// Tests du bandeau d'un contenu retiré par la modération (tranche 7a), et des phrases que l'appli y
// pose. À part de components.test.tsx, partagé avec l'autre agent de la tranche.
import type { Removal } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { removalBanner } from '../reports/removal'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { RemovalNotice } from './RemovalNotice'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const banner = {
  title: 'Retiré par la modération',
  lines: ['Il n’est plus visible que de toi.', 'Pour contester : contact@example.com'],
}

describe('RemovalNotice', () => {
  it('shows its title, then each sentence on its own line', async () => {
    await renderWithProviders(<RemovalNotice {...banner} />)

    expect(screen.getByText('Retiré par la modération')).toBeTruthy()
    for (const line of banner.lines) expect(screen.getByText(line)).toBeTruthy()
  })

  it('is no alert: it is there from the start, and is read in turn', async () => {
    await renderWithProviders(<RemovalNotice {...banner} />)

    // Témoin : le bandeau est affiché.
    expect(screen.getByText('Retiré par la modération')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('removalBanner', () => {
  const removal: Removal = {
    ground: 'illegal',
    explanation: 'Publier de faux avis est interdit.',
    at: '2026-10-20T09:00:00.000Z',
    afterReport: false,
  }

  it('says who decided, on what ground, why, and how to contest, without a report', () => {
    const { title, lines } = removalBanner(removal, fr.t)

    expect(title).toBe(fr.t(($) => $.removal.banner))
    expect(lines).toEqual([
      fr.t(($) => $.removal.onlyYou),
      fr.t(($) => $.removal.direct),
      fr.t(($) => $.removal.grounds.illegal),
      fr.t(($) => $.removal.explanation, { explanation: removal.explanation }),
      fr.t(($) => $.removal.contest),
    ])
  })

  it('says when a report came first, never by whom', () => {
    const { lines } = removalBanner({ ...removal, afterReport: true, ground: 'rules' }, fr.t)

    expect(lines).toContain(fr.t(($) => $.removal.afterReport))
    expect(lines).toContain(fr.t(($) => $.removal.grounds.rules))
    expect(lines).not.toContain(fr.t(($) => $.removal.direct))
  })

  it('writes the explanation as typed, characters included', () => {
    const { lines } = removalBanner({ ...removal, explanation: 'Pas de <script> & co.' }, fr.t)

    expect(lines).toContain('Explication : Pas de <script> & co.'.replace(' :', ' :'))
  })
})
