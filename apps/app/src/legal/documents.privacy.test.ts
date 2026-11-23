// La date de la Confidentialité (R12, relecture juridique de la branche, point 5). R12 en réécrit
// sept parties (le public, le signalement sans compte, les compteurs, le repère de connexion, les
// durées, les droits, l'assistant) : un membre qui a lu la version du 16 novembre doit voir qu'elle
// a changé. R12 la datait du jour des Règles (`RULES_VERSION`). R19 y ajoute la récolte (pollen,
// niveaux, sceaux, miel, classements) ; ses Règles décrivent aussi le classement de la semaine
// (relecture juridique de R19, point 2) : les deux prennent la même date.
import { RULES_VERSION } from '@ruche/contracts'
import { fr } from '../testing/text'
import { legalDocument } from './documents'

describe('the privacy page version (R12, then R19)', () => {
  it('dates the privacy page on the day of its last change, the harvest of R19', () => {
    expect(legalDocument('privacy', fr.t).version).toBe('2026-11-23')
    expect(RULES_VERSION).toBe('2026-11-23')
  })
})
