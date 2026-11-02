// Tests du réglage d'alignement de la paire de boutons (R5a, U7b) : sur la page d'un projet,
// « Tester la démo » a une ligne sous lui (l'hôte du site), « Suivre ce projet » non ; centrés, le
// second descendait sous le premier (signalé par U7a). `align="start"` les aligne en haut, comme la
// planche R5a-Projet-Desktop. Jest ne calcule aucune position : on lit la règle posée sur la rangée.
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'
import { Hint } from './Hint'
import { Stack } from './Stack'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null }

/** La première vue au-dessus du bouton qui range ses enfants en rangée : la paire elle-même. */
const pairRow = (button: Node): Record<string, unknown> => {
  for (let node: Node | null = button; node; node = node.parent) {
    const style =
      (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}
    if (style.flexDirection === 'row' && style.flexWrap === 'wrap') return style
  }
  throw new Error('aucune rangée')
}

const pair = (align?: 'center' | 'start') => (
  <ButtonPair {...(align ? { align } : null)}>
    <Stack gap="sm">
      <Button label="Tester la démo" onPress={() => {}} />
      <Hint icon="globe-simple" text="recettes.example.com" />
    </Stack>
    <Button label="Suivre ce projet" variant="secondary" onPress={() => {}} />
  </ButtonPair>
)

describe('ButtonPair align', () => {
  it('centres the two places by default', async () => {
    await renderWithProviders(pair())

    const row = pairRow(screen.getByRole('button', { name: 'Suivre ce projet' }) as never)
    expect(row.alignItems).toBe('center')
  })

  it('aligns the two places at the top when asked, so both buttons share a line', async () => {
    await renderWithProviders(pair('start'))

    const row = pairRow(screen.getByRole('button', { name: 'Suivre ce projet' }) as never)
    expect(row.alignItems).toBe('flex-start')
  })
})
