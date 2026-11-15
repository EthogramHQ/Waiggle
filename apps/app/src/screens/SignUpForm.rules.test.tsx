// Tests des deux accords de l'inscription (tranche R11, « La conformité ») : sous le mot de passe,
// deux cases non cochées, « J'accepte les règles de Waiggle » et « J'ai 15 ans ou plus ». Le bouton
// « Créer mon compte » reste actif ; sans les deux cases, il dit ce qui manque (trois textes : les
// règles, l'âge, les deux), chaque case vide dit pourquoi, et le focus va au premier champ ou à la
// première case à reprendre. Le lien « Lire les règles » est à part, hors de la case (décision D3
// de la relecture du plan) : il ouvre /rules sans rien perdre de ce qui est tapé.
//
// Dans son propre fichier, à côté de SignUpScreen.test.tsx : mêmes faux modules, même façon de
// remplir le formulaire.
import { fireEvent, screen } from '@testing-library/react-native'
import { signUp } from '../accounts/api'
import { pathOf, visited } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from '../ui/focus'
import { SignUpScreen } from './SignUpScreen'

jest.mock('../accounts/api', () => ({ signUp: jest.fn(), signIn: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../ui/focus', () => ({
  ...jest.requireActual('../ui/focus'),
  focusWithoutScroll: jest.fn(() => true),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/sign-up',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      navigate: mockNavigate,
      setParams: mockSetParams,
      back: jest.fn(),
      canGoBack: () => false,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

const signUpMock = jest.mocked(signUp)

const submitLabel = fr.t(($) => $.auth.signUp.submit)
const rulesBox = fr.t(($) => $.rules.accept)
const ageBox = fr.t(($) => $.rules.age)
const readRules = fr.t(($) => $.rules.read)
const missing = {
  rules: fr.t(($) => $.rules.missing.rules),
  age: fr.t(($) => $.rules.missing.age),
  both: fr.t(($) => $.rules.missing.both),
}
const rulesUnchecked = fr.t(($) => $.auth.errors.rulesUnchecked)
const ageUnchecked = fr.t(($) => $.auth.errors.ageUnchecked)

const labels = {
  inviteCode: fr.t(($) => $.auth.fields.inviteCode),
  name: fr.t(($) => $.auth.fields.name),
  email: fr.t(($) => $.auth.fields.email),
  password: fr.t(($) => $.auth.fields.password),
}
const typed = {
  inviteCode: 'miel-2026-noel',
  name: 'Max',
  email: 'max@example.com',
  password: 'correct-horse-battery',
}

/** Remplit les quatre champs, sans toucher aux cases. */
const fillFields = async () => {
  await fireEvent.changeText(screen.getByLabelText(labels.inviteCode), typed.inviteCode)
  await fireEvent.changeText(screen.getByLabelText(labels.name), typed.name)
  await fireEvent.changeText(screen.getByLabelText(labels.email), typed.email)
  await fireEvent.changeText(screen.getByLabelText(labels.password), typed.password)
}
const box = (name: string) => screen.getByRole('checkbox', { name })
const submit = () => fireEvent.press(screen.getByRole('button', { name: submitLabel }))
/** Un lien, ou, faute de mieux, un bouton (charte : `queryByRole('link') ?? getByRole('button')`). */
const linkNamed = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

/** L'élément reçu par le dernier focusWithoutScroll (natif : la vue, avec ses propriétés). */
const focusedProps = (): Record<string, unknown> => {
  const target = jest.mocked(focusWithoutScroll).mock.calls.at(-1)?.[0] as
    | { props?: Record<string, unknown> }
    | null
    | undefined
  return target?.props ?? {}
}

beforeEach(() => {
  signUpMock.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockNavigate.mockReset()
  mockSetParams.mockReset()
  jest.mocked(focusWithoutScroll).mockClear()
})

describe('SignUpForm, the two accords (R11)', () => {
  it('shows two unchecked boxes: the rules and the age', async () => {
    await renderWithProviders(<SignUpScreen />)

    expect(screen.getByRole('checkbox', { name: rulesBox, checked: false })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: ageBox, checked: false })).toBeTruthy()
    // Le nom lu de la case est son libellé entier : le nom de l'appli y est rempli.
    expect(rulesBox).not.toMatch(/\{\{/)
  })

  it('keeps the button active and says both are missing when neither box is checked', async () => {
    await renderWithProviders(<SignUpScreen />)
    await fillFields()

    await submit()

    expect(signUpMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: submitLabel })).not.toBeDisabled()
    expect(screen.getByText(missing.both)).toBeTruthy()
    // Chaque case vide dit pourquoi.
    expect(screen.getByText(rulesUnchecked)).toBeTruthy()
    expect(screen.getByText(ageUnchecked)).toBeTruthy()
  })

  it('with only the age box empty, says only that the age is missing', async () => {
    await renderWithProviders(<SignUpScreen />)
    await fillFields()
    await fireEvent.press(box(rulesBox))

    await submit()

    expect(signUpMock).not.toHaveBeenCalled()
    expect(screen.getByText(missing.age)).toBeTruthy()
    expect(screen.queryByText(missing.both)).toBeNull()
    expect(screen.queryByText(missing.rules)).toBeNull()
    expect(screen.getByText(ageUnchecked)).toBeTruthy()
    expect(screen.queryByText(rulesUnchecked)).toBeNull()
  })

  it('with only the rules box empty, says only that the rules are missing', async () => {
    await renderWithProviders(<SignUpScreen />)
    await fillFields()
    await fireEvent.press(box(ageBox))

    await submit()

    expect(signUpMock).not.toHaveBeenCalled()
    expect(screen.getByText(missing.rules)).toBeTruthy()
    expect(screen.queryByText(missing.both)).toBeNull()
    expect(screen.getByText(rulesUnchecked)).toBeTruthy()
    expect(screen.queryByText(ageUnchecked)).toBeNull()
  })

  it('moves the focus to the first field or box to fix', async () => {
    await renderWithProviders(<SignUpScreen />)
    await fillFields()

    // Tous les champs sont bons : la première chose à reprendre est la case des règles.
    await submit()
    expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
    expect(focusedProps()).toMatchObject({
      accessibilityRole: 'checkbox',
      accessibilityLabel: rulesBox,
    })

    // Les règles cochées : c'est la case de l'âge.
    jest.mocked(focusWithoutScroll).mockClear()
    await fireEvent.press(box(rulesBox))
    await submit()
    expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
    expect(focusedProps()).toMatchObject({
      accessibilityRole: 'checkbox',
      accessibilityLabel: ageBox,
    })

    // Un champ vide passe avant les cases : le focus va au champ, pas à la case.
    jest.mocked(focusWithoutScroll).mockClear()
    await fireEvent.changeText(screen.getByLabelText(labels.email), '')
    await submit()
    expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
    expect(focusedProps().accessibilityRole).not.toBe('checkbox')
  })

  it('sends both accords with the sign-up once the two boxes are checked', async () => {
    signUpMock.mockResolvedValue({ ok: true })
    await renderWithProviders(<SignUpScreen />)
    await fillFields()
    await fireEvent.press(box(rulesBox))
    await fireEvent.press(box(ageBox))

    await submit()

    expect(signUpMock).toHaveBeenCalledTimes(1)
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ...typed,
        acceptRules: true,
        ageDeclared: true,
      }),
    )
    expect(visited(mockPush, mockReplace, mockNavigate).map(pathOf)).toContain('/check-email')
  })

  it('the rules link is not inside the checkbox, and pressing it leaves the box unchecked', async () => {
    await renderWithProviders(<SignUpScreen />)

    const link = linkNamed(readRules)
    const checkbox = box(rulesBox)
    // Le lien n'est pas un descendant de la case : le lecteur d'écran l'atteint, et le toucher ne
    // coche rien.
    for (let node: typeof link | null = link; node; node = node.parent) {
      expect(node).not.toBe(checkbox)
    }

    await fireEvent.press(link)

    expect(screen.getByRole('checkbox', { name: rulesBox, checked: false })).toBeTruthy()
    expect(visited(mockPush, mockNavigate).map(pathOf)).toEqual(['/rules'])
  })

  it('coming back from /rules keeps the code, the name, the e-mail and the password', async () => {
    await renderWithProviders(<SignUpScreen />)
    await fillFields()
    await fireEvent.press(box(ageBox))

    await fireEvent.press(linkNamed(readRules))

    // La page des règles s'ouvre par-dessus (push) : l'inscription reste montée dessous, et le
    // retour la retrouve telle quelle. Un `replace` l'aurait démontée, mot de passe compris.
    expect(visited(mockPush, mockNavigate).map(pathOf)).toEqual(['/rules'])
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByLabelText(labels.inviteCode).props.value).toBe(typed.inviteCode)
    expect(screen.getByLabelText(labels.name).props.value).toBe(typed.name)
    expect(screen.getByLabelText(labels.email).props.value).toBe(typed.email)
    expect(screen.getByLabelText(labels.password).props.value).toBe(typed.password)
    expect(screen.getByRole('checkbox', { name: ageBox, checked: true })).toBeTruthy()
  })
})
