// Tests de la page d'un projet, R9 (7d) : les parties retirées seules par la modération, vues par
// leur auteur (docs/scenarios/refonte.md, « Retirer une partie », décision L2 de Louis du
// 13/11/2026), et « Rendre privé » d'un compte suspendu (« Un compte suspendu », J14, décision L6).
//
// Ce que ces tests supposent de l'écran (plan de R9, « Appli » et « Ce qui change au plan ») :
// - chaque partie de `project.removedParts` se montre à l'auteur dans un `ui/RemovedPart` : un
//   groupe nommé par son titre (`removal.part.titles.*`, « La photo 2 a été retirée par la
//   modération »), avec le fondement, l'explication, la date absolue, « Pour contester : » et
//   l'adresse de contact écrite (un lien `mailto:` dont l'objet nomme la décision, J12), la justice,
//   puis « Remplacer » et « Supprimer » ; l'endroit dans la page est libre ;
// - la photo retirée reste dans la galerie de l'auteur (le contrat la lui donne dans `visuals`),
//   marquée « Retiré par la modération » ;
// - « Remplacer » ouvre le formulaire du projet (`/projects/<id>/edit`), où l'auteur ajoute une
//   photo et retire l'ancienne (choix 3 du plan : toute écriture de la partie efface la marque) ;
// - « Supprimer » d'une photo retirée la supprime (`deleteVisual(projet, photo)` de
//   `projects/api`), après une confirmation si l'écran en pose une ;
// - « Rendre privé » est au menu « … » d'un auteur suspendu dont le projet est public ; il demande
//   une confirmation (`suspension.makePrivateTitle`), puis envoie `updateProject(id, { visibility:
//   'private' })`, et rien d'autre.
//
// L'API est remplacée par de faux appels ; les aides communes sont dans ProjectScreen.testkit.tsx.
import { contactEmail } from '@ruche/brand'
import type { Project } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { Linking } from 'react-native'
import type { ApiResult } from '../api/errors'
import { getMe } from '../profile/api'
import { deleteVisual, getProject, updateProject } from '../projects/api'
import { passTapGuard } from '../testing/dialog'
import { suspendedMe } from '../testing/fixtures'
import {
  descriptionRemoval,
  photoRemoval,
  removedPhotoPart,
  removedTextPart,
} from '../testing/moderation'
import { pathOf } from '../testing/navigation'
import { projectWithPhotos, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import {
  dialogTitled,
  id,
  mockPush,
  mockScreenProps,
  resetProjectScreenMocks,
} from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil, qui dit aussi si le compte est suspendu.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// R9 : `updateProject` (« Rendre privé ») et `deleteVisual` (« Supprimer » d'une photo retirée).
jest.mock('../projects/api', () => ({
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  updateProject: jest.fn(),
  deleteVisual: jest.fn(),
}))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      dismissTo: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    useIsFocused: () => true,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(() => effect(), [effect])
    },
  }
})
// Le cadre de page, tel quel (le kit en garde les propriétés).
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

let openURL: jest.SpyInstance

beforeEach(() => {
  resetProjectScreenMocks()
  jest
    .mocked(updateProject)
    .mockReset()
    .mockImplementation(
      async (_id, changes): Promise<ApiResult<Project>> => ({
        ok: true,
        data: { ...recipesProject, ...(changes as Partial<Project>) },
      }),
    )
  jest
    .mocked(deleteVisual)
    .mockReset()
    .mockResolvedValue({ ok: true, data: { ...projectWithPhotos, removedParts: [] } })
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

// --- Les données ---

const [firstPhoto, secondPhoto, thirdPhoto] = projectWithPhotos.visuals
if (!firstPhoto || !secondPhoto || !thirdPhoto) throw new Error('three photos expected')

/** Le projet de Léa, sa 2e photo retirée seule : elle la voit encore, dans sa galerie. */
const withRemovedPhoto: Project = {
  ...projectWithPhotos,
  removedParts: [removedPhotoPart(secondPhoto.id)],
}

/** Le même projet tel que l'API le donne à tout autre membre : la photo n'est plus là. */
const removedPhotoForOthers: Project = {
  ...projectWithPhotos,
  isMine: false,
  visuals: [firstPhoto, thirdPhoto],
  removedParts: [],
}

/** La description retirée seule : sortie de sa colonne, l'auteur la relit dans `value`. */
const removedDescription = 'Paie ici pour la version complète : paiement-recettes.example'
const withRemovedDescription: Project = {
  ...recipesProject,
  description: '',
  removedParts: [removedTextPart('description', removedDescription)],
}

// --- Les textes ---

const T = {
  title: recipesProject.title,
  photoTitle: fr.t(($) => $.removal.part.titles.photo, { n: 2 }),
  descriptionTitle: fr.t(($) => $.removal.part.titles.description),
  banner: fr.t(($) => $.removal.banner),
  replace: fr.t(($) => $.removal.part.replace),
  remove: fr.t(($) => $.removal.part.delete),
  contestLead: fr.t(($) => $.removal.part.contestLead),
  court: fr.t(($) => $.removal.part.court),
  onlyYou: fr.t(($) => $.removal.part.onlyYou),
  illegal: fr.t(($) => $.removal.grounds.illegal),
  rules: fr.t(($) => $.removal.grounds.rules),
  afterReport: fr.t(($) => $.removal.afterReport),
  direct: fr.t(($) => $.removal.direct),
  menu: fr.t(($) => $.actionMenu.label),
  edit: fr.t(($) => $.project.page.edit),
  publishUpdate: fr.t(($) => $.project.updates.add),
  deleteProject: fr.t(($) => $.project.page.delete),
  copyLink: fr.t(($) => $.share.copy),
  corner: fr.t(($) => $.project.testers.corner),
  makePrivate: fr.t(($) => $.suspension.makePrivate),
  makePrivateTitle: fr.t(($) => $.suspension.makePrivateTitle, { title: recipesProject.title }),
  makePrivateBody: fr.t(($) => $.suspension.makePrivateBody),
  madePrivate: fr.t(($) => $.suspension.madePrivate),
  cancel: fr.t(($) => $.common.cancel),
}

// --- Les aides ---

/** Ouvre la page du projet et attend son titre. */
const openProject = async (project: Project) => {
  jest.mocked(getProject).mockResolvedValue(project)
  await renderWithProviders(<ProjectScreen id={id} />)
  await screen.findByRole('header', { name: T.title })
}

/** La notice d'une partie retirée : le groupe nommé par son titre. */
const part = (title: string) => within(screen.getByRole('group', { name: title }))

/** Vrai si ce texte est écrit dans la notice, blancs de la typographie française compris. */
const inPart = (title: string, text: string) =>
  part(title).queryAllByText(containing(text)).length > 0

/** Le lien de la notice qui ouvre la messagerie, quel que soit son texte. */
const contactLinkIn = (title: string) => {
  const link = part(title)
    .queryAllByRole('link')
    .find((one) => {
      const name = String(one.props.accessibilityLabel ?? '')
      return name === contactEmail || name === fr.t(($) => $.notifications.contest)
    })
  if (!link) throw new Error(`no contact link in « ${title} »`)
  return link
}

/** Les adresses ouvertes par `router.push`, paramètres remplis. */
const pushed = () => mockPush.mock.calls.map(([href]) => pathOf(href))

/** Ouvre le menu « … » de la page et rend le nom de chacune de ses actions. */
const menuItems = async () => {
  await fireEvent.press(await screen.findByRole('button', { name: T.menu }))
  return screen.getAllByRole('menuitem').map((item) => String(item.props.accessibilityLabel ?? ''))
}

// --- Une photo retirée seule, vue par son autrice ---

describe('a photo removed by the moderation, seen by its author', () => {
  it('shows the ground, the explanation, the date and Contester on a removed part', async () => {
    await openProject(withRemovedPhoto)

    expect(inPart(T.photoTitle, T.illegal)).toBe(true)
    expect(
      inPart(
        T.photoTitle,
        fr.t(($) => $.removal.explanation, { explanation: photoRemoval.explanation }),
      ),
    ).toBe(true)
    // La date absolue (12 novembre) : la notice se relit longtemps après.
    expect(part(T.photoTitle).queryAllByText(/Retiré le .*12 nov/).length).toBeGreaterThan(0)
    expect(inPart(T.photoTitle, T.contestLead)).toBe(true)
    expect(inPart(T.photoTitle, T.court)).toBe(true)
    expect(inPart(T.photoTitle, T.afterReport)).toBe(true)
  })

  it('writes the contact address in full next to Contester', async () => {
    await openProject(withRemovedPhoto)

    expect(inPart(T.photoTitle, contactEmail)).toBe(true)
  })

  it('opens mailto with a subject naming the decision and its date', async () => {
    await openProject(withRemovedPhoto)

    await fireEvent.press(contactLinkIn(T.photoTitle))

    const url = String(openURL.mock.calls.at(-1)?.[0] ?? '')
    expect(url.startsWith(`mailto:${contactEmail}?subject=`)).toBe(true)
    const subject = decodeURIComponent(url.split('?subject=')[1] ?? '')
    // « Contestation : retrait de la photo 2 de « Mon agent de recettes » du 12 nov. » (J12).
    expect(subject).toMatch(/^Contestation/)
    expect(subject).toContain('photo 2')
    expect(subject).toContain(T.title)
    expect(subject).toMatch(/12/)
  })

  it('keeps the removed photo in her gallery, marked « Retiré par la modération »', async () => {
    await openProject(withRemovedPhoto)

    const gallery = screen.getByRole('adjustable', { name: fr.t(($) => $.gallery.label) })
    // Ses trois photos sont toujours là pour elle.
    expect(
      within(gallery).queryAllByText(fr.t(($) => $.gallery.count, { index: 1, count: 3 })),
    ).not.toHaveLength(0)
    expect(within(gallery).queryAllByText(containing(T.banner)).length).toBeGreaterThan(0)
  })

  it('opens the project form from « Remplacer », to add a photo and remove this one', async () => {
    await openProject(withRemovedPhoto)

    await fireEvent.press(part(T.photoTitle).getByRole('button', { name: T.replace }))

    expect(pushed()).toContain(`/projects/${id}/edit`)
  })

  it('deletes the removed photo, and only it, from « Supprimer »', async () => {
    await openProject(withRemovedPhoto)

    await fireEvent.press(part(T.photoTitle).getByRole('button', { name: T.remove }))
    // Une confirmation, si l'écran en pose une : son bouton est le dernier « Supprimer » venu.
    if (jest.mocked(deleteVisual).mock.calls.length === 0) {
      await passTapGuard()
      const buttons = screen.queryAllByRole('button', { name: T.remove })
      const confirm = buttons.at(-1)
      if (confirm) await fireEvent.press(confirm)
    }

    await waitFor(() => expect(deleteVisual).toHaveBeenCalledTimes(1))
    expect(deleteVisual).toHaveBeenCalledWith(id, secondPhoto.id)
  })

  it('offers no « Remplacer » to a suspended author, who cannot edit the project', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await openProject(withRemovedPhoto)

    // Témoin : le bandeau de la suspension est là (le profil est lu), et la notice aussi.
    expect(await screen.findByText(containing(fr.t(($) => $.suspension.title)))).toBeTruthy()
    expect(inPart(T.photoTitle, T.illegal)).toBe(true)
    expect(part(T.photoTitle).queryByRole('button', { name: T.replace })).toBeNull()
  })
})

// --- Un texte retiré seul ---

describe('a description removed by the moderation, seen by its author', () => {
  it('shows what was removed and why, saying no report came first', async () => {
    await openProject(withRemovedDescription)

    expect(inPart(T.descriptionTitle, removedDescription)).toBe(true)
    expect(inPart(T.descriptionTitle, T.rules)).toBe(true)
    expect(
      inPart(
        T.descriptionTitle,
        fr.t(($) => $.removal.explanation, { explanation: descriptionRemoval.explanation }),
      ),
    ).toBe(true)
    expect(inPart(T.descriptionTitle, T.direct)).toBe(true)
    expect(inPart(T.descriptionTitle, T.afterReport)).toBe(false)
    expect(inPart(T.descriptionTitle, contactEmail)).toBe(true)
  })

  it('opens the project form from « Remplacer »', async () => {
    await openProject(withRemovedDescription)

    await fireEvent.press(part(T.descriptionTitle).getByRole('button', { name: T.replace }))

    expect(pushed()).toContain(`/projects/${id}/edit`)
  })
})

// --- Rien de tout cela pour un autre membre ---

describe('a removed part, for another member', () => {
  beforeEach(() => mockSession({ user: { id: 'u2', name: 'Max' } }))

  it('shows nothing of a removed photo, as the API gives the project to others', async () => {
    await openProject(removedPhotoForOthers)

    // Témoin : la page est là, avec sa galerie de deux photos.
    const gallery = screen.getByRole('adjustable', { name: fr.t(($) => $.gallery.label) })
    expect(
      within(gallery).queryAllByText(fr.t(($) => $.gallery.count, { index: 1, count: 2 })),
    ).not.toHaveLength(0)
    expect(screen.queryByRole('group', { name: T.photoTitle })).toBeNull()
    expect(screen.queryAllByText(containing(T.banner))).toHaveLength(0)
    expect(screen.queryByRole('button', { name: T.replace })).toBeNull()
  })

  it('never shows a removed part to a member who is not the author, even if the list came', async () => {
    await openProject({ ...withRemovedDescription, isMine: false })

    // Témoin : le titre de la page est là (attendu par openProject), et « Signaler ce projet ».
    expect(screen.getByRole('link', { name: fr.t(($) => $.project.page.report) })).toBeTruthy()
    expect(screen.queryByRole('group', { name: T.descriptionTitle })).toBeNull()
    expect(screen.queryAllByText(containing(removedDescription))).toHaveLength(0)
    expect(screen.queryAllByText(containing(contactEmail))).toHaveLength(0)
  })
})

// --- « Rendre privé », pour un compte suspendu (J14, décision L6 de Louis du 13/11/2026) ---

describe('« Rendre privé » for a suspended author', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
  })

  /** Ouvre la page, attend le bandeau de la suspension, puis touche « Rendre privé » au menu. */
  const askToMakePrivate = async (project: Project = recipesProject) => {
    await openProject(project)
    await screen.findByText(containing(fr.t(($) => $.suspension.title)))
    await fireEvent.press(await screen.findByRole('button', { name: T.menu }))
    await fireEvent.press(await screen.findByRole('menuitem', { name: T.makePrivate }))
    await passTapGuard()
  }

  it('offers « Rendre privé » in the menu, with nothing else than reading and deleting', async () => {
    await openProject(recipesProject)
    await screen.findByText(containing(fr.t(($) => $.suspension.title)))

    // Le projet de Léa cherche des testeurs : le coin reste lisible.
    expect([...(await menuItems())].sort()).toEqual(
      [T.copyLink, T.makePrivate, T.corner, T.deleteProject].sort(),
    )
  })

  it('asks before making the project private, saying it cannot come back during the suspension', async () => {
    await askToMakePrivate()

    expect(screen.getByRole('header', { name: T.makePrivateTitle })).toBeTruthy()
    expect(screen.queryAllByText(containing(T.makePrivateBody)).length).toBeGreaterThan(0)
    // Rien n'est envoyé avant la confirmation.
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('sends only { visibility: private } once confirmed, and says so', async () => {
    await askToMakePrivate()

    await fireEvent.press(
      dialogTitled(T.makePrivateTitle).getByRole('button', { name: T.makePrivate }),
    )

    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1))
    expect(updateProject).toHaveBeenCalledWith(id, { visibility: 'private' })
    expect(await screen.findByText(T.madePrivate)).toBeTruthy()
  })

  it('sends only once for a double tap on the confirmation', async () => {
    let finish: (value: ApiResult<Project>) => void = () => {}
    jest.mocked(updateProject).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await askToMakePrivate()

    const confirm = dialogTitled(T.makePrivateTitle).getByRole('button', { name: T.makePrivate })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(updateProject).toHaveBeenCalledTimes(1)
    await act(async () => finish({ ok: true, data: { ...recipesProject, visibility: 'private' } }))
  })

  it('changes nothing on « Annuler »', async () => {
    await askToMakePrivate()

    await fireEvent.press(dialogTitled(T.makePrivateTitle).getByRole('button', { name: T.cancel }))

    await waitFor(() =>
      expect(screen.queryByRole('header', { name: T.makePrivateTitle })).toBeNull(),
    )
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('does not offer « Rendre privé » on a project already private', async () => {
    await openProject({ ...recipesProject, visibility: 'private' })
    await screen.findByText(containing(fr.t(($) => $.suspension.title)))

    const items = await menuItems()
    // Témoin : le menu est ouvert, avec « Supprimer ».
    expect(items).toContain(T.deleteProject)
    expect(items).not.toContain(T.makePrivate)
  })

  it('does not offer « Rendre privé » on the project of another member', async () => {
    mockSession({ user: { id: 'u2', name: 'Max' } })
    await openProject({ ...recipesProject, isMine: false })
    await screen.findByText(containing(fr.t(($) => $.suspension.title)))

    const items = await menuItems()
    expect(items).toContain(fr.t(($) => $.report.project))
    expect(items).not.toContain(T.makePrivate)
  })
})

describe('« Rendre privé » for an author who is not suspended', () => {
  it('is not in the menu: « Modifier » changes the visibility', async () => {
    await openProject(recipesProject)

    const items = await menuItems()
    // Témoin : « Modifier » est là.
    expect(items).toContain(T.edit)
    expect(items).not.toContain(T.makePrivate)
  })
})
