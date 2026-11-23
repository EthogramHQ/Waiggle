// Tests du panneau du niveau (R19, `HarvestPanel`) : le niveau, le titre, le rayon et ce qui
// l'accompagne. Le même panneau sert à « Ma récolte », à son propre profil (avec le miel, la phrase
// de pollen et les semaines) et à la page d'un proche (sans rien de tout cela, option a5 des
// planches). Le composant ne lit aucune donnée : l'écran lui passe tout, déjà calculé.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HarvestPanel } from './HarvestPanel'

// Les outils de test passent par le module des comptes ; on le remplace, comme ailleurs dans src/ui.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LEVEL = fr.t(($) => $.game.level, { level: 4 })
const TITLE = fr.t(($) => $.game.titles.keeper_f)
const HONEY = fr.t(($) => $.game.honey, { amount: 35 })
const TO_NEXT = fr.t(($) => $.game.toNext, { count: 120, next: 5 })
const CELLS = fr.t(($) => $.game.comb.cells, { count: 7, next: 5 })
const NEW = fr.t(($) => $.game.new)
const HIBERNATING = fr.t(($) => $.game.hibernating)
const NEWCOMER = fr.t(($) => $.game.newcomer)
const HARVEST = fr.t(($) => $.game.harvest.title)

// Le panneau de « Moi » au niveau 4, 7 alvéoles sur 10, 120 pollen avant le niveau 5 (880 pollen).
const mine = {
  level: 4,
  title: TITLE,
  honey: 35,
  cells: 7,
  toNext: 120,
  weeks: { count: 3, hibernating: false },
  isNew: false,
  tint: 'honey',
  pattern: 'smooth',
} as const

// Un texte visible, ou le nom lu d'un élément qui le porte (le niveau peut être écrit dans
// l'alvéole du niveau, nommée par lui) : le test ne dépend pas de la façon de le dessiner.
const shown = (text: string) => screen.queryByText(text) ?? screen.queryByLabelText(text)

describe('HarvestPanel', () => {
  it('shows the level, the title, the honey and the pollen before the next level', async () => {
    await renderWithProviders(<HarvestPanel {...mine} />)

    expect(shown(LEVEL)).toBeTruthy()
    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(screen.getByText(HONEY)).toBeTruthy()
    expect(screen.getByText(TO_NEXT)).toBeTruthy()
  })

  it('reads its comb as a progressbar with the cells filled toward the next level', async () => {
    await renderWithProviders(<HarvestPanel {...mine} />)

    const comb = screen.getByRole('progressbar')
    expect(comb.props['aria-valuenow']).toBe(7)
    expect(comb.props['aria-valuetext']).toBe(CELLS)
  })

  it('counts the foraged weeks, and says when the streak hibernates', async () => {
    await renderWithProviders(<HarvestPanel {...mine} weeks={{ count: 3, hibernating: true }} />)

    expect(screen.getByText(fr.t(($) => $.game.weeks, { count: 3 }))).toBeTruthy()
    expect(screen.getByText(HIBERNATING)).toBeTruthy()
  })

  it('does not say the streak hibernates while it is alive', async () => {
    await renderWithProviders(<HarvestPanel {...mine} />)

    // Témoin : la série est bien là.
    expect(screen.getByText(fr.t(($) => $.game.weeks, { count: 3 }))).toBeTruthy()
    expect(screen.queryByText(HIBERNATING)).toBeNull()
  })

  it('shows « Nouveau » after a new level, and nothing else to congratulate', async () => {
    await renderWithProviders(<HarvestPanel {...mine} isNew />)

    expect(screen.getByText(NEW)).toBeTruthy()
  })

  it('shows no « Nouveau » once the level has been seen', async () => {
    await renderWithProviders(<HarvestPanel {...mine} />)

    expect(shown(LEVEL)).toBeTruthy()
    expect(screen.queryByText(NEW)).toBeNull()
  })

  // Option a5 : la page d'un proche montre son niveau, son titre et son rayon, jamais son miel, ni
  // la phrase de pollen, ni ses semaines.
  it('shows a close member only the level, the title and the comb', async () => {
    await renderWithProviders(
      <HarvestPanel
        level={4}
        title={TITLE}
        cells={7}
        isNew={false}
        tint="amber"
        pattern="waffle"
      />,
    )

    expect(shown(LEVEL)).toBeTruthy()
    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(screen.getByRole('progressbar').props['aria-valuetext']).toBe(CELLS)
    expect(screen.queryByText(/miel/)).toBeNull()
    expect(screen.queryByText(TO_NEXT)).toBeNull()
    expect(screen.queryByText(/semaines? butinées?/)).toBeNull()
  })

  it('shows no title for a member who has none yet', async () => {
    // `title` absent (pas `undefined`) : la page d'un nouveau membre sans titre (`title: null` du
    // contrat, que l'écran ne passe pas).
    const { level, honey, cells, toNext, weeks, isNew, tint, pattern } = mine
    await renderWithProviders(
      <HarvestPanel
        level={level}
        honey={honey}
        cells={cells}
        toNext={toNext}
        weeks={weeks}
        isNew={isNew}
        tint={tint}
        pattern={pattern}
      />,
    )

    expect(shown(LEVEL)).toBeTruthy()
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  // Option a11 : un nouveau membre lit d'où vient le pollen, à la place de la série.
  it('tells a newcomer where pollen comes from', async () => {
    await renderWithProviders(
      <HarvestPanel {...mine} weeks={{ count: 0, hibernating: false }} newcomerHint />,
    )

    expect(screen.getByText(NEWCOMER)).toBeTruthy()
  })

  it('does not tell a regular member where pollen comes from', async () => {
    await renderWithProviders(<HarvestPanel {...mine} />)

    expect(screen.getByText(TO_NEXT)).toBeTruthy()
    expect(screen.queryByText(NEWCOMER)).toBeNull()
  })

  // Sur son profil, le titre de la rubrique mène à « Ma récolte » ; sur « Ma récolte », pas de lien.
  it('links its section title to « Ma récolte » when given an address', async () => {
    await renderWithProviders(<HarvestPanel {...mine} href="/harvest" />)

    const link = screen.getByRole('link', { name: HARVEST })
    expect(link.props.href).toBe('/harvest')
  })

  it('has no link without an address', async () => {
    await renderWithProviders(<HarvestPanel {...mine} />)

    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
