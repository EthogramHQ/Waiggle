// Tests du repérage des clés d'API dans un prompt (tranche R6a, « Le prompt de départ »). Le module
// est pur : l'appli s'en sert pour l'encadré « Clé : sk-proj…a91f » et le bouton « Retirer la clé ».
// Scénario : docs/scenarios/refonte.md, section R6a ; relecture du plan, sec-A4 et sec-A5.
//
// Les fausses clés sont fabriquées par morceaux (`fake`) : aucune ne ressemble assez à une vraie
// pour qu'un outil qui cherche des secrets dans le dépôt public la prenne pour une fuite.
import { describe, expect, it } from 'vitest'
import { type ApiKeyMatch, findApiKeys, removeApiKey } from './apiKeys'

/** Un préfixe suivi de `length` caractères tirés d'un motif (lettres et chiffres mêlés). */
const fake = (prefix: string, length: number, pattern = 'Ab3dEf9hK2') =>
  prefix + pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length)

/** La forme masquée attendue : 7 premiers caractères, « … », 4 derniers. */
const masked = (key: string) => `${key.slice(0, 7)}…${key.slice(-4)}`

const PLACEHOLDER = '[clé retirée]'

describe('findApiKeys', () => {
  // Chaque forme connue, telle qu'on la colle dans un prompt.
  const keys: [string, string][] = [
    ['OpenAI', fake('sk-', 48)],
    ['OpenAI project', fake('sk-proj-', 60)],
    ['Anthropic', fake('sk-ant-', 80, 'aB-9_xY7')],
    ['AWS', fake('AKIA', 16, 'IOSFODNN7Q')],
    ['GitHub personal', fake('gh' + 'p_', 36)],
    ['GitHub app', fake('gh' + 'o_', 36)],
    ['GitHub fine-grained', fake('github' + '_pat_', 82, 'Ab3_dEf9h')],
    ['Slack bot', fake('xo' + 'xb-', 40, '1234-Abc')],
    ['Slack user', fake('xo' + 'xp-', 40, '9876-Xyz')],
    ['Google', fake('AI' + 'za', 35, 'Sy-B_9q')],
    ['GitLab', fake('gl' + 'pat-', 20)],
    ['Hugging Face', fake('h' + 'f_', 34)],
    ['JWT', `eyJ${fake('', 20)}.eyJ${fake('', 40)}.${fake('', 43, 'x-Y_z9')}`],
  ]

  it.each(keys)('finds a %s key and masks it', (_, key) => {
    const text = `Appelle l'API avec ${key} puis résume.`

    const found = findApiKeys(text)

    expect(found).toHaveLength(1)
    const [match] = found as [ApiKeyMatch]
    expect(text.slice(match.start, match.end)).toBe(key)
    expect(match.raw).toBe(key)
    expect(match.masked).toBe(masked(key))
    // La forme masquée ne montre jamais la clé entière.
    expect(match.masked).not.toContain(key)
  })

  it('finds the token after « Bearer », not the word itself', () => {
    const token = fake('', 32)
    const text = `curl -H "Authorization: Bearer ${token}" https://api.example.com`

    const [match] = findApiKeys(text)

    expect(match?.raw).toBe(token)
    expect(match?.masked).toBe(masked(token))
  })

  it('counts a JWT sent after « Bearer » only once', () => {
    const jwt = `eyJ${fake('', 20)}.eyJ${fake('', 40)}.${fake('', 43)}`

    expect(findApiKeys(`Authorization: Bearer ${jwt}`)).toHaveLength(1)
  })

  it('finds several keys, in the order of the text', () => {
    const first = fake('sk-proj-', 40)
    const second = fake('AKIA', 16, 'ZXCVB7NM4Q')

    const found = findApiKeys(`D'abord ${second}, puis\n${first}.`)

    expect(found.map((m) => m.raw)).toEqual([second, first])
  })

  it('finds a key at the very start or end of the text', () => {
    const key = fake('sk-', 40)

    expect(findApiKeys(key).map((m) => m.raw)).toEqual([key])
    expect(findApiKeys(`clé:${key}`).map((m) => m.raw)).toEqual([key])
  })

  it('finds nothing in an ordinary prompt', () => {
    const prompt = [
      'Tu es un assistant de cuisine. Propose trois recettes avec : {ingrédients}.',
      'Réponds en Markdown, avec un tableau des quantités pour 4 personnes (version 2024-11).',
      'Exemple : https://recettes.example.com/tarte-aux-pommes?id=12345',
    ].join('\n')

    expect(findApiKeys(prompt)).toEqual([])
  })

  it('finds no key in ordinary hyphenated words such as « task-manager-and-planner »', () => {
    // « sk- » se cache dans « task- » et « ask- » : la clé ne commence jamais au milieu d'un mot,
    // même quand la suite a des chiffres et plus de 20 caractères.
    for (const text of [
      'task-manager-and-planner',
      'Mon outil task-manager-and-planner-v2-2026 trie la liste.',
      'ask-the-expert-questions-2024-edition',
      'sk-manager-and-planner-for-teams',
      'Une phrase : risk-assessment-template-2025.',
    ]) {
      expect(findApiKeys(text), text).toEqual([])
    }
  })

  it('finds nothing for « sk-» alone or followed by a few characters', () => {
    expect(findApiKeys('sk-')).toEqual([])
    expect(findApiKeys('Le préfixe sk- désigne une clé.')).toEqual([])
    expect(findApiKeys('sk-abc123')).toEqual([])
  })

  it('needs at least 20 token characters after « Bearer »', () => {
    const nineteen = 'abcdefghijklmnopqrs'
    const twenty = `${nineteen}t`

    expect(findApiKeys(`Authorization: Bearer ${nineteen}`)).toEqual([])
    expect(findApiKeys(`Authorization: Bearer ${twenty}`).map((m) => m.raw)).toEqual([twenty])
    // Le mot seul, ou suivi d'un mot ordinaire, n'est pas une clé.
    expect(findApiKeys('Ajoute un en-tête Bearer avec ton jeton.')).toEqual([])
  })

  it('stays under 50 ms on 4 000 characters of « eyJ » repeated without a dot, and of « sk-» repeated', () => {
    // Un texte piégé : chaque position ressemble au début d'une clé qui ne finit jamais. Une regex
    // à répétitions non bornées y passerait des secondes (« retour arrière catastrophique »).
    // On garde le meilleur de trois essais : un PC chargé par d'autres tests ne doit pas faire
    // rougir ce test, alors qu'une regex catastrophique dépasse les 50 ms à chaque essai.
    const traps = ['eyJ'.repeat(1334).slice(0, 4000), 'sk-'.repeat(1334).slice(0, 4000)]
    for (const trap of traps) {
      expect(trap).toHaveLength(4000)
      let best = Number.POSITIVE_INFINITY
      for (let attempt = 0; attempt < 3; attempt++) {
        const start = performance.now()
        findApiKeys(trap)
        best = Math.min(best, performance.now() - start)
      }
      expect(best, trap.slice(0, 6)).toBeLessThan(50)
    }
  })
})

describe('removeApiKey', () => {
  it('replaces the key by the placeholder, and leaves the rest of the prompt as it was', () => {
    const key = fake('sk-proj-', 48)
    const text = `Appelle l'API avec ${key} puis résume.`
    const [match] = findApiKeys(text) as [ApiKeyMatch]

    expect(removeApiKey(text, match, PLACEHOLDER)).toBe(
      `Appelle l'API avec ${PLACEHOLDER} puis résume.`,
    )
  })

  it('leaves the text unchanged when the key no longer sits at its offsets', () => {
    const key = fake('sk-proj-', 48)
    const text = `Clé : ${key}`
    const [match] = findApiKeys(text) as [ApiKeyMatch]

    // Le membre a tapé avant la clé entre la recherche et le retrait : les positions ont glissé.
    const edited = `Ma ${text}`
    expect(removeApiKey(edited, match, PLACEHOLDER)).toBe(edited)
    // Le texte raccourci, la clé coupée : rien n'est retiré non plus.
    const cut = text.slice(0, -5)
    expect(removeApiKey(cut, match, PLACEHOLDER)).toBe(cut)
  })

  it('removes two keys one after the other, recomputing the offsets', () => {
    const first = fake('sk-proj-', 48)
    const second = fake('gh' + 'p_', 36)
    const text = `A : ${first}\nB : ${second}\nFin.`

    // Après le premier retrait, le texte a raccourci : la seconde clé a changé de place. On
    // relance la recherche, comme l'appli après chaque retrait.
    const [one] = findApiKeys(text) as [ApiKeyMatch]
    const once = removeApiKey(text, one, PLACEHOLDER)
    const [two] = findApiKeys(once) as [ApiKeyMatch]
    const twice = removeApiKey(once, two, PLACEHOLDER)

    expect(two.raw).toBe(second)
    expect(twice).toBe(`A : ${PLACEHOLDER}\nB : ${PLACEHOLDER}\nFin.`)
    expect(findApiKeys(twice)).toEqual([])
  })

  it('never cuts the text with the stale offsets of the second key', () => {
    const first = fake('sk-proj-', 48)
    const second = fake('gh' + 'p_', 36)
    const text = `A : ${first}\nB : ${second}`
    const [one, staleTwo] = findApiKeys(text) as [ApiKeyMatch, ApiKeyMatch]

    const once = removeApiKey(text, one, PLACEHOLDER)

    // Les positions de la seconde datent d'avant le premier retrait : le texte reste intact.
    expect(removeApiKey(once, staleTwo, PLACEHOLDER)).toBe(once)
  })
})
