// Tests de defangLinks (tranche 6c, relecture de sécurité S-B1) : aucun lien venu d'un membre ne
// doit pouvoir devenir cliquable dans un e-mail. Gmail ou Outlook transforment d'eux-mêmes
// « waiggle-login.com » en lien, dans le texte comme dans le HTML ; un e-mail signé par notre
// domaine qui pointe vers un faux site serait un hameçonnage parfait. Toute adresse ou tout nom
// de domaine écrit par un membre (extrait, titre, nom) devient donc « [lien] ».
import { describe, expect, it } from 'vitest'
import { defangLinks } from './links'

describe('defangLinks', () => {
  it('replaces a full address with « [lien] »', () => {
    const result = defangLinks('reconnecte-toi sur https://evil.example/login?next=1 vite')

    expect(result).not.toContain('evil.example')
    expect(result).not.toContain('https://')
    expect(result).toBe('reconnecte-toi sur [lien] vite')
  })

  it('replaces an address without its scheme, a bare domain or a « www. » one', () => {
    for (const written of [
      'waiggle-login.com',
      'www.evil.example',
      'support.example.com',
      'evil.example/login',
      'EVIL.COM',
      'http://192.168.0.1/admin',
      'xn--exmple-cua.com',
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, written).toBe('va sur [lien] maintenant')
    }
  })

  it('replaces the domain of an e-mail address', () => {
    const result = defangLinks('écris à support@waiggle-login.com')

    expect(result).not.toContain('waiggle-login.com')
    expect(result).toContain('[lien]')
  })

  it('replaces every address of a text, not only the first one', () => {
    const result = defangLinks('a.com, puis https://b.example et www.c.net')

    expect(result).toBe('[lien], puis [lien] et [lien]')
  })

  it('leaves ordinary words, numbers and handles untouched', () => {
    for (const ordinary of [
      'Super idée, je teste ce soir.',
      'La version 2.0 sort à 14.30, prix 3.14 €.',
      'Merci @ines_morel !',
      'Météo, quartier par quartier…',
      'Inès Morel',
      'e-mail et mot-clé',
    ]) {
      expect(defangLinks(ordinary)).toBe(ordinary)
    }
  })
})
