// Tests du lien vers notre adresse de contact (R9, scénario « L'adresse de contact, partout un
// lien ») : la connexion, les bandeaux, les notifications de modération et la feuille « Signaler »
// écrivaient l'adresse en texte ; elle devient un lien qui ouvre la messagerie, avec un objet
// facultatif (« Contester » nomme la décision contestée, J12).
//
// L'API attendue de `ui/ContactLink` (fixée au découpage du plan de R9) :
//   { subject?: string; children?: string }
//   rôle `link`, nom = le texte affiché (l'adresse par défaut) ;
//   ouvre `mailto:<contactEmail>?subject=…` (l'adresse vient de @ruche/brand, et de nulle part ailleurs).
import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ContactLink } from './ContactLink'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

/** Le texte d'un lien qui n'est pas l'adresse (la notice d'une partie retirée). */
const CONTEST = 'Contester'

/** L'adresse ouverte par le dernier toucher. */
const opened = (): string => String(openURL.mock.calls.at(-1)?.[0] ?? '')

/**
 * L'objet d'un lien `mailto:` : tout ce qui suit `?subject=`, décodé. Un `mailto:` code les espaces
 * en `%20` (RFC 6068), jamais en `+` : `decodeURIComponent`, pas `URLSearchParams`.
 */
const subjectOf = (url: string): string | null => {
  const [, query] = url.split('?')
  if (query === undefined) return null
  const fields = query.split('&')
  expect(fields).toHaveLength(1)
  const [name, value] = (fields[0] ?? '').split('=')
  expect(name).toBe('subject')
  return decodeURIComponent(value ?? '')
}

describe('ContactLink', () => {
  it('shows the contact address as a link named by it', async () => {
    await renderWithProviders(<ContactLink />)

    expect(screen.getByRole('link', { name: contactEmail })).toBeTruthy()
    expect(screen.getByText(contactEmail)).toBeTruthy()
  })

  it('opens the mail app on the contact address, with no subject by default', async () => {
    await renderWithProviders(<ContactLink />)

    await fireEvent.press(screen.getByRole('link', { name: contactEmail }))

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(opened()).toBe(`mailto:${contactEmail}`)
  })

  it('shows another text when given one, and is named by it', async () => {
    await renderWithProviders(<ContactLink>{CONTEST}</ContactLink>)

    expect(screen.getByRole('link', { name: 'Contester' })).toBeTruthy()
    // Le nom lu suit le texte affiché (WCAG 2.5.3) : l'adresse n'est pas le nom du lien.
    expect(screen.queryByRole('link', { name: contactEmail })).toBeNull()
    await fireEvent.press(screen.getByRole('link', { name: 'Contester' }))
    expect(opened()).toBe(`mailto:${contactEmail}`)
  })

  it('opens mailto with a subject naming the decision and its date', async () => {
    const subject = 'Contestation : retrait de la 2e photo de « Météo » du 12 nov. 2026'
    await renderWithProviders(<ContactLink subject={subject}>{CONTEST}</ContactLink>)

    await fireEvent.press(screen.getByRole('link', { name: 'Contester' }))

    expect(opened().startsWith(`mailto:${contactEmail}?subject=`)).toBe(true)
    expect(subjectOf(opened())).toBe(subject)
    // Encodé : aucune espace ni guillemet brut dans l'adresse ouverte.
    expect(opened()).not.toMatch(/[\s«»]/)
  })

  it('keeps a subject with « & » or « ? » as one subject, never another field of the mail', async () => {
    // Un objet fait d'un titre écrit par un membre ne doit pas ajouter un destinataire caché.
    const subject = 'Contestation : retrait de « Q&R ?bcc=x@example.com » du 12 nov.'
    await renderWithProviders(<ContactLink subject={subject} />)

    await fireEvent.press(screen.getByRole('link', { name: contactEmail }))

    expect(subjectOf(opened())).toBe(subject)
    expect(opened()).not.toContain('bcc=')
  })
})
