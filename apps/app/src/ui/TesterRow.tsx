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
import { space } from '@ruche/brand'
import { Pressable, View } from 'react-native'
import { enterActivates } from './keyboard'
import { ListRow } from './ListGroup'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { TestLink } from './TestLink'
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
// La place que le lien de la ligne demande avant de laisser « Tester » passer dessous : ses marges
// (2 × 16), la vignette (48), l'écart (12) et une centaine de points pour le titre. Dans la colonne
// de droite (320 points), « Tester » tient sur la ligne du titre à la taille de texte ordinaire.
const LINK_BASIS = 180

export function TesterRow({ title, author, image, onTest, onOpen }: Props) {
  const { colors } = useTheme()
  // Une seule garde pour les deux liens de la ligne (voir tapGuard.ts).
  const guard = useTapGuard()
  const test = guard(onTest)
  const open = onOpen ? guard(onOpen) : undefined

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
    // Une rangée qui passe à la ligne : quand le texte est agrandi et que la place manque (200 %,
    // une colonne étroite), « Tester » passe sous le titre au lieu de l'écraser en une lettre par
    // ligne (essai du 31/10 à 320 points et 200 %).
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingRight: space.lg,
      }}
    >
      {/* Pas `flex: 1` (base nulle, qui ne passe jamais à la ligne) : une base réelle, puis
          toute la place qui reste. */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: LINK_BASIS, minWidth: 0 }}>
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
      <TestLink
        title={title}
        onPress={test}
        size="small"
        // Rangé à droite, sur la ligne du titre comme sous elle (marge automatique). La marge
        // verticale ne change rien sur une seule ligne (la ligne est plus haute) ; passé dessous,
        // « Tester » ne colle pas au trait suivant.
        style={{ marginLeft: 'auto', marginVertical: space.sm }}
      />
    </View>
  )
}
