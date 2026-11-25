// Tests du choix de la décoration du rayon (R19, `DecorationPicker`, feuille « Décorer mon
// rayon ») : une teinte et un motif de cire, chacun un groupe de boutons radio (`Choices`). Ce qui
// est déjà à soi le dit (« À toi ») ; le reste montre son prix (teinte 10 miel, motif 15, Louis
// 23/11). Un achat vaut pour toujours. Le composant ne lit aucune donnée et n'achète rien : il dit
// le choix à la feuille (`onChange`), qui montre le prix total et envoie la requête.
import type {
  Decoration,
  DecorationPattern,
  DecorationTint,
  OwnedDecorations,
} from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DecorationPicker } from './DecorationPicker'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TINT = fr.t(($) => $.game.decoration.tint)
const PATTERN = fr.t(($) => $.game.decoration.pattern)
const OWNED = fr.t(($) => $.game.decoration.owned)
const tintName = (tint: DecorationTint) => fr.t(($) => $.game.decoration.tints[tint])
const patternName = (pattern: DecorationPattern) => fr.t(($) => $.game.decoration.patterns[pattern])
const price = (amount: number) => fr.t(($) => $.game.decoration.price, { amount })

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Le nom lu d'un choix commence par son nom ; il peut dire ensuite son prix ou « À toi ».
const option = (name: string, checked?: boolean) =>
  screen.getByRole('radio', {
    name: new RegExp(`^${escapeRegExp(name)}`),
    ...(checked === undefined ? null : { checked }),
  })

// Léa a déjà acheté l'Ambre ; Miel et Lisse sont offerts à tous.
const props: {
  tints: DecorationTint[]
  patterns: DecorationPattern[]
  owned: OwnedDecorations
  value: Decoration
  balance: number
} = {
  tints: ['honey', 'amber', 'pollen'],
  patterns: ['smooth', 'waffle', 'striped', 'dotted'],
  owned: { tints: ['honey', 'amber'], patterns: ['smooth'] },
  value: { tint: 'amber', pattern: 'smooth' },
  balance: 30,
}

describe('DecorationPicker', () => {
  it('offers the tints and the patterns as two radio groups', async () => {
    await renderWithProviders(<DecorationPicker {...props} onChange={jest.fn()} />)

    expect(screen.getByLabelText(TINT).props.accessibilityRole).toBe('radiogroup')
    expect(screen.getByLabelText(PATTERN).props.accessibilityRole).toBe('radiogroup')
    for (const tint of props.tints) expect(option(tintName(tint))).toBeTruthy()
    for (const pattern of props.patterns) expect(option(patternName(pattern))).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(7)
  })

  it('checks the tint and the pattern of the current choice', async () => {
    await renderWithProviders(<DecorationPicker {...props} onChange={jest.fn()} />)

    expect(option(tintName('amber'), true)).toBeTruthy()
    expect(option(tintName('honey'), false)).toBeTruthy()
    expect(option(patternName('smooth'), true)).toBeTruthy()
    expect(option(patternName('waffle'), false)).toBeTruthy()
  })

  it('shows the price of what is not owned yet', async () => {
    await renderWithProviders(<DecorationPicker {...props} onChange={jest.fn()} />)

    // Pollen seul, parmi les teintes ; Gaufré, Rayé, Pointillé, parmi les motifs.
    expect(screen.getAllByText(new RegExp(escapeRegExp(price(10))))).toHaveLength(1)
    expect(screen.getAllByText(new RegExp(escapeRegExp(price(15))))).toHaveLength(3)
  })

  it('says « À toi » instead of a price for what is already owned', async () => {
    await renderWithProviders(
      <DecorationPicker
        {...props}
        owned={{ tints: ['honey', 'amber', 'pollen'], patterns: ['smooth', 'waffle'] }}
        onChange={jest.fn()}
      />,
    )

    // Un achat vaut pour toujours : plus aucune teinte n'a de prix, deux motifs seulement.
    expect(screen.queryByText(new RegExp(escapeRegExp(price(10))))).toBeNull()
    expect(screen.getAllByText(new RegExp(escapeRegExp(price(15))))).toHaveLength(2)
    expect(screen.getAllByText(new RegExp(escapeRegExp(OWNED))).length).toBeGreaterThan(0)
  })

  it('tells the new choice with the other half kept', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<DecorationPicker {...props} onChange={onChange} />)

    await fireEvent.press(option(patternName('striped')))
    expect(onChange).toHaveBeenLastCalledWith({ tint: 'amber', pattern: 'striped' })

    await fireEvent.press(option(tintName('pollen')))
    expect(onChange).toHaveBeenLastCalledWith({ tint: 'pollen', pattern: 'smooth' })
  })

  // Le solde court ne cache rien : la feuille explique au moment d'acheter (option b9).
  it('still lets the member pick what costs more than the balance', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<DecorationPicker {...props} balance={0} onChange={onChange} />)

    await fireEvent.press(option(patternName('dotted')))

    expect(onChange).toHaveBeenLastCalledWith({ tint: 'amber', pattern: 'dotted' })
  })

  describe('with the keyboard, on the web', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
    })
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('is one Tab stop per group, on the checked choice', async () => {
      await renderWithProviders(<DecorationPicker {...props} onChange={jest.fn()} />)

      const stops = screen
        .getAllByRole('radio')
        .filter((radio) => radio.props.tabIndex !== -1)
        .map((radio) => radio.props.accessibilityLabel as string)
      expect(stops).toHaveLength(2)
      expect(stops[0]).toMatch(new RegExp(`^${escapeRegExp(tintName('amber'))}`))
      expect(stops[1]).toMatch(new RegExp(`^${escapeRegExp(patternName('smooth'))}`))
    })
  })
})
