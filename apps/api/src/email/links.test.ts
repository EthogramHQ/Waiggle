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

  // Ajoutés avec les corrections de la relecture de sécurité (B1, A1) : un domaine collé à une
  // ponctuation, ou écrit avec des caractères que la messagerie ou le navigateur lisent comme les
  // lettres et le point ordinaires, passait intact.
  it('replaces a domain glued to a hyphen, an underscore or a colon', () => {
    for (const written of [
      '-waiggle-login.com',
      '_waiggle-login.com',
      'Support -waiggle-login.com',
      ':-evil.com',
      'x--evil.com',
      'voir:evil.com',
      '(evil.com)',
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, written).not.toContain('waiggle-login.com')
      expect(result, written).not.toContain('evil.com')
      expect(result, written).toContain('[lien]')
    }
  })

  it('replaces a domain written with a look-alike dot or an invisible character', () => {
    for (const written of [
      'evil。com', // 。 point idéographique
      'evil．com', // ． point pleine chasse
      'evil｡com', // ｡ point idéographique demi-chasse
      'evil․com', // ․ point de conduite
      'evil​.com', // espace sans largeur
      'evil­.com', // trait d'union conditionnel
      'ｅｖｉｌ.com', // ｅｖｉｌ en lettres pleine chasse
      'evil.c‍om', // liant au milieu de l'extension
    ]) {
      const result = defangLinks(`va sur ${written} maintenant`)

      expect(result, JSON.stringify(written)).toBe('va sur [lien] maintenant')
    }
  })

  it('keeps the text as it was written around an address', () => {
    expect(defangLinks('Super… voir evil.com… ﬁn')).toBe('Super… voir [lien]… ﬁn')
    // Les émojis assemblés (liant U+200D) restent entiers.
    expect(defangLinks('Bravo 👩‍💻')).toBe('Bravo 👩‍💻')
  })

  it('writes the placeholder it is given, in the language of the e-mail', () => {
    expect(defangLinks('go to evil.com now', '[link]')).toBe('go to [link] now')
  })
})
