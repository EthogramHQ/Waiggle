// Ce que l'appli peut faire avec les projets : les lire, les publier, les modifier, les supprimer.
// Les écrans n'appellent que ces fonctions ; les tests les remplacent par de faux appels.
import { Project, type ProjectInput, type ProjectUpdate, type VisualSlot } from '@ruche/contracts'
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

export const updateProject = (id: string, changes: ProjectUpdate): Promise<ApiResult<Project>> =>
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
 * Ajoute une photo au projet (POST /v1/projects/:id/visuals, formulaire multipart). Renvoie le
 * projet à jour, avec la nouvelle photo.
 */
export const uploadVisual = async (
  id: string,
  image: { uri: string },
  slot: VisualSlot,
): Promise<ApiResult<Project>> => {
  const form = new FormData()
  await appendImage(form, 'visual', image)
  form.append('slot', slot)
  return request(`${projectPath(id)}/visuals`, { method: 'POST', body: form }, Project)
}

/** Retire une photo du projet (galerie ou couverture verticale). Renvoie le projet à jour. */
export const deleteVisual = (id: string, visualId: string): Promise<ApiResult<Project>> =>
  request(
    `${projectPath(id)}/visuals/${encodeURIComponent(visualId)}`,
    { method: 'DELETE' },
    Project,
  )
