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
import { Dialog } from '../ui/Dialog'
import { Notice } from '../ui/Notice'

/** Le geste à confirmer. */
export type BlockGesture = 'block' | 'unblock'

/** Ce qu'on demande de confirmer : le geste, et le membre visé (de quoi le nommer). */
export type BlockAsking = { gesture: BlockGesture; member: { id: string; handle: string } }

type Props = {
  /** La demande en cours ; null : la fenêtre est fermée. */
  asking: BlockAsking | null
  /** Le geste lui-même : la fenêtre attend sa réponse (ok, ou la raison du refus). */
  send: (asking: BlockAsking) => Promise<ApiResult<null>>
  /** Le geste a réussi : l'écran ferme la fenêtre (asking à null) et dit ce qui est fait. */
  onDone: (asking: BlockAsking) => void
  /** « Annuler », Échap, le voile ou le retour d'Android, hors envoi : l'écran ferme la fenêtre. */
  onCancel: () => void
  /** La fenêtre a tout à fait disparu (voir Dialog) : le moment de poser le focus ailleurs. */
  onClosed?: () => void
}

export function BlockDialog({ asking, send, onDone, onCancel, onClosed }: Props) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  // La dernière demande montrée : pendant le fondu de fermeture (asking déjà à null), le titre
  // garde son pseudo et son geste, au lieu de « Débloquer @ ? » (relecture de l'interface, 7b).
  const [shown, setShown] = useState<BlockAsking | null>(asking)
  const [refusal, setRefusal] = useState<ApiErrorKey | null>(null)
  const [busy, setBusy] = useState(false)
  // Une ref en plus de l'état : deux tapes dans la même image (double tape) voient toutes deux
  // l'ancien `busy` ; la ref, elle, est déjà à vrai pour la seconde.
  const sending = useRef(false)

  // Une nouvelle demande : on la retient, et le refus d'une fenêtre précédente ne s'y montre pas
  // (pôle design). Changer l'état pendant le dessin est permis par React pour suivre une prop : il
  // redessine aussitôt, avant d'afficher quoi que ce soit.
  if (asking && asking !== shown) {
    setShown(asking)
    setRefusal(null)
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
    onDone(shown)
  }

  if (!shown) return null
  const { gesture } = shown
  const { handle } = shown.member
  const blocking = gesture === 'block'

  // Le message d'un refus. Le quota du jour a son nombre (un pour bloquer, un pour débloquer), la
  // session expirée son lien « Me reconnecter » ; le reste, « Réessaie ».
  const refusalMessage =
    refusal === 'rateLimited'
      ? blocking
        ? t('block.limited', { max: BLOCKS_PER_DAY })
        : t('block.unblockLimited', { max: UNBLOCKS_PER_DAY })
      : refusal === 'unauthorized'
        ? t('states.expired')
        : t('block.error')

  return (
    <Dialog
      visible={asking !== null}
      title={blocking ? t('block.title', { handle }) : t('block.unblockTitle', { handle })}
      // Bloquer : ce qu'on ne verra plus, ce qui reste visible (R1), les abonnements, que @x n'est
      // pas prévenu, et que la modération non plus ; chacun son paragraphe. Débloquer : ce qui
      // revient et ce qui ne revient pas (J10, R7).
      message={
        blocking
          ? [
              t('block.hidden'),
              t('block.remains', { handle }),
              t('block.follows'),
              t('block.notTold', { handle }),
              t('block.notModeration'),
            ]
          : t('block.unblockMessage')
      }
      // Elle s'ouvre là où l'on vient de toucher (un menu, « Bloquer aussi ») : la seconde tape
      // d'une double tape ne confirme rien (relecture de design, 7b).
      guardTaps
      onDismiss={close}
      {...(onClosed ? { onClosed } : null)}
    >
      {refusal ? (
        <Notice
          message={refusalMessage}
          action={refusal === 'unauthorized' ? signInAgain(onCancel) : undefined}
        />
      ) : null}
      {/* Bloquer en rouge plein, comme une suppression ; débloquer en miel, partout le même. */}
      <Button
        label={blocking ? t('block.confirm') : t('block.unblockConfirm')}
        variant={blocking ? 'confirm' : 'primary'}
        onPress={() => void confirm()}
        loading={busy}
      />
      <Button label={t('block.cancel')} variant="secondary" onPress={close} disabled={busy} />
    </Dialog>
  )
}
