// Tests du contrat du coin des testeurs (tranche R7b) : ce que l'API accepte (un appel, un
// message du fil) et ce qu'elle renvoie (le coin, les pages, leurs plafonds). Scénario :
// docs/scenarios/refonte.md, section R7b ; relecture de sécurité du plan : A13 (un texte fait
// d'invisibles est vide), A14 (la description d'une photo n'a de sens qu'avec elle).
//
// Les caractères invisibles sont fabriqués par String.fromCodePoint dans des constantes nommées :
// écrits tels quels dans le fichier, ils seraient impossibles à relire.
import { describe, expect, it } from 'vitest'
import {
  CALL_PHOTOS_PER_PROJECT_MAX,
  CALL_TEXT_MAX,
  CALLS_PAGE_SIZE,
  CALLS_PER_DAY_PER_PROJECT,
  CAPTURES_PER_THREAD_MAX,
  MESSAGE_TEXT_MAX,
  MESSAGES_PAGE_SIZE,
  NewTesterCall,
  NewTesterMessage,
  OPEN_FEEDBACK_MAX,
  OpenFeedbackList,
  SETTLED_PER_UPDATE_MAX,
  TESTER_CALLS_PER_DAY,
  TESTER_EXCERPT_MAX,
  TESTER_MEDIA_PENDING_MAX,
  TESTER_MESSAGES_PER_DAY,
  TESTER_SETTLES_PER_HOUR,
  TesterCall,
  TesterCallPage,
  TesterCorner,
  TesterCursor,
  TesterMessagePage,
  TesterThreadPage,
  TesterThreadsQuery,
  THREADS_PAGE_SIZE,
} from './testers'
import { PHOTO_DESCRIPTION_MAX } from './visuals'

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const COMBINING_ACUTE = String.fromCodePoint(0x0301)
const COMBINING_GRAPHEME_JOINER = String.fromCodePoint(0x034f)
const NO_BREAK_SPACE = String.fromCodePoint(0x00a0)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const ROCKET = String.fromCodePoint(0x1f680)

/** Un identifiant de photo en attente, bien formé. */
const PHOTO = '11111111-1111-4111-8111-111111111111'
const CALL = '22222222-2222-4222-8222-222222222222'

/** Des textes qui ne montrent rien : vides, blancs, ou faits seulement d'invisibles. */
const INVISIBLE_TEXTS = [
  '',
  '   ',
  '\n\n',
  `${NO_BREAK_SPACE}${NO_BREAK_SPACE}`,
  ZERO_WIDTH_SPACE.repeat(3),
  `${COMBINING_ACUTE}${COMBINING_GRAPHEME_JOINER}`,
  ` ${ZERO_WIDTH_SPACE}${COMBINING_ACUTE} `,
]

const call = (changes: object = {}) => ({
  text: 'Essayez le niveau 3 ce week-end, surtout sur téléphone.',
  photoId: null,
  photoDescription: null,
  ...changes,
})

const feedback = (changes: object = {}) => ({
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  text: 'Le score repart à zéro au niveau 3.',
  captureId: null,
  ...changes,
})

const reply = (changes: object = {}) => ({ kind: 'reply', text: 'Merci, je regarde.', ...changes })

describe('the limits of the corner', () => {
  it('keeps the numbers of the scenario and of the security review', () => {
    expect(CALL_TEXT_MAX).toBe(500)
    expect(MESSAGE_TEXT_MAX).toBe(1000)
    expect(CALLS_PER_DAY_PER_PROJECT).toBe(5)
    expect(TESTER_CALLS_PER_DAY).toBe(20)
    expect(TESTER_MESSAGES_PER_DAY).toBe(30)
    expect(TESTER_SETTLES_PER_HOUR).toBe(120)
    expect(CALLS_PAGE_SIZE).toBe(20)
    expect(THREADS_PAGE_SIZE).toBe(20)
    expect(MESSAGES_PAGE_SIZE).toBe(30)
    expect(SETTLED_PER_UPDATE_MAX).toBe(20)
    expect(OPEN_FEEDBACK_MAX).toBe(50)
    expect(TESTER_MEDIA_PENDING_MAX).toBe(2)
    expect(CAPTURES_PER_THREAD_MAX).toBe(100)
    expect(CALL_PHOTOS_PER_PROJECT_MAX).toBe(100)
    expect(TESTER_EXCERPT_MAX).toBe(80)
  })
})

describe('a new call (NewTesterCall)', () => {
  it('accepts a call of 500 characters, and refuses more', () => {
    expect(NewTesterCall.safeParse(call({ text: 'é'.repeat(CALL_TEXT_MAX) })).success).toBe(true)
    expect(NewTesterCall.safeParse(call({ text: 'é'.repeat(CALL_TEXT_MAX + 1) })).success).toBe(
      false,
    )
  })

  it('counts an emoji as one character', () => {
    expect(NewTesterCall.safeParse(call({ text: ROCKET.repeat(CALL_TEXT_MAX) })).success).toBe(true)
  })

  it('trims the text and keeps its line breaks', () => {
    expect(NewTesterCall.parse(call({ text: '  Niveau 3.\nSur téléphone.  ' })).text).toBe(
      'Niveau 3.\nSur téléphone.',
    )
  })

  it('refuses a call that shows nothing', () => {
    for (const text of INVISIBLE_TEXTS) {
      expect(NewTesterCall.safeParse(call({ text })).success, JSON.stringify(text)).toBe(false)
    }
  })

  it('refuses a character that turns the text around', () => {
    expect(
      NewTesterCall.safeParse(call({ text: `Niveau ${RIGHT_TO_LEFT_OVERRIDE}3` })).success,
    ).toBe(false)
  })

  it('takes a photo with or without a description', () => {
    expect(NewTesterCall.parse(call({ photoId: PHOTO }))).toMatchObject({
      photoId: PHOTO,
      photoDescription: null,
    })
    expect(
      NewTesterCall.parse(call({ photoId: PHOTO, photoDescription: 'La fusée au départ.' })),
    ).toMatchObject({ photoDescription: 'La fusée au départ.' })
    // Une description vide revient à ne pas en donner.
    expect(
      NewTesterCall.parse(call({ photoId: PHOTO, photoDescription: '' })).photoDescription,
    ).toBe(null)
  })

  it('refuses a description without a photo (photoDescription sans photo)', () => {
    expect(NewTesterCall.safeParse(call({ photoDescription: 'La fusée au départ.' })).success).toBe(
      false,
    )
  })

  it('refuses a photo description over 250 characters', () => {
    expect(
      NewTesterCall.safeParse(
        call({ photoId: PHOTO, photoDescription: 'a'.repeat(PHOTO_DESCRIPTION_MAX) }),
      ).success,
    ).toBe(true)
    expect(
      NewTesterCall.safeParse(
        call({ photoId: PHOTO, photoDescription: 'a'.repeat(PHOTO_DESCRIPTION_MAX + 1) }),
      ).success,
    ).toBe(false)
  })

  it('refuses a malformed photo identifier and unknown fields', () => {
    expect(NewTesterCall.safeParse(call({ photoId: 'pas-un-identifiant' })).success).toBe(false)
    expect(NewTesterCall.safeParse(call({ pinned: true })).success).toBe(false)
    expect(NewTesterCall.safeParse({ photoId: null, photoDescription: null }).success).toBe(false)
  })
})

describe('a new message of a thread (NewTesterMessage)', () => {
  it('takes a feedback with an outcome, the device, text and capture being optional', () => {
    expect(NewTesterMessage.parse(feedback())).toEqual(feedback())
    expect(
      NewTesterMessage.parse(feedback({ device: null, text: null, captureId: null })),
    ).toMatchObject({ kind: 'feedback', outcome: 'partly', device: null, text: null })
    expect(NewTesterMessage.safeParse(feedback({ captureId: PHOTO })).success).toBe(true)
    for (const outcome of ['yes', 'partly', 'no']) {
      expect(NewTesterMessage.safeParse(feedback({ outcome })).success, outcome).toBe(true)
    }
    for (const device of ['phone', 'computer', 'tablet']) {
      expect(NewTesterMessage.safeParse(feedback({ device })).success, device).toBe(true)
    }
  })

  it('refuses a feedback without an outcome, or with an unknown one', () => {
    expect(NewTesterMessage.safeParse(feedback({ outcome: undefined })).success).toBe(false)
    expect(NewTesterMessage.safeParse(feedback({ outcome: null })).success).toBe(false)
    expect(NewTesterMessage.safeParse(feedback({ outcome: 'maybe' })).success).toBe(false)
    expect(NewTesterMessage.safeParse(feedback({ device: 'watch' })).success).toBe(false)
  })

  it('takes 1 000 characters in a feedback or a reply, and refuses more', () => {
    const longest = 'é'.repeat(MESSAGE_TEXT_MAX)
    const tooLong = 'é'.repeat(MESSAGE_TEXT_MAX + 1)
    expect(NewTesterMessage.safeParse(feedback({ text: longest })).success).toBe(true)
    expect(NewTesterMessage.safeParse(reply({ text: longest })).success).toBe(true)
    expect(NewTesterMessage.safeParse(feedback({ text: tooLong })).success).toBe(false)
    expect(NewTesterMessage.safeParse(reply({ text: tooLong })).success).toBe(false)
  })

  it('refuses a text that shows nothing: a feedback sends null instead', () => {
    for (const text of INVISIBLE_TEXTS) {
      expect(NewTesterMessage.safeParse(feedback({ text })).success, JSON.stringify(text)).toBe(
        false,
      )
      expect(NewTesterMessage.safeParse(reply({ text })).success, JSON.stringify(text)).toBe(false)
    }
  })

  it('refuses a reply without text', () => {
    expect(NewTesterMessage.safeParse(reply({ text: null })).success).toBe(false)
    expect(NewTesterMessage.safeParse({ kind: 'reply' }).success).toBe(false)
  })

  it('keeps each kind to its own fields', () => {
    // Une réponse n'a ni issue ni capture ; un retour n'a pas de champ inconnu.
    expect(NewTesterMessage.safeParse(reply({ outcome: 'yes' })).success).toBe(false)
    expect(NewTesterMessage.safeParse(reply({ captureId: PHOTO })).success).toBe(false)
    expect(NewTesterMessage.safeParse(feedback({ settled: true })).success).toBe(false)
    expect(NewTesterMessage.safeParse(feedback({ kind: 'note' })).success).toBe(false)
    expect(NewTesterMessage.safeParse({ ...feedback(), kind: undefined }).success).toBe(false)
    expect(NewTesterMessage.safeParse(feedback({ captureId: 'pas-un-identifiant' })).success).toBe(
      false,
    )
  })
})

describe('the corner (TesterCorner)', () => {
  it('takes the three roles, the list for the author only', () => {
    expect(
      TesterCorner.safeParse({ role: 'author', closed: false, testerCount: 0, testers: [] })
        .success,
    ).toBe(true)
    expect(
      TesterCorner.safeParse({ role: 'tester', closed: false, testerCount: 12, testers: null })
        .success,
    ).toBe(true)
    expect(
      TesterCorner.safeParse({
        role: 'former_tester',
        closed: false,
        testerCount: null,
        testers: null,
      }).success,
    ).toBe(true)
    expect(
      TesterCorner.safeParse({ role: 'member', closed: false, testerCount: 1, testers: null })
        .success,
    ).toBe(false)
  })
})

describe('the caps of the pages', () => {
  const media = null
  const aCall = (i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    text: `Appel ${i}`,
    photo: media,
    createdAt: '2026-11-02T08:00:00.000Z',
    removal: null,
  })
  const aMessage = (i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    kind: 'reply',
    sender: 'author',
    outcome: null,
    device: null,
    text: `Réponse ${i}`,
    capture: null,
    createdAt: '2026-11-02T08:00:00.000Z',
    settled: null,
    removal: null,
    mine: true,
  })

  it('reads a call back as the API sends it', () => {
    expect(TesterCall.parse(aCall(1))).toEqual(aCall(1))
    expect(TesterCall.safeParse({ ...aCall(1), id: CALL }).success).toBe(true)
  })

  it('caps a page of calls at 20 and a page of messages at 30', () => {
    const calls = (n: number) => Array.from({ length: n }, (_, i) => aCall(i))
    const messages = (n: number) => Array.from({ length: n }, (_, i) => aMessage(i))
    expect(
      TesterCallPage.safeParse({ items: calls(CALLS_PAGE_SIZE), nextCursor: null }).success,
    ).toBe(true)
    expect(
      TesterCallPage.safeParse({ items: calls(CALLS_PAGE_SIZE + 1), nextCursor: null }).success,
    ).toBe(false)
    expect(
      TesterMessagePage.safeParse({ items: messages(MESSAGES_PAGE_SIZE), nextCursor: null })
        .success,
    ).toBe(true)
    expect(
      TesterMessagePage.safeParse({ items: messages(MESSAGES_PAGE_SIZE + 1), nextCursor: null })
        .success,
    ).toBe(false)
  })

  it('caps the excerpt of a thread at 80 characters and an ellipsis', () => {
    const thread = (excerpt: string | null) => ({
      items: [
        {
          tester: {
            id: 'ines',
            name: 'Inès',
            handle: null,
            avatarUrl: null,
            current: true,
            since: null,
          },
          lastAt: '2026-11-02T08:00:00.000Z',
          lastFrom: 'tester',
          unread: true,
          state: 'open',
          excerpt,
        },
      ],
      nextCursor: null,
      counts: { open: 1, settled: 0 },
    })
    expect(TesterThreadPage.safeParse(thread(null)).success).toBe(true)
    expect(TesterThreadPage.safeParse(thread(`${'a'.repeat(80)}…`)).success).toBe(true)
    expect(TesterThreadPage.safeParse(thread('a'.repeat(82))).success).toBe(false)
  })

  it('caps the open feedback at 50', () => {
    const open = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        tester: { name: 'Inès', current: true },
        outcome: 'no',
        excerpt: null,
        createdAt: '2026-11-02T08:00:00.000Z',
      }))
    expect(OpenFeedbackList.safeParse(open(OPEN_FEEDBACK_MAX)).success).toBe(true)
    expect(OpenFeedbackList.safeParse(open(OPEN_FEEDBACK_MAX + 1)).success).toBe(false)
  })
})

describe('the queries of the lists', () => {
  it('reads « À traiter » by default, and refuses a malformed cursor', () => {
    expect(TesterThreadsQuery.parse({})).toEqual({ state: 'open' })
    expect(TesterThreadsQuery.safeParse({ state: 'closed' }).success).toBe(false)
    expect(TesterCursor.safeParse('abc_DEF-123').success).toBe(true)
    expect(TesterCursor.safeParse("x' or '1'='1").success).toBe(false)
    expect(TesterCursor.safeParse('').success).toBe(false)
  })
})
