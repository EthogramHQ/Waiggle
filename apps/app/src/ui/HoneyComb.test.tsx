// Tests du rayon (R19, planches R19-Recolte et R19-Profil) : dix alvéoles hexagonales, scellées une
// à une à mesure que le pollen approche du niveau suivant. Pour un lecteur d'écran, c'est une
// barre de progression, comme la jauge en alvéoles de miel (ui/HoneyMeter) : un nom (« Mon rayon »),
// une valeur (le nombre d'alvéoles scellées) et la phrase qui la dit (« 7 alvéoles sur 10 vers le
// niveau 5 »). En petit (`size="small"`), le même dessin sert de jauge à un défi : `count` dit
// combien d'alvéoles il a (5 pour « 5 retours »), et la valeur se lit sur ce nombre.
//
// La teinte et le motif (la décoration achetée avec du miel) ne changent rien à ce qui est lu.
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HoneyComb } from './HoneyComb'

type CombProps = ComponentProps<typeof HoneyComb>

const MINE = fr.t(($) => $.game.comb.mine)
const THEIRS = fr.t(($) => $.game.comb.theirs)
/** « 7 alvéoles sur 10 vers le niveau 5 ». */
const cellsText = (count: number, next: number) => fr.t(($) => $.game.comb.cells, { count, next })

/** Le rayon de Léa, niveau 4, 7 alvéoles scellées sur 10 ; chaque test change ce qu'il regarde. */
const comb = (props: Partial<CombProps> = {}) => (
  <HoneyComb
    cells={7}
    label={MINE}
    valueText={cellsText(7, 5)}
    tint="honey"
    pattern="smooth"
    size="regular"
    {...props}
  />
)

describe('HoneyComb', () => {
  it('reads as a named progressbar over its ten cells', async () => {
    await renderWithProviders(comb())

    const bar = screen.getByRole('progressbar', { name: MINE })
    expect(bar.props['aria-valuemin']).toBe(0)
    expect(bar.props['aria-valuemax']).toBe(10)
    expect(bar.props['aria-valuenow']).toBe(7)
    expect(bar.props['aria-valuetext']).toBe(cellsText(7, 5))
  })

  it('reads an empty comb as zero, never as missing', async () => {
    // Juste après un passage de niveau, aucune alvéole n'est encore scellée.
    await renderWithProviders(comb({ cells: 0, valueText: cellsText(0, 6) }))

    expect(screen.getByRole('progressbar', { name: MINE }).props['aria-valuenow']).toBe(0)
  })

  it('does not count past its ten cells', async () => {
    await renderWithProviders(comb({ cells: 12 }))

    expect(screen.getByRole('progressbar', { name: MINE }).props['aria-valuenow']).toBe(10)
  })

  it('reads the comb of another member by its own name', async () => {
    // La page d'un proche (option a5) : son rayon, sans la phrase de pollen.
    await renderWithProviders(comb({ label: THEIRS }))

    expect(screen.getByRole('progressbar', { name: THEIRS })).toBeTruthy()
    expect(screen.queryByRole('progressbar', { name: MINE })).toBeNull()
  })

  it('counts a small challenge gauge over its own number of cells', async () => {
    // La jauge d'un défi « 5 retours », 3 donnés : 5 alvéoles, 3 scellées.
    await renderWithProviders(
      comb({ size: 'small', count: 5, cells: 3, label: 'Défi', valueText: '3 sur 5' }),
    )

    const bar = screen.getByRole('progressbar', { name: 'Défi' })
    expect(bar.props['aria-valuemax']).toBe(5)
    expect(bar.props['aria-valuenow']).toBe(3)
    expect(bar.props['aria-valuetext']).toBe('3 sur 5')
  })

  it('reads the same whatever its decoration', async () => {
    // Ambre et rayé, achetés avec du miel : le dessin change, la lecture non.
    await renderWithProviders(comb({ tint: 'amber', pattern: 'striped' }))

    const bar = screen.getByRole('progressbar', { name: MINE })
    expect(bar.props['aria-valuenow']).toBe(7)
    expect(bar.props['aria-valuetext']).toBe(cellsText(7, 5))
  })

  it('is read once, as its bar: no cell is read on its own', async () => {
    await renderWithProviders(comb())

    // Une seule barre, et aucun texte ni image lus à côté d'elle (les alvéoles sont du dessin).
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
