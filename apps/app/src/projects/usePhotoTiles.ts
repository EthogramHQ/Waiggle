// Les photos de la feuille de publication : l'état des tuiles et leurs gestes (ajouter, déplacer,
// retirer, décrire), pour un projet à créer ou un projet à modifier. L'écran ne fait que brancher
// ce que ce hook rend sur le composant `PhotoTiles` (`src/ui`).
//
// Un « hook » est une fonction de React dont le nom commence par `use` : elle garde un état entre
// deux affichages de l'écran (`useState`) et peut s'abonner à des données (`useQuery`).
//
// Deux modes, selon que l'on donne un `projectId` ou non :
// - création (pas de `projectId`) : le projet n'existe pas encore sur le serveur. Les photos
//   choisies et leurs descriptions attendent sur l'appareil ; rien ne part avant `flushPending`,
//   que l'écran appelle juste après la création : une photo par envoi, dans l'ordre des tuiles,
//   puis la description de chacune ;
// - modification : chaque geste s'enregistre tout de suite (ajout, retrait, nouvel ordre), comme
//   le dit la feuille (« Les photos s'enregistrent tout de suite »). Les photos enregistrées
//   viennent du projet gardé en cache par React Query ; seules les photos en cours d'envoi, ou
//   refusées, vivent dans l'état local.
// Un troisième, pour la feuille « Nouvelle mise à jour » (R7a) : `usePhotoTiles(id, { slot: 'update',
// max: 4 })`. Chaque photo part tout de suite (`slot=update`) et devient une photo « en attente » du
// serveur, qui rend son identifiant (pas le projet, qui ne change pas : le cache n'est pas touché).
// La mise à jour citera ces identifiants en se publiant (`photos`). Retirer une photo l'efface du
// serveur ; « Abandonner » efface toutes celles de la feuille (`discardPending`, relecture A11).
import { type Project, UPDATE_PHOTOS_MAX, VISUALS_MAX } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey, ApiResult } from '../api/errors'
import { useMediaSources } from '../api/media'
import { type PickedImage, pickVisuals } from '../media/pick'
import type { PhotoTile } from '../ui/PhotoTiles'
import { deletePendingVisual, deleteVisual, updateProject, updateVisual, uploadVisual } from './api'
import { projectQueryKey, useProject, useSetProject } from './hooks'

/** Les gestes que `PhotoTiles` attend (hors `onSelect`, que le hook rend à part : `select`). */
export type PhotoActions = {
  /** Ouvre la galerie de l'appareil, au plus autant de photos qu'il reste de places. */
  onAdd: () => void
  /** Web : des fichiers déposés sur la zone. Seules les images comptent ; l'excédent est coupé. */
  onDropFiles: (files: File[]) => void
  /** La photo de la place `from` va à la place `to`. */
  onMove: (from: number, to: number) => void
  onRemove: (key: string) => void
}

/** Plusieurs photos au-delà des places libres : la feuille dit `project.form.photosCut`. */
export type PhotosCut = { count: number; max: number }

/** Ce que `flushPending` rend : combien de photos n'ont pas pu partir (0 : tout est enregistré). */
export type FlushResult = { failed: number }

/** Le réglage du hook : la galerie d'un projet (par défaut), ou les photos d'une mise à jour. */
export type PhotoTilesOptions = {
  slot?: 'gallery' | 'update'
  /** Le nombre de photos au plus ; par défaut `VISUALS_MAX` (galerie) ou `UPDATE_PHOTOS_MAX`. */
  max?: number
}

/**
 * Une photo de la mise à jour, telle que la feuille la publie (la forme d'`UpdateFormPhoto`, plus la
 * clé de sa tuile). `id` vaut null tant que l'envoi n'est pas fini ; une photo refusée n'y est pas.
 */
export type UpdatePhoto = {
  key: string
  id: string | null
  /** La description tapée, sans les blancs autour ; null si elle est vide. */
  description: string | null
  uploading: boolean
}

/** Une photo qui n'est pas (encore) dans le projet du serveur. */
type LocalPhoto = {
  key: string
  /** Mise à jour : l'identifiant de la photo en attente, donné par le serveur à la fin de l'envoi. */
  id?: string
  /** Ce qu'on dessine : l'adresse choisie, puis celle de l'image préparée. */
  uri: string
  state: PhotoTile['state']
  /** Pourquoi l'envoi a été refusé, quand `state` vaut `failed`. */
  reason?: ApiErrorKey
  /** L'image préparée (réduite, en JPEG), prête à partir ; absente pendant sa préparation. */
  prepared?: PickedImage
}

/** Le tiroir du cache qui garde le projet d'une feuille de modification. */
const savedProject = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): Project | undefined => queryClient.getQueryData<Project>(projectQueryKey(id))

/** Un envoi ou une écriture qui lève (réseau coupé, fichier illisible) devient une erreur « network ». */
const safely = async <T>(call: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
  try {
    return await call()
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function usePhotoTiles(projectId?: string, options: PhotoTilesOptions = {}) {
  const forUpdate = options.slot === 'update'
  const max = options.max ?? (forUpdate ? UPDATE_PHOTOS_MAX : VISUALS_MAX)
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const queryClient = useQueryClient()
  const setWholeProject = useSetProject()
  /**
   * Range dans le cache le projet qu'une réponse de photo renvoie, sans toucher à la couverture
   * verticale : elle a sa propre file (`usePortraitCover`), et une réponse partie avant qu'elle change
   * en porte l'ancienne, qui la ferait disparaître de la feuille.
   */
  const setProject = (project: Project) => {
    const current = savedProject(queryClient, project.id)
    setWholeProject(current ? { ...project, portraitCover: current.portraitCover } : project)
  }
  // En modification : le projet tel qu'il est dans le cache, tenu à jour après chaque geste. Une
  // mise à jour ne montre pas la galerie du projet : elle ne le lit pas.
  const saved = useProject(projectId ?? '', Boolean(projectId) && !forUpdate).data

  // L'état est doublé d'une `ref` (une boîte qui garde sa valeur d'un affichage à l'autre, sans en
  // provoquer un) : les gestes asynchrones y lisent la valeur la plus récente, pas celle de
  // l'affichage où ils ont démarré.
  const [local, setLocalState] = useState<LocalPhoto[]>([])
  const localRef = useRef<LocalPhoto[]>([])
  const setLocal = (next: LocalPhoto[]) => {
    localRef.current = next
    setLocalState(next)
  }
  const patchLocal = (key: string, patch: Partial<LocalPhoto>) =>
    setLocal(localRef.current.map((one) => (one.key === key ? { ...one, ...patch } : one)))
  const removeLocal = (key: string) => setLocal(localRef.current.filter((one) => one.key !== key))

  // Les descriptions tapées, par photo (clé de tuile).
  const [drafts, setDraftsState] = useState<Record<string, string>>({})
  const draftsRef = useRef<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [cut, setCut] = useState<PhotosCut | null>(null)
  // `photoGone` : retirer une photo que le serveur ne connaît plus (404, retirée depuis un autre
  // appareil) ; « Cette page n'existe pas. » n'aurait pas de sens ici (R6a, relecture de design).
  const [problem, setProblem] = useState<ApiErrorKey | 'describeFailed' | 'photoGone' | null>(null)

  const counter = useRef(0)
  const newKey = () => {
    counter.current += 1
    return `new-photo-${counter.current}`
  }

  // Les écritures du serveur passent l'une après l'autre (une file) : un retrait lancé juste après
  // un envoi attend la fin de l'envoi, et le serveur voit les gestes dans l'ordre où le membre les
  // a faits. `waiting` compte celles qui n'ont pas fini : la relecture du projet ne s'applique qu'après
  // la dernière, sinon la réponse d'une écriture ancienne ferait revenir une photo déjà retirée.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const waiting = useRef(0)
  const enqueue = <T>(job: (last: () => boolean) => Promise<T>): Promise<T> => {
    waiting.current += 1
    const run = queue.current.then(() => job(() => waiting.current === 1))
    queue.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run.finally(() => {
      waiting.current -= 1
    })
  }
  /** Les ajouts de photos en cours (choix puis préparation), que `flushPending` attend. */
  const adds = useRef(new Set<Promise<void>>())
  /**
   * Mise à jour : les photos retirées (ou abandonnées) pendant leur envoi. Le serveur ne les connaît
   * pas encore ; dès qu'il rend leur identifiant, on les efface, pour ne rien laisser en attente.
   */
  const dropped = useRef(new Set<string>())

  const savedPhotos = projectId && !forUpdate ? (saved?.visuals ?? []) : []
  const total = savedPhotos.length + local.length
  const countRef = useRef(0)
  countRef.current = total

  const photoLabel = (number: number) =>
    t(($) => $.project.visuals.photo, { number, total: Math.max(total, number) })

  const reasonText = (error: ApiErrorKey | undefined) => {
    if (error === 'payloadTooLarge') return t(($) => $.project.form.photoTooLarge)
    if (error === 'unsupportedMediaType') return t(($) => $.project.form.photoWrongType)
    if (error === 'tooManyVisuals') return t(($) => $.project.form.photoTooMany)
    // Mise à jour : 100 photos de mises à jour par projet au plus (décision du 10/11/2026).
    if (error === 'updatePhotosFull') return t(($) => $.project.updates.photosFull)
    return t(($) => $.project.form.photoUploadError)
  }

  const tiles: PhotoTile[] = [
    ...savedPhotos.map(
      (visual, index): PhotoTile => ({
        key: visual.id,
        state: 'ready',
        image: {
          source: toSource(visual.url),
          thumbhash: visual.thumbhash,
          label: photoLabel(index + 1),
        },
      }),
    ),
    ...local.map((one, index): PhotoTile => {
      const tile: PhotoTile = {
        key: one.key,
        state: one.state,
        image: { source: { uri: one.uri }, label: photoLabel(savedPhotos.length + index + 1) },
      }
      return one.state === 'failed' ? { ...tile, error: reasonText(one.reason) } : tile
    }),
  ]
  // La tuile choisie disparaît avec sa photo : aucune ne reste choisie.
  const selectedKey = tiles.some((tile) => tile.key === selected) ? selected : null

  // --- Ajouter ---

  /**
   * Mise à jour : efface une photo en attente. Un échec ne se dit pas : la photo n'est plus sur la
   * feuille, la mise à jour ne la citera pas, et le serveur efface d'elle-même une photo en attente
   * après 24 heures (ou la remplace par une cinquième, relecture A11).
   */
  const erase = (id: string, visualId: string) => safely(() => deletePendingVisual(id, visualId))

  /** Mise à jour : envoie une photo en attente ; son identifiant reste sur la tuile. */
  const uploadPending = (id: string, key: string, image: PickedImage) =>
    enqueue(async () => {
      const result = await safely(() => uploadVisual(id, image, 'update'))
      if (dropped.current.delete(key)) {
        // Retirée pendant l'envoi : le serveur l'a peut-être reçue, on l'efface aussitôt.
        if (result.ok) await erase(id, result.data.id)
        return
      }
      if (result.ok) patchLocal(key, { state: 'ready', id: result.data.id })
      else patchLocal(key, { state: 'failed', reason: result.error })
    })

  /** Envoie une photo au projet enregistré (modification) ; une échec reste sur sa tuile. */
  const uploadNow = (id: string, key: string, image: PickedImage) =>
    enqueue(async () => {
      const result = await safely(() => uploadVisual(id, image, 'gallery'))
      if (result.ok) {
        setProject(result.data)
        removeLocal(key)
      } else {
        patchLocal(key, { state: 'failed', reason: result.error })
      }
    })

  /** Pose des tuiles pour des images choisies, en coupant au-delà des places libres. */
  const place = (images: PickedImage[], remaining: number): string[] => {
    const kept = images.slice(0, remaining)
    setCut(images.length > kept.length ? { count: kept.length, max } : null)
    const added = kept.map((image) => ({
      key: newKey(),
      uri: image.uri,
      state: 'uploading' as const,
    }))
    setLocal([...localRef.current, ...added])
    return added.map((one) => one.key)
  }

  /** Les images sont prêtes : en création elles attendent, en modification elles partent. */
  const prepared = (keys: string[], images: PickedImage[]) => {
    keys.forEach((key, index) => {
      const image = images[index]
      if (!image) {
        removeLocal(key)
      } else if (!localRef.current.some((one) => one.key === key)) {
        // Retirée (ou abandonnée) pendant sa préparation : elle ne part pas.
        return
      } else if (projectId && forUpdate) {
        patchLocal(key, { uri: image.uri, prepared: image })
        void uploadPending(projectId, key, image)
      } else if (projectId) {
        patchLocal(key, { uri: image.uri, prepared: image })
        void uploadNow(projectId, key, image)
      } else {
        patchLocal(key, { uri: image.uri, state: 'ready', prepared: image })
      }
    })
  }

  const add = async () => {
    const remaining = max - countRef.current
    if (remaining < 1) return
    let keys: string[] = []
    try {
      // `gallery` aussi pour une mise à jour : plusieurs photos d'un coup, proportions gardées.
      const images = await pickVisuals('gallery', remaining, (chosen) => {
        keys = place(chosen, remaining)
      })
      prepared(keys, images)
    } catch {
      // La préparation a échoué : les tuiles posées au choix s'en vont, le membre peut recommencer.
      for (const key of keys) removeLocal(key)
      setProblem('internal')
    }
  }

  const track = (job: Promise<void>) => {
    adds.current.add(job)
    void job.finally(() => adds.current.delete(job))
  }

  const onAdd = () => track(add())

  const onDropFiles = (files: File[]) => {
    const images = files
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ uri: URL.createObjectURL(file), width: 0, height: 0 }))
    const remaining = max - countRef.current
    if (images.length === 0 || remaining < 1) return
    prepared(place(images, remaining), images)
  }

  // --- Déplacer, retirer ---

  /** Relit le projet après une écriture refusée : le cache dit de nouveau la vérité. */
  const refetch = (id: string) =>
    void queryClient.invalidateQueries({ queryKey: projectQueryKey(id) })

  const onMove = (from: number, to: number) => {
    if (from === to) return
    const reorder = <T>(list: T[]) => {
      const copy = [...list]
      const [item] = copy.splice(from, 1)
      if (item !== undefined) copy.splice(to, 0, item)
      return copy
    }
    // Création et mise à jour : l'ordre vit sur l'appareil (une mise à jour l'envoie en se publiant).
    if (!projectId || forUpdate) {
      if (from < localRef.current.length && to < localRef.current.length) {
        setLocal(reorder(localRef.current))
      }
      return
    }
    const project = savedProject(queryClient, projectId)
    // Seules les photos déjà enregistrées se déplacent (celles qui partent encore suivent).
    if (!project || from >= project.visuals.length || to >= project.visuals.length) return
    const visuals = reorder(project.visuals)
    // Au toucher : l'ordre change à l'écran tout de suite, le serveur suit.
    setProject({ ...project, visuals })
    void enqueue(async (last) => {
      const result = await safely(() =>
        updateProject(projectId, { visualOrder: visuals.map((visual) => visual.id) }),
      )
      if (!result.ok) {
        setProblem(result.error)
        refetch(projectId)
      } else if (last()) {
        setProject(result.data)
      }
    })
  }

  /** Mise à jour : la photo quitte la feuille tout de suite ; le serveur l'efface ensuite. */
  const forget = (id: string, one: LocalPhoto) => {
    removeLocal(one.key)
    const visualId = one.id
    if (visualId) void enqueue(() => erase(id, visualId).then(() => undefined))
    else if (one.state === 'uploading') dropped.current.add(one.key)
  }

  /** « Abandonner » la mise à jour : toutes ses photos en attente sont effacées du serveur. */
  const discardPending = async () => {
    if (!projectId || !forUpdate) return
    for (const one of localRef.current) forget(projectId, one)
    await queue.current
  }

  const onRemove = (key: string) => {
    const mine = localRef.current.find((one) => one.key === key)
    if (forUpdate) {
      if (mine && projectId) forget(projectId, mine)
      return
    }
    if (mine || !projectId) {
      // Une photo qui n'est pas sur le serveur : on l'oublie, sauf si elle est en plein envoi.
      if (mine && (projectId ? mine.state !== 'uploading' : true)) removeLocal(key)
      return
    }
    const project = savedProject(queryClient, projectId)
    if (!project?.visuals.some((visual) => visual.id === key)) return
    setProject({ ...project, visuals: project.visuals.filter((visual) => visual.id !== key) })
    void enqueue(async (last) => {
      const result = await safely(() => deleteVisual(projectId, key))
      if (!result.ok) {
        setProblem(result.error === 'notFound' ? 'photoGone' : result.error)
        refetch(projectId)
      } else if (last()) {
        setProject(result.data)
      }
    })
  }

  // --- Décrire ---

  const describe = (key: string, text: string) => {
    draftsRef.current = { ...draftsRef.current, [key]: text }
    setDraftsState(draftsRef.current)
  }

  /** Le texte du champ de la photo `key` : ce qui est tapé, sinon la description enregistrée. */
  const descriptionOf = (key: string) =>
    drafts[key] ?? saved?.visuals.find((visual) => visual.id === key)?.description ?? ''

  /** Ce qui a été envoyé en dernier pour chaque photo : évite d'envoyer deux fois le même texte. */
  const sent = useRef(new Map<string, string | null>())

  const writeDescription = (id: string, visualId: string, text: string | null) =>
    enqueue(async (last) => {
      sent.current.set(visualId, text)
      const result = await safely(() => updateVisual(id, visualId, text))
      if (!result.ok) {
        sent.current.delete(visualId)
        setProblem('describeFailed')
        return false
      }
      if (last()) setProject(result.data)
      return true
    })

  const flushing = useRef<Promise<FlushResult> | null>(null)

  /**
   * Création : envoie les photos du projet `id` qui vient d'être créé, une par une dans l'ordre des
   * tuiles, puis la description de chacune. Modification : envoie les descriptions changées (à
   * appeler en quittant le champ, et à la fermeture de la feuille : ce qui est déjà parti ne repart
   * pas). Rend le nombre de photos qui n'ont pas pu partir.
   */
  const flushPending = (id: string): Promise<FlushResult> => {
    // Mise à jour : les descriptions partent avec elle ; on attend seulement la fin des envois.
    if (forUpdate) return settleUploads()
    if (projectId) return flushDescriptions(id)
    // Deux appels de suite (double tape) partagent le même envoi : jamais une photo en double.
    flushing.current ??= createPhotos(id).finally(() => {
      flushing.current = null
    })
    return flushing.current
  }

  const settleUploads = async (): Promise<FlushResult> => {
    await Promise.allSettled([...adds.current])
    await queue.current
    return { failed: localRef.current.filter((one) => one.state === 'failed').length }
  }

  const flushDescriptions = async (id: string): Promise<FlushResult> => {
    await Promise.allSettled([...adds.current])
    const project = savedProject(queryClient, id)
    for (const visual of project?.visuals ?? []) {
      const draft = draftsRef.current[visual.id]
      if (draft === undefined) continue
      const text = draft.trim() === '' ? null : draft
      const before = sent.current.has(visual.id) ? sent.current.get(visual.id) : visual.description
      if (text !== before) void writeDescription(id, visual.id, text)
    }
    await queue.current
    return { failed: 0 }
  }

  const createPhotos = async (id: string): Promise<FlushResult> => {
    // Les photos encore en préparation sur l'appareil partent aussi : on les attend.
    await Promise.allSettled([...adds.current])
    let failed = 0
    let known = new Set<string>()
    for (const one of localRef.current) {
      if (!one.prepared) {
        failed += 1
        continue
      }
      patchLocal(one.key, { state: 'uploading' })
      const result = await safely(() => uploadVisual(id, one.prepared as PickedImage, 'gallery'))
      if (!result.ok) {
        patchLocal(one.key, { state: 'failed', reason: result.error })
        failed += 1
        continue
      }
      setProject(result.data)
      // La photo qui vient d'arriver : celle qu'on ne connaissait pas encore.
      const added = result.data.visuals.find((visual) => !known.has(visual.id))
      known = new Set(result.data.visuals.map((visual) => visual.id))
      const text = draftsRef.current[one.key]?.trim()
      if (added && text) await writeDescription(id, added.id, draftsRef.current[one.key] ?? null)
      removeLocal(one.key)
    }
    return { failed }
  }

  return {
    tiles,
    actions: { onAdd, onDropFiles, onMove, onRemove } satisfies PhotoActions,
    selectedKey,
    select: setSelected,
    describe,
    /** Le texte du champ de description de la photo `key`. */
    descriptionOf,
    flushPending,
    /** Des photos choisies d'un coup dépassaient les places : `project.form.photosCut`. */
    cut,
    /**
     * Une écriture a échoué : la clé du message (`errors.*`), `describeFailed`, ou `photoGone`
     * (`project.form.photoGone`).
     */
    problem,
    clearNotices: () => {
      setCut(null)
      setProblem(null)
    },
    /** Des photos sont encore en préparation sur l'appareil : « Publier » peut attendre. */
    preparing: local.some((one) => one.state === 'uploading' && !one.prepared),
    /**
     * Mise à jour : les photos à publier, dans l'ordre des tuiles (pour `toPayload`) ; vide dans
     * les autres modes. Une photo refusée n'y est pas.
     */
    photos: forUpdate
      ? local
          .filter((one) => one.state !== 'failed')
          .map(
            (one): UpdatePhoto => ({
              key: one.key,
              id: one.id ?? null,
              description: drafts[one.key]?.trim() || null,
              uploading: one.state === 'uploading',
            }),
          )
      : [],
    /**
     * Mise à jour : « Abandonner » efface du serveur toutes les photos en attente de la feuille
     * (celles en plein envoi, dès que le serveur les a). Rend la main quand tout est parti.
     */
    discardPending,
  }
}
