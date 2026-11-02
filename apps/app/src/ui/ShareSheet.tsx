// La feuille « Partager » (tranche R5a, F-Pr1, F-Mb1, planche R5a-Partager) : partager la page d'un
// projet ou d'un membre. Elle montre une vignette, « Décollage ! sur Waiggle », l'adresse de la page
// en chasse fixe (telle qu'elle sera copiée), un bandeau ambre qui dit qui pourra l'ouvrir, puis
// deux boutons : « Copier le lien » et « Partager… » (le menu de l'appareil, s'il en a un).
//
// Elle repose sur `Sheet` (un composant voisin, mêmes gardes : R2-E5) : boîte de dialogue modale
// nommée par son titre, Échap, toucher à côté, retour d'Android, focus rendu au bouton Partager à
// la fermeture. Ce fichier n'ajoute que le contenu et les deux gestes.
//
// Les règles des relectures du plan :
// - l'adresse vient de `shareUrl` (identifiant validé, sec-B6) et ne contient rien d'autre : ni
//   paramètre, ni nom de qui partage ;
// - jur-3 : pour un projet privé, le bandeau dit que le lien ne s'ouvrira que pour son auteur ;
//   jur-5 : le toast de « Copier le lien » le redit ;
// - ui-8 : « Copier le lien » ferme la feuille d'abord, puis montre le toast (un toast montré sous
//   une fenêtre modale est caché sur téléphone, et hors de `aria-modal` sur le web) ; une copie
//   refusée par l'appareil garde la feuille ouverte et le dit dans son pied (jamais un « Lien
//   copié » mensonger : ui-7) ;
// - ui-9 : « Partager… » attend l'hydratation de la page web (le pré-rendu ne connaît pas le
//   navigateur).
import { radii } from '@ruche/brand'
import { Image } from 'expo-image'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'
import { Callout } from './Callout'
import { copyText } from './clipboard'
import type { ImageSource } from './image'
import { Sheet, type SheetNotice, SheetPanel } from './Sheet'
import { canShareNatively, type ShareTarget, shareLink, shareUrl } from './share'
import { Text } from './Text'
import { holdPageTaps, TAP_GUARD_MS, useTapGuard } from './tapGuard'
import { useHydrated } from './theme/hydration'
import { useTheme } from './theme/ThemeProvider'
import { useToast } from './theme/toast'

/** La taille de la vignette, en points : à côté du titre, à la hauteur de deux lignes. */
const THUMBNAIL = 56

type ContentProps = {
  /** Le titre du projet, ou le nom du membre : la feuille dit « {{title}} sur Waiggle ». */
  title: string
  /** La page partagée. Un identifiant douteux ne donne aucune adresse : la feuille ne s'ouvre pas. */
  target: ShareTarget
  /**
   * `public` (par défaut) : seuls les membres pourront l'ouvrir. `private` : un projet privé, que
   * le lien n'ouvrira que pour son auteur (jur-3).
   */
  visibility?: 'public' | 'private'
  /**
   * La vignette : la première photo du projet, la photo du membre. Décorative (le titre dit de quoi
   * il s'agit). Un membre sans photo a ses initiales ; un projet sans photo, pas de vignette.
   */
  image?: ImageSource | null
  onClose: () => void
}

type Props = ContentProps & { open: boolean }

/**
 * Le contenu de la feuille, commun à `ShareSheet` (dans sa couche modale) et à `ShareSheetPanel`
 * (le catalogue) : le titre, la vignette, l'adresse et le bandeau, les boutons du pied, et le
 * message d'une copie refusée. `null` sans adresse.
 */
function useShareContent({
  open,
  title,
  target,
  visibility = 'public',
  image = null,
  onClose,
  copy = copyText,
  canShare,
}: ContentProps & {
  open: boolean
  copy?: (text: string) => Promise<boolean>
  canShare?: boolean
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const toast = useToast()
  const hydrated = useHydrated()
  const guard = useTapGuard()
  const url = shareUrl(target)
  // La copie en cours, et la fin de sa garde : la seconde tape d'une double tape arrive avant que
  // React ait redessiné, d'où des `ref` plutôt qu'un état (comme « Copier » d'un prompt).
  const copying = useRef(false)
  const copyGuardUntil = useRef(0)
  // Ce que l'appareil a refusé : la copie (« copy ») ou le menu de partage (« system »), dit dans le
  // pied de la feuille jusqu'à la fermeture ; `null` tant que rien n'a échoué.
  const [failed, setFailed] = useState<'copy' | 'system' | null>(null)
  // À chaque réouverture, la feuille repart sans le message d'avant (une erreur se montre après un
  // geste, et disparaît quand on rouvre). Changer l'état pendant le dessin pour suivre une prop est
  // permis par React, et évite d'afficher l'ancien message le temps d'un dessin.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setFailed(null)
  }

  if (!url) return null

  const isPrivate = target.kind === 'project' && visibility === 'private'
  // Le menu de l'appareil : seulement s'il existe, et (sur le web) une fois la page hydratée.
  const system = hydrated && (canShare ?? canShareNatively())

  const onCopy = async () => {
    const now = Date.now()
    if (copying.current || now < copyGuardUntil.current) return
    copying.current = true
    copyGuardUntil.current = now + TAP_GUARD_MS
    const done = await copy(url)
    copying.current = false
    if (!done) {
      setFailed('copy')
      return
    }
    setFailed(null)
    // La feuille d'abord, le toast ensuite (ui-8). La feuille disparaît sous le doigt : sur le web,
    // la seconde tape d'une double tape tomberait sur la page dessous (« Publier », une carte) ;
    // la page l'ignore le temps de la garde.
    holdPageTaps()
    onClose()
    toast.show(isPrivate ? t(($) => $.share.copiedPrivate) : t(($) => $.share.copiedMembers), {
      icon: 'check-circle',
    })
  }

  const onSystem = async () => {
    setFailed(null)
    try {
      await shareLink(url)
    } catch {
      // Une panne du menu de l'appareil (autre qu'un menu refermé, déjà avalé par shareLink) : la
      // feuille reste ouverte, avec « Copier le lien » à portée, et le dit dans son pied, comme une
      // copie refusée (relecture de design R5a, C1 : le geste ne devait pas rester muet).
      setFailed('system')
    }
  }

  // La vignette, à droite du titre (la place de décor de la feuille, cachée aux lecteurs d'écran).
  const decoration: ReactNode =
    target.kind === 'member' ? (
      <Avatar name={title} source={image} label="" size={THUMBNAIL} />
    ) : image ? (
      // expo-image, comme les vignettes d'un projet (`Thumbnails`) : il recadre la photo au carré
      // et dessine aussi une image SVG sur le web, où l'Image de React Native ne le fait pas.
      <Image
        source={image}
        contentFit="cover"
        accessible={false}
        style={{
          width: THUMBNAIL,
          height: THUMBNAIL,
          borderRadius: radii.small,
          backgroundColor: colors.honeySoft,
        }}
      />
    ) : null

  const notice: SheetNotice | null = failed
    ? {
        message: failed === 'copy' ? t(($) => $.share.copyFailed) : t(($) => $.share.systemFailed),
        tone: 'error',
      }
    : null

  return {
    title: t(($) => $.share.title, { title }),
    decoration,
    notice,
    children: (
      <>
        {/* L'adresse, telle qu'elle sera copiée : en chasse fixe, sélectionnable, coupée où il
            faut sur un écran étroit (une adresse n'a pas d'espace). */}
        <Text variant="code" tone="secondary" selectable breakAnywhere>
          {url}
        </Text>
        <Callout
          tone="caution"
          icon="lock-simple"
          title={isPrivate ? t(($) => $.share.privateOnly) : t(($) => $.share.membersOnly)}
        />
      </>
    ),
    footer: (
      <ButtonPair>
        <Button
          key="copy"
          label={t(($) => $.share.copy)}
          icon="link"
          onPress={() => void onCopy()}
        />
        {system ? (
          <Button
            key="system"
            label={t(($) => $.share.system)}
            icon="share-network"
            variant="secondary"
            onPress={guard(() => void onSystem())}
          />
        ) : null}
      </ButtonPair>
    ),
  }
}

/**
 * La feuille « Partager », par-dessus la page. La page la monte avec son bouton Partager, et la
 * referme par `onClose` (« Fermer », Échap, le voile, après « Copier le lien »).
 */
export function ShareSheet({ open, onClose, ...rest }: Props) {
  const content = useShareContent({ open, onClose, ...rest })
  if (!content) return null
  return (
    <Sheet open={open} onClose={onClose} {...content}>
      {content.children}
    </Sheet>
  )
}

type PanelProps = ContentProps & {
  /** Téléphone ou ordinateur : le catalogue montre les deux. */
  layout: 'phone' | 'desktop'
  /** Le nom du bouton « Fermer », pour le catalogue seulement. */
  closeLabel?: string
  /** La copie (le catalogue en passe une qui échoue, pour montrer le message du pied). */
  copy?: (text: string) => Promise<boolean>
  /** Le menu de l'appareil existe-t-il ? (le catalogue montre la feuille avec et sans). */
  canShare?: boolean
}

/**
 * La feuille sans sa couche modale, posée dans la page : pour le catalogue (un outil de
 * développement), qui la montre dans tous ses états. Les écrans passent par `ShareSheet`.
 */
export function ShareSheetPanel({ layout, closeLabel, copy, canShare, ...rest }: PanelProps) {
  const content = useShareContent({
    open: true,
    ...rest,
    ...(copy ? { copy } : null),
    ...(canShare === undefined ? null : { canShare }),
  })
  if (!content) return null
  return (
    <View style={{ width: '100%' }}>
      <SheetPanel
        layout={layout}
        onClose={rest.onClose}
        {...(closeLabel ? { closeLabel } : null)}
        {...content}
      >
        {content.children}
      </SheetPanel>
    </View>
  )
}
