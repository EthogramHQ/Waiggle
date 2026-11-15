// Tests des règles du formulaire pour « Une ruche » (R10, « Un projet réservé à une ruche ») :
// la ruche part toujours avec sa visibilité, et repasser en « Membres de Waiggle » ou « Privé »
// l'efface. Fonctions pures : aucun écran, aucun réseau.
import { emptyProjectForm, type ProjectForm, settleAudience, toProjectChanges } from './form'

const FAMILLE = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c01'
const AMIS = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c02'

/** Un projet prêt à partir, réservé à Famille. */
const reserved: ProjectForm = {
  ...emptyProjectForm,
  title: 'Le plan de table',
  pitch: 'Placer les invités sans fâcher personne',
  primaryCategory: 'science',
  audience: 'hive',
  hiveId: FAMILLE,
}

describe('a project reserved to a hive (R10)', () => {
  it('sends the hive with its visibility when publishing', () => {
    const checked = toProjectChanges(reserved)
    expect(checked).toEqual({
      ok: true,
      changes: expect.objectContaining({ visibility: 'hive', hiveId: FAMILLE }),
    })
  })

  it('refuses « Une ruche » without a hive, and sends nothing', () => {
    const checked = toProjectChanges({ ...reserved, hiveId: null })
    expect(checked).toEqual({ ok: false, errors: { hiveId: 'hiveRequired' } })
  })

  it('forgets the hive when going back to « Membres de Waiggle » or « Privé »', () => {
    expect(settleAudience({ ...reserved, audience: 'members' }).hiveId).toBeNull()
    expect(settleAudience({ ...reserved, audience: 'private' }).hiveId).toBeNull()
    // Témoin : « Une ruche » garde sa ruche.
    expect(settleAudience(reserved).hiveId).toBe(FAMILLE)
  })

  it('saves a reserved project made visible to members without any hive', () => {
    const next = settleAudience({ ...reserved, audience: 'members' })
    const checked = toProjectChanges(next, reserved)
    expect(checked).toEqual({ ok: true, changes: { visibility: 'public' } })
  })

  it('saves a move to another hive with its visibility', () => {
    const checked = toProjectChanges({ ...reserved, hiveId: AMIS }, reserved)
    expect(checked).toEqual({ ok: true, changes: { visibility: 'hive', hiveId: AMIS } })
  })
})
