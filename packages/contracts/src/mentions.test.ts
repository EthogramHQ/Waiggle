// Tests des mentions « @pseudo » (tranche 6b) : le découpage d'un texte en morceaux, partagé par
// l'API (qui retrouve les membres mentionnés) et par l'appli (qui fait de chaque mention un lien),
// et ce que l'appli peut demander pendant qu'on tape « @in… ». Scénario :
// docs/scenarios/phase-1.md, « Précisions (tranche 6b) », « Mentionner » ; depuis R5b, le nom du
// membre mentionné et la recherche par le nom (docs/scenarios/refonte.md, « Les mentions »).
import { describe, expect, it } from 'vitest'
import { HANDLE_MAX_LENGTH } from './handles'
import {
  findMentions,
  MENTIONABLE_MAX,
  Mention,
  MentionableList,
  MentionableQuery,
  splitMentions,
} from './mentions'

/** Le texte recollé : la somme des morceaux doit redonner exactement le texte de départ. */
const rejoin = (text: string) =>
  splitMentions(text)
    .map((segment) => segment.text)
    .join('')

/** Les seuls pseudos trouvés (dans l'ordre, doublons compris), pour des tests plus lisibles. */
const handlesIn = (text: string) =>
  splitMentions(text).flatMap((segment) => (segment.handle ? [segment.handle] : []))

describe('splitMentions', () => {
  it('cuts a text into plain text and mentions, in order', () => {
    expect(splitMentions('Merci @ines_morel, et bravo !')).toEqual([
      { text: 'Merci ' },
      { text: '@ines_morel', handle: 'ines_morel' },
      { text: ', et bravo !' },
    ])
  })

  it('finds a mention at the very start and at the very end of the text', () => {
    expect(splitMentions('@max')).toEqual([{ text: '@max', handle: 'max' }])
    expect(splitMentions('@max tu as vu ? @ines_morel')).toEqual([
      { text: '@max', handle: 'max' },
      { text: ' tu as vu ? ' },
      { text: '@ines_morel', handle: 'ines_morel' },
    ])
  })

  it('accepts capitals: the handle is lowered, the text keeps what was typed', () => {
    expect(splitMentions('Salut @Ines_Morel')).toEqual([
      { text: 'Salut ' },
      { text: '@Ines_Morel', handle: 'ines_morel' },
    ])
  })

  it('stops the mention at punctuation, a new line or an apostrophe', () => {
    expect(handlesIn('(@max) @lea. @zoe, @ines!\n@sam’s @tom?')).toEqual([
      'max',
      'lea',
      'zoe',
      'ines',
      'sam',
      'tom',
    ])
  })

  it('never takes an email address for a mention', () => {
    for (const text of [
      'Écris-moi à ines@exemple.fr',
      'ines.morel@exemple.fr',
      'ines_morel@exemple.fr',
      'ines2@exemple.fr',
      // Une lettre accentuée est une lettre : « andré@… » est une adresse, pas une mention.
      'andré@exemple.fr',
    ]) {
      expect(handlesIn(text), text).toEqual([])
      expect(splitMentions(text), text).toEqual([{ text }])
    }
  })

  it('keeps as plain text what does not have the form of a handle', () => {
    for (const text of [
      // Un « _ » à la fin, deux de suite : un pseudo ne s'écrit pas ainsi (voir Handle).
      '@ines_',
      'Bonjour @ines_ !',
      '@ines__morel',
      // Trop court (3 caractères au moins) ou trop long (20 au plus).
      '@ab',
      `@${'a'.repeat(HANDLE_MAX_LENGTH + 1)}`,
      // Un chiffre ou un « _ » au début, un « @ » seul, deux « @ ».
      '@2max',
      '@_max',
      'un @ seul',
      '@@max',
      // Un « . » juste avant : « x.@max » n'est pas une mention.
      'x.@max',
    ]) {
      expect(handlesIn(text), text).toEqual([])
      expect(rejoin(text), text).toBe(text)
    }
  })

  it('takes a handle of exactly 3 and exactly 20 characters', () => {
    expect(handlesIn('@abc')).toEqual(['abc'])
    const longest = 'a'.repeat(HANDLE_MAX_LENGTH)
    expect(handlesIn(`@${longest}`)).toEqual([longest])
  })

  it('gives back exactly the text it was given, mentions and all', () => {
    for (const text of [
      '',
      'Aucun pseudo ici.',
      'Merci @ines_morel et @Max !',
      '@max@lea ines@exemple.fr @ines_ fin',
      '  @zoe  \n\n  @zoe ',
      'Emoji 🐝 avant @ines_morel et après 🍯',
    ]) {
      expect(rejoin(text), text).toBe(text)
    }
  })

  it('gives nothing for an empty text', () => {
    expect(splitMentions('')).toEqual([])
  })
})

describe('findMentions', () => {
  it('gives each handle once, lowered, in the order of its first appearance', () => {
    expect(findMentions('@Max, @ines_morel et encore @max et @MAX')).toEqual(['max', 'ines_morel'])
  })

  it('finds nothing in a text without mention, or with only addresses', () => {
    expect(findMentions('Bravo pour le projet')).toEqual([])
    expect(findMentions('ines@exemple.fr')).toEqual([])
  })

  it('gives every handle written, even beyond 5: the API keeps the first 5 members', () => {
    const text = '@aaa @bbb @ccc @ddd @eee @fff'
    expect(findMentions(text)).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'])
  })
})

describe('Mention', () => {
  it('names a member by id, with the handle as it was written', () => {
    const mention = { handle: 'ines_morel', memberId: 'ines-id', name: 'Inès Morel' }
    expect(Mention.parse(mention)).toEqual(mention)
    expect(Mention.safeParse({ handle: 'ines_morel' }).success).toBe(false)
  })

  // R5b : la pastille affiche le nom actuel du membre ; une mention sans nom n'est pas une réponse
  // valable de l'API (elle répondrait 500 plutôt que de laisser l'appli sans nom à montrer).
  it('needs the current name of the member', () => {
    expect(Mention.safeParse({ handle: 'ines_morel', memberId: 'ines-id' }).success).toBe(false)
    expect(
      Mention.safeParse({ handle: 'ines_morel', memberId: 'ines-id', name: null }).success,
    ).toBe(false)
  })
})

describe('MentionableQuery', () => {
  const projectId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'

  it('removes an « @ » at the start and the spaces around, and lowers the case', () => {
    expect(MentionableQuery.parse({ q: '  @In ', projectId })).toEqual({ q: 'in', projectId })
    expect(MentionableQuery.parse({ q: 'INES_m', projectId })).toEqual({ q: 'ines_m', projectId })
  })

  it('waits for 2 characters after the « @ »', () => {
    expect(MentionableQuery.safeParse({ q: 'i', projectId }).success).toBe(false)
    expect(MentionableQuery.safeParse({ q: '@i', projectId }).success).toBe(false)
    expect(MentionableQuery.safeParse({ q: '', projectId }).success).toBe(false)
    expect(MentionableQuery.safeParse({ q: 'in', projectId }).success).toBe(true)
  })

  // R5b : la recherche vaut aussi pour un mot du nom, jusqu'à 30 caractères (avant : 20, un pseudo).
  it('searches on one word only: no space, no other character, at most 30 characters', () => {
    for (const q of ['ines morel', 'in%', 'in*', "in'", '2in', '_in', 'a'.repeat(31)]) {
      expect(MentionableQuery.safeParse({ q, projectId }).success, q).toBe(false)
    }
  })

  // R5b : on cherche aussi le début d'un mot du nom, qui peut être accentué ou d'un autre alphabet.
  // « @Lé », tapé dans le champ, devient « le » : la base replie le nom « Léa » de la même façon.
  it('folds « @Lé » to « le », as the name is folded in the database', () => {
    expect(MentionableQuery.parse({ q: '@Lé', projectId })).toEqual({ q: 'le', projectId })
    expect(MentionableQuery.parse({ q: 'Lefèvre', projectId }).q).toBe('lefevre')
    // « Œ » se replie en deux lettres, comme dans la recherche (R3).
    expect(MentionableQuery.parse({ q: 'Œdipe', projectId }).q).toBe('oedipe')
  })

  it('accepts a letter of any alphabet, not only the latin one', () => {
    expect(MentionableQuery.parse({ q: 'Жанна', projectId }).q).toBe('жанна')
    expect(MentionableQuery.parse({ q: '@Жа', projectId }).q).toBe('жа')
  })

  it('refuses a single letter, or an « @ » alone', () => {
    for (const q of ['l', '@l', '@', ' @ ', 'Ж']) {
      expect(MentionableQuery.safeParse({ q, projectId }).success, q).toBe(false)
    }
  })

  it('accepts 30 characters, and refuses 31, counted once folded', () => {
    expect(MentionableQuery.safeParse({ q: 'a'.repeat(30), projectId }).success).toBe(true)
    expect(MentionableQuery.safeParse({ q: `@${'a'.repeat(30)}`, projectId }).success).toBe(true)
    expect(MentionableQuery.safeParse({ q: 'a'.repeat(31), projectId }).success).toBe(false)
    // 15 « œ » donnent 30 lettres repliées ; 16 en donnent 32.
    expect(MentionableQuery.safeParse({ q: 'œ'.repeat(15), projectId }).success).toBe(true)
    expect(MentionableQuery.safeParse({ q: 'œ'.repeat(16), projectId }).success).toBe(false)
  })

  // Relecture de sécurité sec-A5 : un accent peut être tapé à part, après sa lettre (« e » puis
  // l'accent aigu combinant U+0301). Sans `normalize('NFC')`, l'accent seul n'est pas une lettre
  // (\p{L}) et la recherche serait refusée, ou ne trouverait pas « Léa ».
  it('folds « @Léa » typed with a combining accent to « lea »', () => {
    const combiningAcute = String.fromCodePoint(0x0301)
    const typed = `@Le${combiningAcute}a`
    expect(typed).toHaveLength(5) // témoin : l'accent est bien un caractère à part
    expect(MentionableQuery.parse({ q: typed, projectId })).toEqual({ q: 'lea', projectId })
  })

  it('needs the project being commented, by a well-formed id', () => {
    expect(MentionableQuery.safeParse({ q: 'in' }).success).toBe(false)
    expect(MentionableQuery.safeParse({ q: 'in', projectId: 'meteo' }).success).toBe(false)
  })
})

describe('MentionableList', () => {
  const ines = { id: 'ines-id', name: 'Inès Morel', handle: 'ines_morel', avatarUrl: null }

  it('proposes at most 5 members, with name, handle and picture', () => {
    const members = Array.from({ length: MENTIONABLE_MAX + 1 }, (_, i) => ({
      ...ines,
      id: `member-${i}`,
    }))
    expect(MentionableList.safeParse({ members: members.slice(0, -1) }).success).toBe(true)
    expect(MentionableList.safeParse({ members }).success).toBe(false)
  })

  it('never carries an email address', () => {
    const parsed = MentionableList.parse({
      members: [{ ...ines, email: 'ines@example.com' }],
    })
    expect(JSON.stringify(parsed)).not.toContain('ines@example.com')
  })
})
