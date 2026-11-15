// Les quatre fenêtres de confirmation des ruches (R10, docs/scenarios/refonte.md, « L'animateur »,
// « Quitter une ruche » ; planche R10-Reglages-Ruche) : quitter la ruche, retirer un membre (option
// 5 des planches), supprimer la ruche, confier l'animation. Elles vivent ici, une fois chacune : la
// page de la ruche et ses réglages ouvrent les mêmes (charte de design : deux copies d'une fenêtre
// de geste finissent par diverger).
//
// Toutes suivent le modèle de `projects/DeleteProjectDialog` :
// - le bouton d'action ignore les tapes juste après l'ouverture (`guardTaps`) : la fenêtre s'ouvre
//   sous le doigt qui vient de toucher « Quitter la ruche » ou « Retirer » ;
// - une seule écriture part, même sur une double tape (une `ref`, lue avant tout nouveau dessin) ;
// - pendant l'écriture, le bouton tourne, « Annuler » attend, et ni Échap, ni le voile, ni le retour
//   d'Android ne ferment la fenêtre (`busy`) : fermée, elle laisserait croire que rien ne se passe ;
// - un refus se lit dans la fenêtre, qui reste ouverte : on réessaie, ou on annule ;
// - réussie, la fenêtre laisse l'écran décider de la suite (`onDone`) : partir vers l'onglet Ruches,
//   vers la page de la ruche, ou rester sur la liste des membres.
//
// « Annuler » reçoit le focus à l'ouverture : aucune de ces actions ne se défait d'un geste, et
// Entrée à l'arrivée ne doit rien lancer.
//
// L'API des quatre (plan R10, « API au contrat ») : `{ hive, open, onClose, onDone, member? }`.
// `member` sert à « Retirer » et à « Confier » (sans lui, ces deux fenêtres ne s'ouvrent pas).
import type { HiveMember, HivePage } from '@ruche/contracts'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'
import type { IconName } from '../ui/Icon'
import { Notice } from '../ui/Notice'
import { useDeleteHive, useLeaveHive, useRemoveMember, useSetAnimator } from './api'

export type HiveDialogProps = {
  /** La page de la ruche : son nom (dans le titre), son nombre de projets, qui animera après. */
  hive: HivePage
  open: boolean
  /** « Annuler », Échap, le voile ou le retour d'Android, hors écriture : l'écran ferme. */
  onClose: () => void
  /** L'écriture a réussi : l'écran ferme la fenêtre et décide de la suite. */
  onDone: () => void
  /** Le membre visé par « Retirer » et « Confier ». */
  member?: HiveMember
  /**
   * La fenêtre a fini de partir (web et iOS, après son fondu ; voir `Dialog`). La page d'une ruche
   * garde sa liste des membres figée jusque-là : le focus revient d'abord sur « Retirer », puis la
   * liste perd le membre et `HiveMemberList` donne le focus au voisin. Android ne l'appelle pas.
   */
  onClosed?: () => void
}

/** Les refus qui ont leur propre phrase, plus juste que « Réessaie ». */
const OWN_MESSAGES = ['rateLimited', 'suspended', 'forbidden'] as const
type OwnMessage = (typeof OWN_MESSAGES)[number]
const hasOwnMessage = (key: ApiErrorKey): key is OwnMessage =>
  (OWN_MESSAGES as readonly ApiErrorKey[]).includes(key)

type ActionProps = {
  open: boolean
  onClose: () => void
  onDone: () => void
  title: string
  /** Les paragraphes sous le titre, chacun le sien. */
  message: string[]
  confirmLabel: string
  confirmIcon: IconName
  /** `confirm` : rouge plein, pour ce qui ne se défait pas ; `primary` pour confier. */
  variant: 'confirm' | 'primary'
  /** La phrase d'un échec ordinaire (panne, réseau). */
  errorText: string
  /** L'écriture ; lève une `ApiError` si l'API refuse. */
  run: () => Promise<unknown>
  /**
   * Un 404 vaut une réussite : la ruche, ou le membre, n'y est déjà plus (supprimé d'un autre
   * appareil), ce que voulait le membre.
   */
  goneIsDone: boolean
  onClosed?: (() => void) | undefined
}

/** La fenêtre commune : l'action, son attente, son refus. */
function HiveActionDialog({
  open,
  onClose,
  onDone,
  onClosed,
  title,
  message,
  confirmLabel,
  confirmIcon,
  variant,
  errorText,
  run,
  goneIsDone,
}: ActionProps) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ApiErrorKey | null>(null)
  // Une ref en plus de l'état : deux tapes dans la même image voient toutes deux l'ancien `busy` ;
  // la ref, elle, est déjà à vrai pour la seconde.
  const sending = useRef(false)
  const cancelRef = useRef<Focusable>(null)

  // Rouverte, la fenêtre ne montre pas l'échec d'une fois précédente. Changer l'état pendant le
  // dessin est permis par React pour suivre une prop : il redessine aussitôt.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setRefusal(null)
  }

  const cancel = () => {
    if (!sending.current) onClose()
  }

  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setRefusal(null)
    let failure: ApiErrorKey | null = null
    try {
      await run()
    } catch (error) {
      failure = errorKey(error)
    }
    sending.current = false
    setBusy(false)
    if (failure && !(goneIsDone && failure === 'notFound')) {
      setRefusal(failure)
      return
    }
    onDone()
  }

  const refusalMessage =
    refusal === 'unauthorized'
      ? t(($) => $.states.expired)
      : refusal && hasOwnMessage(refusal)
        ? t(($) => $.errors[refusal])
        : errorText

  // Une session expirée garde son lien « Me reconnecter » : une alerte à elle, parmi les boutons.
  let expired: ReactNode = null
  if (refusal === 'unauthorized')
    expired = <Notice message={refusalMessage} action={signInAgain(onClose)} />

  return (
    <Dialog
      visible={open}
      guardTaps
      busy={busy}
      title={title}
      message={message}
      error={refusal && refusal !== 'unauthorized' ? refusalMessage : undefined}
      onDismiss={cancel}
      {...(onClosed ? { onClosed } : null)}
      initialFocusRef={cancelRef}
    >
      {expired}
      <Button
        label={confirmLabel}
        icon={confirmIcon}
        variant={variant}
        onPress={() => void confirm()}
        loading={busy}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.hives.dialogs.cancel)}
        variant="secondary"
        onPress={cancel}
        disabled={busy}
      />
    </Dialog>
  )
}

/** Le nom de la ruche dans une phrase : « Famille », ou « sans nom ». */
const useNameInSentence = (hive: HivePage) => {
  const { t } = useTranslation()
  return hive.summary.name ?? t(($) => $.hives.unnamedInline)
}

/**
 * « Quitter la ruche Famille ? » : ses projets réservés redeviennent privés, ses commentaires restent
 * lisibles (Q2 de la relecture du plan), puis qui animera après (l'animateur qui part) ou la
 * suppression (le dernier membre).
 */
export function QuitHiveDialog({ hive, open, onClose, onDone }: HiveDialogProps) {
  const { t } = useTranslation()
  const leave = useLeaveHive(hive.summary.id)
  const name = useNameInSentence(hive)
  const successor = hive.successor
  const after = successor
    ? [t(($) => $.hives.dialogs.quitSuccessor, { name: successor.name })]
    : hive.summary.memberCount <= 1
      ? [t(($) => $.hives.dialogs.quitLast)]
      : []
  return (
    <HiveActionDialog
      open={open}
      onClose={onClose}
      onDone={onDone}
      title={t(($) => $.hives.dialogs.quitTitle, { hive: name })}
      message={[
        t(($) => $.hives.dialogs.quitBody),
        t(($) => $.hives.dialogs.quitComments),
        ...after,
      ]}
      confirmLabel={t(($) => $.hives.dialogs.quit)}
      confirmIcon="sign-out"
      variant="confirm"
      errorText={t(($) => $.hives.dialogs.quitError)}
      run={() => leave.mutateAsync()}
      goneIsDone
    />
  )
}

/** « Retirer Tante Odile de la ruche ? » (option 5 des planches), pour l'animateur. */
export function RemoveMemberDialog({
  hive,
  open,
  onClose,
  onDone,
  onClosed,
  member,
}: HiveDialogProps) {
  const { t } = useTranslation()
  const remove = useRemoveMember(hive.summary.id)
  const memberName = member?.face.name ?? ''
  return (
    <HiveActionDialog
      open={open && member !== undefined}
      onClose={onClose}
      onDone={onDone}
      onClosed={onClosed}
      title={t(($) => $.hives.dialogs.removeTitle, { name: memberName })}
      message={[t(($) => $.hives.dialogs.removeBody)]}
      confirmLabel={t(($) => $.hives.dialogs.remove)}
      confirmIcon="user-minus"
      variant="confirm"
      errorText={t(($) => $.hives.dialogs.removeError)}
      run={async () => {
        if (member) await remove.mutateAsync(member.face.id)
      }}
      goneIsDone
    />
  )
}

/** « Supprimer la ruche Famille ? Ses 5 projets réservés redeviennent privés… » */
export function DeleteHiveDialog({ hive, open, onClose, onDone }: HiveDialogProps) {
  const { t } = useTranslation()
  const remove = useDeleteHive(hive.summary.id)
  const name = useNameInSentence(hive)
  const count = hive.projectCount
  return (
    <HiveActionDialog
      open={open}
      onClose={onClose}
      onDone={onDone}
      title={t(($) => $.hives.dialogs.deleteTitle, { hive: name })}
      message={[
        count === 0
          ? t(($) => $.hives.dialogs.deleteBodyNone)
          : t(($) => $.hives.dialogs.deleteBody, { count }),
      ]}
      confirmLabel={t(($) => $.hives.dialogs.delete)}
      confirmIcon="trash"
      variant="confirm"
      errorText={t(($) => $.hives.dialogs.deleteError)}
      run={() => remove.mutateAsync()}
      goneIsDone
    />
  )
}

/** « Confier l'animation à Inès Haddad ? » : elle animera, l'animateur reste membre. */
export function HandOverDialog({ hive, open, onClose, onDone, member }: HiveDialogProps) {
  const { t } = useTranslation()
  const setAnimator = useSetAnimator(hive.summary.id)
  const memberName = member?.face.name ?? ''
  return (
    <HiveActionDialog
      open={open && member !== undefined}
      onClose={onClose}
      onDone={onDone}
      title={t(($) => $.hives.dialogs.handOverTitle, { name: memberName })}
      message={[t(($) => $.hives.dialogs.handOverBody, { name: memberName })]}
      confirmLabel={t(($) => $.hives.dialogs.handOver)}
      confirmIcon="crown"
      variant="primary"
      errorText={t(($) => $.hives.dialogs.handOverError)}
      run={async () => {
        if (member) await setAnimator.mutateAsync(member.face.id)
      }}
      // Un 404 ici n'est pas la réussite : le membre choisi n'est plus dans la ruche.
      goneIsDone={false}
    />
  )
}
