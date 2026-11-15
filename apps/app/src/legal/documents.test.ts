// Tests de legal/documents.ts (R11) : chaque page reprend toutes les parties et toutes les puces
// écrites dans les textes, dans l'ordre du fichier de référence (le français). Une partie ajoutée à
// `packages/i18n` sans être ajoutée ici n'apparaîtrait sur aucune page, sans aucune erreur : ce
// test le dit.
import { LEGAL_PAGES, RULES_VERSION } from '@ruche/contracts'
import { resources } from '@ruche/i18n'
import { fr } from '../testing/text'
import { LEGAL_VERSIONS, legalDocument } from './documents'

const written = resources.fr.translation.legal.pages

describe('legalDocument (R11)', () => {
  it('shows every part written in the texts, in their order', () => {
    for (const page of LEGAL_PAGES) {
      expect({
        page,
        parts: legalDocument(page, fr.t).sections.map((section) => section.id),
      }).toEqual({ page, parts: Object.keys(written[page].sections) })
    }
  })

  it('shows every summary point written in the texts', () => {
    // Le typage oblige déjà à donner une icône à chaque puce ; ce test vérifie que chacune est lue.
    for (const page of LEGAL_PAGES) {
      expect({ page, points: legalDocument(page, fr.t).summary.length }).toEqual({
        page,
        points: Object.keys(written[page].summary).length,
      })
    }
  })

  it('dates the rules with the version members accept, and every page with a real day', () => {
    expect(LEGAL_VERSIONS.rules).toBe(RULES_VERSION)
    for (const page of LEGAL_PAGES) {
      const version = legalDocument(page, fr.t).version
      expect(version).toBe(LEGAL_VERSIONS[page])
      expect(new Date(`${version}T12:00:00Z`).toISOString().slice(0, 10)).toBe(version)
    }
  })
})
