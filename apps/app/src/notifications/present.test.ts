// Tests de ce qu'écrit une notification d'Activité, et d'où elle mène (notifications/present.ts),
// pour les sortes de R7a : une mise à jour d'un projet qu'on suit ou qu'on teste (« Papi Jean a
// publié une mise à jour de « Décollage ! » · v1.2 », sa première ligne dessous, la frise au
// toucher), le retrait d'une mise à jour par la modération, et le signalement traité d'une mise à
// jour ou d'une ancienne note (les signalements d'avant R7a se lisent toujours). Des fonctions
// pures : pas d'écran à monter, seulement les textes français de l'appli.
//
// R7b, le coin des testeurs : un appel à tester, un message d'un fil (retour ou réponse), un retour
// réglé (à la main, ou par une mise à jour avec ou sans version), et le retrait d'un appel ou d'un
// message par la modération. Destinations (plan R7b, « Activité ») : l'onglet « Appels » du coin
// pour un appel ; pour le testeur, l'onglet « Retours » du coin (son fil) ; pour l'auteur, le fil du
// testeur. Une destination s'écrit en texte ou en objet (`{ pathname, params }`) : le test compare
// l'adresse qu'elle donne (`addressOf`).
import type { Notification } from '@ruche/contracts'
import type { Href } from 'expo-router'
import type { Of } from '../testing/notifications'
import { meteoProject } from '../testing/notifications'
import { fr } from '../testing/text'
import { presentNotification } from './present'

/** La fonction de traduction de l'écran, prise aux textes français des tests. */
const t = fr.t as unknown as Parameters<typeof presentNotification>[1]
const present = (notification: Notification) => presentNotification(notification, t, 'fr')

const papiJean = { id: 'u7', name: 'Papi Jean', avatarUrl: null }
const decollage = { id: '7f8091a2-b3c4-4dd5-8e6f-708192a3b4c5', title: 'Décollage !' }

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
  },
}

describe('an update of a project one follows or tests (R7a)', () => {
  it('says who published an update of which project, with its version', () => {
    expect(present(projectUpdate).text).toBe(
      fr.t(($) => $.notifications.projectUpdateVersion, {
        name: 'Papi Jean',
        title: 'Décollage !',
        version: 'v1.2',
      }),
    )
  })

  it('says it without a version when the update has none', () => {
    const plain = { ...projectUpdate, update: { ...projectUpdate.update, version: null } }

    expect(present(plain).text).toBe(
      fr.t(($) => $.notifications.projectUpdate, { name: 'Papi Jean', title: 'Décollage !' }),
    )
    expect(present(plain).text).not.toMatch(/·/)
  })

  it('shows the first line of « Ce qui a changé » under the sentence', () => {
    expect(present(projectUpdate).detail).toBe('Un compte à rebours avant chaque question')
  })

  it('opens the timeline of the updates of the project', () => {
    expect(present(projectUpdate).target).toEqual({
      pathname: '/projects/[id]/updates',
      params: { id: decollage.id },
    })
  })

  it('has an icon of its own', () => {
    expect(typeof present(projectUpdate).icon).toBe('string')
    expect(present(projectUpdate).icon.length).toBeGreaterThan(0)
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
      project: meteoProject,
      excerpt: 'Un compte à rebours avant chaque question',
      ground: 'rules',
      explanation: 'Publicité répétée.',
      afterReport: true,
      projectHidden: false,
    }

    const shown = present(removed)

    // Le texte du juridique (T1), avec ses espaces insécables : lu dans les traductions.
    expect(shown.text).toBe(fr.t(($) => $.notifications.removed.update, { title: 'Météo' }))
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

    expect(present(handled).text).toBe(fr.t(($) => $.notifications.reportHandled.update.removed))
  })

  // Sécurité B1, juridique P1 : un signalement de note d'avant R7a se lit toujours, sans lien (sa
  // cible a disparu avec le Journal). Témoin : il passe dès le contrat, qui garde les textes.
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

    expect(present(old).text).toBe(fr.t(($) => $.notifications.reportHandled.note.dismissed))
    expect(present(old).target).toBeNull()
  })
})

// --- R7b : le coin des testeurs ---

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
    expect(present(testerCall).text).toBe(
      fr.t(($) => $.notifications.testerCall, { name: 'Papi Jean', title: 'Décollage !' }),
    )
  })

  it('quotes the beginning of the call under the sentence', () => {
    expect(present(testerCall).quote).toBe(testerCall.call.excerpt)
  })

  it('opens the « Appels » tab of the testers corner', () => {
    expect(addressOf(present(testerCall).target)).toBe(`${corner}?tab=calls`)
  })

  it('has an icon of its own', () => {
    expect(present(testerCall).icon.length).toBeGreaterThan(0)
  })
})

describe('a message of a tester thread (R7b)', () => {
  it('tells the author that a tester sent feedback, and opens the thread of that tester', () => {
    const shown = present(testerMessage('tester', 'feedback'))

    expect(shown.text).toBe(
      fr.t(($) => $.notifications.testerFeedback, { name: 'Inès', title: 'Décollage !' }),
    )
    expect(addressOf(shown.target)).toBe(`${corner}/threads/${ines.id}`)
  })

  it('tells the author that a tester replied, and opens the thread of that tester', () => {
    const shown = present(testerMessage('tester', 'reply'))

    expect(shown.text).toBe(
      fr.t(($) => $.notifications.testerReplyToAuthor, { name: 'Inès', title: 'Décollage !' }),
    )
    expect(addressOf(shown.target)).toBe(`${corner}/threads/${ines.id}`)
  })

  it('tells the tester that the author replied to the feedback, and opens « Retours »', () => {
    const shown = present(testerMessage('author', 'reply'))

    expect(shown.text).toBe(
      fr.t(($) => $.notifications.testerReplyToTester, { name: 'Papi Jean', title: 'Décollage !' }),
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
    expect(present(feedbackSettled(null)).text).toBe(
      fr.t(($) => $.notifications.feedbackSettled, { name: 'Papi Jean', title: 'Décollage !' }),
    )
  })

  it('names the version of the update that settled it', () => {
    expect(present(feedbackSettled(settledUpdate)).text).toBe(
      fr.t(($) => $.notifications.feedbackSettledVersion, {
        name: 'Papi Jean',
        title: 'Décollage !',
        version: 'v1.3',
      }),
    )
  })

  it('dates the update that settled it when the update has no version', () => {
    const text = present(feedbackSettled({ ...settledUpdate, version: null })).text

    // La date est écrite pour un lecteur (« 12 nov. », « 12 novembre »…), jamais telle que l'API
    // l'envoie ; le reste de la phrase est celui de la traduction.
    const [before = '', after = ''] = fr
      .t(($) => $.notifications.feedbackSettledUpdate, {
        name: 'Papi Jean',
        title: 'Décollage !',
        date: '<date>',
      })
      .split('<date>')
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
    project: decollage,
    excerpt: 'Essayez le niveau 3 ce week-end',
    ground: 'rules',
    explanation: 'Publicité répétée.',
    afterReport: true,
    projectHidden: false,
  })

  it('tells the author that a call was removed', () => {
    const shown = present(removed('call'))

    expect(shown.text).toBe(fr.t(($) => $.notifications.removed.call, { title: 'Décollage !' }))
    expect(shown.quote).toBe('Essayez le niveau 3 ce week-end')
  })

  it('tells the sender that a message was removed', () => {
    const shown = present(removed('message'))

    expect(shown.text).toBe(fr.t(($) => $.notifications.removed.message, { title: 'Décollage !' }))
  })

  // Un message retiré sans texte (une capture seule) arrive avec `excerpt: null` : rien à citer,
  // mais la phrase, le fondement et la contestation s'écrivent comme d'habitude.
  it('writes the removal of a message without text, with no quote', () => {
    const shown = present({ ...removed('message'), excerpt: null })

    expect(shown.text).toBe(fr.t(($) => $.notifications.removed.message, { title: 'Décollage !' }))
    expect(shown.quote).toBeNull()
    expect(shown.detail).toContain(fr.t(($) => $.removal.contest))
    expect(shown.target).not.toBeNull()
  })
})
