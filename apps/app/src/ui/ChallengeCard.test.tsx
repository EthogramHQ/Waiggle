// Tests de la carte d'un défi (R19, `ChallengeCard`) : le défi perso en cours ou réussi (« Mon
// défi »), et le défi de la semaine d'une ruche (sa page, « Défis de mes ruches »). Une jauge en
// alvéoles (`HoneyComb` petit) lue « 3 sur 5 » ; un défi neuf dit « Nouveau », jamais « 0 sur 5 »
// (option a14 des planches) ; un défi réussi montre « +10 miel » (option b2).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ChallengeCard } from './ChallengeCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.game.challenges.hive.feedback_5)
const NEW = fr.t(($) => $.game.new)
const DONE = fr.t(($) => $.game.harvest.challenge.done)
const REWARD = fr.t(($) => $.game.harvest.challenge.reward, { amount: 10 })
const progress = (value: number, target: number) =>
  fr.t(($) => $.game.harvest.challenge.progress, { progress: value, target })

const card = { label: LABEL, target: 5, honey: 10 } as const

describe('ChallengeCard', () => {
  it('shows a challenge in progress with its comb read « 3 sur 5 »', async () => {
    await renderWithProviders(<ChallengeCard {...card} progress={3} state="active" />)

    expect(screen.getByText(LABEL)).toBeTruthy()
    const gauge = screen.getByRole('progressbar')
    expect(gauge.props['aria-valuetext']).toBe(progress(3, 5))
  })

  it('reads the progress of a long challenge against its own target', async () => {
    await renderWithProviders(
      <ChallengeCard
        label={fr.t(($) => $.game.challenges.hive.reactions_10)}
        target={10}
        honey={10}
        progress={4}
        state="active"
      />,
    )

    expect(screen.getByRole('progressbar').props['aria-valuetext']).toBe(progress(4, 10))
  })

  it('does not promise the honey as won while the challenge is in progress', async () => {
    await renderWithProviders(<ChallengeCard {...card} progress={3} state="active" />)

    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText(DONE)).toBeNull()
    expect(screen.queryByText(REWARD)).toBeNull()
  })

  // Option a14 : le lundi, un défi de ruche neuf ne dit jamais « 0 sur 5 ».
  it('says « Nouveau » for a new challenge, never « 0 sur 5 »', async () => {
    await renderWithProviders(<ChallengeCard {...card} progress={0} state="new" />)

    expect(screen.getByText(LABEL)).toBeTruthy()
    expect(screen.getByText(NEW)).toBeTruthy()
    expect(screen.queryByText(progress(0, 5))).toBeNull()
    for (const gauge of screen.queryAllByRole('progressbar')) {
      expect(gauge.props['aria-valuetext']).not.toBe(progress(0, 5))
    }
  })

  // Option b2 : un défi réussi montre ce qu'il a rapporté.
  it('shows a challenge done with the honey it brought', async () => {
    await renderWithProviders(<ChallengeCard {...card} progress={5} state="done" />)

    expect(screen.getByText(LABEL)).toBeTruthy()
    expect(screen.getByText(DONE)).toBeTruthy()
    expect(screen.getByText(REWARD)).toBeTruthy()
    expect(screen.queryByText(NEW)).toBeNull()
  })

  it('says « Nouveau » only for a new challenge', async () => {
    await renderWithProviders(<ChallengeCard {...card} progress={2} state="active" />)

    expect(screen.getByRole('progressbar').props['aria-valuetext']).toBe(progress(2, 5))
    expect(screen.queryByText(NEW)).toBeNull()
  })
})
