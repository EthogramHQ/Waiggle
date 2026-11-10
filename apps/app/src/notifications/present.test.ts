// Tests de ce qu'écrit une notification d'Activité, et d'où elle mène (notifications/present.ts),
// pour les sortes de R7a : une mise à jour d'un projet qu'on suit ou qu'on teste (« Papi Jean a
// publié une mise à jour de « Décollage ! » · v1.2 », sa première ligne dessous, la frise au
// toucher), le retrait d'une mise à jour par la modération, et le signalement traité d'une mise à
// jour ou d'une ancienne note (les signalements d'avant R7a se lisent toujours). Des fonctions
// pures : pas d'écran à monter, seulement les textes français de l'appli.
import type { Notification } from '@ruche/contracts'
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
