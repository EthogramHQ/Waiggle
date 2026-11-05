// Un texte long replié après quelques lignes, avec « Lire la suite » pour le déplier sur place et
// « Réduire » pour le replier (R5b : un commentaire de plus de 10 lignes). Le texte qui tient dans
// ces lignes s'affiche entier, sans bouton.
//
// Le composant ne dessine pas le texte lui-même : il reçoit une fonction (`children`) qui le
// dessine avec le nombre de lignes voulu (`numberOfLines`, ou `undefined` pour tout montrer). Ainsi
// un commentaire garde ses pastilles de mention (`MentionText`), une note son propre style, et
// `ReadMore` ne décide que du repli.
//
// Savoir si le texte dépasse ses lignes, une mesure par plateforme :
// - sur téléphone, le texte natif dit combien de lignes il occupe (`onTextLayout`, une entrée par
//   ligne), passé par le contexte de `textLayout.ts` au `Text` que dessine `children` ;
// - sur le web, react-native-web n'a pas `onTextLayout` : deux copies invisibles, cachées aux
//   lecteurs d'écran et au clavier, sont mesurées par `onLayout` : le texte entier, et le texte
//   coupé à une ligne (la hauteur d'une ligne). Le texte dépasse s'il est plus haut que `lines`
//   lignes.
// Les deux mesures se refont à chaque changement de mise en page : le repli suit la largeur de
// l'écran et la taille de texte de l'appareil (à 200 %, une ligne contient moins de mots, et le
// bouton apparaît plus tôt dans le texte).
//
// Le bouton garde le focus quand il change de libellé : c'est le même bouton (même place dans
// l'arbre), dont seul le texte change, et les lecteurs d'écran disent s'il est déplié
// (`aria-expanded`).
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, View } from 'react-native'
import { ActionDescription } from './CommentAction'
import { TextLink } from './TextLink'
import { TextLayoutContext, type TextLayoutListener } from './textLayout'

type Props = {
  /** Le nombre de lignes montrées replié (10, `COMMENT_FOLD_LINES`, par défaut). */
  lines?: number
  /**
   * Dessine le texte : `numberOfLines` est le nombre de lignes à montrer, ou `undefined` pour le
   * texte entier. À passer tel quel au `Text` de l'appli (ou au composant qui le dessine), qui
   * transmet la mesure des lignes. Sur le web, la fonction est appelée trois fois (le texte vu et
   * ses deux copies mesurées) : elle ne pose pas de `nativeID`, qui serait en trois exemplaires.
   */
  children: (numberOfLines: number | undefined) => ReactNode
  /**
   * Ce qui dit de quel texte parle le bouton, quand plusieurs « Lire la suite » se suivent (un par
   * commentaire : « Hugo Lefèvre : début du texte », ui-M1). Lu après le nom : indice
   * (`accessibilityHint`) sur téléphone, description (`aria-describedby`) sur le web.
   */
  hint?: string | undefined
  /** Déplié dès l'affichage (le catalogue montre ainsi l'état « déplié »). */
  initiallyExpanded?: boolean
}

/** Les deux hauteurs mesurées sur le web, en points ; `null` tant qu'on ne les connaît pas. */
type Heights = { full: number | null; line: number | null }

/**
 * La marge, en fraction de ligne : le texte entier dépasse s'il est plus haut que `lines` lignes et
 * demie. Une ligne de plus ajoute une ligne entière ; les arrondis de mise en page, une fraction de
 * point seulement.
 */
const SLACK_LINES = 0.5

/** Dépasse-t-il (web) ? Non tant qu'une des deux mesures manque : aucun bouton avant de savoir. */
export const overflowsLines = (heights: Heights, lines: number): boolean =>
  heights.full !== null &&
  heights.line !== null &&
  heights.line > 0 &&
  heights.full > heights.line * (lines + SLACK_LINES)

/**
 * Dépasse-t-il (téléphone) ? D'après le nombre de lignes que dit le texte natif. Un texte replié ne
 * compte que ses lignes montrées : exactement `lines` ne dit donc rien de neuf (replié, ou texte
 * qui tient tout juste), et l'on garde la réponse d'avant. Une mesure en retard, faite avant un
 * toucher, ne peut ainsi pas faire disparaître le bouton qui a le focus.
 */
export const overflowsCount = (count: number, lines: number, previous: boolean): boolean =>
  count > lines ? true : count < lines ? false : previous

export function ReadMore({ lines = 10, children, hint, initiallyExpanded = false }: Props) {
  const { t } = useTranslation()
  const web = Platform.OS === 'web'
  const [expanded, setExpanded] = useState(initiallyExpanded)

  // Téléphone : le nombre de lignes compté par le texte natif.
  const [countOverflows, setCountOverflows] = useState(false)
  const onTextLayout: TextLayoutListener = ({ nativeEvent }) => {
    const count = nativeEvent.lines.length
    setCountOverflows((previous) => overflowsCount(count, lines, previous))
  }

  // Web : les hauteurs des deux copies mesurées.
  const [heights, setHeights] = useState<Heights>({ full: null, line: null })
  const measure =
    (kind: keyof Heights) =>
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { height } = nativeEvent.layout
      setHeights((previous) =>
        previous[kind] === height ? previous : { ...previous, [kind]: height },
      )
    }

  const overflows = web ? overflowsLines(heights, lines) : countOverflows
  // Replié seulement s'il dépasse : un texte qui tient n'a pas de limite. Sur le web, replié dès
  // le premier dessin (un texte long ne s'affiche pas entier pour se replier ensuite) : les copies
  // mesurées disent s'il dépasse sans dépendre du texte vu. Sur téléphone, le texte natif ne
  // compte que les lignes qu'il montre : il s'affiche donc entier le temps de la première mesure.
  const folded = !expanded && (web ? !(heights.full !== null && !overflows) : overflows)
  const numberOfLines = folded ? lines : undefined

  // La couche invisible ne doit pas être atteinte par Tab sur le web (un lien de mention dedans
  // serait un arrêt fantôme) : l'attribut `inert`, que react-native-web ne transmet pas, posé sur
  // la balise elle-même.
  const hidden = useRef<View>(null)
  useEffect(() => {
    if (!web) return
    const node = hidden.current as unknown as HTMLElement | null
    node?.setAttribute?.('inert', '')
  }, [web])

  // L'identifiant du texte caché qui décrit le bouton (web), stable entre le pré-rendu et le
  // navigateur (useId).
  const descriptionId = useId()

  return (
    <View>
      {web ? (
        // overflow hidden : les copies mesurées, plus hautes que le texte replié, ne dépassent pas
        // du cadre (elles allongeraient la page qu'on fait défiler).
        <View style={{ overflow: 'hidden' }}>
          {children(numberOfLines)}
          <View
            ref={hidden}
            // Ni vues, ni lues, ni touchées : seulement mesurées.
            aria-hidden
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 }}
          >
            <View onLayout={measure('full')}>{children(undefined)}</View>
            <View onLayout={measure('line')}>{children(1)}</View>
          </View>
        </View>
      ) : (
        <TextLayoutContext.Provider value={onTextLayout}>
          {children(numberOfLines)}
        </TextLayoutContext.Provider>
      )}
      {overflows ? (
        // alignSelf : la zone à toucher reste autour du libellé, pas de toute la largeur.
        <View style={{ alignSelf: 'flex-start' }}>
          {hint ? <ActionDescription id={descriptionId} text={hint} /> : null}
          <TextLink
            role="button"
            label={
              expanded
                ? t(($) => $.project.comments.readLess)
                : t(($) => $.project.comments.readMore)
            }
            expanded={expanded}
            onPress={() => setExpanded((previous) => !previous)}
            describedById={hint ? descriptionId : undefined}
            hint={hint}
          />
        </View>
      ) : null}
    </View>
  )
}
