// La durée du lien « mot de passe oublié » est écrite en clair dans deux textes de l'appli (« Le lien
// est valable une heure. », « Il a expiré (une heure)… ») ; le serveur, lui, lit la constante
// `RESET_LINK_LIFETIME_SECONDS` du contrat (relecture juridique R2, C5 et jur-4). Ce test les tient
// ensemble : si l'un change sans l'autre, il rougit, et les textes ne mentent pas au membre.
import { RESET_LINK_LIFETIME_SECONDS } from '@ruche/contracts'
import { createI18n } from '../i18n'

const ONE_HOUR_SECONDS = 60 * 60

/** Les deux textes qui citent la durée, dans une langue. */
const lifetimeTexts = (language: 'fr' | 'en') => {
  const i18n = createI18n(language)
  return [
    i18n.t(($) => $.auth.forgotPassword.sentExpires),
    i18n.t(($) => $.auth.resetPassword.invalidBody),
  ]
}

describe('the lifetime of a reset link, said in the app', () => {
  it('lasts one hour on the server', () => {
    expect(RESET_LINK_LIFETIME_SECONDS).toBe(ONE_HOUR_SECONDS)
  })

  it('says « une heure » in French, the lifetime of the server', () => {
    for (const said of lifetimeTexts('fr')) expect(said).toMatch(/une heure/)
  })

  it('says « one hour » in English, the lifetime of the server', () => {
    for (const said of lifetimeTexts('en')) expect(said).toMatch(/one hour/)
  })
})
