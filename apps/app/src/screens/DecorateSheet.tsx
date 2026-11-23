// La feuille « Décorer mon rayon » (R19, planche R19-Miel, option b11), ouverte depuis « Mon miel »
// de « Ma récolte » : l'aperçu du rayon, le choix d'une teinte et d'un motif (`DecorationPicker`),
// « Ton miel : N », et le bouton qui suit le choix : « Décorer pour 25 miel » pour ce qui n'est pas
// encore acheté, « Décorer » pour ce qui est déjà à soi. Un achat vaut pour toujours.
//
// Ce que la relecture d'interface du plan (UI-2) demande :
// - l'achat part une seule fois, même sur deux tapes (une garde posée au toucher, avant la réponse) ;
// - pendant l'achat, la feuille refuse de se fermer (`Sheet busy` : « Fermer », Échap, le voile et
//   le retour d'Android ne font rien), sinon « Fermer » mentirait : l'achat continuerait derrière ;
// - un solde trop court (409 `honey_short`, option b9) s'explique dans la feuille, sans rouge ni
//   reproche : comment le miel se gagne ; rien n'est débité, la feuille reste ouverte.
//
// La feuille n'a pas d'adresse : la page qui l'ouvre lui passe la récolte qu'elle a déjà lue (le
// solde, le rayon, ce qui est acheté). Après l'achat, le hook relit la récolte : le solde de
// « Mon miel » suit, et un toast « Rayon décoré. » le dit une fois la feuille fermée.
import {
  type Decoration,
  DecorationPattern,
  DecorationTint,
  decorationPrice,
  type Harvest,
} from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { useDecorate } from '../gamification/api'
import { Button } from '../ui/Button'
import { DecorationPicker } from '../ui/DecorationPicker'
import { HoneyComb } from '../ui/HoneyComb'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useToast } from '../ui/theme/toast'

type Props = {
  /** La feuille est ouverte ; chaque ouverture repart de la décoration du rayon. */
  open: boolean
  /** La récolte du membre, lue par la page : son rayon, son solde, ce qu'il a déjà acheté. */
  harvest: Harvest
  /** Demande de fermeture (« Fermer », Échap, le voile, le retour), et la fin d'un achat réussi. */
  onClose: () => void
}

// Les choix dans l'ordre de la planche, celui du contrat.
const TINTS = DecorationTint.options
const PATTERNS = DecorationPattern.options

const same = (a: Decoration, b: Decoration) => a.tint === b.tint && a.pattern === b.pattern

export function DecorateSheet({ open, harvest, onClose }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const decorate = useDecorate()

  // Le choix en cours, gardé dans la feuille jusqu'à l'achat. À chaque ouverture, il repart de la
  // décoration du rayon : un choix laissé sans l'acheter ne revient pas la fois suivante. Le
  // changement se fait pendant le rendu (pas dans un effet), pour ne jamais montrer, même une
  // image, le choix de la fois d'avant.
  const [choice, setChoice] = useState<Decoration>(harvest.decoration)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setChoice(harvest.decoration)
      decorate.reset()
    }
  }

  // La garde de la double tape : posée au toucher, avant que React Query ne dise « en cours ».
  const sending = useRef(false)
  const pending = decorate.isPending

  const price = decorationPrice(choice, harvest.ownedDecorations)
  const unchanged = same(choice, harvest.decoration)

  const change = (next: Decoration) => {
    if (sending.current) return
    setChoice(next)
    // Le message parlait du choix précédent (son prix, son échec) : il s'en va avec lui.
    decorate.reset()
  }

  const onDecorate = async () => {
    if (sending.current || unchanged) return
    sending.current = true
    try {
      await decorate.mutateAsync(choice)
      onClose()
      // Après la fermeture : un toast pendant une feuille ouverte resterait caché derrière elle.
      toast.show(
        t(($) => $.game.decoration.done),
        { icon: 'check-circle' },
      )
    } catch {
      // Le refus se lit dans le pied de la feuille (`decorate.error`), qui reste ouverte.
    } finally {
      sending.current = false
    }
  }

  // Le message du pied : un solde court explique comment le miel se gagne (une information, pas une
  // erreur : rien n'est perdu) ; tout autre refus dit que rien n'est enregistré.
  const failed = decorate.isError ? errorKey(decorate.error) : null
  const notice: SheetNotice | null =
    failed === 'honeyShort'
      ? { message: t(($) => $.game.short.how), tone: 'info' }
      : failed
        ? { message: t(($) => $.game.decoration.error), tone: 'error' }
        : null

  return (
    <Sheet
      open={open}
      title={t(($) => $.game.decoration.title)}
      onClose={onClose}
      busy={pending}
      notice={notice}
      // Le bouton au pied, pas dans la tête (`action`) : la tête garde sa croix « Fermer », la sortie
      // que la feuille doit offrir (et refuser pendant l'achat). Le solde juste au-dessus, à côté du
      // prix qu'il paie.
      footer={
        <Stack gap="sm">
          <Text weight={600}>{t(($) => $.game.decoration.balance, { amount: harvest.honey })}</Text>
          <Button
            label={
              price > 0
                ? t(($) => $.game.decoration.buy, { amount: price })
                : t(($) => $.game.decoration.apply)
            }
            onPress={() => void onDecorate()}
            loading={pending}
            // Le rayon porte déjà ce choix : rien à décorer. Le bouton reste atteignable au clavier,
            // pour qu'on l'entende avant de choisir.
            disabled={unchanged}
            focusableWhenDisabled
          />
        </Stack>
      }
    >
      <Stack gap="xl">
        {/* L'aperçu : le rayon du membre, tel qu'il sera avec ce choix. */}
        <HoneyComb
          cells={harvest.cells}
          label={t(($) => $.game.decoration.preview)}
          valueText={t(($) => $.game.comb.cells, {
            count: harvest.cells,
            next: harvest.level + 1,
          })}
          tint={choice.tint}
          pattern={choice.pattern}
          size="regular"
        />
        <DecorationPicker
          tints={TINTS}
          patterns={PATTERNS}
          owned={harvest.ownedDecorations}
          value={choice}
          balance={harvest.honey}
          onChange={change}
        />
      </Stack>
    </Sheet>
  )
}
