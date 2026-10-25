// Tests de defangLinks (tranche 6c, relecture de sécurité S-B1) : aucun lien venu d'un membre ne
// doit pouvoir devenir cliquable dans un e-mail. Gmail ou Outlook transforment d'eux-mêmes
// « waiggle-login.com » en lien, dans le texte comme dans le HTML ; un e-mail signé par notre
// domaine qui pointe vers un faux site serait un hameçonnage parfait. Toute adresse ou tout nom
// de domaine écrit par un membre (extrait, titre, nom) devient donc « [lien] ».
import { describe, expect, it } from 'vitest'
import { defangLinks } from './links'

/** Un caractère par son numéro Unicode : tapé tel quel, un invisible ne se verrait pas ici. */
const char = (code: number) => String.fromCodePoint(code)

describe('defangLinks', () => {
  it('replaces a full address with « [lien] »', () => {
    const result = defangLinks('reconnecte-toi sur https://evil.example/login?next=1 vite')

    expect(result).not.toContain('evil.example')
    expect(result).not.toContain('https://')
    expect(result).toBe('reconnecte-toi sur [lien] vite')
  })

  it('replaces an address without its scheme, a bare domain or a « www. » one', () => {
    for (const written of [
      'waiggle-login.com',
      'www.evil.example',
      'support.example.com',
      'evil.example/login',
      'EVIL.COM',
      'http://192.168.0.1/admin',
      'xn--exmple-cua.com',
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, written).toBe('va sur [lien] maintenant')
    }
  })

  it('replaces the domain of an e-mail address', () => {
    const result = defangLinks('écris à support@waiggle-login.com')

    expect(result).not.toContain('waiggle-login.com')
    expect(result).toContain('[lien]')
  })

  it('replaces every address of a text, not only the first one', () => {
    const result = defangLinks('a.com, puis https://b.example et www.c.net')

    expect(result).toBe('[lien], puis [lien] et [lien]')
  })

  it('leaves ordinary words, numbers and handles untouched', () => {
    for (const ordinary of [
      'Super idée, je teste ce soir.',
      'La version 2.0 sort à 14.30, prix 3.14 €.',
      'Merci @ines_morel !',
      'Météo, quartier par quartier…',
      'Inès Morel',
      'e-mail et mot-clé',
    ]) {
      expect(defangLinks(ordinary)).toBe(ordinary)
    }
  })

  // Audit de sécurité du 25/10/2026 (C13, décision de Louis : liste blanche) : « Node.js » ou
  // « fichier.txt » devenaient « [lien] ». Un nom de fichier dont l'extension n'est pas un domaine
  // de premier niveau reste intact ; une extension qui en est un (« .md », la Moldavie) non.
  it('leaves a file or library name untouched when its suffix is not a top-level domain', () => {
    for (const ordinary of [
      'Node.js',
      'Vue.js vs React',
      'mon projet Next.js',
      'fichier.txt',
      'données.CSV et config.yaml',
      'le code est dans src/index.ts',
      'Node.js, Deno et Bun.',
    ]) {
      expect(defangLinks(ordinary), ordinary).toBe(ordinary)
    }
  })

  it('still replaces a name whose suffix is a real top-level domain', () => {
    for (const written of ['README.md', 'evil.com', 'script.py', 'asp.net', 'socket.io']) {
      expect(defangLinks(`lis ${written} ici`), written).toBe('lis [lien] ici')
    }
  })

  it('still replaces a file-like name written with a scheme, « www. », a path or several dots', () => {
    for (const written of [
      'https://x.js',
      'http://evil.txt/login',
      'www.evil.js',
      'WWW.evil.json',
      'evil.js/login',
      'evil.com.js',
      'login.evil.json',
      `www${char(0x2024)}evil${char(0x2024)}js`, // « www » et des points de conduite (U+2024)
    ]) {
      expect(defangLinks(`va sur ${written} vite`), written).toBe('va sur [lien] vite')
    }
  })

  // Les essais d'entrées de l'audit du 25/10/2026 (essai-entrees.log) : aucun ne doit repasser
  // intact à cause de la liste blanche.
  it('still replaces every look-alike address tried by the audit', () => {
    for (const written of [
      'waiggle-login.com',
      `evil.${char(0x034f)}com`,
      `${char(0xff45)}${char(0xff56)}${char(0xff49)}${char(0xff4c)}.com`,
      `evil${char(0x3002)}com`,
      'xn--80ak6aa92e.com',
      `htt${char(0x200b)}ps://evil.com`,
      `evil${char(0x200b)}.com`,
      'EVIL.COM/login',
      `evil.c${char(0x0301)}om`,
      `${char(0xfb01)}.com`,
      `www${char(0x2024)}evil${char(0x2024)}com`,
      `evil.co${char(0x200d)}m`,
    ]) {
      expect(defangLinks(`va sur ${written} vite`), JSON.stringify(written)).toBe(
        'va sur [lien] vite',
      )
    }
  })

  // Ajoutés avec les corrections de la relecture de sécurité (B1, A1) : un domaine collé à une
  // ponctuation, ou écrit avec des caractères que la messagerie ou le navigateur lisent comme les
  // lettres et le point ordinaires, passait intact.
  it('replaces a domain glued to a hyphen, an underscore or a colon', () => {
    for (const written of [
      '-waiggle-login.com',
      '_waiggle-login.com',
      'Support -waiggle-login.com',
      ':-evil.com',
      'x--evil.com',
      'voir:evil.com',
      '(evil.com)',
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, written).not.toContain('waiggle-login.com')
      expect(result, written).not.toContain('evil.com')
      expect(result, written).toContain('[lien]')
    }
  })

  it('replaces a domain written with a look-alike dot or an invisible character', () => {
    for (const written of [
      'evil。com', // 。 point idéographique
      'evil．com', // ． point pleine chasse
      'evil｡com', // ｡ point idéographique demi-chasse
      'evil․com', // ․ point de conduite
      'evil​.com', // espace sans largeur
      'evil­.com', // trait d'union conditionnel
      'ｅｖｉｌ.com', // ｅｖｉｌ en lettres pleine chasse
      'evil.c‍om', // liant au milieu de l'extension
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, JSON.stringify(written)).toBe('va sur [lien] maintenant')
    }
  })

  it('keeps the text as it was written around an address', () => {
    expect(defangLinks('Super… voir evil.com… ﬁn')).toBe('Super… voir [lien]… ﬁn')
    // Les émojis assemblés (liant U+200D) restent entiers.
    expect(defangLinks('Bravo 👩‍💻')).toBe('Bravo 👩‍💻')
  })

  // Ajoutés avec les suites de la relecture de sécurité de e414e88 (A1, A2).
  it('replaces a domain hiding a mark that browsers ignore right after the dot', () => {
    // Ce ne sont pas des caractères de mise en forme (\p{Cf}) mais des marques (\p{Mn}) « à
    // ignorer » : un navigateur les efface d'un nom de domaine (UTS 46), et « evil.͏com » mène à
    // evil.com.
    for (const written of [
      'evil.͏com', // U+034F, liant de graphèmes
      'evil.︀com', // U+FE00, sélecteur de variante 1
      'evil.᠋com', // U+180B, sélecteur de variante mongol
      'evil.\u{E0100}com', // U+E0100, sélecteur de variante 17
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, JSON.stringify(written)).toBe('va sur [lien] maintenant')
    }
    // Le sélecteur d'émoji (U+FE0F), ignoré lui aussi pour chercher, reste dans le texte rendu.
    expect(defangLinks('Bravo ❤️')).toBe('Bravo ❤️')
  })

  it('replaces an address whose scheme is glued to an underscore, a digit or a word', () => {
    for (const written of [
      '_http://192.168.0.1/admin',
      '1http://203.0.113.5/login',
      'a_http://1.2.3.4/x',
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, written).not.toContain('192.168')
      expect(result, written).not.toContain('203.0')
      expect(result, written).not.toContain('1.2.3.4')
      expect(result, written).toContain('[lien]')
    }
  })

  it('writes the placeholder it is given, in the language of the e-mail', () => {
    expect(defangLinks('go to evil.com now', '[link]')).toBe('go to [link] now')
  })
})
