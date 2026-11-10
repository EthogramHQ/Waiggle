// Les aides, données et fausses fonctions communes aux tests de la page d'un projet
// (ProjectScreen.*.test.tsx). Pas de suffixe « .test » : Jest ne le prend pas pour une suite de
// tests, il le charge seulement quand un fichier de test l’importe.
//
// Les jest.mock, eux, restent écrits dans chaque fichier de test : Jest les remonte en tête du
// fichier où ils sont écrits, avant ses imports. Écrits ici, ils arriveraient trop tard, une fois
// l'écran déjà chargé avec les vrais modules. Comme chaque fichier de test remplace les mêmes
// modules, les faux hooks importés ici (useFollow, useComments…) sont bien les faux.
import type { Comment, Project, UpdateFamily } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { webAppUrl } from '../config'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { deleteProject, getProject } from '../projects/api'
import { useReaction } from '../reactions/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { mockSession } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { copyText } from '../ui/clipboard'
import { useDeleteUpdate } from '../updates/api'

// Les fausses fonctions de la navigation et du cadre de page, lues par les jest.mock de chaque
// fichier (un nom qui commence par « mock » y est permis : Jest le lit au moment de l'appel).
export const mockPush = jest.fn()
export const mockReplace = jest.fn()
// Le cadre de page, tel quel, mais dont le test lit les propriétés (RF : `fade`).
export const mockScreenProps: Record<string, unknown>[] = []

export const { id } = recipesProject
export const mockToggle = jest.fn()

/**
 * Tranche 6c : à côté de « Ta session a expiré », un lien « Me reconnecter » mène à la connexion,
 * qui ramène ensuite sur cette page (?next=, vérifié par navigation/next.ts).
 */
export const signInAgain = async () => {
  await fireEvent.press(await screen.findByRole('link', { name: 'Me reconnecter' }))
  expect(visited(mockPush)).toContain('/sign-in?next=/page/actuelle')
}

// --- R7a : les mises à jour, qui remplacent le Journal ---

/** Le faux `remove` de `useDeleteUpdate` : le test lit ses appels et choisit sa réponse. */
export const mockRemoveUpdate = jest.fn()

/**
 * Le projet de Léa avec trois mises à jour : la section « Les mises à jour » montre la dernière
 * (« Le décompte de la fusée », v1.2, une ligne « Nouveau » et une « Réparé », deux photos en avant
 * / après), puis « Voir les 3 mises à jour ».
 */
export const withUpdates: Project = {
  ...recipesProject,
  latestUpdate: rocketUpdate,
  updateCount: 3,
  version: 'v1.2',
}

/** Le bouton corbeille de la mise à jour de la fusée, nommé par son titre. */
export const deleteUpdateName = fr.t(($) => $.project.updates.delete, {
  title: rocketUpdate.title ?? '',
})

/** Le titre de la fenêtre de suppression d'une mise à jour. */
export const deleteUpdateTitle = fr.t(($) => $.project.updates.deleteTitle)

/** La corbeille de la mise à jour de la fusée, une fois la page affichée. */
export const deleteUpdateButton = () => screen.findByRole('button', { name: deleteUpdateName })

/**
 * Une ligne de « Ce qui a changé » telle qu'elle se lit (interface B4) : « Nouveau : <texte> »,
 * par un texte caché à l'œil ou par le nom de la ligne. Rend vrai si la page la lit ainsi.
 */
export const readsLine = (family: UpdateFamily, text: string) => {
  const read = fr.t(($) => $.update.lineRead, {
    family: fr.t(($) => $.update.family[family]),
    text,
  })
  return (
    screen.queryAllByText(containing(read)).length > 0 ||
    screen.queryAllByLabelText(containing(read)).length > 0
  )
}

/** Le projet de Léa, vu par Max. */
export const seenByOther = (project: Project = withUpdates) => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getProject).mockResolvedValue({ ...project, isMine: false })
}

/**
 * Le contenu de la fenêtre de confirmation qui porte ce titre : on remonte depuis le titre jusqu'au
 * premier ensemble qui contient aussi des boutons. Utile quand un bouton de la page porte le même
 * nom qu'un bouton de la fenêtre (« Supprimer », pour le projet comme pour la note).
 */
export const dialogTitled = (title: string) => {
  let node = screen.getByRole('header', { name: title }).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no dialog titled ${title}`)
  return within(node)
}

export const mockReact = jest.fn()
export const mockPost = jest.fn()
export const mockEdit = jest.fn()
export const mockRemoveComment = jest.fn()
export const mockSetHidden = jest.fn()
export const mockFetchNextPage = jest.fn()

/**
 * La liste des commentaires telle que useComments la rend : une page déjà lue (comme
 * useInfiniteQuery), et peut-être une suite à charger.
 */
export const mockComments = (
  items: Comment[],
  { hasNextPage = false, isFetchingNextPage = false } = {},
) => {
  jest.mocked(useComments).mockReturnValue({
    data: { pages: [{ items, nextCursor: hasNextPage ? 'abc' : null }], pageParams: [undefined] },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage,
    isFetchingNextPage,
    isRefetching: false,
    fetchNextPage: mockFetchNextPage,
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useComments>)
}

/** Le projet de Léa avec ces réactions (vu par elle-même, sauf si le test appelle seenByOther). */
export const withReactions = (reactions: Project['reactions']): Project => ({
  ...recipesProject,
  reactions,
})

/**
 * Les actions d'un commentaire : on remonte depuis son texte jusqu'au premier ensemble qui contient
 * des boutons, c'est-à-dire sa carte. Les réponses ont chacune la leur, hors de celle de la racine.
 */
export const cardOf = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no actions around the comment ${text}`)
  return within(node)
}

/**
 * Le fil d'un commentaire : « Répondre » est porté par le fil, pas par la carte, qui a ses propres
 * actions depuis la tranche 7a (« Signaler »). On remonte donc jusqu'à l'ensemble qui le contient.
 */
export const threadOf = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('button', { name: 'Répondre' }).length === 0) {
    node = node.parent
  }
  if (!node) throw new Error(`no thread around the comment ${text}`)
  return within(node)
}

/** Les textes des commentaires affichés, dans l'ordre de la page. */
export const shownComments = () =>
  screen.getAllByText(
    /^(Super idée, je teste ce soir\.|Moi aussi, dis-nous !|Merci à vous deux\.|Ça marche aussi en anglais \?)$/,
  )

/** L'ancêtre le plus proche qui porte ce rôle (les listes et les groupes ne sont pas « accessibles »
 * sur téléphone : getByRole ne les trouve pas, leur rôle sert au web). */
export const ancestorWithRole = (node: ReturnType<typeof screen.getByText>, role: string) => {
  let parent = node.parent
  while (parent && parent.props.role !== role) parent = parent.parent
  return parent
}

/** Un élément de l'écran, tel que Testing Library le rend : on ne lit que son arbre. */
export type Element = ReturnType<typeof screen.getByText>
export type TreeNode = { children: (TreeNode | string)[]; type: unknown }

/**
 * La place de chaque élément dans l'ordre de lecture (l'ordre de l'arbre, celui que suivent le
 * clavier et le lecteur d'écran) : on parcourt l'arbre depuis la racine, en profondeur d'abord.
 */
export const readingOrder = (...elements: Element[]) => {
  const order: unknown[] = []
  const walk = (node: TreeNode) => {
    order.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => order.indexOf(element))
}

/** Vrai si l'élément est dans la page qui défile (le ScrollView de `Screen`). */
export const insideScroll = (element: Element) => {
  let node = element.parent
  while (node) {
    if (node.type === 'RCTScrollView') return true
    node = node.parent
  }
  return false
}

/** Le nom lu de chaque contrôle (bouton, lien, interrupteur), dans l'ordre de l'arbre. */
export const controlNames = () =>
  screen
    .getAllByRole(/^(button|link|switch)$/)
    .map((control) => String(control.props.accessibilityLabel ?? ''))

/** Le petit « Suivre » de l'auteur, à côté de son nom : « Suivre » ou « Suivre Léa ». */
export const followAuthor = /^Suivre( Léa)?$/

/** L'adresse publique du projet, sans rien d'autre (aucun paramètre, rien sur qui partage). */
export const projectUrl = new URL(`/projects/${id}`, webAppUrl).href

/**
 * Remet à zéro les faux appels communs avant chaque test : c'est le contenu des trois `beforeEach`
 * de l'ancien fichier, sauf `mockParams` et `mockFocused`, que chaque fichier remet lui-même.
 */
export const resetProjectScreenMocks = () => {
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getProject).mockReset().mockResolvedValue(recipesProject)
  jest.mocked(deleteProject).mockReset()
  // Tranche 7c : le profil, lu pour savoir si le compte est suspendu ; Léa ne l'est pas.
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(copyText).mockReset().mockResolvedValue(true)
  mockPush.mockReset()
  mockReplace.mockReset()
  mockScreenProps.length = 0
  // R7a : la page ne publie plus (la feuille « Nouvelle mise à jour » a sa propre adresse) ; elle
  // supprime une mise à jour depuis sa corbeille.
  mockRemoveUpdate.mockReset().mockResolvedValue(true)
  jest
    .mocked(useDeleteUpdate)
    .mockReset()
    .mockReturnValue({ remove: mockRemoveUpdate, pending: false, error: false, reason: undefined })
  mockReact.mockReset()
  jest
    .mocked(useReaction)
    .mockReset()
    .mockReturnValue({ toggle: mockReact, error: false, expired: false })
  mockPost.mockReset().mockResolvedValue(true)
  mockEdit.mockReset().mockResolvedValue(true)
  mockRemoveComment.mockReset().mockResolvedValue(true)
  mockSetHidden.mockReset().mockResolvedValue(true)
  mockFetchNextPage.mockReset().mockResolvedValue(undefined)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: mockPost, pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: mockEdit, pending: false, error: false })
  jest
    .mocked(useDeleteComment)
    .mockReset()
    .mockReturnValue({ remove: mockRemoveComment, error: false })
  jest
    .mocked(useHideComment)
    .mockReset()
    .mockReturnValue({ setHidden: mockSetHidden, error: false })
  jest.mocked(useComments).mockReset()
  mockComments([])
}
