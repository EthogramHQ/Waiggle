// Tests de la page « Réglages » (refonte, tranche R2), qui remplace « Mon compte ». En haut, la
// carte du membre (« Voir ma page », « Modifier ») ; puis les rubriques : Mon profil, Notifications,
// Langue, Apparence, Mes données, Sécurité, Compte, À propos, et Modération pour un administrateur.
// Sur téléphone, une liste de liens vers /settings/<rubrique> ; sur ordinateur, la colonne des
// rubriques (SettingsNav) à gauche et la rubrique ouverte à droite.
//
// Interface attendue : `<SettingsScreen />` affiche la page d'accueil des réglages ;
// `<SettingsScreen section="language" />` ouvre la rubrique (la page /settings/<rubrique>).
//
// Relecture juridique du plan (jur-11) : rien de ce que l'on règle aujourd'hui ne disparaît. Chaque
// entrée de « Mon compte » est retrouvée ici, dans sa rubrique, avec son aide.
import { contactEmail, sourceUrl } from '@ruche/brand'
import type { EmailPreferences } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { downloadMyData, signOut } from '../accounts/api'
import { request } from '../api/client'
import { getMe } from '../profile/api'
import { leaEmailPreferences } from '../testing/email'
import { adminMe, leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithI18n, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SettingsScreen } from './SettingsScreen'

// Le choix de la langue enregistre la langue sur le compte : on remplace aussi ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  downloadMyData: jest.fn(),
}))
// Les réglages d'e-mail (rubrique Notifications) passent par le client réseau : un faux serveur
// rend ceux de Léa (voir ProfileScreen.test.tsx, « les réglages d'e-mail »).
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockReplace = jest.fn()
const mockPush = jest.fn()
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports. Un `Link`
// d'Expo Router devient un simple texte au rôle de lien, qui passe son adresse au faux `push`.
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/settings',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

const emailPath = '/v1/me/email-preferences'
let storedEmails: EmailPreferences
const fakeRequest = async (to: string, init: RequestInit = {}) => {
  if (to !== emailPath) return { ok: false, error: 'notFound' } as const
  if (init.method === 'PATCH') {
    storedEmails = { ...storedEmails, ...JSON.parse(String(init.body)) }
  }
  return { ok: true, data: storedEmails } as const
}

const lea = { user: { name: 'Léa', email: 'lea@example.com' } }
// Le nom de chaque rubrique et son aide, tels que l'écran les lit dans les traductions.
const sections = {
  profile: fr.t(($) => $.settings.sections.profile),
  notifications: fr.t(($) => $.settings.sections.notifications),
  language: fr.t(($) => $.settings.sections.language),
  appearance: fr.t(($) => $.settings.sections.appearance),
  data: fr.t(($) => $.settings.sections.data),
  security: fr.t(($) => $.settings.sections.security),
  account: fr.t(($) => $.settings.sections.account),
  about: fr.t(($) => $.settings.sections.about),
  moderation: fr.t(($) => $.settings.sections.moderation),
}
const hints = {
  profile: fr.t(($) => $.settings.hints.profile),
  notifications: fr.t(($) => $.settings.hints.notifications),
  language: fr.t(($) => $.settings.hints.language),
  appearance: fr.t(($) => $.settings.hints.appearance),
  data: fr.t(($) => $.settings.hints.data),
  security: fr.t(($) => $.settings.hints.security),
  account: fr.t(($) => $.settings.hints.account),
  about: fr.t(($) => $.settings.hints.about),
}

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/**
 * Une entrée des réglages qu'on touche : un lien (vers une page) ou un bouton (une action), selon
 * ce que l'écran a choisi. Le test vérifie où elle mène, pas la forme.
 */
const entry = (name: string | RegExp) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })
/** La même entrée, attendue si elle n'apparaît qu'une fois le profil arrivé. */
const findEntry = (name: string | RegExp) => waitFor(() => entry(name))

/** Toutes les adresses demandées au routeur, chemin seul (« /settings/language »). */
const paths = () => visited(mockPush, mockReplace).map(pathOf)

beforeEach(() => {
  mockSession(lea)
  storedEmails = { ...leaEmailPreferences }
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(signOut).mockReset()
  jest.mocked(downloadMyData).mockReset()
  mockReplace.mockReset()
  mockPush.mockReset()
})

describe('SettingsScreen, the page', () => {
  it('is titled « Réglages »', async () => {
    await renderWithI18n(<SettingsScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.settings.title) })).toBeTruthy()
  })

  it('shows the member card: name, « Voir ma page » and « Modifier »', async () => {
    await renderWithI18n(<SettingsScreen />)

    expect(await screen.findByText('Léa')).toBeTruthy()
    await fireEvent.press(entry(fr.t(($) => $.settings.viewPage)))
    await fireEvent.press(entry(fr.t(($) => $.settings.edit)))

    // Sa page publique (celle que les autres voient), puis la feuille du profil.
    expect(paths()).toContain(`/members/${leaMe.id}`)
    expect(paths()).toContain('/settings/profile')
  })

  it('lists every section, each with what it contains, as a link to its page (phone)', async () => {
    await renderWithI18n(<SettingsScreen />)

    for (const key of [
      'profile',
      'notifications',
      'language',
      'appearance',
      'data',
      'security',
      'account',
      'about',
    ] as const) {
      const row = entry(containing(sections[key]))
      expect(row).toBeTruthy()
      // L'aide sous le nom : ce que contient la rubrique (« Photo, nom, pseudo et présentation »).
      expect(screen.getAllByText(containing(hints[key])).length).toBeGreaterThan(0)
      mockPush.mockClear()
      mockReplace.mockClear()
      await fireEvent.press(row)
      expect(paths()).toContain(`/settings/${key}`)
    }
  })

  it('keeps the sections in the order of the scenario', async () => {
    await renderWithI18n(<SettingsScreen />)

    const expected = [
      sections.profile,
      sections.notifications,
      sections.language,
      sections.appearance,
      sections.data,
      sections.security,
      sections.account,
      sections.about,
    ]
    const order = screen
      .getAllByText(new RegExp(`^(${expected.join('|')})$`))
      .map((element) => String(element.props.children))
    expect(order).toEqual(expected)
  })

  it('offers « Modération » to an administrator only', async () => {
    jest.mocked(getMe).mockResolvedValue(adminMe)
    await renderWithI18n(<SettingsScreen />)

    // Le profil arrive après l'affichage : la rubrique apparaît quand on sait qu'il est administrateur.
    await fireEvent.press(await findEntry(containing(sections.moderation)))

    expect(paths().some((path) => path === '/moderation' || path === '/settings/moderation')).toBe(
      true,
    )
  })

  it('shows no « Modération » to a member who is not an administrator', async () => {
    await renderWithI18n(<SettingsScreen />)

    // Témoin : le profil est arrivé (le nom de la carte en dépend).
    expect(await screen.findByText('Léa')).toBeTruthy()
    expect(jest.mocked(getMe)).toHaveBeenCalled()
    expect(screen.queryByText(sections.moderation)).toBeNull()
  })

  it('says so when the profile cannot be loaded, and still lets the member reach the sections', async () => {
    jest.mocked(getMe).mockRejectedValue(new TypeError('Network request failed'))
    await renderWithI18n(<SettingsScreen />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(entry(containing(sections.account))).toBeTruthy()
  })
})

describe('SettingsScreen on a computer', () => {
  let restore: () => void
  beforeEach(() => {
    restore = setDesktopWindow()
  })
  afterEach(() => restore())

  it('shows the sections as a navigation column, the open one marked current, next to its content', async () => {
    await renderWithI18n(<SettingsScreen section="language" />)

    // La colonne : une zone de navigation nommée (SettingsNav), un lien par rubrique.
    expect(roleOf(screen.getByLabelText(fr.t(($) => $.settings.title)).props)).toBe('navigation')
    const current = screen.getByRole('link', { name: sections.language })
    expect(current.props['aria-current']).toBe('page')
    expect(screen.getByRole('link', { name: sections.about }).props['aria-current']).not.toBe(
      'page',
    )
    expect(screen.getByRole('link', { name: sections.about }).props.href).toBe('/settings/about')
    // La rubrique ouverte, à côté : le choix de la langue.
    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.account.language.hint))).toBeTruthy()
  })

  it('opens another section from the column, and the address follows', async () => {
    await renderWithI18n(<SettingsScreen section="language" />)

    await fireEvent.press(screen.getByRole('link', { name: sections.appearance }))

    expect(paths()).toContain('/settings/appearance')
  })

  it('keeps the member card above the sections', async () => {
    await renderWithI18n(<SettingsScreen section="language" />)

    expect(await screen.findByText('Léa')).toBeTruthy()
    expect(entry(fr.t(($) => $.settings.viewPage))).toBeTruthy()
  })
})

// --- jur-11 : chaque réglage d'aujourd'hui, retrouvé dans sa rubrique ---

describe('the « Langue » section', () => {
  it('offers the languages, with the help about the e-mails', async () => {
    await renderWithI18n(<SettingsScreen section="language" />)

    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Français', checked: true })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.account.language.hint))).toBeTruthy()
  })
})

describe('the « Apparence » section', () => {
  it('lets the member choose the appearance of this device, with its help', async () => {
    await renderWithI18n(<SettingsScreen section="appearance" />)

    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.account.appearance.auto), checked: true }),
    ).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.account.appearance.hint))).toBeTruthy()

    await fireEvent.press(
      screen.getByRole('radio', { name: fr.t(($) => $.account.appearance.night) }),
    )

    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.account.appearance.night), checked: true }),
    ).toBeTruthy()
  })
})

describe('the « Mes données » section', () => {
  it('lets the member download their data, and says when it is done', async () => {
    jest.mocked(downloadMyData).mockResolvedValue({ ok: true })
    await renderWithI18n(<SettingsScreen section="data" />)

    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.account.export.button) }),
    )

    expect(await screen.findByText(fr.t(($) => $.account.export.done))).toBeTruthy()
  })
})

describe('the « Sécurité » section', () => {
  it('leads to « Changer mon mot de passe » and to « Membres bloqués »', async () => {
    await renderWithI18n(<SettingsScreen section="security" />)

    await fireEvent.press(entry(containing(fr.t(($) => $.settings.changePassword.title))))
    await fireEvent.press(entry(containing(fr.t(($) => $.account.blocks))))

    // La page du mot de passe vit sous la rubrique Sécurité ; la liste des bloqués garde sa page.
    expect(paths().some((path) => /password/.test(path))).toBe(true)
    expect(paths().some((path) => /\/blocks$/.test(path))).toBe(true)
  })
})

describe('the « Compte » section', () => {
  it('shows the current address on a row named after the action, which leads to the change page', async () => {
    await renderWithI18n(<SettingsScreen section="account" />)

    // Le nom lu dit ce que fait la ligne (« Changer d'adresse e-mail : … »), pas seulement ce
    // qu'elle montre (relecture juridique de la tranche « adresse », J9).
    await fireEvent.press(
      await findEntry(fr.t(($) => $.account.email.spoken, { email: 'lea@example.com' })),
    )

    expect(screen.getByText('lea@example.com')).toBeTruthy()
    expect(paths()).toContain('/settings/account/email')
  })

  it('signs out and goes back home', async () => {
    jest.mocked(signOut).mockResolvedValue(undefined)
    await renderWithI18n(<SettingsScreen section="account" />)

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.account.signOut) }))

    expect(signOut).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('leads to the sheet that deletes the account', async () => {
    await renderWithI18n(<SettingsScreen section="account" />)

    await fireEvent.press(entry(containing(fr.t(($) => $.account.delete.title))))

    expect(paths()).toContain('/settings/account/delete')
  })

  it('shows the contact address as a link that opens the mail app, with its help', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      await renderWithI18n(<SettingsScreen section="account" />)

      expect(screen.getAllByText(containing(fr.t(($) => $.account.contact.hint))).length).toBe(1)
      const link = screen.getByRole('link', { name: containing(contactEmail) })
      await fireEvent.press(link)

      const href = (link.props as Record<string, unknown>).href
      expect(openURL.mock.calls.length > 0 || href === `mailto:${contactEmail}`).toBe(true)
      if (openURL.mock.calls.length > 0) {
        expect(openURL).toHaveBeenCalledWith(`mailto:${contactEmail}`)
      }
      // Notre propre adresse : pas de page « Tu quittes… ».
      expect(paths().filter((path) => path.startsWith('/out'))).toEqual([])
    } finally {
      openURL.mockRestore()
    }
  })
})

describe('the « À propos » section', () => {
  it('says the app is free software (AGPL, art. 13) and links to the code as an external site', async () => {
    await renderWithI18n(<SettingsScreen section="about" />)

    expect(screen.getAllByText(containing(fr.t(($) => $.home.openSource))).length).toBe(1)
    expect(screen.getAllByText(/logiciel libre/).length).toBeGreaterThan(0)
    const link = screen.getByRole('link', { name: containing(fr.t(($) => $.home.seeCode)) })
    const external = fr.t(($) => $.common.externalSite)
    const props = link.props as Record<string, unknown>
    expect(
      [props.accessibilityHint, props['aria-description'], props.accessibilityLabel].some(
        (value) => typeof value === 'string' && value.includes(external),
      ),
    ).toBe(true)

    await fireEvent.press(link)
    expect(paths().some((path) => path.startsWith('/out') && path.includes(sourceUrl))).toBe(true)
  })
})

describe('the « Notifications » section', () => {
  it('shows the two e-mail switches with their help, saved by the member', async () => {
    await renderWithI18n(<SettingsScreen section="notifications" />)

    const recap = await screen.findByRole('switch', {
      name: fr.t(($) => $.profile.emails.weeklyRecap),
    })
    expect(recap).toBeChecked()
    expect(
      screen.getByRole('switch', { name: fr.t(($) => $.profile.emails.mentionEmails) }),
    ).not.toBeChecked()
    expect(screen.getByText(fr.t(($) => $.profile.emails.weeklyRecapHint))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.profile.emails.mentionEmailsHint))).toBeTruthy()
    // Les e-mails du compte ne dépendent pas de ces réglages : la rubrique le dit toujours.
    expect(screen.getByText(fr.t(($) => $.profile.emails.accountEmails))).toBeTruthy()
  })

  it('saves a setting as soon as it is touched', async () => {
    await renderWithI18n(<SettingsScreen section="notifications" />)
    const recap = await screen.findByRole('switch', {
      name: fr.t(($) => $.profile.emails.weeklyRecap),
    })

    await fireEvent.press(recap)

    const patches = () =>
      jest
        .mocked(request)
        .mock.calls.filter(([to, init]) => to === emailPath && init?.method === 'PATCH')
        .map(([, init]) => JSON.parse(String(init?.body)) as unknown)
    await waitFor(() => expect(patches()).toEqual([{ weeklyRecap: false }]))
    expect(await screen.findByText(fr.t(($) => $.profile.emails.saved))).toBeTruthy()
  })
})
