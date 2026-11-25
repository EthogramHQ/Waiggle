// Tests du clavier du choix de la décoration (R19, `DecorationPicker`), sur le web : dans chaque
// groupe, les flèches cochent la pastille voisine en faisant le tour, sans toucher à l'autre moitié
// du choix ; la barre d'espace coche la pastille qui a le focus.
import type { Decoration } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DecorationPicker } from './DecorationPicker'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const tintName = (tint: Decoration['tint']) => fr.t(($) => $.game.decoration.tints[tint])
const patternName = (pattern: Decoration['pattern']) =>
  fr.t(($) => $.game.decoration.patterns[pattern])
const radio = (name: string) => screen.getByRole('radio', { name })
const press = (key: string) => ({ key, preventDefault: () => {} })

const render = (onChange: (value: Decoration) => void) =>
  renderWithProviders(
    <DecorationPicker
      tints={['honey', 'amber', 'pollen']}
      patterns={['smooth', 'waffle', 'striped', 'dotted']}
      owned={{ tints: ['honey'], patterns: ['smooth'] }}
      value={{ tint: 'pollen', pattern: 'smooth' }}
      balance={30}
      onChange={onChange}
    />,
  )

describe('DecorationPicker, with the keyboard on the web', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('checks the next tint with the right arrow, going round after the last', async () => {
    const onChange = jest.fn()
    await render(onChange)

    await fireEvent(radio(tintName('pollen')), 'keyDown', press('ArrowRight'))

    expect(onChange).toHaveBeenLastCalledWith({ tint: 'honey', pattern: 'smooth' })
  })

  it('checks the previous pattern with the left arrow, going round before the first', async () => {
    const onChange = jest.fn()
    await render(onChange)

    await fireEvent(radio(patternName('smooth')), 'keyDown', press('ArrowLeft'))

    expect(onChange).toHaveBeenLastCalledWith({ tint: 'pollen', pattern: 'dotted' })
  })

  it('checks the focused swatch with the space bar', async () => {
    const onChange = jest.fn()
    await render(onChange)

    await fireEvent(radio(patternName('waffle')), 'keyDown', press(' '))

    expect(onChange).toHaveBeenLastCalledWith({ tint: 'pollen', pattern: 'waffle' })
  })
})
