// La date de la Confidentialité (R12, relecture juridique de la branche, point 5). R12 en réécrit
// sept parties (le public, le signalement sans compte, les compteurs, le repère de connexion, les
// durées, les droits, l'assistant) : un membre qui a lu la version du 16 novembre doit voir qu'elle
// a changé. Elle part le même jour que les Règles (`RULES_VERSION`) : si la tranche part plus tard,
// les deux dates changent ensemble, et ce test avec elles.
import { RULES_VERSION } from '@ruche/contracts'
import { fr } from '../testing/text'
import { legalDocument } from './documents'

describe('the privacy page version (R12)', () => {
  it('dates the privacy page of R12 on the day of the new rules', () => {
    expect(legalDocument('privacy', fr.t).version).toBe('2026-11-17')
    expect(RULES_VERSION).toBe('2026-11-17')
  })
})
