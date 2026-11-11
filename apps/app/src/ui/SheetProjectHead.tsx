// L'en-tête projet d'une feuille du coin des testeurs (tranche R7b, planches « Feuille Appel » et
// « Feuille Retour », point 7 des planches validées) : sous le titre de la feuille (« Nouvel appel »,
// « Ton retour »), une rangée qui rappelle pour quel projet on écrit et à qui. La vignette du projet,
// son titre en gras, une ligne discrète dessous (« Pour tes 12 testeurs », « de Papi Jean »), et à
// droite, quand la feuille a été rouverte avec un brouillon, « Effacer le brouillon ».
//
// - La vignette est un décor, comme `ProjectThumb` dans la fenêtre « Supprimer » : le titre écrit à
//   côté nomme déjà le projet. Elle est cachée aux lecteurs d'écran et rien n'y est touchable ; sans
//   photo, elle garde sa place sur la lumière miel d'une couverture sans photo (`ProjectCover`).
// - Le titre n'est pas un titre de la page (il n'a pas de niveau) : la feuille a déjà le sien, et le
//   projet n'ouvre pas une section, il précise ce qu'on écrit.
// - L'action est un lien en texte (`TextLink`) qui agit sur place : un bouton pour les lecteurs
//   d'écran, de 44 points de haut et de large au moins. Elle se lit après le titre et la ligne de
//   dessous (ordre de la rangée).
// - À 320 points et 200 % de texte, la rangée passe à la ligne : l'action descend sous le texte,
//   rangée à droite, plutôt que d'écraser le titre en une lettre par ligne.
import { layout, space } from '@ruche/brand'
import { View } from 'react-native'
import type { ImageSource } from './image'
import { ProjectCover } from './ProjectCover'
import { Text } from './Text'
import { TextLink } from './TextLink'

type Props = {
  /** La première photo du projet ; null : la lumière miel d'un projet sans photo. */
  thumb: ImageSource | null
  /** Le titre du projet, tel que le membre l'a écrit. */
  title: string
  /** Pour qui l'on écrit, déjà traduit (« Pour tes 12 testeurs », « de Papi Jean »). */
  subtitle: string
  /** L'action de droite (« Effacer le brouillon ») ; sans elle, rien à droite. */
  action?: { label: string; onPress: () => void }
}

// La vignette, comme sur les planches : 40 points, la taille de la pastille d'icône d'une ligne.
const THUMB = 40
// La place que la vignette et le texte demandent avant de laisser l'action passer dessous : la
// vignette (40), l'écart (12) et une centaine de points pour le titre (même calcul que `TesterRow`).
// Dans une feuille de téléphone (390 points moins ses marges), l'action tient sur la ligne du titre
// à la taille de texte ordinaire.
const TEXT_BASIS = 160

export function SheetProjectHead({ thumb, title, subtitle, action }: Props) {
  return (
    // Une rangée qui passe à la ligne quand la place manque (texte agrandi, téléphone étroit).
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space.md,
      }}
    >
      {/* La vignette et le texte restent ensemble : seule l'action passe à la ligne. Pas `flex: 1`
          (base nulle, qui ne passe jamais à la ligne sur le web) : une base réelle, puis toute la
          place qui reste. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: TEXT_BASIS,
          minWidth: 0,
          // Une ligne de 44 points au moins, comme l'action : la rangée garde sa hauteur avec ou
          // sans elle (rien ne bouge quand le brouillon s'efface et que l'action part).
          minHeight: layout.touchTarget,
        }}
      >
        <View
          // Caché aux lecteurs d'écran, partout (web, iOS, Android), et intouchable : un décor.
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          // Elle ne s'étire ni ne rétrécit : la photo garde son cadre carré.
          style={{ width: THUMB, flexShrink: 0 }}
        >
          <ProjectCover
            height={THUMB}
            radius="code"
            image={thumb ? { source: thumb, label: '' } : null}
          />
        </View>
        {/* Le texte prend la place qui reste et peut rétrécir ; un titre long passe sur plusieurs
            lignes, il ne se coupe jamais par « … ». */}
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
          <Text variant="callout" weight={700}>
            {title}
          </Text>
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        </View>
      </View>
      {action ? (
        // Rangée à droite, sur la ligne du titre comme dessous (marge automatique) ; jamais
        // rétrécie (charte : un bouton de la rangée ne rétrécit pas).
        <View style={{ marginLeft: 'auto', flexShrink: 0, maxWidth: '100%' }}>
          <TextLink label={action.label} onPress={action.onPress} role="button" tone="muted" />
        </View>
      ) : null}
    </View>
  )
}
