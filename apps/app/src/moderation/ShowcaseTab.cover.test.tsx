// Tests de l'onglet « Vitrine de l'accueil » de la modération comme source de la photo qui vole
// jusqu'à la page du projet (tranche R17, docs/scenarios/refonte.md, « La carte qui devient la
// page »). Chaque carte de la vitrine ouvre la page du projet des membres : elle reçoit
// l'identifiant de son projet (`coverId`), et son ouverture passe par `capture`, puis par la
// navigation de l'onglet, inchangée.
//
// `useCoverSource` est remplacé par un faux (comme `ui/coverSources.test.tsx`), qui note
// l'identifiant reçu et ouvre tout de suite. Le réseau : `api/client` remplacé, qui rend la vitrine.
import type { ModerationShowcase } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { request, requestWithoutBody } from '../api/client'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useCoverSource } from '../ui/coverTransition'
import { ShowcaseTab } from './ShowcaseTab'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))
const mockCapture = jest.fn((then: () => void) => then())
jest.mock('../ui/coverTransition', () => ({
  ...jest.requireActual('../ui/coverTransition'),
  useCoverSource: jest.fn(() => ({ ref: jest.fn(), capture: mockCapture, bounceStyle: {} })),
}))

/** « Décollage ! », seul sur l'accueil. */
const decollage: ModerationShowcase['items'][number]['project'] = {
  id: 'd1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6',
  title: 'Décollage !',
  status: 'testable',
  cover: null,
  author: { id: 'u-papi-jean', name: 'Papi Jean' },
}
const state: ModerationShowcase = {
  items: [
    {
      project: decollage,
      position: 1,
      addedAt: '2026-11-14T10:02:00.000Z',
      editedSinceAdded: false,
    },
  ],
  candidates: [],
}

beforeEach(() => {
  mockPush.mockReset()
  mockCapture.mockClear()
  jest.mocked(useCoverSource).mockClear()
  mockSession({ user: { id: 'u9', name: 'Louis' } })
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (_path: string, _init: RequestInit, schema) => {
      const parsed = schema.safeParse(state)
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
    }) as typeof request)
  jest.mocked(requestWithoutBody).mockReset()
})

describe('ShowcaseTab as a source of the card photo that becomes the page (R17)', () => {
  it('opens a card of the showcase through its cover, then at the project page', async () => {
    await renderWithProviders(<ShowcaseTab />)
    await screen.findByRole('header', {
      name: containing(fr.t(($) => $.moderation.showcase.title)),
    })

    expect(useCoverSource).toHaveBeenCalledWith(decollage.id)
    const card = screen.getAllByRole('link', { name: containing(decollage.title) })[0]
    if (!card) throw new Error('no card « Décollage ! »')
    await fireEvent.press(card)

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([`/projects/${decollage.id}`])
  })
})
