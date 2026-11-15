// Tests de la feuille « Partager » pour un projet réservé à une ruche (R10, F-Pub6,
// docs/scenarios/refonte.md, « Un projet réservé à une ruche ») : « Partager ce projet dit : Seuls
// les membres de Famille pourront l'ouvrir. », et le toast de « Copier le lien » le redit. Une ruche
// sans nom se dit « Ruche sans nom » (plan R10, « Une ruche sans nom dans une phrase » : `hiveOnly`
// n'écrit pas « la ruche {{hive}} », donc `hives.unnamed`).
//
// Ce que ces tests supposent du code (l'API de la feuille, choisie ici d'après le contrat) :
// `visibility` prend les valeurs de `ProjectVisibility` (`public`, `hive`, `private`), et la prop
// neuve `hive` reçoit `Project.hive` (`{ id, name | null } | null`), comme `ProjectScreen` l'a sous
// la main : `<ShareSheet visibility={project.visibility} hive={project.hive} … />`.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { copyText } from './clipboard'
import { ShareSheet } from './ShareSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./clipboard', () => ({ copyText: jest.fn() }))
jest.mock('./share', () => ({
  ...jest.requireActual('./share'),
  canShareNatively: jest.fn(() => true),
  shareLink: jest.fn(() => Promise.resolve()),
}))
// Les toasts : on note ce qui est affiché.
const mockToasts: string[] = []
jest.mock('./theme/toast', () => ({
  ...jest.requireActual('./theme/toast'),
  useToast: () => ({ show: (text: string) => mockToasts.push(text) }),
}))

const copy = jest.mocked(copyText)

const PROJECT = '6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1f01'
const HIVE = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c01'
const famille = { id: HIVE, name: 'Famille' }
const unnamed = { id: HIVE, name: null }

const t = {
  hiveOnly: (hive: string) => fr.t(($) => $.share.hiveOnly, { hive }),
  copiedHive: (hive: string) => fr.t(($) => $.share.copiedHive, { hive }),
  membersOnly: fr.t(($) => $.share.membersOnly),
  privateOnly: fr.t(($) => $.share.privateOnly),
  copiedMembers: fr.t(($) => $.share.copiedMembers),
  copy: fr.t(($) => $.share.copy),
  unnamed: fr.t(($) => $.hives.unnamed),
}

type SheetProps = Partial<Parameters<typeof ShareSheet>[0]>

/** La feuille d'un projet réservé à Famille, ouverte. */
const HiveSheet = (props: SheetProps) => (
  <ShareSheet
    open
    title="Le plan de table"
    target={{ kind: 'project', id: PROJECT }}
    onClose={() => {}}
    visibility="hive"
    hive={famille}
    {...props}
  />
)

beforeEach(() => {
  mockToasts.length = 0
  copy.mockReset()
})

describe('ShareSheet, a project reserved to a hive (R10)', () => {
  it('says only the members of Famille will be able to open it', async () => {
    await renderWithProviders(<HiveSheet />)

    expect(screen.getByText(containing(t.hiveOnly('Famille')))).toBeTruthy()
    expect(t.hiveOnly('Famille')).toBe('Seuls les membres de Famille pourront l’ouvrir.') // témoin
  })

  it('says neither « members of Waiggle » nor « private » for a reserved project', async () => {
    await renderWithProviders(<HiveSheet />)

    expect(screen.getByRole('button', { name: containing(t.copy) })).toBeTruthy() // témoin
    expect(screen.queryByText(containing(t.membersOnly))).toBeNull()
    expect(screen.queryByText(containing(t.privateOnly))).toBeNull()
  })

  it('says « Ruche sans nom » when the hive has no name', async () => {
    await renderWithProviders(<HiveSheet hive={unnamed} />)

    expect(screen.getByText(containing(t.hiveOnly(t.unnamed)))).toBeTruthy()
    expect(t.unnamed).toBe('Ruche sans nom') // témoin : le texte de la ruche sans nom
  })

  it('says it again in the toast once the link is copied', async () => {
    copy.mockResolvedValue(true)
    await renderWithProviders(<HiveSheet />)

    await fireEvent.press(screen.getByRole('button', { name: containing(t.copy) }))
    await act(async () => {})

    expect(mockToasts).toEqual([t.copiedHive('Famille')])
  })

  it('says « Ruche sans nom » in the toast too when the hive has no name', async () => {
    copy.mockResolvedValue(true)
    await renderWithProviders(<HiveSheet hive={unnamed} />)

    await fireEvent.press(screen.getByRole('button', { name: containing(t.copy) }))
    await act(async () => {})

    expect(mockToasts).toEqual([t.copiedHive(t.unnamed)])
  })

  it('still says « members of Waiggle » for a project open to the members (témoin)', async () => {
    await renderWithProviders(<HiveSheet visibility="public" hive={null} />)

    expect(screen.getByText(containing(t.membersOnly))).toBeTruthy()
    expect(screen.queryByText(containing(t.hiveOnly('Famille')))).toBeNull()
  })
})
