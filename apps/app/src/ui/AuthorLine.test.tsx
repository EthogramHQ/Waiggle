// Tests de la ligne de l'auteur d'un projet (R5a, AuthorLine) : un lien vers sa page (photo, nom,
// pseudo) et, à côté, la pastille « Suivre » quand l'écran sait déjà si on le suit. Tant qu'il ne
// le sait pas, aucune pastille : un « Suivre » qui deviendrait « Tu suis Léa » sous le doigt ferait
// faire le geste inverse (question de TW-3, tranchée par la session le 2/11). La lecture elle-même
// (la page du membre) est testée avec l'en-tête, dans projects/ProjectHeader.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type AuthorFollow, AuthorLine } from './AuthorLine'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const name = 'Léa'
const onOpen = jest.fn()
const onFollow = jest.fn()

/** La pastille dans l'état donné, avec les textes que l'écran lui passe. */
const chip = (followed: boolean, extra: Partial<AuthorFollow> = {}): AuthorFollow => ({
  followed,
  label: followed
    ? fr.t(($) => $.follow.memberFollowing, { name })
    : fr.t(($) => $.follow.member, { name }),
  text: followed ? fr.t(($) => $.follow.memberFollowing, { name }) : fr.t(($) => $.follow.follow),
  onPress: onFollow,
  ...extra,
})

const line = (props: Partial<Parameters<typeof AuthorLine>[0]> = {}) => (
  <AuthorLine
    name={name}
    handle="@lea"
    avatar={null}
    openLabel="Voir la page de Léa"
    onOpen={onOpen}
    {...props}
  />
)

beforeEach(() => {
  onOpen.mockReset()
  onFollow.mockReset()
})

describe('AuthorLine', () => {
  it('leads to the page of the author, with her name and handle', async () => {
    await renderWithProviders(line())

    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByText('@lea')).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Voir la page de Léa' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('offers to follow an author not followed yet, and passes the state shown', async () => {
    await renderWithProviders(line({ follow: chip(false) }))

    const follow = screen.getByRole('switch', { name: 'Suivre Léa' })
    expect(follow).not.toBeChecked()
    // Le nom lu contient le texte affiché (« Suivre »).
    expect(screen.getByText('Suivre')).toBeTruthy()
    await fireEvent.press(follow)
    expect(onFollow).toHaveBeenCalledWith(false)
  })

  it('says « Tu suis Léa » for an author already followed at opening', async () => {
    await renderWithProviders(line({ follow: chip(true) }))

    expect(screen.getByRole('switch', { name: 'Tu suis Léa' })).toBeChecked()
    expect(screen.getByText('Tu suis Léa')).toBeTruthy()
  })

  it('shows no chip while the state is unknown, but keeps the link', async () => {
    await renderWithProviders(line({ follow: undefined, handle: undefined }))

    // Témoin : la ligne est là.
    expect(screen.getByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Suivre')).toBeNull()
  })

  it('keeps the place of the handle while it is unknown', async () => {
    await renderWithProviders(line({ handle: undefined }))

    // Une ligne vide (espace insécable) garde la hauteur du pseudo à venir.
    expect(
      screen.getByText(String.fromCodePoint(0xa0), { normalizer: (text) => text }),
    ).toBeTruthy()
  })

  it('keeps no place for a handle that will never come, so the name sits on the photo', async () => {
    // `null` : la lecture de la page du membre a échoué, le pseudo ne viendra pas. Sans la ligne
    // réservée (une espace insécable), le nom est seul dans sa colonne, donc centré sur la photo.
    await renderWithProviders(line({ handle: null }))

    // Témoin : le nom est là, et le lien aussi.
    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(
      screen.queryByText(String.fromCodePoint(0xa0), { normalizer: (text) => text }),
    ).toBeNull()
  })

  it('keeps an inactive chip in place, announced as disabled', async () => {
    await renderWithProviders(line({ follow: chip(false, { disabled: true }) }))

    const follow = screen.getByRole('switch', { name: 'Suivre Léa' })
    expect(follow).toBeDisabled()
    await fireEvent.press(follow)
    expect(onFollow).not.toHaveBeenCalled()
  })

  it('says when the last change could not be saved, with its action', async () => {
    const signIn = jest.fn()
    await renderWithProviders(
      line({
        follow: chip(false),
        error: 'Ta session a expiré.',
        errorAction: { label: 'Me reconnecter', onPress: signIn },
      }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Ta session a expiré.', { exact: false })
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('gives the chip a 44-point target', async () => {
    await renderWithProviders(line({ follow: chip(false) }))

    const style = screen.getByRole('switch', { name: 'Suivre Léa' }).props.style
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style
    expect(flat.minHeight).toBeGreaterThanOrEqual(44)
  })
})
