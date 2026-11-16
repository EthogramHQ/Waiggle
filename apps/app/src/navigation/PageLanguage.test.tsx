// Tests de la langue d'une page à adresse par langue selon qui la lit (tranche R12, « La langue de
// la page ») : un membre connecté la lit dans la langue de son appli, sans que l'adresse la change ;
// tant que la session n'est pas lue, la page est dans la langue de l'adresse (celle du HTML reçu)
// et l'appli garde la sienne. Et le choix de l'écran : membre connecté ou visiteur.
import { appName } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { MemberOrVisitor } from './MemberOrVisitor'
import { PageLanguage } from './PageLanguage'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Une page qui écrit un texte de l'appli, dans la langue qu'elle reçoit. */
function Probe() {
  const { t } = useTranslation()
  return <Text>{t(($) => $.home.title)}</Text>
}

const lea = { user: { id: 'u-lea', name: 'Léa' } }

describe('PageLanguage (R12)', () => {
  it('shows a member the page in the language of the app, whatever the address', async () => {
    mockSession(lea)
    const { i18n } = await renderWithProviders(
      <PageLanguage language="en">
        <Probe />
      </PageLanguage>,
      'fr',
    )

    expect(screen.getByText(`Bienvenue sur ${appName}`)).toBeTruthy()
    expect(i18n.language).toBe('fr')
  })

  it('uses the address language while the session is read, and leaves the app language alone', async () => {
    mockSession(null, true)
    const { i18n } = await renderWithProviders(
      <PageLanguage language="en">
        <Probe />
      </PageLanguage>,
      'fr',
    )

    expect(screen.getByText(`Welcome to ${appName}`)).toBeTruthy()
    expect(i18n.language).toBe('fr')
  })

  it('moves the whole app to the address language for a visitor', async () => {
    mockSession(null)
    const { i18n } = await renderWithProviders(
      <PageLanguage language="en">
        <Probe />
      </PageLanguage>,
      'fr',
    )

    expect(screen.getByText(`Welcome to ${appName}`)).toBeTruthy()
    expect(i18n.language).toBe('en')
  })
})

describe('MemberOrVisitor (R12)', () => {
  const render = () =>
    renderWithProviders(
      <MemberOrVisitor member={<Text>member view</Text>} visitor={<Text>visitor view</Text>} />,
    )

  it('shows a signed-in member the member view', async () => {
    mockSession(lea)
    await render()

    expect(screen.getByText('member view')).toBeTruthy()
    expect(screen.queryByText('visitor view')).toBeNull()
  })

  it('shows the visitor view without a session, and while the session is read', async () => {
    mockSession(null)
    const view = await render()
    expect(screen.getByText('visitor view')).toBeTruthy()
    await view.unmount()

    mockSession(null, true)
    await render()
    expect(screen.getByText('visitor view')).toBeTruthy()
    expect(screen.queryByText('member view')).toBeNull()
  })
})
