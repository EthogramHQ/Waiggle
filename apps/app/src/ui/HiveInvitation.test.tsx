// Tests de la carte d'une invitation dans une ruche (tranche R10, planches R10-Ruches, R10-Inviter,
// R10-Etats ; relecture du plan, juridique C1 et interface 9, 12, 14) :
// - reçue (`mode` « received », par défaut) : « Nora Benali t'invite dans la ruche Atelier IA »,
//   « 6 membres · il y a 5 min », les trois promesses (ce que rejoindre partage, lues avant les
//   boutons), « Rejoindre la ruche » et « Refuser », nommés pour cette invitation (« Rejoindre la
//   ruche Atelier IA », « Refuser l'invitation de Nora Benali »), puis « Refuser ne prévient
//   personne. » Deux tapes rapides ne lancent qu'une écriture : une seule promesse à la fois ;
// - un « … » hors des boutons propose « Signaler la ruche Atelier IA » quand l'écran le permet
//   (`onReport`) ;
// - en aperçu (`preview`, « Ce que reçoit Max » de la feuille « Inviter ») : la même carte, boutons
//   dessinés mais inertes, sans rôle de bouton, sans « … » ;
// - refusée (`refused`) : elle reste à sa place, « Invitation refusée. » au lieu des boutons.
//
// L'API (plan R10, « API au contrat ») :
//   HiveInvitation({ invitation: HiveInvitation; onAccept: () => Promise<void>;
//     onRefuse: () => Promise<void>; onReport?: () => void; mode?: 'received' | 'preview';
//     refused?: boolean }).
import type { HiveInvitation as Invitation } from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, isHiddenFromAccessibility, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { renderWithProviders } from '../testing/render'
import { containing, fr, missingSentences } from '../testing/text'
import { HiveInvitation } from './HiveInvitation'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

/** Nora Benali invite dans « Atelier IA », 6 membres, il y a 5 minutes (la planche R10-Ruches). */
const invitation = (): Invitation => ({
  id: '6d1c2b8e-9f3a-4b7c-8e21-3a4f5b6c7d80',
  hive: {
    id: 'a3e4f5b6-1c2d-4e8f-9a0b-1c2d3e4f5a6b',
    name: 'Atelier IA',
    icon: 'code',
    memberCount: 6,
    animatorName: 'Nora Benali',
  },
  inviter: { id: 'u-nora', name: 'Nora Benali', avatarUrl: null },
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
})

const text = {
  line: fr.t(($) => $.hives.invitations.line, { name: 'Nora Benali', hive: 'Atelier IA' }),
  accept: fr.t(($) => $.hives.invitations.accept),
  acceptNamed: fr.t(($) => $.hives.invitations.acceptNamed, { hive: 'Atelier IA' }),
  refuse: fr.t(($) => $.hives.invitations.refuse),
  refuseNamed: fr.t(($) => $.hives.invitations.refuseNamed, {
    nameOf: nameOf('fr', 'Nora Benali'),
  }),
  refuseHint: fr.t(($) => $.hives.invitations.refuseHint),
  refused: fr.t(($) => $.hives.invitations.refused),
  more: fr.t(($) => $.hives.invitations.more, { hive: 'Atelier IA' }),
  report: fr.t(($) => $.hives.invitations.report, { hive: 'Atelier IA' }),
  members: fr.t(($) => $.hives.members, { count: 6 }),
  fiveMinutes: fr.t(($) => $.dates.minutes, { count: 5 }),
}

/** Les trois promesses (juridique C1), dans l'ordre du scénario. */
const PROMISES = [
  fr.t(($) => $.hives.invitations.promiseFaces),
  fr.t(($) => $.hives.invitations.promiseProjects),
  fr.t(($) => $.hives.invitations.promiseLeave),
]

type Props = ComponentProps<typeof HiveInvitation>

/** Une carte reçue ; chaque test remplace ce qu'il observe. */
const card = (props: Partial<Props> = {}) => (
  <HiveInvitation
    invitation={invitation()}
    onAccept={() => Promise.resolve()}
    onRefuse={() => Promise.resolve()}
    {...props}
  />
)

// --- Les outils ----------------------------------------------------------------------------------

/** La place de chaque élément dans l'ordre de l'arbre, celui où le lecteur d'écran lit. */
const readingOrder = (...elements: unknown[]) => {
  const order: unknown[] = []
  const walk = (node: unknown) => {
    order.push(node)
    for (const child of (node as { children: unknown[] }).children) {
      if (typeof child !== 'string') walk(child)
    }
  }
  walk(screen.root)
  return elements.map((element) => order.indexOf(element))
}

/** Une promesse dont on garde la main : le test décide quand l'écriture finit. */
const pending = () => {
  let finish: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}

// --- Les tests -----------------------------------------------------------------------------------

describe('HiveInvitation', () => {
  it('says who invites into which hive, with its size and when', async () => {
    expect(text.line).toMatch(containing('Nora Benali t’invite dans la ruche Atelier IA')) // témoin
    await renderWithProviders(card())

    expect(screen.getByText(containing(text.line))).toBeTruthy()
    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.hives.invitations.when, {
            members: text.members,
            relative: text.fiveMinutes,
          }),
        ),
      ),
    ).toBeTruthy()
  })

  it('names « Rejoindre la ruche Atelier IA » and « Refuser l’invitation de Nora Benali »', async () => {
    expect(text.refuseNamed).toBe('Refuser l’invitation de Nora Benali')
    const onAccept = jest.fn(() => Promise.resolve())
    const onRefuse = jest.fn(() => Promise.resolve())
    await renderWithProviders(card({ onAccept, onRefuse }))

    // À l'œil, les mots courts de la planche ; à l'oreille, le nom qui dit quelle invitation.
    expect(screen.getByText(text.accept)).toBeTruthy()
    expect(screen.getByText(text.refuse)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: text.acceptNamed }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: text.refuseNamed }))
    expect(onRefuse).toHaveBeenCalledTimes(1)
    expect(screen.getByText(text.refuseHint)).toBeTruthy()
  })

  it('names the refusal by the hive when the inviter deleted their account', async () => {
    await renderWithProviders(card({ invitation: { ...invitation(), inviter: null } }))

    expect(
      screen.getByText(
        containing(fr.t(($) => $.hives.invitations.lineNoInviter, { hive: 'Atelier IA' })),
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: fr.t(($) => $.hives.invitations.refuseNamedNoInviter, { hive: 'Atelier IA' }),
      }),
    ).toBeTruthy()
    expect(screen.queryByText(/null/)).toBeNull()
  })

  it('shows the three promises on a received invitation', async () => {
    expect(PROMISES[0]).toBe('Les membres de la ruche verront ton nom et ta photo dans la ruche.')
    await renderWithProviders(card())

    expect(screen.getByRole('button', { name: text.acceptNamed })).toBeTruthy() // témoin : reçue
    expect(missingSentences(PROMISES, screen)).toEqual([])
  })

  it('shows the invitee what joining shares before they accept', async () => {
    await renderWithProviders(card())

    const accept = screen.getByRole('button', { name: text.acceptNamed })
    for (const promise of PROMISES) {
      const said = screen.getByText(containing(promise))
      // Lue par les lecteurs d'écran (pas cachée), et avant « Rejoindre la ruche » : on sait ce
      // qu'on partage avant d'atteindre le bouton (la planche R10-Inviter).
      expect(isHiddenFromAccessibility(said)).toBe(false)
      const [promiseAt, acceptAt] = readingOrder(said, accept)
      expect(promiseAt).toBeGreaterThanOrEqual(0)
      expect(promiseAt).toBeLessThan(acceptAt ?? -1)
    }
  })

  it('accepts only once on two quick taps, until the first write ends', async () => {
    const first = pending()
    const onAccept = jest.fn(() => first.promise)
    const onRefuse = jest.fn(() => Promise.resolve())
    await renderWithProviders(card({ onAccept, onRefuse }))

    await fireEvent.press(screen.getByRole('button', { name: text.acceptNamed }))
    await fireEvent.press(screen.getByRole('button', { name: text.acceptNamed }))
    // Une seule promesse à la fois : « Refuser » attend aussi.
    await fireEvent.press(screen.getByRole('button', { name: text.refuseNamed }))

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onRefuse).not.toHaveBeenCalled()

    // L'écriture finie (un échec que l'écran a dit, par exemple), on peut réessayer.
    await act(async () => {
      first.finish()
      await first.promise
    })
    await fireEvent.press(screen.getByRole('button', { name: text.acceptNamed }))
    expect(onAccept).toHaveBeenCalledTimes(2)
  })

  it('refuses only once on two quick taps', async () => {
    const first = pending()
    const onRefuse = jest.fn(() => first.promise)
    const onAccept = jest.fn(() => Promise.resolve())
    await renderWithProviders(card({ onAccept, onRefuse }))

    await fireEvent.press(screen.getByRole('button', { name: text.refuseNamed }))
    await fireEvent.press(screen.getByRole('button', { name: text.refuseNamed }))
    await fireEvent.press(screen.getByRole('button', { name: text.acceptNamed }))

    expect(onRefuse).toHaveBeenCalledTimes(1)
    expect(onAccept).not.toHaveBeenCalled()
    await act(async () => {
      first.finish()
      await first.promise
    })
  })

  it('offers "Signaler la ruche Atelier IA" from an invitation', async () => {
    expect(text.report).toBe('Signaler la ruche Atelier IA')
    const onReport = jest.fn()
    const onAccept = jest.fn(() => Promise.resolve())
    const onRefuse = jest.fn(() => Promise.resolve())
    await renderWithProviders(card({ onReport, onAccept, onRefuse }))

    await fireEvent.press(screen.getByRole('button', { name: text.more }))
    await fireEvent.press(screen.getByRole('menuitem', { name: text.report }))

    expect(onReport).toHaveBeenCalledTimes(1)
    // Le « … » est à part : le toucher n'accepte ni ne refuse.
    expect(onAccept).not.toHaveBeenCalled()
    expect(onRefuse).not.toHaveBeenCalled()
  })

  it('offers no « … » when the screen gives no way to report', async () => {
    await renderWithProviders(card())

    expect(screen.getByRole('button', { name: text.acceptNamed })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: text.more })).toBeNull()
  })

  it('shows the invitation preview without any button', async () => {
    const onAccept = jest.fn(() => Promise.resolve())
    const onRefuse = jest.fn(() => Promise.resolve())
    const onReport = jest.fn()
    await renderWithProviders(card({ mode: 'preview', onAccept, onRefuse, onReport }))

    // Témoins : la même carte, ses promesses et ses deux boutons dessinés.
    expect(screen.getByText(containing(text.line))).toBeTruthy()
    expect(missingSentences(PROMISES, screen)).toEqual([])
    const drawnAccept = screen.getByText(text.accept)
    const drawnRefuse = screen.getByText(text.refuse)

    // Rien à toucher : ni bouton, ni lien, ni « … ».
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.queryByLabelText(text.more)).toBeNull()

    // Un toucher sur le dessin ne fait rien.
    await fireEvent.press(drawnAccept)
    await fireEvent.press(drawnRefuse)
    expect(onAccept).not.toHaveBeenCalled()
    expect(onRefuse).not.toHaveBeenCalled()
  })

  it('keeps a refused invitation in place with its result', async () => {
    expect(text.refused).toBe('Invitation refusée.')
    await renderWithProviders(card({ refused: true, onReport: () => {} }))

    // L'invitation reste lisible, à sa place…
    expect(screen.getByText(containing(text.line))).toBeTruthy()
    // … et dit ce qui s'est passé, au lieu des deux boutons.
    expect(screen.getByText(text.refused)).toBeTruthy()
    expect(screen.queryByRole('button', { name: text.acceptNamed })).toBeNull()
    expect(screen.queryByRole('button', { name: text.refuseNamed })).toBeNull()
    expect(screen.queryByText(text.accept)).toBeNull()
  })
})
