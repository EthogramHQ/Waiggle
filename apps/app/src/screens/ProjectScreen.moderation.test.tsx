// Tests de la page d'un projet : signaler, ce que l'auteur lit d'un contenu retiré (tranche 7a),
// la session qui expire, le compte suspendu (7c) et les fenêtres qui viennent de s’ouvrir.
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
import { NO_REACTIONS, type Project } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useState } from 'react'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { deleteProject, getProject } from '../projects/api'
import { projectQueryKey } from '../projects/hooks'
import { useReaction } from '../reactions/api'
import { maxComment } from '../testing/comments'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { removalAfterReport, removalByLaw } from '../testing/moderation'
import { reportsOpened } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr, missingSentences, removalSentences } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import {
  cardOf,
  deleteButton,
  dialogTitled,
  firstVersion,
  id,
  mockComments,
  mockPush,
  mockReact,
  mockRemove,
  mockRemoveComment,
  mockReplace,
  mockScreenProps,
  mockToggle,
  resetProjectScreenMocks,
  seenByOther,
  signInAgain,
  v2,
  withNotes,
  withReactions,
} from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
// Suivre : un faux hook, dont le test lit les appels (toggle) et choisit l'erreur.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// La page de l'auteur est lue (« Suivre » n'est proposé qu'une fois qu'on sait si on le suit, et
// plus quand la lecture échoue : décision du 2/11/2026). Ici, une lecture réussie, auteur non suivi.
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
// Les notes (tranche 4b) : de faux hooks, dont le test lit les appels (publish, remove).
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
// Les réactions et les commentaires (tranche 5) : de faux hooks, dont le test lit les appels.
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
// Les suggestions après « @ » (tranche 6b) : personne à proposer ; elles sont testées dans
// ProjectComments.test.tsx.
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
// Le presse-papiers (R5a) : « Copier le lien » du menu « … » et de la feuille Partager, « Copier »
// d'un prompt. Le test lit ce qui est copié ; l'appareil, lui, n'est jamais touché.
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
// Les paramètres de l'adresse de la page (?announce=testable), choisis par chaque test.
let mockParams: Record<string, string | undefined> = {}
// RF (ui-1) : la page est-elle affichée ? Sur le web, la page quittée reste montée, cachée ; le
// retour la rend affichée de nouveau. `useIsFocused` et `useFocusEffect` suivent ce drapeau, relu
// à chaque rendu (le test redessine après l'avoir changé).
let mockFocused = true
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mockFocused
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})
// Le cadre de page, tel quel, mais dont le test lit les propriétés (RF : `fade`).
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})

beforeEach(() => {
  resetProjectScreenMocks()
  mockParams = {}
  mockFocused = true
})

// --- Tranche 7a : signaler un projet ou une note, et ce que l'auteur lit d'un contenu retiré ---

// Tranche 7b (décision de Louis du 24/10/2026, « pas un bouton par entrée ») : « Signaler ce projet »
// passe dans le menu « … » de la page (ActionMenu), un bouton « Plus d'actions » qui ouvre une
// liste d'actions (rôle menuitem).
describe('reporting a project from its page', () => {
  it('offers another member to report the project through the « … » menu, and opens « Signaler » for it', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(
      await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }),
    )
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler ce projet' }))

    expect(reportsOpened(mockPush)).toEqual([expect.objectContaining({ kind: 'project', id })])
  })

  // R5a (F-Pr12) : le lien gris « Signaler ce projet » revient en bas de la page, en plus du menu
  // (le test de 7b « plus de lien à part » est retourné). Le test de 7b qui voulait le menu juste
  // après « Suivre ce projet » est retiré : le menu « … » monte sur la photo, à côté de Partager.
  it('offers « Signaler ce projet » at the bottom of the page, after the comments on a phone', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('button', { name: 'Écrire un commentaire' })
    const report =
      screen.queryByRole('link', { name: 'Signaler ce projet' }) ??
      screen.getByRole('button', { name: 'Signaler ce projet' })
    const names = screen
      .getAllByRole(/^(button|link)$/)
      .map((control) => String(control.props.accessibilityLabel ?? ''))
    expect(names.indexOf('Signaler ce projet')).toBeGreaterThan(
      names.indexOf('Écrire un commentaire'),
    )
    await fireEvent.press(report)

    expect(reportsOpened(mockPush)).toEqual([expect.objectContaining({ kind: 'project', id })])
  })

  it('never offers the author to report the project, neither at the bottom nor in the menu', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page de l'auteur est affichée, avec ses actions.
    expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Signaler ce projet' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Signaler ce projet' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.actionMenu.label) }))
    expect(screen.queryByRole('menuitem', { name: 'Signaler ce projet' })).toBeNull()
  })
})

describe('reporting a note from the journal', () => {
  it('offers another member a « Signaler cette note » button per note', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    const buttons = await screen.findAllByRole('button', { name: 'Signaler cette note' })
    expect(buttons).toHaveLength(2)
    const second = buttons[1]
    if (!second) throw new Error('a report button per note is expected')
    await fireEvent.press(second)

    expect(reportsOpened(mockPush)).toEqual([
      expect.objectContaining({ kind: 'note', id: firstVersion.id }),
    ])
  })

  it('says which note the button reports, by its text', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    const buttons = await screen.findAllByRole('button', { name: 'Signaler cette note' })
    // Comme « Supprimer la note » : l'indice lu sur téléphone est le début de la note.
    expect(buttons[0]).toHaveProp('accessibilityHint', expect.stringContaining('v2'))
  })

  it('never offers the author to report a note of the project', async () => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : l'auteur supprime ses notes ; il ne les signale pas.
    expect(await screen.findAllByRole('button', { name: 'Supprimer la note' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Signaler cette note' })).toBeNull()
  })
})

describe('a project removed by the moderation, seen by its author', () => {
  it('says at the top that it was removed, why, by whom, and how to contest', async () => {
    // Retiré sans signalement, au nom de la loi : « une personne de la modération a décidé ».
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, removal: removalByLaw })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBeGreaterThan(0)
    expect(missingSentences(removalSentences(removalByLaw), screen)).toEqual([])
    // Le fondement de la loi, pas celui des règles ; aucun signalement mentionné.
    expect(screen.queryByText(containing(fr.t(($) => $.removal.grounds.rules)))).toBeNull()
    expect(screen.queryByText(containing(fr.t(($) => $.removal.afterReport)))).toBeNull()
  })

  it('says when the removal followed a report, without saying who reported', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, removal: removalAfterReport })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(missingSentences(removalSentences(removalAfterReport), screen)).toEqual([])
  })

  it('shows no such banner on a project that was not removed', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page est là, sans bandeau de retrait.
    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByText(containing(fr.t(($) => $.removal.banner)))).toBeNull()
    expect(screen.queryByText(containing(fr.t(($) => $.removal.contest)))).toBeNull()
  })
})

describe('a note removed by the moderation, seen by the author of the project', () => {
  it('keeps the note in the journal, with « Retiré par la modération » and why', async () => {
    jest.mocked(getProject).mockResolvedValue({
      ...recipesProject,
      notes: [{ ...v2, removal: removalAfterReport }, firstVersion],
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('v2 : mode hors ligne')).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBe(1)
    expect(missingSentences(removalSentences(removalAfterReport), screen)).toEqual([])
    // L'autre note, visible, n'a pas de bandeau : un seul « Pour contester ».
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.contest)))).toHaveLength(1)
  })
})

// Relecture de design de 6c : deux actions refusées parce que la session a expiré (Suivre, puis une
// réaction) empilaient deux « Ta session a expiré » et deux liens « Me reconnecter ».
describe('a session that expired during two actions on the page', () => {
  it('says it once, with a single « Me reconnecter », after following then reacting', async () => {
    seenByOther(recipesProject)
    // Les deux actions échouent en 401 au toucher : un état React dans chaque faux hook, pour que
    // l'écran se redessine comme avec le vrai.
    jest.mocked(useFollow).mockImplementation(() => {
      const [expired, setExpired] = useState(false)
      return { toggle: () => setExpired(true), error: expired, expired }
    })
    jest.mocked(useReaction).mockImplementation(() => {
      const [expired, setExpired] = useState(false)
      return { toggle: () => setExpired(true), error: expired, expired }
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('switch', { name: 'Suivre ce projet' }))
    // Témoin : le premier refus a bien son lien.
    expect(await screen.findAllByRole('link', { name: 'Me reconnecter' })).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Bluffant, 0' }))

    expect(screen.getAllByRole('link', { name: 'Me reconnecter' })).toHaveLength(1)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    await signInAgain()
  })
})

// --- Tranche 7c : un compte suspendu (docs/scenarios/phase-1.md, « Un compte suspendu ») ---
//
// Le profil (GET /v1/me) dit si le compte est suspendu. Sur la page d'un projet, un membre suspendu
// lit tout, mais ne modifie plus son projet, n'écrit plus de note, ne suit plus et ne réagit plus ;
// il peut encore supprimer son projet et ses notes.
describe('a project page seen by a suspended member', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
  })

  it('shows the suspension banner at the top of the page', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText(containing(fr.t(($) => $.suspension.title)))).toBeTruthy()
  })

  it('offers the author neither to edit the project nor to write a note, but still to delete', async () => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Publier une note' })).toBeNull()
    expect(screen.queryByLabelText('Ta note')).toBeNull()
    // Supprimer reste possible : le projet, chacune de ses notes.
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Supprimer la note' })).toHaveLength(2)
    // Le journal reste lisible.
    expect(screen.getByText('v2 : mode hors ligne')).toBeTruthy()
  })

  it('offers neither to follow nor to react on the project of another member, but shows the numbers', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() =>
      expect(screen.queryByRole('switch', { name: 'Suivre ce projet' })).toBeNull(),
    )
    expect(
      screen.queryByRole('button', { name: /^(Bluffant|Inspirant|Utile|Drôle|Waggle\s!),/ }),
    ).toBeNull()
    // Il lit tout ce qu'il lisait avant : les nombres restent, comme pour l'auteur.
    expect(screen.getByLabelText('Waggle\u202f!, 3')).toBeTruthy()
  })

  it('offers no comment to write, but keeps the comments readable', async () => {
    seenByOther()
    mockComments([maxComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Écrire un commentaire' })).toBeNull(),
    )
  })

  it('keeps every action for a member who is not suspended', async () => {
    // Témoin : Léa, pas suspendue, une fois son profil lu.
    jest.mocked(getMe).mockResolvedValue(leaMe)
    jest.mocked(getProject).mockResolvedValue(withNotes)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publier une note' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.suspension.title)))).toBeNull()
  })

  it('keeps following and reacting for another member who is not suspended', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByRole('switch', { name: 'Suivre ce projet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Waggle\u202f!, 3' })).toBeTruthy()
  })
})

// Décision de Louis du 26/10/2026 (choix a) : un membre suspendu peut retirer ce qu'il a déjà
// donné, jamais ajouter (scénario : « retirer ses réactions et ses abonnements »). Un projet qu'il
// suit garde son interrupteur, pour ne plus le suivre ; une réaction donnée garde son bouton, pour
// la retirer ; les autres réactions ne montrent que leur nombre.
describe('a suspended member takes back what she gave, and gives nothing more', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
  })

  it('lets her stop following a project she follows', async () => {
    seenByOther({ ...withNotes, isFollowed: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    // Témoin du profil lu : aucune réaction à poser.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Waggle\s!,/ })).toBeNull())
    await fireEvent.press(screen.getByRole('switch', { name: 'Projet suivi' }))

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('lets her take back a reaction she gave, but not add another one', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: ['bravo'] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^(Bluffant|Inspirant|Utile|Drôle),/ }),
      ).toBeNull(),
    )
    // Les autres réactions restent lisibles, sans bouton.
    expect(screen.getByLabelText('Utile, 0')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Waggle\u202f!, 3, ta réaction' }))

    expect(mockReact).toHaveBeenCalledWith('bravo')
  })

  // Relecture de design 7c : une fois le suivi retiré, l'interrupteur restait actif, et une seconde
  // tape envoyait un suivi que l'API refuse (403). Il reste à sa place, inactif.
  it('keeps « Follow this project » in place but inactive once she stopped following', async () => {
    seenByOther({ ...withNotes, isFollowed: true })
    const { queryClient } = await renderWithProviders(<ProjectScreen id={id} />)
    // Le faux hook fait ce que fait le vrai au toucher : le projet n'est plus suivi, dans le cache.
    mockToggle.mockImplementation(() =>
      queryClient.setQueryData<Project>(projectQueryKey(id), (project) =>
        project ? { ...project, isFollowed: false } : project,
      ),
    )

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Waggle\s!,/ })).toBeNull())
    await fireEvent.press(screen.getByRole('switch', { name: 'Projet suivi' }))

    const follow = await screen.findByRole('switch', { name: 'Suivre ce projet' })
    expect(follow).toBeDisabled()
    await fireEvent.press(follow)
    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  // Même défaut pour une réaction retirée pendant la visite : sa pastille reste, inactive.
  it('keeps a reaction she took back in place but inactive', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: ['bravo'] }))
    const { queryClient } = await renderWithProviders(<ProjectScreen id={id} />)
    mockReact.mockImplementation(() =>
      queryClient.setQueryData<Project>(projectQueryKey(id), (project) =>
        project
          ? {
              ...project,
              reactions: { counts: { ...NO_REACTIONS.counts, bravo: 2 }, mine: [] },
            }
          : project,
      ),
    )

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Waggle\u202f!, 3, ta réaction' }),
    )

    const chip = await screen.findByRole('button', { name: 'Waggle\u202f!, 2' })
    expect(chip).toBeDisabled()
    await fireEvent.press(chip)
    expect(mockReact).toHaveBeenCalledTimes(1)
  })

  // Relecture d'interface 7c : sans réaction à retirer, les nombres seuls forment une liste, qui a
  // besoin d'un nom, comme celle de l'auteur (« Les réactions à ton projet »).
  it('names the list of numbers when she has no reaction to take back', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Waggle\s!,/ })).toBeNull())
    expect(screen.getByLabelText(fr.t(($) => $.project.reactions.readOnly))).toBeTruthy()
  })
})

// Design 7b (`guardTaps`) : les fenêtres de la page s'ouvrent sous le doigt qui vient de toucher
// « Supprimer » ; une seconde tape trop rapide ne doit rien y décider.
describe('the windows of the project page, right after opening', () => {
  it('ignores a tap in the window to delete the project', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Supprimer' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer le projet' }))

    // « Supprimer le projet » touché pendant la garde : rien n'est supprimé, la fenêtre reste.
    expect(deleteProject).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer le projet' })).toBeTruthy()
  })

  it('ignores a tap in the window to delete a note', async () => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(0))
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(mockRemove).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: 'Supprimer cette note ?' })).toBeTruthy()
  })

  it('ignores a tap in the window to delete a comment', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Supprimer le commentaire',
      }),
    )
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(mockRemoveComment).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeTruthy()
  })
})
