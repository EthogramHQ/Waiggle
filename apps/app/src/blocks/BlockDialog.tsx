// La fenêtre « Bloquer @x ? » ou « Débloquer @x ? » (tranche 7b), la même sur la page d'un membre,
// après un signalement (« Bloquer aussi ») et dans la liste « Membres bloqués ». Elle dit tout ce qui
// change avant le geste (relecture juridique, J9 et J10), envoie le geste une seule fois même après
// une double tape, garde son refus affiché pour réessayer, et ne se ferme pas pendant l'envoi.
//
// Trois copies de cette fenêtre existaient et divergeaient déjà (la couleur de « Débloquer », le
// message d'un quota atteint) : elle vit ici, une fois (relecture de l'interface, 7b).
//
// L'écran garde le geste lui-même (`send`, avec useBlock ou useUnblock de ./api) : chacun le fait à
// sa façon (sur un profil, l'un ou l'autre ; après un signalement, bloquer seulement).
import { BLOCKS_PER_DAY, UNBLOCKS_PER_DAY } from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey, ApiResult } from '../api/errors'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'
import type { ImageSource } from '../ui/image'
import { KeyPoints } from '../ui/KeyPoints'
import { MarkedAvatar } from '../ui/MarkedAvatar'
import { Notice } from '../ui/Notice'

/** Le geste à confirmer. */
export type BlockGesture = 'block' | 'unblock'

/**
 * Ce qu'on demande de confirmer : le geste, et le membre visé (de quoi le nommer, R9 : son nom et
 * son pseudo). `avatar` : sa photo, si l'écran l'a ; sans elle, ses initiales.
 */
export type BlockAsking = {
  gesture: BlockGesture
  member: { id: string; name: string; handle: string; avatar?: ImageSource | null }
}

type Props = {
  /** La demande en cours ; null : la fenêtre est fermée. */
  asking: BlockAsking | null
  /**
   * R9 : la case « Signaler aussi son profil », jamais cochée d'avance (faux par défaut). Absente
   * quand la fenêtre vient de « Bloquer aussi » d'un signalement : il est déjà parti.
   */
  offerReport?: boolean
  /** Le geste lui-même : la fenêtre attend sa réponse (ok, ou la raison du refus). */
  send: (asking: BlockAsking) => Promise<ApiResult<null>>
  /**
   * Le geste a réussi : l'écran ferme la fenêtre (asking à null) et dit ce qui est fait.
   * `alsoReport` : la case « Signaler aussi » était cochée ; l'écran ouvre alors le signalement,
   * après le blocage (jamais avant, ni s'il est refusé).
   */
  onDone: (asking: BlockAsking, alsoReport: boolean) => void
  /** « Annuler », Échap, le voile ou le retour d'Android, hors envoi : l'écran ferme la fenêtre. */
  onCancel: () => void
  /** La fenêtre a tout à fait disparu (voir Dialog) : le moment de poser le focus ailleurs. */
  onClosed?: () => void
}

export function BlockDialog({
  asking,
  offerReport = false,
  send,
  onDone,
  onCancel,
  onClosed,
}: Props) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  // La dernière demande montrée : pendant le fondu de fermeture (asking déjà à null), le titre
  // garde son pseudo et son geste, au lieu de « Débloquer @ ? » (relecture de l'interface, 7b).
  const [shown, setShown] = useState<BlockAsking | null>(asking)
  const [refusal, setRefusal] = useState<ApiErrorKey | null>(null)
  // La case « Signaler aussi son profil » : jamais cochée d'avance, décochée à chaque demande.
  const [alsoReport, setAlsoReport] = useState(false)
  const [busy, setBusy] = useState(false)
  // Une ref en plus de l'état : deux tapes dans la même image (double tape) voient toutes deux
  // l'ancien `busy` ; la ref, elle, est déjà à vrai pour la seconde.
  const sending = useRef(false)
  // « Annuler » reçoit le focus à l'ouverture, comme les autres fenêtres de geste lourd (H3).
  const cancelRef = useRef<Focusable>(null)

  // Une nouvelle demande : on la retient, et le refus d'une fenêtre précédente ne s'y montre pas
  // (pôle design). Changer l'état pendant le dessin est permis par React pour suivre une prop : il
  // redessine aussitôt, avant d'afficher quoi que ce soit.
  if (asking && asking !== shown) {
    setShown(asking)
    setRefusal(null)
    setAlsoReport(false)
  }

  // Pendant l'envoi, la fenêtre reste ouverte : la fermer perdrait le focus prévu après.
  const close = () => {
    if (!sending.current) onCancel()
  }

  const confirm = async () => {
    if (!shown || sending.current) return
    sending.current = true
    setBusy(true)
    setRefusal(null)
    const result = await send(shown)
    sending.current = false
    setBusy(false)
    // Refusé : la fenêtre reste ouverte, avec le message ; le bouton permet de réessayer.
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    onDone(shown, shown.gesture === 'block' && offerReport && alsoReport)
  }

  if (!shown) return null
  const { gesture } = shown
  const { name, handle } = shown.member
  const blocking = gesture === 'block'
  // La case n'existe que pour bloquer, et seulement là où l'écran la propose.
  const offering = blocking && offerReport

  // Le message d'un refus. Le quota du jour a son nombre (un pour bloquer, un pour débloquer), la
  // session expirée son lien « Me reconnecter » ; le reste, « Réessaie ».
  const refusalMessage =
    refusal === 'rateLimited'
      ? blocking
        ? t(($) => $.block.limited, { max: BLOCKS_PER_DAY })
        : t(($) => $.block.unblockLimited, { max: UNBLOCKS_PER_DAY })
      : refusal === 'unauthorized'
        ? t(($) => $.states.expired)
        : t(($) => $.block.error)

  return (
    <Dialog
      visible={asking !== null}
      // R9 (planche R9-Bloquer) : « Bloquer Léa Martin (@lea) ? », sous son avatar marqué
      // « bloqué » : on voit d'un coup d'œil qui, et ce qu'il deviendra.
      illustration={
        blocking ? (
          <MarkedAvatar
            name={name}
            source={shown.member.avatar ?? null}
            label={name}
            mark={{ icon: 'prohibit', label: t(($) => $.block.badge) }}
          />
        ) : undefined
      }
      title={
        blocking
          ? t(($) => $.block.titleNamed, { name, handle })
          : t(($) => $.block.unblockTitle, { handle })
      }
      // Débloquer : ce qui revient et ce qui ne revient pas (J10, R7).
      message={blocking ? undefined : t(($) => $.block.unblockMessage)}
      // Bloquer (R9) : un résumé en gras, quatre puces courtes, puis le texte complet d'avant R9,
      // visible sans rien déplier : ce qu'on ne verra plus, ce qui reste visible (R1), les
      // abonnements, que @x n'est pas prévenu, et que la modération non plus (J9).
      body={
        blocking ? (
          <KeyPoints
            summary={t(($) => $.block.summary, { name })}
            points={[
              { icon: 'eye-slash', text: t(($) => $.block.bullets.content) },
              { icon: 'users', text: t(($) => $.block.bullets.follows) },
              { icon: 'bell-slash', text: t(($) => $.block.bullets.notTold) },
              { icon: 'flag', text: t(($) => $.block.bullets.moderation) },
            ]}
            details={{
              title: t(($) => $.block.fullText),
              paragraphs: [
                t(($) => $.block.hidden),
                t(($) => $.block.remains, { handle }),
                t(($) => $.block.follows),
                t(($) => $.block.notTold, { handle }),
                t(($) => $.block.notModeration),
              ],
            }}
          />
        ) : undefined
      }
      // Elle s'ouvre là où l'on vient de toucher (un menu, « Bloquer aussi ») : la seconde tape
      // d'une double tape ne confirme rien (relecture de design, 7b).
      guardTaps
      onDismiss={close}
      initialFocusRef={cancelRef}
      {...(onClosed ? { onClosed } : null)}
    >
      {refusal ? (
        <Notice
          message={refusalMessage}
          action={refusal === 'unauthorized' ? signInAgain(onCancel) : undefined}
        />
      ) : null}
      {/* R9 : signaler aussi son profil, après le blocage. Jamais cochée d'avance ; cocher ne
          bloque rien, seul « Bloquer » agit. Dans la zone des boutons : la garde des tapes de
          l'ouverture la protège aussi. Inactive pendant l'envoi, comme « Annuler ». */}
      {offering ? (
        <Checkbox
          label={t(($) => $.block.alsoReport)}
          value={alsoReport}
          onValueChange={setAlsoReport}
          disabled={busy}
        />
      ) : null}
      {/* Bloquer en rouge plein, comme une suppression ; débloquer en miel, partout le même. */}
      <Button
        label={blocking ? t(($) => $.block.confirm) : t(($) => $.block.unblockConfirm)}
        variant={blocking ? 'confirm' : 'primary'}
        onPress={() => void confirm()}
        loading={busy}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.block.cancel)}
        variant="secondary"
        onPress={close}
        disabled={busy}
      />
    </Dialog>
  )
}
