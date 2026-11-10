// Tests de la page de sortie sur ordinateur (correction après R7a) : la carte y est centrée en
// hauteur à côté du portail (ui/BrandAmbiance.tsx). Quand la ligne des testeurs arrivait sous les
// boutons, la carte grandissait et se recentrait : « Ouvrir le site » remontait de 43 px sous la
// souris. Tant que la ligne peut encore venir, sa place est donc gardée **sous** la carte, sur le
// miel, invisible : la carte se centre avec elle, et la ligne la reprend en arrivant.
//
// Jest ne mesure aucune position : ces tests vérifient la place gardée (là où elle doit être,
// cachée, sans rien qu'on puisse atteindre) ; la preuve que rien ne bouge est la mesure dans le
// navigateur (essai de la page de sortie, à 1440 px).
import { isHiddenFromAccessibility, screen, within } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { BrandAmbiance } from './BrandAmbiance'
import { LeavingSheet, type LeavingTesters } from './LeavingSheet'
import type { SizeClass } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LINK = fr.t(($) => $.project.testers.leavingLink)
const OPEN = fr.t(($) => $.leaving.open)
const HOLD = 'card-hold'

/** La page de sortie d'une démo, dans la mise en page voulue (ordinateur : `wide`). */
const sheet = (
  size: SizeClass,
  { holdOrigin, testers }: { holdOrigin: boolean; testers?: LeavingTesters | null },
) => (
  <BrandAmbiance size={size} hero={null}>
    <LeavingSheet
      host="decollage.example"
      href="https://decollage.example/"
      origin={null}
      holdOrigin={holdOrigin}
      testers={testers ?? null}
      onOpen={jest.fn()}
      onStay={jest.fn()}
    />
  </BrandAmbiance>
)

const hold = () => screen.queryByTestId(HOLD, { includeHiddenElements: true })

describe('LeavingSheet on a computer, the room of the testers line', () => {
  it('keeps the room of the line under the card while it may still come', async () => {
    await renderWithProviders(sheet('wide', { holdOrigin: true }))

    const room = hold()
    expect(room).not.toBeNull()
    // Une place vide : cachée aux lecteurs d'écran, sans lien qu'on atteindrait au clavier.
    expect(isHiddenFromAccessibility(room as NonNullable<typeof room>)).toBe(true)
    expect(
      within(room as NonNullable<typeof room>).queryByRole('link', {
        includeHiddenElements: true,
      }),
    ).toBeNull()
  })

  it('gives that room to the line when it comes', async () => {
    const { rerender } = await renderWithProviders(sheet('wide', { holdOrigin: true }))
    expect(hold()).not.toBeNull()

    await rerender(
      sheet('wide', { holdOrigin: true, testers: { name: 'Papi Jean', onOpenProject: jest.fn() } }),
    )

    expect(screen.getByRole('link', { name: LINK })).toBeTruthy()
    expect(hold()).toBeNull()
  })

  it('keeps no room when no line can come (a link that is not a demo)', async () => {
    await renderWithProviders(sheet('wide', { holdOrigin: false }))

    // Témoin : la feuille est bien là.
    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(hold()).toBeNull()
  })

  it('keeps no room on a phone, where the line comes under the buttons without moving them', async () => {
    await renderWithProviders(sheet('compact', { holdOrigin: true }))

    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(hold()).toBeNull()
  })
})
