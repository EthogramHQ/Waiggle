// Ce que la page de sortie pose sur sa feuille claire (R5a, planches `R5a-Portail`) : « Tu quittes
// Waiggle pour », le nom du site en gras et en entier, son adresse complète en petit, la ligne « La
// démo de …, ajoutée par … » quand elle a lieu d'être, l'encadré de prudence, puis « Ouvrir le site ↗ »
// (miel) et « Rester sur Waiggle ». L'écran (screens/LeavingScreen.tsx) décide de l'adresse, de la
// ligne et des gestes ; ce composant décide de leur place, de leur ordre et de leur allure.
//
// Pourquoi la ligne est discrète (relecture de sécurité du plan, sec-B5, risque accepté) : le titre
// d'un projet est écrit par un membre, qui pourrait l'appeler « Connexion Waiggle ». La page doit
// faire douter ; c'est donc le nom du site, en grand, et l'encadré qui dominent. La ligne vient en
// petit, en gris, en texte brut (jamais du Markdown).
//
// Rien ne bouge sous le doigt (ui-17) : la ligne arrive après la page (l'API répond un instant plus
// tard). Tant qu'elle peut encore arriver (`holdOrigin`), sa place est gardée : une vue vide, à la
// hauteur de deux lignes de texte, mesurée sur un texte invisible (elle suit donc le texte agrandi).
// La place reste ensuite acquise : si la ligne ne vient pas (projet introuvable, autre adresse), le
// vide reste, plutôt que les boutons ne remontent sous le doigt.
import { space } from '@ruche/brand'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, View } from 'react-native'
import { AvatarStack, type StackMember } from './AvatarStack'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'
import { Callout } from './Callout'
import { Stack } from './Stack'
import { Text } from './Text'

/** La ligne « La démo de … » : sa phrase toute faite, et l'auteur dont la photo la précède. */
export type LeavingOrigin = { text: string; author: StackMember }

type Props = {
  /** Le nom du site (« carnet-cafes.vercel.app »), tel que l'adresse le donne. */
  host: string
  /** L'adresse complète, telle qu'elle sera ouverte. */
  href: string
  /** La ligne « La démo de … », ou null (pas encore là, ou n'a pas lieu d'être). */
  origin: LeavingOrigin | null
  /** Une ligne peut encore arriver : sa place est gardée dès maintenant (voir l'en-tête). */
  holdOrigin?: boolean
  onOpen: () => void
  onStay: () => void
}

/**
 * Cache un élément et ce qu'il contient aux lecteurs d'écran, sur chaque plateforme : Android
 * (importantForAccessibility), iOS (accessibilityElementsHidden) et le web (aria-hidden).
 */
const hiddenFromReaders = {
  importantForAccessibility: 'no-hide-descendants' as const,
  accessibilityElementsHidden: true,
  ...(Platform.OS === 'web' ? { 'aria-hidden': true } : null),
}

/** Une espace insécable : une ligne « vide » qui garde quand même sa hauteur. */
const BLANK = String.fromCodePoint(0xa0)

export function LeavingSheet({ host, href, origin, holdOrigin = false, onOpen, onStay }: Props) {
  const { t } = useTranslation()
  return (
    <>
      {/* align="stretch" : les textes prennent toute la largeur de la feuille, et un nom de site
          très long se coupe (breakAnywhere) au lieu de sortir de l'écran. */}
      <Stack gap="xs" align="stretch">
        <Text variant="callout" weight={600} tone="secondary" heading={1}>
          {t(($) => $.leaving.to)}
        </Text>
        {/* Le nom du site, en grand : c'est lui qu'on doit reconnaître (ou pas). */}
        <Text variant="title2" breakAnywhere>
          {host}
        </Text>
        {/* L'adresse complète, telle qu'elle sera ouverte : un nom écrit avec des lettres d'un autre
            alphabet y apparaît sous sa forme réelle (« xn--… »), s'il n'a pas été refusé avant. */}
        <Text variant="mono" tone="secondary" selectable breakAnywhere>
          {href}
        </Text>
      </Stack>
      {origin || holdOrigin ? <OriginLine origin={origin} /> : null}
      <Callout
        icon="key"
        title={t(($) => $.leaving.warningTitle)}
        body={t(($) => $.leaving.warningBody)}
      />
      <ButtonPair>
        <Button label={t(($) => $.leaving.open)} icon="arrow-up-right" iconAfter onPress={onOpen} />
        <Button label={t(($) => $.leaving.stay)} variant="secondary" onPress={onStay} />
      </ButtonPair>
    </>
  )
}

/** La ligne « La démo de … », ou sa place gardée, vide, tant qu'elle n'est pas là. */
function OriginLine({ origin }: { origin: LeavingOrigin | null }) {
  // La hauteur gardée : celle du texte invisible de deux lignes, mesurée une fois. Elle reste
  // ensuite, que la ligne arrive (plus courte ou aussi haute) ou non.
  const [held, setHeld] = useState(0)
  const measure = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    setHeld((before) => Math.max(before, height))
  }
  return (
    <View style={{ minHeight: held, justifyContent: 'center' }}>
      {origin ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {/* La photo de l'auteur, décor : la phrase le nomme déjà (une pile sans `label` est
              cachée aux lecteurs d'écran). */}
          <View style={{ flexShrink: 0 }}>
            <AvatarStack members={[origin.author]} />
          </View>
          {/* flexShrink et minWidth 0 : à 200 % de texte, la phrase passe à la ligne au lieu de
              sortir de la feuille (sur le web, une vue ne rétrécit pas d'elle-même). */}
          <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
            <Text variant="callout" tone="secondary">
              {origin.text}
            </Text>
          </View>
        </View>
      ) : (
        // Le gabarit de la place : deux lignes vides, invisibles et cachées aux lecteurs d'écran.
        <View {...hiddenFromReaders} style={{ opacity: 0 }} onLayout={measure}>
          <Text variant="callout">{`${BLANK}\n${BLANK}`}</Text>
        </View>
      )}
    </View>
  )
}
