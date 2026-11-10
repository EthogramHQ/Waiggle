// Ce que l'appli peut faire avec les projets : les lire, les publier, les modifier, les supprimer.
// Les écrans n'appellent que ces fonctions ; les tests les remplacent par de faux appels.
import {
  Project,
  type ProjectChanges,
  type ProjectInput,
  ProjectVisual,
  type VisualSlot,
} from '@ruche/contracts'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'
import { appendImage, type PickedImage, pickImage } from '../media/pick'

// encodeURIComponent : l'identifiant vient de l'adresse de la page ; on l'insère sans qu'il puisse
// changer le chemin de la requête (un « ../ » glissé dedans resterait un simple texte).
const projectPath = (id: string) => `/v1/projects/${encodeURIComponent(id)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Lit un projet (GET /v1/projects/:id). Lève une ApiError en cas d'échec (404 s'il est privé). */
export const getProject = async (id: string): Promise<Project> => {
  const result = await request(projectPath(id), {}, Project)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

export const createProject = (input: ProjectInput): Promise<ApiResult<Project>> =>
  request('/v1/projects', json('POST', input), Project)

export const updateProject = (id: string, changes: ProjectChanges): Promise<ApiResult<Project>> =>
  request(projectPath(id), json('PATCH', changes), Project)

export const deleteProject = (id: string): Promise<ApiResult<null>> =>
  requestWithoutBody(projectPath(id), { method: 'DELETE' })

export type { PickedImage }

/**
 * Ouvre la galerie de photos pour un visuel : une photo de la galerie du projet (proportions
 * gardées), ou sa couverture verticale (format téléphone). Null si le membre annule.
 */
export const pickVisual = (slot: VisualSlot, onChosen?: () => void): Promise<PickedImage | null> =>
  pickImage(slot === 'portrait' ? 'portrait' : 'free', onChosen)

/**
 * Ajoute une photo au projet (POST /v1/projects/:id/visuals, formulaire multipart). Pour la galerie
 * et la couverture verticale, renvoie le projet à jour, avec la nouvelle photo. Pour une mise à jour
 * (`update`, R7a), renvoie la seule photo « en attente » : son identifiant sera cité par la mise à
 * jour au moment de la publier, et le projet, lui, n'a pas changé.
 *
 * Deux « surcharges » (deux signatures pour une même fonction) : TypeScript choisit le type de la
 * réponse d'après le `slot` écrit à l'appel.
 */
export async function uploadVisual(
  id: string,
  image: { uri: string },
  slot: 'update',
): Promise<ApiResult<ProjectVisual>>
export async function uploadVisual(
  id: string,
  image: { uri: string },
  slot: Exclude<VisualSlot, 'update'>,
): Promise<ApiResult<Project>>
export async function uploadVisual(
  id: string,
  image: { uri: string },
  slot: VisualSlot,
): Promise<ApiResult<Project> | ApiResult<ProjectVisual>> {
  const form = new FormData()
  await appendImage(form, 'visual', image)
  form.append('slot', slot)
  const init = { method: 'POST', body: form }
  return slot === 'update'
    ? request(`${projectPath(id)}/visuals`, init, ProjectVisual)
    : request(`${projectPath(id)}/visuals`, init, Project)
}

/**
 * Écrit la description d'une photo (PATCH /v1/projects/:id/visuals/:visualId, R6a). Une description
 * vide ou faite d'espaces s'envoie `null` : effacer la description, c'est vider le champ. Renvoie le
 * projet à jour.
 */
export const updateVisual = (
  id: string,
  visualId: string,
  description: string | null,
): Promise<ApiResult<Project>> =>
  request(
    `${projectPath(id)}/visuals/${encodeURIComponent(visualId)}`,
    json('PATCH', { description: description?.trim() ? description : null }),
    Project,
  )

/**
 * Efface une photo en attente d'une mise à jour (DELETE /v1/projects/:id/visuals/:visualId, R7a) :
 * retirée de la feuille, ou abandonnée avec elle. Le corps de la réponse ne sert pas : le projet n'a
 * pas changé.
 */
export const deletePendingVisual = (id: string, visualId: string): Promise<ApiResult<null>> =>
  requestWithoutBody(`${projectPath(id)}/visuals/${encodeURIComponent(visualId)}`, {
    method: 'DELETE',
  })

/** Retire une photo du projet (galerie ou couverture verticale). Renvoie le projet à jour. */
export const deleteVisual = (id: string, visualId: string): Promise<ApiResult<Project>> =>
  request(
    `${projectPath(id)}/visuals/${encodeURIComponent(visualId)}`,
    { method: 'DELETE' },
    Project,
  )
