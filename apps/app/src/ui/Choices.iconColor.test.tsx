// Un choix dont l'icône a sa couleur (R7b, « Ça a marché ? » de « Ton retour », planche
// R7b-Feuille-Retour) : la coche verte, le demi-cercle ambre, la croix rouge, tant que le choix
// n'est pas coché ; coché, sur le miel, l'icône passe à l'encre, comme son texte.
import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import Svg from 'react-native-svg'
import { renderWithProviders } from '../testing/render'
import { Choices } from './Choices'

type Node = {
  type: unknown
  props: Record<string, unknown>
  children: ReadonlyArray<Node | string>
}
const allNodes = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : allNodes(child))),
]
const fillsUnder = (root: unknown): string[] =>
  allNodes(root as Node)
    .filter((node) => typeof node.type === 'string' && /^RNSVGSvg/.test(node.type))
    .map((svg) => JSON.stringify(svg.props.fill ?? null))

function Outcome() {
  const [value, setValue] = useState<'yes' | 'no' | null>(null)
  return (
    <Choices
      label="Ça a marché ?"
      options={[
        { value: 'yes', label: 'Oui', icon: 'check', iconColor: 'outcomeYesIcon' },
        { value: 'no', label: 'Non', icon: 'x', iconColor: 'outcomeNoIcon' },
      ]}
      value={value}
      onChange={setValue}
    />
  )
}

/** Le remplissage, tel que l'élément natif le reçoit, d'un dessin témoin de cette couleur. */
const witness = async (color: string) => {
  const view = await renderWithProviders(<Svg width={1} height={1} fill={color} />)
  const [fill] = fillsUnder(screen.root)
  await view.unmount()
  return fill
}

describe('Choices with coloured icons', () => {
  it('colours the icon of each choice by its role until it is checked', async () => {
    const yes = await witness(palettes.day.outcomeYesIcon)
    const no = await witness(palettes.day.outcomeNoIcon)
    const ink = await witness(palettes.day.onHoney)
    await renderWithProviders(<Outcome />)

    expect(fillsUnder(screen.getByRole('radio', { name: 'Oui' }))).toEqual([yes])
    expect(fillsUnder(screen.getByRole('radio', { name: 'Non' }))).toEqual([no])

    await fireEvent.press(screen.getByRole('radio', { name: 'Non' }))

    // Coché, sur le miel : l'encre, comme le texte (le rouge s'y lirait mal).
    expect(fillsUnder(screen.getByRole('radio', { name: 'Non' }))).toEqual([ink])
    expect(fillsUnder(screen.getByRole('radio', { name: 'Oui' }))).toEqual([yes])
  })
})
