// Les places de la vitrine dans l'onglet « Vitrine de l'accueil » de la Modération (tranche R12,
// planche R12-Vitrine ; plan R12, décision 18) :
// - ShowcaseSlot : un projet mis en avant. Sa carte (`ShowcaseCard`, en taille de bande), puis, s'il
//   a changé depuis son entrée, « Modifié depuis la mise en avant », et son bouton « Retirer ». La
//   colonne a la largeur de la carte : la note passe à la ligne au lieu d'élargir la place ;
// - ShowcaseFreeSlot : une place libre, en pointillés de miel, de la taille d'une carte. Un simple
//   dessin, sans geste : on remplit la place depuis la liste des projets publics, en dessous.
//
// Plusieurs cartes portent le même bouton « Retirer » : son nom lu dit lequel (« Retirer Décollage !
// de l'accueil »), et la note « Modifié… » le décrit (`aria-describedby` sur le web, indice sur
// téléphone) : on l'entend en arrivant sur le bouton, avant de décider.
//
// Un projet retiré (relecture de design R12, point 1 ; piège 7a de la charte) : sa place **reste**,
// la carte comprise, avec le résultat (« Retiré de l'accueil ») à la place du bouton, au moins aussi
// haut (`DecidedZone`). Sans cela, la carte suivante glissait à sa place et son « Retirer » arrivait
// sous le doigt : une seconde tape, à 700 ms (après la garde de l'onglet), retirait aussi la voisine.
// C'est l'écran qui décide quand la place part (au prochain changement de vue).
import { borders, layout, radii, space } from '@ruche/brand'
import { type ReactNode, useId } from 'react'
import { View } from 'react-native'
import { Button } from './Button'
import { DecidedZone } from './DecidedZone'
import { Icon } from './Icon'
import { SHOWCASE_CARD_SIZE } from './ShowcaseCard'
import { Row } from './Stack'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type SlotProps = {
  /** La carte du projet (`ShowcaseCard`, taille `carousel`, la taille par défaut). */
  card: ReactNode
  /** La note sous la carte, déjà traduite (« Modifié depuis la mise en avant ») ; absente : rien. */
  note?: string | undefined
  /** Le bouton « Retirer » : son libellé, son nom lu (qui nomme le projet) et son geste. */
  remove: { label: string; spokenLabel: string; onPress: () => void; loading?: boolean }
  /**
   * Le résultat d'un retrait, déjà traduit (« Retiré de l'accueil ») : il prend la place du bouton,
   * et la place reste où elle était. Absent ou null : le bouton « Retirer ».
   */
  removed?: string | null | undefined
}

export function ShowcaseSlot({ card, note, remove, removed = null }: SlotProps) {
  // L'identifiant de la note, qui décrit le bouton sur le web.
  const noteId = `showcase-note-${useId()}`
  return (
    <View
      // La largeur de la carte, sans dépasser la colonne (un téléphone de 320 points, texte agrandi).
      style={{ width: SHOWCASE_CARD_SIZE.width, maxWidth: '100%', gap: space.sm }}
    >
      {card}
      {note ? (
        <Row gap="xs" align="start">
          {/* L'icône décore la note, lue juste à côté ; elle ne rétrécit pas sur le web. */}
          <View style={{ flexShrink: 0 }}>
            <Icon name="pencil-simple" size={16} tone="status" />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text variant="caption" weight={600} tone="secondary" nativeID={noteId}>
              {note}
            </Text>
          </View>
        </Row>
      ) : null}
      {/* La zone garde la hauteur du bouton quand le résultat le remplace, et rend le focus du
          clavier au résultat s'il est tombé avec le bouton touché. */}
      <DecidedZone
        result={removed}
        actions={
          <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
            <Button
              label={remove.label}
              spokenLabel={remove.spokenLabel}
              icon="x"
              variant="secondary"
              size="compact"
              onPress={remove.onPress}
              loading={remove.loading ?? false}
              describedById={note ? noteId : undefined}
              hint={note}
            />
          </View>
        }
      />
    </View>
  )
}

/** Une place libre de la vitrine : « + Une place libre », en pointillés, de la taille d'une carte. */
export function ShowcaseFreeSlot({ label }: { label: string }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: SHOWCASE_CARD_SIZE.width,
        maxWidth: '100%',
        // Une hauteur au moins : le texte agrandi l'allonge, comme une carte.
        minHeight: SHOWCASE_CARD_SIZE.height,
        borderWidth: borders.strong,
        borderStyle: 'dashed',
        borderColor: colors.dashed,
        borderRadius: radii.sheet,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        padding: space.md,
      }}
    >
      {/* Le « + » décore la phrase, lue seule : caché aux lecteurs d'écran. */}
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: layout.touchTarget,
          height: layout.touchTarget,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.honeySoft,
        }}
      >
        {/* Le brun de statut sur la crème : l'ambre n'y ferait pas 3:1 de jour (comme AddTile). */}
        <Icon name="plus" size={22} tone="status" />
      </View>
      <Text variant="callout" weight={600} tone="accent" align="center">
        {label}
      </Text>
    </View>
  )
}
