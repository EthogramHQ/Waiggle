// Ce que la page de sortie pose sur sa feuille claire (R5a, planches `R5a-Portail`) : « Tu quittes
// Waiggle pour », le nom du site en gras et en entier, son adresse complète en petit, la ligne « La
// démo de …, ajoutée par … » quand elle a lieu d'être, l'encadré de prudence, puis « Ouvrir le site ↗ »
// (miel) et « Rester sur Waiggle », puis, sous les boutons, la ligne des testeurs. L'écran (screens/LeavingScreen.tsx) décide de l'adresse, de la
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
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, View } from 'react-native'
import { AvatarStack, type StackMember } from './AvatarStack'
import { useHoldUnderCard } from './BrandAmbiance'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'
import { Callout } from './Callout'
import { Stack } from './Stack'
import { Text } from './Text'
import { TextLink, TextLinkShape } from './TextLink'
import { useTapsAllowed } from './tapGuard'

/** La ligne « La démo de … » : sa phrase toute faite, et l'auteur dont la photo la précède. */
export type LeavingOrigin = { text: string; author: StackMember }

/** La ligne des testeurs : le nom de l'auteur, et où mène le lien (la page du projet). */
export type LeavingTesters = { name: string; onOpenProject: () => void }

type Props = {
  /** Le nom du site (« carnet-cafes.vercel.app »), tel que l'adresse le donne. */
  host: string
  /** L'adresse complète, telle qu'elle sera ouverte. */
  href: string
  /** La ligne « La démo de … », ou null (pas encore là, ou n'a pas lieu d'être). */
  origin: LeavingOrigin | null
  /** Une ligne peut encore arriver : sa place est gardée dès maintenant (voir l'en-tête). */
  holdOrigin?: boolean
  /**
   * La ligne des testeurs (R7a) : « Tu veux aider Léa ? », puis le lien « Rejoins les testeurs depuis
   * la page du projet. » qui mène à cette page (`onOpenProject`). `null` ou absente : pas de ligne.
   * L'écran décide quand elle a lieu d'être. Elle se pose sous les boutons, sans place gardée dans
   * la feuille : sa venue ne déplace rien de ce qui la précède. Sur ordinateur, où la carte est
   * centrée en hauteur, sa place est gardée sous la carte tant qu'elle peut venir (`holdOrigin`).
   */
  testers?: LeavingTesters | null
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

export function LeavingSheet({
  host,
  href,
  origin,
  holdOrigin = false,
  testers = null,
  onOpen,
  onStay,
}: Props) {
  const { t } = useTranslation()
  // RF (S1b) : la tape qui a ouvert cette page (un double clic sur « Tester ») ne doit pas ouvrir le
  // site dans la foulée. « Ouvrir le site » ignore les tapes pendant TAP_GUARD_MS après le montage,
  // comme les boutons d'une fenêtre (Dialog) ; « Rester sur Waiggle » n'a rien de définitif.
  const tapsAllowed = useTapsAllowed(true, true)
  // Sur ordinateur, la carte est centrée en hauteur : la ligne des testeurs qui arrive sous les
  // boutons la ferait grandir et se recentrer, et « Ouvrir le site » remonterait de 43 px sous la
  // souris (mesure de R7a, à 1440 px). Tant qu'elle peut venir (un lien de démo, `holdOrigin`), sa
  // place est donc gardée sous la carte, sur le miel ; elle y reste si la ligne ne vient pas (la
  // carte, déjà centrée avec elle, ne redescend pas). Sur téléphone, rien n'est gardé : la feuille
  // grandit vers le bas sans rien déplacer.
  useHoldUnderCard(holdOrigin && !testers ? TestersHold : null)
  return (
    <>
      {/* align="stretch" : les textes prennent toute la largeur de la feuille, et un nom de site
          très long se coupe (breakAnywhere) au lieu de sortir de l'écran. */}
      <Stack gap="xs" align="stretch">
        {/* Le titre se lit en entier, avec le site (« Tu quittes Waiggle pour carnet-cafes… ») : un
            lecteur d'écran qui parcourt la page par ses titres ne doit pas entendre une phrase
            coupée. À l'œil, rien ne change : la phrase d'un côté, le nom du site en grand dessous. */}
        <Text
          variant="callout"
          weight={600}
          tone="secondary"
          heading={1}
          accessibilityLabel={t(($) => $.leaving.toHost, { host })}
        >
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
        <Button
          label={t(($) => $.leaving.open)}
          icon="arrow-up-right"
          iconAfter
          onPress={() => {
            if (tapsAllowed) onOpen()
          }}
        />
        <Button label={t(($) => $.leaving.stay)} variant="secondary" onPress={onStay} />
      </ButtonPair>
      {/* Sous les boutons, donc après l'avertissement de sécurité (relecture juridique) : ce qui
          arrive avec le projet ne pousse rien de ce qui est au-dessus, « Ouvrir le site » reste où
          le doigt va le chercher (R7a, des-C2). Aucune place n'est gardée dans la feuille : rien ne
          la précède (sur ordinateur, elle l'est sous la carte : voir useHoldUnderCard plus haut). */}
      {testers ? <TestersLine testers={testers} /> : null}
    </>
  )
}

/**
 * Une ligne dont la place est gardée : son contenu quand il est là, sinon un gabarit invisible de
 * deux lignes de texte. La hauteur gardée est celle de ce gabarit, mesurée une fois ; elle reste
 * ensuite, que le contenu arrive (plus court ou aussi haut) ou non.
 */
function HeldLine({ children }: { children: ReactNode | null }) {
  const [held, setHeld] = useState(0)
  const measure = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    setHeld((before) => Math.max(before, height))
  }
  return (
    <View style={{ minHeight: held, justifyContent: 'center' }}>
      {children ?? (
        // Le gabarit de la place : deux lignes vides, invisibles et cachées aux lecteurs d'écran.
        <View {...hiddenFromReaders} style={{ opacity: 0 }} onLayout={measure}>
          <Text variant="callout">{`${BLANK}\n${BLANK}`}</Text>
        </View>
      )}
    </View>
  )
}

/**
 * La forme de la ligne des testeurs : la phrase, puis, dessous et rangé à gauche, le lien. Commune
 * à la ligne et à son gabarit (`TestersHold`) : la place gardée a ainsi la hauteur exacte de ce qui
 * la reprend.
 */
function TestersShape({ lead, link }: { lead: string; link: ReactNode }) {
  return (
    <Stack gap="xxs" align="stretch">
      <Text variant="callout" tone="secondary">
        {lead}
      </Text>
      <View style={{ alignSelf: 'flex-start' }}>{link}</View>
    </Stack>
  )
}

/** La ligne des testeurs : la phrase, puis le lien vers la page du projet (qui seule inscrit). */
function TestersLine({ testers }: { testers: LeavingTesters }) {
  const { t } = useTranslation()
  return (
    <TestersShape
      lead={t(($) => $.project.testers.leavingLead, { name: testers.name })}
      // Un lien et non un bouton : il mène à la page du projet ; ouvrir la démo ne rend jamais
      // testeur, et ce lien non plus (l'inscription se fait depuis la page).
      link={
        <TextLink label={t(($) => $.project.testers.leavingLink)} onPress={testers.onOpenProject} />
      }
    />
  )
}

/**
 * Le gabarit de la ligne des testeurs, pour garder sa place sous la carte sur ordinateur (voir
 * useHoldUnderCard dans ui/BrandAmbiance.tsx) : la même forme, invisible. Le lien n'y est que
 * dessiné (`TextLinkShape`, l'allure même de `TextLink`) : aucun lien qu'on atteindrait au clavier
 * dans une place vide. Le nom de l'auteur n'est pas encore connu : une espace insécable le remplace
 * (un nom très long, qui passerait à la ligne, ferait encore bouger la carte d'une demi-ligne ; les
 * noms tiennent d'ordinaire sur la ligne).
 */
function TestersHold() {
  const { t } = useTranslation()
  return (
    <TestersShape
      lead={t(($) => $.project.testers.leavingLead, { name: BLANK })}
      link={<TextLinkShape label={t(($) => $.project.testers.leavingLink)} />}
    />
  )
}

/** La ligne « La démo de … », ou sa place gardée, vide, tant qu'elle n'est pas là. */
function OriginLine({ origin }: { origin: LeavingOrigin | null }) {
  return (
    <HeldLine>
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
      ) : null}
    </HeldLine>
  )
}
