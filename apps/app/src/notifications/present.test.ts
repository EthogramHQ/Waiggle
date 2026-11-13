// Tests de ce qu'écrit une ligne d'Activité, et d'où elle mène (notifications/present.ts). Des
// fonctions pures : pas d'écran à monter, seulement les textes de l'appli.
//
// R7a : une mise à jour d'un projet qu'on suit ou qu'on teste, le retrait d'une mise à jour par la
// modération, le signalement traité d'une mise à jour ou d'une ancienne note.
// R7b, le coin des testeurs : un appel à tester, un message d'un fil (retour ou réponse), un retour
// réglé, et le retrait d'un appel ou d'un message. Destinations : l'onglet « Appels » du coin pour
// un appel ; pour le testeur, l'onglet « Retours » ; pour l'auteur, le fil du testeur.
//
// R8 (planches R8-Activite et R8-Activite-Plus) : chaque phrase est une seule clé de traduction, en
// morceaux (`parts`) dont les noms et titres sont en gras et la version à part ; à gauche, l'avatar
// de qui a agi ou une icône (rouge pour la modération) ; à droite, la miniature du projet ou la
// tuile de l'outil ; les icônes des réactions reçues. Un commentaire mène à sa page, feuille des
// commentaires ouverte sur lui (`?comment=<id>`) ; un outil, à sa page. Deux sortes nouvelles : le
// projet rangé par l'équipe et l'outil entré au catalogue.
//
// L'API (plan, « API des modules partagés ») : presentNotification(n, t, now) → Presented & {
// leading, parts, thumb, reactions?, version? } ; `target: Href | null`. La forme de la photo dans
// `leading` et `thumb` (l'adresse que l'écran passe à `useMediaSources`) n'est pas fixée : ces tests
// ne lisent que la sorte, le nom, l'icône et sa teinte, le titre.
import { appName } from '@ruche/brand'
import type { Notification } from '@ruche/contracts'
import type { Href } from 'expo-router'
import { createI18n } from '../i18n'
import type { Of } from '../testing/notifications'
import {
  commentNotification,
  feedbackSettledNotification,
  handleNotification,
  memberFollowsNotification,
  mentionNotification,
  meteoProject,
  noReactionCounts,
  papiJeanAuthor,
  projectCategoryNotification,
  projectFollowsNotification,
  reactionsNotification,
  removedCommentNotification,
  removedProjectNotification,
  replyNotification,
  reportHandledNotification,
  suspendedNotification,
  testerCallNotification,
  toolAddedNotification,
  toolMergedNotification,
  updateNotification,
} from '../testing/notifications'
import { fr } from '../testing/text'
import { presentNotification } from './present'

/** La fonction de traduction de l'écran, prise aux textes français des tests. */
type T = Parameters<typeof presentNotification>[1]
const t = fr.t as unknown as T
/** Le jeudi 12 novembre 2026, 9 h à Paris. */
const now = new Date('2026-11-12T08:00:00.000Z')
const present = (notification: Notification) => presentNotification(notification, t, now)

type Shown = ReturnType<typeof presentNotification>

/** La phrase entière d'une ligne, ses morceaux remis bout à bout. */
const sentenceOf = (shown: Shown): string => shown.parts.map((part) => part.text).join('')

/** Une phrase de traduction sans ses marques `<b>` et `<v>` : ce que la ligne écrit en entier. */
const plain = (text: string): string => text.replace(/<\/?[bv]>/g, '')

/** Les morceaux en gras d'une ligne. */
const strongOf = (shown: Shown): string[] =>
  shown.parts.filter((part) => part.style === 'strong').map((part) => part.text)

/** Les morceaux sans `style` vide : `{ text }` et `{ text, style: undefined }` se valent. */
const partsOf = (shown: Shown) =>
  shown.parts.map((part) =>
    part.style ? { text: part.text, style: part.style } : { text: part.text },
  )

/**
 * L'adresse d'une destination, en texte : « /projects/<id>/testers?tab=calls ». Un objet
 * `{ pathname, params }` donne la même adresse : chaque `[clé]` du chemin prend son paramètre, les
 * autres paramètres vont après « ? », par ordre alphabétique.
 */
const addressOf = (target: Href | null): string | null => {
  if (target === null) return null
  if (typeof target === 'string') return target
  const { pathname, params = {} } = target as { pathname: string; params?: Record<string, string> }
  let path = pathname
  const query: string[] = []
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (path.includes(`[${key}]`)) path = path.replace(`[${key}]`, String(value))
    else query.push(`${key}=${value}`)
  }
  return query.length > 0 ? `${path}?${query.join('&')}` : path
}

const decollage = { id: '7f8091a2-b3c4-4dd5-8e6f-708192a3b4c5', title: 'Décollage !', cover: null }
const papiJean = { id: 'u7', name: 'Papi Jean', avatarUrl: null }

/** La mise à jour « Le décompte de la fusée » de Papi Jean, telle qu'Activité la reçoit. */
const projectUpdate: Of<'project_update'> = {
  kind: 'project_update',
  id: 'project_update:5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  at: '2026-10-21T09:00:00.000Z',
  isNew: true,
  project: decollage,
  author: papiJean,
  update: {
    id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
    title: 'Le décompte de la fusée',
    version: 'v1.2',
    firstLine: { family: 'new', text: 'Un compte à rebours avant chaque question' },
    moreLines: 0,
  },
}

describe('an update of a project one follows or tests (R7a, R8)', () => {
  it('names the project and its version, not the author (R8)', () => {
    const shown = present(projectUpdate)

    expect(sentenceOf(shown)).toBe(
      plain(
        fr.t(($) => $.notifications.projectUpdateVersion, {
          title: 'Décollage !',
          version: 'v1.2',
        }),
      ),
    )
    expect(sentenceOf(shown)).not.toMatch(/Papi Jean/)
    expect(partsOf(shown)).toContainEqual({ text: 'v1.2', style: 'version' })
  })

  it('says it without a version when the update has none', () => {
    const plainUpdate = { ...projectUpdate, update: { ...projectUpdate.update, version: null } }

    expect(sentenceOf(present(plainUpdate))).toBe(
      plain(fr.t(($) => $.notifications.projectUpdate, { title: 'Décollage !' })),
    )
    expect(present(plainUpdate).parts.some((part) => part.style === 'version')).toBe(false)
  })

  it('shows the first line of « Ce qui a changé » under the sentence', () => {
    expect(present(projectUpdate).detail).toBe('Un compte à rebours avant chaque question')
  })

  it('counts the other lines after the first one (« and 2 more changes »)', () => {
    expect(present(updateNotification).detail).toBe(
      fr.t(($) => $.notifications.updateMore, {
        line: 'Un compte à rebours avant chaque question',
        count: 2,
      }),
    )
  })

  it('opens the timeline of the updates of the project', () => {
    expect(present(projectUpdate).target).toEqual({
      pathname: '/projects/[id]/updates',
      params: { id: decollage.id },
    })
  })

  it('draws an icon, since nobody is named', () => {
    expect(present(projectUpdate).leading).toMatchObject({ kind: 'icon' })
  })
})

describe('the moderation and the updates (R7a)', () => {
  it('tells the author that an update was removed, and leads to the project', () => {
    const removed: Of<'removed'> = {
      kind: 'removed',
      id: 'removed:update:5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      at: '2026-10-21T09:00:00.000Z',
      isNew: true,
      targetKind: 'update',
      // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
      part: null,
      project: meteoProject,
      excerpt: 'Un compte à rebours avant chaque question',
      ground: 'rules',
      explanation: 'Publicité répétée.',
      afterReport: true,
      projectHidden: false,
    }

    const shown = present(removed)

    // Le texte du juridique (T1), avec ses espaces insécables : lu dans les traductions.
    expect(sentenceOf(shown)).toBe(
      plain(fr.t(($) => $.notifications.removed.update, { title: 'Météo' })),
    )
    expect(shown.quote).toBe('Un compte à rebours avant chaque question')
    expect(shown.target).toEqual({ pathname: '/projects/[id]', params: { id: meteoProject.id } })
  })

  it('tells the reporter that a reported update was handled', () => {
    const handled: Of<'report_handled'> = {
      kind: 'report_handled',
      id: 'report_handled:0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d',
      at: '2026-10-21T10:00:00.000Z',
      isNew: true,
      targetKind: 'update',
      outcome: 'removed',
      link: null,
    }

    expect(sentenceOf(present(handled))).toBe(
      fr.t(($) => $.notifications.reportHandled.update.removed),
    )
  })

  // Sécurité B1, juridique P1 : un signalement de note d'avant R7a se lit toujours, sans lien.
  it('still reads a handled report of a note from before R7a, leading nowhere', () => {
    const old: Of<'report_handled'> = {
      kind: 'report_handled',
      id: 'report_handled:1b2c3d4e-5f60-4b7c-9d8e-9f0a1b2c3d4e',
      at: '2026-10-20T10:00:00.000Z',
      isNew: false,
      targetKind: 'note',
      outcome: 'dismissed',
      link: null,
    }

    expect(sentenceOf(present(old))).toBe(fr.t(($) => $.notifications.reportHandled.note.dismissed))
    expect(present(old).target).toBeNull()
  })
})

// --- R7b : le coin des testeurs ---

const corner = `/projects/${decollage.id}/testers`
const ines = { id: 'u5', name: 'Inès', avatarUrl: null }

/** Un appel à tester de Papi Jean, reçu par un de ses testeurs. */
const testerCall: Of<'tester_call'> = {
  kind: 'tester_call',
  id: 'tester_call:1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  at: '2026-11-10T09:00:00.000Z',
  isNew: true,
  project: decollage,
  author: papiJean,
  call: {
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    excerpt: 'Essayez le niveau 3 ce week-end, surtout sur téléphone',
  },
}

/** Un message d'un fil : `role`, le rôle de qui l'a envoyé ; `kind`, retour ou réponse. */
const testerMessage = (
  role: 'author' | 'tester',
  kind: 'feedback' | 'reply',
): Of<'tester_message'> => ({
  kind: 'tester_message',
  id: 'tester_message:2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  at: '2026-11-10T10:00:00.000Z',
  isNew: true,
  project: decollage,
  from: role === 'author' ? papiJean : ines,
  role,
  message: { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', kind, testerId: ines.id },
})

/** Un retour d'Inès réglé par Papi Jean : à la main (`update` nul) ou par une mise à jour. */
const feedbackSettled = (update: Of<'feedback_settled'>['update']): Of<'feedback_settled'> => ({
  kind: 'feedback_settled',
  id: 'feedback_settled:3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  at: '2026-11-12T09:00:00.000Z',
  isNew: true,
  project: decollage,
  author: papiJean,
  update,
})
const settledUpdate = {
  id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  version: 'v1.3',
  createdAt: '2026-11-12T09:00:00.000Z',
}

describe('a call for testing (R7b)', () => {
  it('says who calls for testing which project', () => {
    expect(sentenceOf(present(testerCall))).toBe(
      plain(fr.t(($) => $.notifications.testerCall, { name: 'Papi Jean', title: 'Décollage !' })),
    )
  })

  it('quotes the beginning of the call under the sentence', () => {
    expect(present(testerCall).quote).toBe(testerCall.call.excerpt)
  })

  it('opens the « Appels » tab of the testers corner', () => {
    expect(addressOf(present(testerCall).target)).toBe(`${corner}?tab=calls`)
  })
})

describe('a message of a tester thread (R7b)', () => {
  it('tells the author that a tester sent feedback, and opens the thread of that tester', () => {
    const shown = present(testerMessage('tester', 'feedback'))

    expect(sentenceOf(shown)).toBe(
      plain(fr.t(($) => $.notifications.testerFeedback, { name: 'Inès', title: 'Décollage !' })),
    )
    expect(addressOf(shown.target)).toBe(`${corner}/threads/${ines.id}`)
  })

  it('tells the author that a tester replied, and opens the thread of that tester', () => {
    const shown = present(testerMessage('tester', 'reply'))

    expect(sentenceOf(shown)).toBe(
      plain(
        fr.t(($) => $.notifications.testerReplyToAuthor, { name: 'Inès', title: 'Décollage !' }),
      ),
    )
    expect(addressOf(shown.target)).toBe(`${corner}/threads/${ines.id}`)
  })

  it('tells the tester that the author replied to the feedback, and opens « Retours »', () => {
    const shown = present(testerMessage('author', 'reply'))

    expect(sentenceOf(shown)).toBe(
      plain(
        fr.t(($) => $.notifications.testerReplyToTester, {
          name: 'Papi Jean',
          title: 'Décollage !',
        }),
      ),
    )
    expect(addressOf(shown.target)).toBe(`${corner}?tab=feedback`)
  })

  // Le fil est privé : la notification ne montre jamais le texte du message (le contrat ne le
  // donne pas), seulement qui a écrit et sur quel projet.
  it('shows no text of the private thread', () => {
    for (const role of ['author', 'tester'] as const) {
      const shown = present(testerMessage(role, 'reply'))
      expect(shown.quote).toBeNull()
      expect(shown.detail).toBeNull()
    }
  })
})

describe('a settled feedback (R7b)', () => {
  it('says the author settled the feedback by hand', () => {
    expect(sentenceOf(present(feedbackSettled(null)))).toBe(
      plain(
        fr.t(($) => $.notifications.feedbackSettled, { name: 'Papi Jean', title: 'Décollage !' }),
      ),
    )
  })

  it('names the version of the update that settled it', () => {
    expect(sentenceOf(present(feedbackSettled(settledUpdate)))).toBe(
      plain(
        fr.t(($) => $.notifications.feedbackSettledVersion, {
          name: 'Papi Jean',
          title: 'Décollage !',
          version: 'v1.3',
        }),
      ),
    )
  })

  // Relecture du plan (interface) : la version s'écrit dans la phrase, à sa place, avec son style
  // à elle (planche R8-Activite-Plus : « a réglé ton retour dans la v1.3 de Décollage ! »).
  it('writes the version inline in a settled feedback', () => {
    expect(partsOf(present(feedbackSettled(settledUpdate)))).toEqual([
      { text: 'Papi Jean', style: 'strong' },
      { text: ' a réglé ton retour dans la ' },
      { text: 'v1.3', style: 'version' },
      { text: ' de ' },
      { text: 'Décollage !', style: 'strong' },
    ])
  })

  it('dates the update that settled it when the update has no version', () => {
    const text = sentenceOf(present(feedbackSettled({ ...settledUpdate, version: null })))

    // La date est écrite pour un lecteur (« 12 nov. », « 12 novembre »…), jamais telle que l'API
    // l'envoie ; le reste de la phrase est celui de la traduction.
    const [before = '', after = ''] = plain(
      fr.t(($) => $.notifications.feedbackSettledUpdate, {
        name: 'Papi Jean',
        title: 'Décollage !',
        date: '<date>',
      }),
    ).split('<date>')
    expect(text.startsWith(before)).toBe(true)
    expect(text.endsWith(after)).toBe(true)
    const date = text.slice(before.length, text.length - after.length)
    expect(date).toMatch(/12/)
    expect(date).not.toMatch(/2026-11-12|T09/)
  })

  it('opens the « Retours » tab of the testers corner, where the tester reads « Réglé »', () => {
    expect(addressOf(present(feedbackSettled(settledUpdate)).target)).toBe(`${corner}?tab=feedback`)
    expect(addressOf(present(feedbackSettled(null)).target)).toBe(`${corner}?tab=feedback`)
  })
})

describe('the moderation and the testers corner (R7b)', () => {
  const removed = (targetKind: 'call' | 'message'): Of<'removed'> => ({
    kind: 'removed',
    id: `removed:${targetKind}:4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f8a`,
    at: '2026-11-11T09:00:00.000Z',
    isNew: true,
    targetKind,
    // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
    part: null,
    project: decollage,
    excerpt: 'Essayez le niveau 3 ce week-end',
    ground: 'rules',
    explanation: 'Publicité répétée.',
    afterReport: true,
    projectHidden: false,
  })

  it('tells the author that a call was removed', () => {
    const shown = present(removed('call'))

    expect(sentenceOf(shown)).toBe(
      plain(fr.t(($) => $.notifications.removed.call, { title: 'Décollage !' })),
    )
    expect(shown.quote).toBe('Essayez le niveau 3 ce week-end')
  })

  it('tells the sender that a message was removed', () => {
    expect(sentenceOf(present(removed('message')))).toBe(
      plain(fr.t(($) => $.notifications.removed.message, { title: 'Décollage !' })),
    )
  })

  it('leads a removed call to the « Appels » tab and a removed message to « Retours »', () => {
    expect(addressOf(present(removed('call')).target)).toBe(`${corner}?tab=calls`)
    expect(addressOf(present(removed('message')).target)).toBe(`${corner}?tab=feedback`)
  })

  it('writes the removal of a message without text, with no quote', () => {
    const shown = present({ ...removed('message'), excerpt: null })

    expect(sentenceOf(shown)).toBe(
      plain(fr.t(($) => $.notifications.removed.message, { title: 'Décollage !' })),
    )
    expect(shown.quote).toBeNull()
    expect(shown.detail).toContain(fr.t(($) => $.removal.contest))
    expect(shown.target).not.toBeNull()
  })
})

// --- R8 : les phrases en morceaux ---

describe('the sentences in parts (R8)', () => {
  // Relecture du plan (interface, UI-B1) : une clé par phrase, jamais une phrase recollée de bouts
  // traduits à part ; les noms et les titres en gras.
  it('keeps each sentence in one translation and bolds its marked parts, in French and English', () => {
    const en = createI18n('en')
    const inEnglish = presentNotification(commentNotification, en.t as unknown as T, now)

    expect(partsOf(present(commentNotification))).toEqual([
      { text: 'Malik', style: 'strong' },
      { text: ' a commenté ' },
      { text: 'Météo', style: 'strong' },
    ])
    expect(partsOf(inEnglish)).toEqual([
      { text: 'Malik', style: 'strong' },
      { text: ' commented on ' },
      { text: 'Météo', style: 'strong' },
    ])
    // La phrase anglaise entière est celle de sa traduction, pas une traduction mot à mot.
    expect(sentenceOf(inEnglish)).toBe(
      plain(en.t(($) => $.notifications.comment, { name: 'Malik', title: 'Météo' })),
    )
  })

  it('bolds the title of a project in the reactions, never a name', () => {
    expect(strongOf(present(reactionsNotification))).toEqual(['Météo'])
  })

  // Sécurité : un titre est écrit par un membre ; ses « <b> » restent du texte.
  it('never reads a mark written in the title of a project', () => {
    const shown = present({
      ...commentNotification,
      project: { ...meteoProject, title: 'Mon <b>gras</b> à moi' },
    })

    expect(strongOf(shown)).toEqual(['Malik', 'Mon <b>gras</b> à moi'])
  })
})

// --- R8 : à gauche, qui a agi ou une icône ; à droite, la miniature ---

describe('the left side of a line (R8)', () => {
  it.each([
    ['a comment', commentNotification, 'Malik'],
    ['a mention', mentionNotification, 'Malik'],
    ['a reply', replyNotification, 'Malik'],
    ['a call for testing', testerCallNotification, 'Papi Jean'],
    ['a settled feedback', feedbackSettledNotification, 'Papi Jean'],
  ])('shows the avatar of whoever wrote %s', (_kind, notification, name) => {
    expect(present(notification).leading).toMatchObject({ kind: 'avatar', name })
  })

  it.each([
    ['reactions', reactionsNotification],
    ['project followers', projectFollowsNotification],
    ['account followers', memberFollowsNotification],
    ['an update', updateNotification],
    ['the handle', handleNotification],
    ['a filed project', projectCategoryNotification],
    ['a tool added to the catalogue', toolAddedNotification],
  ])('draws an icon, not red, for %s, which names nobody', (_kind, notification) => {
    const { leading } = present(notification)

    expect(leading.kind).toBe('icon')
    expect(leading.kind === 'icon' && leading.tone).not.toBe('danger')
  })

  it.each([
    ['a removal', removedCommentNotification],
    ['a handled report', reportHandledNotification],
    ['a suspension', suspendedNotification],
  ])('draws a red icon for %s', (_kind, notification) => {
    expect(present(notification).leading).toMatchObject({ kind: 'icon', tone: 'danger' })
  })
})

describe('the right side of a line (R8)', () => {
  it.each([
    ['reactions', reactionsNotification],
    ['a comment', commentNotification],
    ['an update', updateNotification],
    ['a filed project', projectCategoryNotification],
    ['a removed project', removedProjectNotification],
  ])('shows the thumbnail of the project for %s', (_kind, notification) => {
    const title = 'project' in notification ? notification.project.title : ''

    expect(present(notification).thumb).toMatchObject({ kind: 'project', title })
  })

  it('shows the tile of the tool for a tool added to the catalogue', () => {
    expect(present(toolAddedNotification).thumb).toMatchObject({ kind: 'tool', name: 'Glide' })
    expect(present(toolMergedNotification).thumb).toMatchObject({
      kind: 'tool',
      name: 'Glide Apps',
    })
  })

  it.each([
    ['account followers', memberFollowsNotification],
    ['the handle', handleNotification],
    ['a suspension', suspendedNotification],
    // Règle 2 de 7a : ni titre ni image du contenu signalé.
    ['a handled report', reportHandledNotification],
  ])('shows no thumbnail for %s', (_kind, notification) => {
    expect(present(notification).thumb ?? null).toBeNull()
  })

  // Règle 9 de 7b : un projet que je ne vois plus ne se montre pas, ni son titre ni sa photo.
  it('shows no thumbnail of a project hidden from me', () => {
    const elsewhere = {
      ...removedCommentNotification,
      project: {
        ...decollage,
        title: '',
        cover: testerCallNotification.project.cover,
      },
      projectHidden: true,
    }

    expect(present(elsewhere).thumb ?? null).toBeNull()
  })
})

describe('the reactions of a line (R8)', () => {
  it('gives the kinds received, in the order of the reaction bar, and only those', () => {
    const shown = present({
      ...reactionsNotification,
      counts: { ...noReactionCounts, bravo: 2, useful: 1, amazing: 3 },
      total: 6,
    })

    expect(shown.reactions).toEqual(['amazing', 'useful', 'bravo'])
  })
})

// --- R8 : où mène chaque ligne (scénario, « Où mène chaque ligne ») ---

describe('where a line leads (R8)', () => {
  it.each([
    ['a comment', commentNotification],
    ['a mention', mentionNotification],
    ['a reply', replyNotification],
  ])('opens the comments of the project on %s (« see in context »)', (_kind, notification) => {
    expect(addressOf(present(notification).target)).toBe(
      `/projects/${meteoProject.id}?comment=${notification.comment.id}`,
    )
  })

  it('opens the project for reactions and project followers', () => {
    expect(addressOf(present(reactionsNotification).target)).toBe(`/projects/${meteoProject.id}`)
    expect(addressOf(present(projectFollowsNotification).target)).toBe(
      `/projects/${meteoProject.id}`,
    )
  })

  it('opens the project that the team filed', () => {
    expect(addressOf(present(projectCategoryNotification).target)).toBe(
      `/projects/${meteoProject.id}`,
    )
  })

  it('opens the page of the tool added to the catalogue', () => {
    expect(addressOf(present(toolAddedNotification).target)).toBe('/tags/glide')
    expect(addressOf(present(toolMergedNotification).target)).toBe('/tags/glide-apps')
  })

  it('leads nowhere for account followers and a suspension', () => {
    expect(present(memberFollowsNotification).target).toBeNull()
    expect(present(suspendedNotification).target).toBeNull()
  })
})

// --- R8 : deux notifications nouvelles (renvoyées de R6b) ---

describe('the two notifications of the catalogue (R8)', () => {
  it('signs a filed project by the team, never by an administrator, and bolds its title', () => {
    const shown = present(projectCategoryNotification)

    expect(sentenceOf(shown)).toContain(`L’équipe de ${appName}`)
    expect(strongOf(shown)).toContain('Météo')
  })

  it('says that the tool one wrote is now part of the catalogue', () => {
    expect(sentenceOf(present(toolAddedNotification))).toBe(
      plain(fr.t(($) => $.notifications.toolAdded, { name: 'Glide' })),
    )
  })

  it('says under which name the tool one wrote now shows', () => {
    const shown = present(toolMergedNotification)

    expect(sentenceOf(shown)).toBe(
      plain(fr.t(($) => $.notifications.toolMerged, { name: 'Glide', tool: 'Glide Apps' })),
    )
    expect(strongOf(shown)).toEqual(['Glide', 'Glide Apps'])
  })

  it('names nobody but the tool', () => {
    // Témoin : la phrase est là…
    expect(sentenceOf(present(toolAddedNotification)).length).toBeGreaterThan(0)
    // … et ne nomme ni Papi Jean, ni un administrateur.
    expect(sentenceOf(present(toolAddedNotification))).not.toMatch(new RegExp(papiJeanAuthor.name))
  })
})
