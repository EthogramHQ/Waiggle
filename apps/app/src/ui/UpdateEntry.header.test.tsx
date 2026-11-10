// Tests de l'en-tête d'une mise à jour et de sa photo (R7a, relectures de design A1 et d'interface
// S1) : la version se lit « version 1.2 » (le « v » collé au nombre se lirait mal) tout en restant
// affichée « v1.2 », dans l'en-tête de la mise à jour comme dans la ligne de dates du projet ; et
// l'avant / après peut prendre la hauteur d'une bande dans la section de la page projet, alors que la
// frise garde la grande. La place de la date sous le titre se mesure dans le navigateur (essai
// « date-entree »).
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { photo } from '../testing/projects'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { ProjectDatesLine } from './ProjectDatesLine'
import { UpdateEntry } from './UpdateEntry'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const toSource = (url: string | null | undefined) => (url ? { uri: url } : null)
const versionRead = (version: string) => fr.t(($) => $.project.updates.versionRead, { version })

/** L'avant / après d'une fusée : deux photos. */
const comparing = {
  ...rocketUpdate,
  beforeAfter: true,
  photos: [photo('a', 1600, 900, 'Avant'), photo('b', 1600, 900, 'Après')],
}

type Host = { props: Record<string, unknown>; parent: Host | null }

/** La hauteur du cadre de la comparaison : le premier ancêtre du curseur qui a une hauteur fixe. */
const frameHeight = () => {
  let node = (screen.queryByRole('adjustable') ?? screen.getByRole('slider')) as unknown as Host
  while (node.parent) {
    node = node.parent
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    if (typeof style.height === 'number') return style.height
  }
  throw new Error('no frame height')
}

describe('the version of an update', () => {
  it('is read « version 1.2 » in the header of the update, and still shown « v1.2 »', async () => {
    await renderWithProviders(<UpdateEntry update={rocketUpdate} toSource={toSource} />)

    expect(screen.getByLabelText(versionRead('1.2'))).toBeTruthy()
    expect(screen.getByText('v1.2')).toBeTruthy()
  })

  it('is read « version 1.2 » in the dates line of the project, and still shown « v1.2 »', async () => {
    await renderWithProviders(
      <ProjectDatesLine
        createdAt="2026-09-12T08:00:00.000Z"
        visibility="public"
        latestUpdateAt="2026-10-30T08:00:00.000Z"
        version="v1.2"
        now={new Date('2026-10-31T08:00:00.000Z')}
      />,
    )

    expect(screen.getByLabelText(versionRead('1.2'))).toBeTruthy()
    expect(screen.getByText('v1.2')).toBeTruthy()
  })
})

describe('the height of the before / after in an update', () => {
  it('is a medium photo on a computer, in the timeline', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<UpdateEntry update={comparing} toSource={toSource} />)

      expect(frameHeight()).toBe(layout.cover.medium)
    } finally {
      restore()
    }
  })

  it('is a band on a computer when the page project asks for one', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <UpdateEntry update={comparing} toSource={toSource} photoHeight="band" />,
      )

      expect(frameHeight()).toBe(layout.cover.band)
    } finally {
      restore()
    }
  })
})
