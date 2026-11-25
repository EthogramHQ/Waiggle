// La feuille « Offrir du miel » (R19, planche R19-Miel, options b7, b9 et b10), ouverte depuis la
// page du projet d'un autre membre (projects/ProjectActions) : ce que l'auteur verra (« Léa verra
// « Inès t'a offert du miel » dans son Activité. »), le solde lu à l'ouverture seulement (« Ton
// miel : 35. Il t'en restera 30. », relecture d'interface du plan, UI-5), « Offrir 5 miel » (le
// miel de la feuille) et « Annuler ».
//
// Solde trop court, lu à l'ouverture ou refusé par l'API pendant l'envoi (`honeyShort` : le solde
// a changé ailleurs) : la feuille explique, sans rouge ni reproche (option b9), mène à « Ma
// récolte » et se ferme par « Fermer ». Rien ne la ferme pendant l'envoi (`busy`), et ses boutons
// ignorent les tapes de la garde d'ouverture (`guardTaps`, la seconde tape d'une double tape).
//
// Ce fichier n'écrit aucun style : il assemble des composants de `src/ui`.
import { HONEY } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useHarvest } from '../gamification/api'
import { Button } from '../ui/Button'
import { ButtonPair } from '../ui/ButtonPair'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Sheet } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'

/** Pourquoi l'offre n'est pas partie : le solde court (API), déjà offert ailleurs, ou une panne. */
export type HoneyOfferProblem = 'short' | 'already' | 'expired' | 'failed'

type Props = {
  open: boolean
  /** Le titre du projet (« Offrir du miel à Décollage ! »). */
  title: string
  /** L'auteur, qui verra l'avis dans son Activité. */
  authorName: string
  /** Le membre qui offre, nommé dans cet avis. */
  viewerName: string
  /** L'offre est partie : le bouton montre son chargement, la feuille ne se ferme plus. */
  pending: boolean
  problem: HoneyOfferProblem | null
  /** « Offrir 5 miel », avec le solde lu (pour le toast « Il te reste N miel. »). */
  onConfirm: (balance: number) => void
  onClose: () => void
  /**
   * Où le focus retourne à la fermeture : le bouton de la page (« Miel offert » une fois l'offre
   * partie), que l'ouvreur, retrouvé par son nom, ne désigne plus.
   */
  returnFocusTo?: () => unknown
}

export function HoneyOfferSheet({
  open,
  title,
  authorName,
  viewerName,
  pending,
  problem,
  onConfirm,
  onClose,
  returnFocusTo,
}: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  // Le solde n'est lu qu'une fois la feuille ouverte (pas sur chaque page de projet) ; relu à
  // chaque ouverture (`staleTime: 0`), il a pu changer ailleurs.
  const harvest = useHarvest({ enabled: open })
  const balance = harvest.data?.honey
  const short = problem === 'short' || (balance !== undefined && balance < HONEY.gift)
  const failed = !harvest.data && harvest.isError

  // Le refus « pas assez de miel » arrive après l'envoi : les boutons « Offrir » et « Annuler »
  // disparaissent avec le focus, qui tomberait sur la page entière (rien d'annoncé, Tab repartirait
  // du haut). On le pose sur le message qui les remplace. (Un solde déjà court à l'ouverture n'en a
  // pas besoin : la feuille a posé le focus sur « Fermer ».)
  const messageRef = useRef<Focusable>(null)
  useEffect(() => {
    if (!open || problem !== 'short') return
    if (!focusWithoutScroll(messageRef.current)) moveReaderTo(messageRef.current)
  }, [open, problem])

  // « Ma récolte » : la feuille se ferme d'abord, la page s'ouvre derrière.
  const openHarvest = () => {
    onClose()
    router.push('/harvest')
  }

  const body = short ? (
    <Stack gap="md">
      <Text focusRef={messageRef}>
        {problem === 'short' || balance === undefined
          ? t(($) => $.errors.honeyShort)
          : t(($) => $.game.short.body, { needed: HONEY.gift, balance })}
      </Text>
      <Text tone="muted">{t(($) => $.game.short.how)}</Text>
      <TextLink role="link" label={t(($) => $.game.harvest.title)} onPress={openHarvest} />
    </Stack>
  ) : (
    <Stack gap="md">
      <Text>{t(($) => $.game.offer.notice, { author: authorName, name: viewerName })}</Text>
      {balance !== undefined ? (
        <Text tone="muted">
          {t(($) => $.game.offer.balance, { balance, after: balance - HONEY.gift })}
        </Text>
      ) : null}
    </Stack>
  )

  // Ce qui n'a pas marché, au-dessus des boutons : la lecture du solde, ou l'offre elle-même.
  const message =
    problem === 'already'
      ? t(($) => $.errors.honeyAlready)
      : problem === 'expired'
        ? t(($) => $.states.expired)
        : problem === 'failed'
          ? t(($) => $.game.offer.error)
          : failed
            ? t(($) => $.game.harvest.loadError)
            : null

  // Plus rien à offrir (solde court, déjà offert) : « Fermer » seul. Sinon « Offrir 5 miel », qui
  // attend le solde (le toast le cite), et « Annuler ».
  // (« Fermer » est alors celui de la feuille, en haut : un second, dans le pied, le doublerait.)
  const footer =
    short || problem === 'already' ? null : (
      <ButtonPair>
        <Button
          key="confirm"
          label={t(($) => $.game.offer.confirm, { amount: HONEY.gift })}
          icon="hexagon"
          onPress={() => {
            if (balance !== undefined) onConfirm(balance)
          }}
          loading={pending}
          disabled={balance === undefined}
          focusableWhenDisabled
        />
        <Button
          key="close"
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={onClose}
          disabled={pending}
        />
      </ButtonPair>
    )

  return (
    <Sheet
      open={open}
      guardTaps
      title={t(($) => $.game.offer.title, { title })}
      compact
      busy={pending}
      onClose={onClose}
      {...(returnFocusTo ? { returnFocusTo } : null)}
      footer={footer}
      notice={
        message
          ? {
              message,
              tone: 'error',
              action: failed
                ? { label: t(($) => $.common.retry), onPress: () => void harvest.refetch() }
                : undefined,
            }
          : null
      }
    >
      {body}
    </Sheet>
  )
}
