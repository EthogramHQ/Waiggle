// La fenêtre « Supprimer « Le ciel de ce soir » ? » (R6a, scénario « Supprimer », planche
// `R6-Supprimer`), la même depuis le menu « … » de la page du projet et depuis la zone rouge de la
// feuille de modification. Elle vit ici, une fois : deux copies d'une fenêtre de geste finissent par
// diverger (charte de design, 7b).
//
// Ce qu'elle fait :
// - en tête, la vignette du projet et son badge de corbeille (ui/ProjectThumb) ; le titre nomme le
//   projet, le message dit tout ce qui disparaît (texte du juridique), et, pour un projet retiré par
//   la modération, que la décision et la copie du signalement restent gardées un an ;
// - « Supprimer » ignore les tapes juste après l'ouverture (`guardTaps`) : elle s'ouvre sous le doigt
//   qui vient de toucher « Supprimer » dans le menu ;
// - une seule suppression part, même sur une double tape ; pendant l'envoi, « Supprimer » tourne,
//   « Annuler » attend, et ni Échap, ni le voile, ni le retour d'Android ne la ferment (`busy`) ;
// - un échec se lit dans la fenêtre, qui reste ouverte : on réessaie, ou on annule ;
// - réussie, elle range le cache (le fil et la page du membre se relisent, le projet est oublié),
//   puis laisse l'écran partir (`onDeleted`) : le toast « Projet supprimé. » et « Mes projets ».
//
// Le focus : sur le web, la fenêtre (le Modal de react-native-web) le rend en se fermant à
// l'élément qui l'avait quand elle s'est ouverte : « Supprimer ce projet » de la feuille, ou « … »
// de la page (le menu y a ramené le focus avant d'ouvrir la fenêtre, ui/ActionMenu.tsx). `opener`
// le rend aussi explicitement, une fois la fenêtre partie, et amène le lecteur d'écran d'un
// téléphone au même endroit.

import { useQueryClient } from '@tanstack/react-query'
import { type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey, ApiResult } from '../api/errors'
import { feedQueryKey } from '../feed/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Notice } from '../ui/Notice'
import type { CoverImage } from '../ui/ProjectCover'
import { ProjectThumb } from '../ui/ProjectThumb'
import { Row } from '../ui/Stack'
import { deleteProject } from './api'
import { projectQueryKey } from './hooks'

type Props = {
  /**
   * Le projet visé : son titre (dans le titre de la fenêtre), sa première photo (la vignette ; null,
   * la lumière miel), et `removed` s'il a été retiré par la modération (le message le dit).
   */
  project: { id: string; title: string; cover: CoverImage | null; removed?: boolean }
  visible: boolean
  /** « Annuler », Échap, le voile ou le retour d'Android, hors envoi : l'écran ferme la fenêtre. */
  onCancel: () => void
  /** Le projet est supprimé, le cache rangé : l'écran dit « Projet supprimé. » et s'en va. */
  onDeleted: () => void
  /**
   * Le contrôle qui a ouvert la fenêtre (« … », « Supprimer ce projet ») : il reprend le focus quand
   * elle se ferme sans rien supprimer. Facultatif : sur le web, le Modal le rend déjà de lui-même.
   */
  opener?: RefObject<Focusable | null>
  /**
   * La suppression elle-même : `deleteProject` de ./api, sauf pour le catalogue, qui montre la
   * fenêtre occupée ou en échec sans rien envoyer.
   */
  remove?: (id: string) => Promise<ApiResult<null>>
}

export function DeleteProjectDialog({
  project,
  visible,
  onCancel,
  onDeleted,
  opener,
  remove = deleteProject,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const signInAgain = useSignInAgain()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ApiErrorKey | null>(null)
  // Une ref en plus de l'état : deux tapes dans la même image (double tape) voient toutes deux
  // l'ancien `busy` ; la ref, elle, est déjà à vrai pour la seconde.
  const sending = useRef(false)
  // Supprimé : à la fermeture, le focus ne revient pas au « … » d'une page qu'on quitte.
  const deleted = useRef(false)

  // Rouverte, la fenêtre ne montre pas l'échec d'une fois précédente (charte de design : l'erreur
  // d'une fenêtre qu'on referme disparaît à la réouverture). Changer l'état pendant le dessin est
  // permis par React pour suivre une prop : il redessine aussitôt, avant d'afficher quoi que ce soit.
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setRefusal(null)
  }

  // Pendant l'envoi, la fenêtre reste ouverte : la fermer laisserait croire que rien ne se passe.
  const cancel = () => {
    if (!sending.current) onCancel()
  }

  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setRefusal(null)
    const result = await remove(project.id)
    sending.current = false
    setBusy(false)
    // Refusé : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    deleted.current = true
    // Le cache : le fil et les pages de membre (« Mes projets ») se relisent, sans le projet ; la
    // page du projet est oubliée (revenir à son adresse la redemande, et l'API dit « introuvable »).
    void queryClient.invalidateQueries({ queryKey: feedQueryKey })
    void queryClient.invalidateQueries({ queryKey: ['member'] })
    queryClient.removeQueries({ queryKey: projectQueryKey(project.id), exact: true })
    onDeleted()
  }

  // La fenêtre est tout à fait partie (après son fondu, web et iOS) : sans suppression, le focus
  // revient au contrôle qui l'avait ouverte.
  const closed = () => {
    if (deleted.current) return
    const node = opener?.current
    if (!node) return
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }

  // Le message d'un refus. Une session expirée a son lien « Me reconnecter », le quota son message ;
  // le reste (réseau, serveur), « Réessaie ».
  const refusalMessage =
    refusal === 'unauthorized'
      ? t(($) => $.states.expired)
      : refusal === 'rateLimited'
        ? t(($) => $.errors.rateLimited)
        : t(($) => $.project.form.deleteError)

  return (
    <Dialog
      visible={visible}
      guardTaps
      busy={busy}
      // La vignette, centrée au-dessus du titre centré. Dans une rangée : la vignette se range seule
      // à gauche (`alignSelf`, pour les états rangés à gauche), la rangée, elle, suit la fenêtre.
      illustration={
        <Row>
          <ProjectThumb image={project.cover} badge="trash" />
        </Row>
      }
      title={t(($) => $.project.page.deleteTitle, { title: project.title })}
      message={
        project.removed
          ? t(($) => $.project.page.deleteConfirmRemoved)
          : t(($) => $.project.page.deleteConfirm)
      }
      // L'échec, lu en alerte dans la fenêtre. Une session expirée garde son lien : une alerte à
      // elle, avec l'action, parmi les boutons (le lien ferme d'abord la fenêtre).
      error={refusal && refusal !== 'unauthorized' ? refusalMessage : undefined}
      onDismiss={cancel}
      onClosed={closed}
    >
      {refusal === 'unauthorized' ? (
        <Notice message={refusalMessage} action={signInAgain(onCancel)} />
      ) : null}
      <Button
        label={t(($) => $.project.page.deleteConfirmButton)}
        variant="confirm"
        onPress={() => void confirm()}
        loading={busy}
      />
      <Button
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={cancel}
        disabled={busy}
      />
    </Dialog>
  )
}
