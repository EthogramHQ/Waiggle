// La couverture verticale de la feuille de publication (« Couverture verticale, facultative ») : une
// seule image, au format d'un téléphone tenu droit, à côté des photos de la galerie
// (`usePhotoTiles`). L'écran branche ce que rend ce hook sur `ui/VisualEditor`.
//
// Deux modes, comme pour les photos :
// - création (pas de `projectId`) : l'image choisie attend sur l'appareil ; elle part par `flush`,
//   que l'écran appelle juste après la création du projet et l'envoi de ses photos ;
// - modification : la choisir l'envoie tout de suite, la retirer la supprime tout de suite (la
//   feuille le dit : « Chaque changement s'enregistre tout de suite »).
import type { Project } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey, ApiResult } from '../api/errors'
import { useMediaSources } from '../api/media'
import type { VisualTile } from '../ui/VisualEditor'
import { deleteVisual, type PickedImage, pickVisual, uploadVisual } from './api'
import { projectQueryKey, useProject, useSetProject } from './hooks'
import type { FlushResult } from './usePhotoTiles'

/** Un envoi qui lève (réseau coupé, fichier illisible) devient une erreur « network ». */
const safely = async (call: () => Promise<ApiResult<Project>>): Promise<ApiResult<Project>> => {
  try {
    return await call()
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function usePortraitCover(projectId?: string) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const queryClient = useQueryClient()
  const setProject = useSetProject()
  // En modification : la couverture enregistrée, lue dans le projet gardé en cache.
  const saved = useProject(projectId ?? '', Boolean(projectId)).data?.portraitCover ?? null

  // Création : l'image choisie, qui attend la publication. Doublée d'une `ref` pour `flush`, qui
  // lit la plus récente même si l'affichage où il a démarré est ancien.
  const [pending, setPendingState] = useState<PickedImage | null>(null)
  const pendingRef = useRef<PickedImage | null>(null)
  const setPending = (image: PickedImage | null) => {
    pendingRef.current = image
    setPendingState(image)
  }
  // L'image est choisie et se prépare sur l'appareil (réduite, en JPEG) : « Publier » attend.
  const [preparing, setPreparing] = useState(false)
  // Une écriture du serveur est en cours (modification) : les boutons attendent, une à la fois.
  // Une `ref` en plus de l'état : deux tapes dans la même image voient toutes deux l'ancien état.
  const [writing, setWritingState] = useState(false)
  const writingRef = useRef(false)
  const setWriting = (value: boolean) => {
    writingRef.current = value
    setWritingState(value)
  }
  const [problem, setProblem] = useState<ApiErrorKey | null>(null)
  /** Le choix en cours (galerie ouverte, puis préparation), que `flush` attend. */
  const picking = useRef<Promise<void> | null>(null)

  /**
   * Range la couverture renvoyée par le serveur dans le projet du cache, sans toucher au reste : une
   * réponse ne ramène pas un ancien état des photos, qui ont leur propre file d'écritures.
   */
  const keepPortrait = (id: string, portraitCover: Project['portraitCover']) => {
    const current = queryClient.getQueryData<Project>(projectQueryKey(id))
    if (current) setProject({ ...current, portraitCover })
  }

  const write = async (id: string, call: () => Promise<ApiResult<Project>>) => {
    setWriting(true)
    const result = await safely(call)
    setWriting(false)
    if (result.ok) {
      keepPortrait(id, result.data.portraitCover)
    } else {
      setProblem(result.error)
      // Le cache dit de nouveau la vérité (une couverture retirée au toucher revient).
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(id) })
    }
  }

  const choose = async () => {
    let image: PickedImage | null = null
    try {
      image = await pickVisual('portrait', () => setPreparing(true))
    } catch {
      // La préparation a échoué : rien n'est posé, le membre peut recommencer.
      setProblem('internal')
    } finally {
      // finally : même si la préparation échoue, « Publier » cesse d'attendre.
      setPreparing(false)
    }
    if (!image) return
    if (!projectId) {
      setPending(image)
      return
    }
    const chosen = image
    await write(projectId, () => uploadVisual(projectId, chosen, 'portrait'))
  }

  const onPick = () => {
    // Un seul choix à la fois : la galerie ne s'ouvre pas deux fois sur une double tape.
    if (picking.current || writingRef.current) return
    const job = choose().finally(() => {
      picking.current = null
    })
    picking.current = job
  }

  const onRemove = () => {
    if (!projectId) {
      setPending(null)
      return
    }
    if (!saved || writingRef.current) return
    const visualId = saved.id
    // Au toucher : la couverture part de l'écran tout de suite, le serveur suit.
    keepPortrait(projectId, null)
    void write(projectId, () => deleteVisual(projectId, visualId))
  }

  const flushing = useRef<Promise<FlushResult> | null>(null)

  /**
   * Création : envoie la couverture choisie au projet `id` qui vient d'être créé. Rend 1 si elle n'a
   * pas pu partir (l'écran ouvre alors la modification, qui le dit), 0 sinon. Deux appels de suite
   * (double tape) partagent le même envoi.
   */
  const flush = (id: string): Promise<FlushResult> => {
    flushing.current ??= (async () => {
      // Une couverture encore en préparation part aussi : on l'attend.
      await picking.current
      const image = pendingRef.current
      if (!image) return { failed: 0 }
      const result = await safely(() => uploadVisual(id, image, 'portrait'))
      if (!result.ok) return { failed: 1 }
      keepPortrait(id, result.data.portraitCover)
      setPending(null)
      return { failed: 0 }
    })().finally(() => {
      flushing.current = null
    })
    return flushing.current
  }

  const label = t(($) => $.project.visuals.portraitLabel)
  const tile: VisualTile | null = projectId
    ? saved
      ? {
          key: saved.id,
          image: { source: toSource(saved.url), thumbhash: saved.thumbhash, label },
        }
      : null
    : pending
      ? { key: pending.uri, image: { source: { uri: pending.uri }, label } }
      : null

  return {
    /** La vignette à montrer, ou null : aucune couverture verticale. */
    tile,
    onPick,
    onRemove,
    /** Une écriture est en cours (modification) : les boutons attendent. */
    busy: writing,
    /** Création : une couverture choisie attend la publication (ce qui serait perdu en fermant). */
    chosen: pending !== null,
    /** L'image choisie se prépare encore sur l'appareil : « Publier » attend. */
    preparing,
    flush,
    /** Une écriture a échoué : la clé du message (`errors.*`). */
    problem,
    clearProblem: () => setProblem(null),
  }
}
