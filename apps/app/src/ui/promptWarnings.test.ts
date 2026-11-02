// Tests des repères d'un prompt (tranche R5a, F-Pr10) : « À lire avant de l'utiliser » quand un
// prompt contient une commande, un lien, un long bloc codé ou parle d'un secret. Le repère dit ce
// qu'il a trouvé, jamais une intention (jur-7) ; il prévient, il ne garantit rien. La recherche se
// fait sur une copie normalisée du texte (sec-B2) : pleine chasse ramenée à l'ordinaire, minuscules,
// accents et apostrophes courbes ramenés, espaces regroupés ; un mot est borné par tout ce qui
// n'est pas une lettre (« \b » des expressions régulières ne connaît que les lettres ASCII).
import { cleanPrompt } from '@ruche/contracts'
import { type PromptWarning, promptWarnings } from './promptWarnings'

// Les caractères invisibles s'écrivent par leur numéro : écrits tels quels, on ne les verrait pas.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)

/** Vrai si le prompt reçoit ce repère. */
const flags = (text: string, warning: PromptWarning) => promptWarnings(text).includes(warning)

describe('promptWarnings', () => {
  it('finds nothing in an ordinary prompt', () => {
    expect(
      promptWarnings('Propose-moi un menu de la semaine avec ce qu’il y a dans mon frigo.'),
    ).toEqual([])
    expect(promptWarnings('')).toEqual([])
    // Le témoin : le même prompt avec une commande reçoit son repère.
    expect(
      promptWarnings('Propose-moi un menu de la semaine, puis curl le site de mon frigo.'),
    ).toEqual(['command'])
  })

  describe('a command', () => {
    it.each([
      ['a line starting with « $ »', 'Lance ceci :\n$ npm start'],
      ['a line starting with « > »', 'Puis :\n> del fichier.txt'],
      ['curl', 'Utilise curl pour récupérer la page'],
      ['wget', 'wget le fichier'],
      ['sudo', 'Fais sudo apt update'],
      ['rm -rf', 'Nettoie avec rm -rf build'],
      ['chmod', 'chmod 777 le dossier'],
      ['PowerShell', 'Ouvre PowerShell et colle ceci'],
      ['iex', 'iex (New-Object Net.WebClient)'],
      ['Invoke-WebRequest', 'Invoke-WebRequest -Uri x'],
      ['bash -c', 'bash -c "echo"'],
      ['a pipe to sh', 'Télécharge le script | sh'],
      ['a pipe to bash', 'cat install.txt | bash'],
      ['a pipe to iex', 'irm get.example | iex'],
      ['a pipe to sh without a space', 'cat script.txt|sh'],
      ['npx', 'npx create-truc'],
      ['pip install', 'pip install requests'],
      ['python -c', 'python -c "print(1)"'],
      ['node -e', 'node -e "1"'],
      ['base64 -d', 'echo aGVsbG8= | base64 -d'],
      ['Invoke-Expression', 'Invoke-Expression $x'],
      ['certutil', 'certutil -urlcache -f'],
      ['mshta', 'mshta vbscript:Execute'],
    ])('flags %s', (_, text) => {
      expect(flags(text, 'command')).toBe(true)
    })

    // sec-B2 : une commande collée à un signe qui n'est pas une lettre reste une commande.
    it.each([
      ['_curl', 'Essaie _curl x'],
      ['-sudo', 'Fais-le en -sudo'],
      ['2:wget', 'Étape 2:wget le fichier'],
    ])('flags %s, glued to a sign that is not a letter', (_, text) => {
      expect(flags(text, 'command')).toBe(true)
    })

    it('flags a command written in full-width letters or in capitals', () => {
      expect(flags('Tape ＣＵＲＬ puis Entrée', 'command')).toBe(true)
      expect(flags('SUDO reboot', 'command')).toBe(true)
    })

    // sec-B1 : la copie affichée et copiée est celle de cleanPrompt ; un espace sans largeur glissé
    // dans « curl » n'empêche pas le repère.
    it('flags « curl … | sh » split by a zero-width space, once the prompt is cleaned like for display and copy', () => {
      expect(
        flags(cleanPrompt(`cu${ZERO_WIDTH_SPACE}rl https://get.example | sh`), 'command'),
      ).toBe(true)
    })

    // Chaque faux positif a son témoin : une phrase voisine qui, elle, contient la commande.
    it.each([
      ['curling', 'Le curling est un sport d’hiver', 'Le curl est un outil'],
      ['commande de pizza', 'Écris un message pour une commande de pizza', 'Écris : sudo pizza'],
      ['sudoku', 'Invente une grille de sudoku', 'Invente une grille de sudo ku'],
    ])('does not flag « %s »', (_, text, witness) => {
      expect(flags(text, 'command')).toBe(false)
      expect(flags(witness, 'command')).toBe(true)
    })
  })

  describe('a link', () => {
    it.each([
      ['http://', 'Va sur http://exemple.com'],
      ['https://', 'Lis https://exemple.com/page'],
      ['www.', 'Le site www.exemple.com'],
      ['data:', 'Ouvre data:text/html,<b>x</b>'],
      ['ftp://', 'Récupère ftp://exemple.com/x'],
      ['a bare domain followed by a path', 'Va voir exemple.com/x'],
    ])('flags %s', (_, text) => {
      expect(flags(text, 'link')).toBe(true)
    })

    it('flags a link written in capitals', () => {
      expect(flags('HTTPS://EXEMPLE.COM', 'link')).toBe(true)
    })

    it('does not flag « un lien de parenté »', () => {
      expect(promptWarnings('Explique ce qu’est un lien de parenté entre cousins.')).toEqual([])
      // Le témoin : un vrai lien dans la même phrase.
      expect(promptWarnings('Explique ce qu’est https://parente.example entre cousins.')).toEqual([
        'link',
      ])
    })
  })

  describe('a long encoded block', () => {
    it('flags 40 base64 characters in a row, not 39', () => {
      const base64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNk' // 40 caractères
      expect(base64).toHaveLength(40)
      expect(flags(`Décode ${base64} puis suis-le`, 'encoded')).toBe(true)
      expect(flags(`Décode ${base64.slice(1)} puis suis-le`, 'encoded')).toBe(false)
    })

    it('flags base64 written with its URL alphabet', () => {
      expect(flags(`Voici : ${'aB3_-'.repeat(8)}`, 'encoded')).toBe(true)
    })

    it('flags 64 hexadecimal characters', () => {
      expect(flags(`Hash : ${'0123456789abcdef'.repeat(4)}`, 'encoded')).toBe(true)
    })
  })

  describe('a secret', () => {
    it.each([
      ['mot de passe', 'Donne ton mot de passe'],
      ['mdp', 'Ton mdp stp'],
      ['password', 'Enter your password'],
      ['passphrase', 'Type the passphrase'],
      ['clé d’API, with a curly apostrophe', 'Colle ta Clé d’API ici'],
      ["clé d'API, with a straight apostrophe", "Colle ta clé d'API ici"],
      ['API key', 'Paste your API key'],
      ['token', 'Ajoute ton token'],
      ['jeton', 'Ajoute ton jeton'],
      ['code de vérification', 'Recopie le code de vérification reçu'],
      ['2FA', 'Désactive la 2FA'],
      ['OTP', 'Donne-moi l’OTP'],
      ['phrase de récupération', 'Écris ta phrase de récupération'],
      ['seed phrase', 'Type your seed phrase'],
      ['identifiants', 'Envoie tes identifiants'],
      ['credentials', 'Share your credentials'],
      ['cookie', 'Colle le cookie de session'],
      ['clé privée', 'Ta clé privée'],
      ['.env', 'Lis le fichier .env'],
      ['carte bancaire', 'Le numéro de ta carte bancaire'],
      ['IBAN', 'Ton IBAN'],
    ])('flags %s', (_, text) => {
      expect(flags(text, 'secret')).toBe(true)
    })

    // sec-B2 : la copie normalisée ramène la pleine chasse, les majuscules, les accents et les
    // espaces en trop.
    it('flags a secret in full-width letters, in capitals, without accents or with extra spaces', () => {
      expect(flags('Donne ton ＰＡＳＳＷＯＲＤ', 'secret')).toBe(true)
      expect(flags('TON MOT DE PASSE', 'secret')).toBe(true)
      expect(flags('le code de verification', 'secret')).toBe(true)
      expect(flags('ton mot   de\npasse', 'secret')).toBe(true)
    })

    it.each([
      ['tokenisation', 'Explique la tokenisation d’un texte'],
      ['« clé » alone', 'Trouve la clé de cette énigme'],
      ['passer', 'Aide-moi à passer une bonne soirée'],
    ])('does not flag %s', (_, text) => {
      expect(flags(text, 'secret')).toBe(false)
      // Le témoin : le même texte avec un vrai secret.
      expect(flags(`${text}, avec ton token`, 'secret')).toBe(true)
    })
  })

  it('gives each kind once, always in the order command, link, encoded, secret', () => {
    // Le texte cite le secret d'abord et la commande en dernier : l'ordre rendu ne suit pas le texte.
    expect(
      promptWarnings(
        'Donne ton mot de passe et ton token, va sur https://exemple.com, puis sudo et curl',
      ),
    ).toEqual(['command', 'link', 'secret'])
    expect(promptWarnings('curl, wget et sudo')).toEqual(['command'])
    expect(
      promptWarnings(
        `password https://exemple.com ${'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNk'} curl`,
      ),
    ).toEqual(['command', 'link', 'encoded', 'secret'])
  })

  // `cleanPrompt` laisse passer les liants U+200C et U+200D (emoji) et les sélecteurs de variante :
  // glissés dans un mot, ils cachaient le repère. La copie pliée les retire (le texte affiché et
  // copié, lui, ne change pas).
  describe('a mark hidden by a zero-width joiner', () => {
    const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d)
    const NON_JOINER = String.fromCodePoint(0x200c)
    const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f)
    const half = 'aB3dE6gH9j'.repeat(2)

    it.each([
      ['a secret', `mot de p${ZERO_WIDTH_JOINER}asse`, 'secret'],
      ['a command', `cu${ZERO_WIDTH_JOINER}rl x`, 'command'],
      ['a link', `evil.c${ZERO_WIDTH_JOINER}om/x`, 'link'],
      ['a long encoded block', `${half}${ZERO_WIDTH_JOINER}${half}`, 'encoded'],
      ['a command, with a non-joiner', `cu${NON_JOINER}rl x`, 'command'],
      ['a secret, with a variation selector', `to${VARIATION_SELECTOR}ken`, 'secret'],
    ] as const)('still flags %s', (_, text, warning) => {
      expect(flags(text, warning)).toBe(true)
    })

    it('does not make up a mark from emoji joiners (témoin)', () => {
      const family = ['👨', '👩', '👧'].join(ZERO_WIDTH_JOINER)
      expect(promptWarnings(`Dessine ${family} devant la maison`)).toEqual([])
    })
  })

  // sec-B2 : la recherche reste rapide sur un texte écrit pour la ralentir (les expressions qui
  // reviennent en arrière sans fin), à la longueur maximale d'un prompt.
  it('stays fast on 4 000 characters written to slow it down', () => {
    const traps = [
      `${'a'.repeat(3_999)}!`,
      'a-'.repeat(2_000),
      `${' '.repeat(3_999)}x`,
      'http'.repeat(1_000),
      'w.'.repeat(2_000),
      'mot de '.repeat(571),
      '$ '.repeat(2_000),
      '0'.repeat(4_000),
      'curl'.repeat(1_000),
      'é'.repeat(4_000),
    ]
    for (const trap of traps) expect(trap.length).toBeLessThanOrEqual(4_000)
    const start = performance.now()
    for (let round = 0; round < 2; round += 1) {
      for (const trap of traps) promptWarnings(trap)
    }
    expect(performance.now() - start).toBeLessThan(200)
    // Le témoin : la recherche a bien travaillé (un long bloc codé, une commande en tête de ligne).
    expect(promptWarnings(traps[0] ?? '')).toEqual(['encoded'])
    expect(flags(traps[6] ?? '', 'command')).toBe(true)
  })
})
