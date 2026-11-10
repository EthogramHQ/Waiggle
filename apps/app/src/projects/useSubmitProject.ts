// L'envoi de la feuille de publication et de modification (R6a), sorti de `ProjectFormScreen`
// après les relectures (ui-C6) : la requête, puis ses issues. L'écran garde ce qui précède l'envoi
// (la vérification des champs, le focus sur le premier en erreur) et ce qu'il dit en cas d'échec.
//
// Les issues d'une publication (un nouveau projet) :
// - des photos (ou la couverture verticale) ne sont pas parties : la modification du projet, qui
//   dit lesquelles manquent (jur-J11), sans danse ni « Projet publié » ;
// - un brouillon privé : « Brouillon enregistré », puis la page du projet ;
// - sinon, le fil d'où l'on venait, qui danse (`published`, HomeScreen).
// Une modification enregistrée revient à la page du projet, avec une note toute prête quand le
// statut d'un projet visible a changé (`announce`).
import type { ProjectChanges, ProjectInput } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'
import { useToast } from '../ui/theme/toast'
import { createProject, updateProject } from './api'
import type { ProjectForm } from './form'
import { useSetProject } from './hooks'
import type { FlushResult } from './usePhotoTiles'

type Options = {
  /** Le projet modifié ; absent : un nouveau projet. */
  projectId: string | undefined
  /** Le formulaire à l'ouverture : un statut changé se compare à lui. */
  initial: ProjectForm
  /** Envoie les photos en attente (`usePhotoTiles`), une fois le projet enregistré. */
  flushPhotos: (projectId: string) => Promise<FlushResult>
  /** Envoie la couverture verticale choisie (`usePortraitCover`), après les photos. */
  flushPortrait: (projectId: string) => Promise<FlushResult>
  /** Retire la garde de départ (`useLeaveGuard`) : on quitte la feuille sans rien demander. */
  release: () => Promise<void>
}

export function useSubmitProject({
  projectId,
  initial,
  flushPhotos,
  flushPortrait,
  release,
}: Options) {
  const { t } = useTranslation()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const setProject = useSetProject()
  const [busy, setBusy] = useState(false)
  // Une `ref` en plus de l'état : deux tapes dans la même image voient toutes deux l'ancien `busy`.
  const sending = useRef(false)

  /**
   * Envoie les champs déjà vérifiés (`toProjectChanges`). Rend la clé de l'erreur de l'API si la
   * requête échoue (la feuille reste ouverte, `busy` retombe), sinon `null` une fois parti.
   */
  const send = async (
    form: ProjectForm,
    changes: ProjectInput | ProjectChanges,
  ): Promise<ApiErrorKey | null> => {
    sending.current = true
    setBusy(true)
    const result = projectId
      ? await updateProject(projectId, changes)
      : // Sans projet, toProjectChanges(form) rend un ProjectInput complet (sa surcharge).
        await createProject(changes as ProjectInput)
    if (!result.ok) {
      sending.current = false
      setBusy(false)
      return result.error
    }
    setProject(result.data) // la page du projet s'affichera sans nouvelle requête
    const id = result.data.id
    if (!projectId) {
      // Le fil la montre tout de suite (plan, U5a) ; puis les photos partent, dans l'ordre.
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
      const { failed } = await flushPhotos(id)
      // La couverture verticale ensuite ; un échec compte comme une photo qui n'est pas partie.
      const portraitSent = await flushPortrait(id)
      await release()
      if (failed + portraitSent.failed > 0) {
        router.replace({ pathname: '/projects/[id]/edit', params: { id, photos: 'failed' } })
      } else if (form.audience === 'private') {
        toast.show(
          t(($) => $.project.form.draftSaved),
          { icon: 'check-circle' },
        )
        router.replace({ pathname: '/projects/[id]', params: { id } })
      } else {
        // Le fil, au-dessus duquel la feuille était ouverte : il danse (HomeScreen, `published`).
        router.dismissTo({ pathname: '/', params: { published: id } })
      }
      return null
    }
    await flushPhotos(projectId)
    await release()
    // Un nouveau statut d'un projet visible des membres : la page propose une note toute prête.
    const announce = result.data.status !== initial.status && result.data.visibility === 'public'
    toast.show(
      t(($) => $.project.form.saved),
      { icon: 'check-circle' },
    )
    // dismissTo : retour à la page du projet dessous (ou à sa place), jamais une seconde copie.
    router.dismissTo({
      pathname: '/projects/[id]',
      params: announce ? { id, announce: result.data.status } : { id },
    })
    return null
  }

  /** Un envoi est parti et n'a pas encore répondu (lu au geste, avant tout changement d'état). */
  const inFlight = () => sending.current

  return { busy, send, inFlight }
}
