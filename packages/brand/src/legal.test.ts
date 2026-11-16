// Tests des coordonnées des Mentions légales (R11) : une seule adresse de contact, aucun champ
// vide, et la liste des champs encore à remplir avant le déploiement.
import { describe, expect, it } from 'vitest'
import { contactEmail, legal, legalPlaceholder, legalPlaceholders } from './index'

describe('legal', () => {
  it('gives the contact address written once in name.ts', () => {
    expect(legal.publisher.email).toBe(contactEmail)
  })

  it('never leaves a field empty: unknown values are marked', () => {
    const values = [
      ...Object.values(legal.publisher),
      legal.publicationDirector,
      ...Object.values(legal.host),
    ]
    for (const value of values) expect(value.trim()).not.toBe('')
  })

  it('lists exactly the fields still marked, by their path', () => {
    const marked = Object.entries({
      'publisher.name': legal.publisher.name,
      'publisher.address': legal.publisher.address,
      'publisher.phone': legal.publisher.phone,
      'publisher.siren': legal.publisher.siren,
      'publisher.email': legal.publisher.email,
      publicationDirector: legal.publicationDirector,
      'host.name': legal.host.name,
      'host.address': legal.host.address,
      'host.phone': legal.host.phone,
    })
      .filter(([, value]) => value === legalPlaceholder)
      .map(([path]) => path)
    expect(legalPlaceholders()).toEqual(marked)
  })
})
