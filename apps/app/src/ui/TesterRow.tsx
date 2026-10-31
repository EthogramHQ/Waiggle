// Une ligne de « Ils cherchent des testeurs », dans la colonne de droite du Fil sur ordinateur
// (refonte, tranche R4, planche R4-Fil-Desktop) : la vignette d'un projet, son titre, son auteur, et
// « Tester » en miel à droite. La petite sœur de `TesterCard` (le carrousel d'Explorer), avec les
// mêmes gardes :
// - deux liens frères, jamais l'un dans l'autre (relecture de l'interface, ui-4) : la ligne
//   (vignette, titre, auteur) ouvre la page du projet, nommée par le titre ; « Tester » est posé à
//   côté, et non dedans ;
// - « Tester » est annoncé comme un site externe, et nommé d'après le projet (« Tester Carnet de
//   cafés ») : une colonne en montre plusieurs ;
// - une seule garde contre la double tape pour les deux liens (`useTapGuard`) : la seconde tape d'un
//   « Tester » ne tombe pas, à côté, sur le lien de la ligne ;
// - la ligne ne connaît pas l'adresse de la démo : « Tester » appelle `onTest`, que l'écran fait
//   passer par la page d'avertissement des liens externes (`/out`, relecture de sécurité sec-A7).
// Le corps de la ligne est un `ListRow` (la vignette à la place de l'icône, le titre en libellé,
// l'auteur en précision) : mêmes marges, même hauteur et mêmes lettres que les autres lignes d'un
// `ListGroup`. Mais le lien de la ligne et « Tester » se posent autour de lui, pas par son `onPress` :
// un `ListRow` touchable range tout ce qui est à droite (`trailing`, `accessory`) dans son propre
// bouton, où « Tester » serait un lien dans un lien ; et il ne devient un lien qu'avec une adresse
// (`href`), que la ligne n'a pas.
import { layout, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import { ListRow } from './ListGroup'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  title: string
  /** Le nom affiché de l'auteur (« Sam Petit »). */
  author: string
  /** La photo de couverture, en vignette ; sans photo, la lumière miel des couvertures. */
  image: CoverImage | null
  /** Ouvre la démo (l'écran passe par la page d'avertissement des liens externes). */
  onTest: () => void
  /**
   * Ouvre la page du projet : la vignette, le titre et l'auteur deviennent un lien nommé par le
   * titre. Sans lui (le catalogue, un aperçu), la ligne n'est pas touchable, seul « Tester » l'est.
   */
  onOpen?: () => void
}

// La vignette : un peu plus grande que la pastille d'icône d'une ligne (40), pour qu'on reconnaisse
// la photo, comme sur la planche ; ses coins, ceux d'un petit bloc.
const THUMB = 48

export function TesterRow({ title, author, image, onTest, onOpen }: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const web = Platform.OS === 'web'
  // Une seule garde pour les deux liens de la ligne (voir tapGuard.ts).
  const guard = useTapGuard()
  const test = guard(onTest)
  const open = onOpen ? guard(onOpen) : undefined

  // Le nom lu : « Tester Carnet de cafés » (le texte affiché en tête, puis le projet). Il quitte
  // l'appli : sur le web, où l'indice n'existe pas, le nom le dit (« …, ouvre un site externe ») ;
  // sur téléphone, l'indice lu après le nom.
  const name = t(($) => $.explore.testProject, { title })
  const outside = t(($) => $.common.externalSite)

  const body = (
    <ListRow
      label={title}
      detail={author}
      leading={
        // La vignette ne s'étire ni ne rétrécit : la photo garde son cadre carré.
        <View style={{ width: THUMB, flexShrink: 0 }}>
          <ProjectCover height={THUMB} radius="code" image={image} />
        </View>
      }
    />
  )

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space.lg }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {open ? (
          // Le lien de la ligne, nommé par le titre du projet. Comme une ligne touchable d'un
          // `ListRow` : le fond s'assombrit sous le doigt, et l'anneau du clavier se dessine à
          // l'intérieur (le groupe qui l'entoure rogne ce qui dépasse).
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={title}
            // Entrée ouvre la page sur le web, comme un vrai lien (voir keyboard.ts).
            {...enterActivates(open)}
            onPress={open}
            {...insetFocus}
            style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceGrouped } : null)}
          >
            {body}
          </Pressable>
        ) : (
          body
        )}
      </View>
      {/* « Tester », frère du lien de la ligne. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={web ? `${name}, ${outside}` : name}
        accessibilityHint={web ? undefined : outside}
        {...enterActivates(test)}
        onPress={test}
        style={{
          // 44 points à toucher autour de la pastille dessinée, plus petite (hitSlop est ignoré
          // sur le web) ; le rayon suit la pastille, pour l'anneau du clavier, qui se dessine
          // autour de la zone : un anneau intérieur se perdrait sur le miel.
          minHeight: layout.touchTarget,
          minWidth: layout.touchTarget,
          // Jamais plus large que la moitié de la ligne, même à 200 % de texte : le titre garde
          // sa place.
          maxWidth: '50%',
          flexShrink: 1,
          justifyContent: 'center',
          borderRadius: radii.pill,
        }}
      >
        {({ pressed }) => (
          // La pastille miel, comme celle de `TesterCard` : son texte encre (onHoney) se lit sur le
          // miel.
          <View
            style={{
              alignSelf: 'flex-end',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              minHeight: layout.controlHeight.small,
              paddingHorizontal: space.md,
              borderRadius: radii.pill,
              backgroundColor: pressed ? colors.honeyPressed : colors.honey,
              boxShadow: `${shadows.highlight}, ${shadows.honey}`,
            }}
          >
            <Text variant="callout" weight={700} tone="onHoney" numberOfLines={1}>
              {t(($) => $.explore.test)}
            </Text>
            {/* La flèche est décorative : le nom lu dit déjà que le lien sort de l'appli. */}
            <View aria-hidden>
              <Icon name="arrow-up-right" size={space.lg} tone="onHoney" />
            </View>
          </View>
        )}
      </Pressable>
    </View>
  )
}
