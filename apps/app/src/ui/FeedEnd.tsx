// Le bas d'un fil : « Afficher la suite » tant qu'il en reste, puis « Tu es à jour ». Pas de
// défilement sans fin : on sait où le fil s'arrête, et un bouton se prend aussi au clavier. Si la
// page suivante n'arrive pas, le message d'erreur et « Réessayer » se mettent ici, sous les cartes
// déjà lues, qui restent en place.
//
// Miel 2 (R1) : au bout du fil de l'accueil, « Tu es à jour » est un petit moment de marque, une
// ambiance locale de « miel vif » (`ambiance="brand"`). Les autres listes (commentaires,
// notifications, membres bloqués, modération) gardent leur « C'est tout » discret.
import { honeyLight, radii, type Scheme, space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Button } from './Button'
import { Icon } from './Icon'
import { Notice } from './Notice'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type State = 'more' | 'loading' | 'end' | 'error'

type Props = {
  /** more : il reste des pages ; loading : la suivante arrive ; end : tout est lu ; error : raté. */
  state: State
  moreLabel: string
  endLabel: string
  onMore: () => void
  /** Le message quand la page suivante n'a pas pu se charger, et le bouton pour réessayer. */
  errorLabel?: string
  retryLabel?: string
  /**
   * La fin du fil :
   * - light (par défaut) : une ligne discrète, une coche et le texte (« C'est tout ») ;
   * - brand : le fil de l'accueil, « Tu es à jour » dans un bloc de miel vif. Le texte y est posé
   *   sur un verre (`panel`), dont les couples sont mesurés sur le miel et sur le noir : le miel de
   *   nuit va d'un cœur clair à un bord presque noir, aucun texte ne s'y lirait partout sans verre.
   */
  ambiance?: 'brand' | 'light'
}

// Le peu du navigateur dont on a besoin ici : l'élément qui a le focus, et savoir si un élément en
// contient un autre. (Les types de React Native ne décrivent pas la page web.)
type WebNode = { contains?: (node: unknown) => boolean; focus?: (options?: object) => void }
const activeElement = () =>
  (globalThis as { document?: { activeElement: unknown } }).document?.activeElement

export function FeedEnd({
  state,
  moreLabel,
  endLabel,
  onMore,
  errorLabel,
  retryLabel,
  ambiance = 'light',
}: Props) {
  const { scheme } = useTheme()
  // Quand la dernière page arrive, le bouton « Afficher la suite » laisse la place à « Tu es à
  // jour ». Si le focus du clavier était sur ce bouton, il passe sur ce message (tabIndex -1 :
  // focusable sans être une étape de la touche Tab) au lieu de se perdre. preventScroll : la page
  // ne saute pas jusqu'à lui, on reste sur les cartes qui viennent d'arriver.
  const button = useRef<View>(null)
  const end = useRef<View>(null)
  const hadFocus = useRef(false)
  // Deux clics dans le même instant arrivent avant que l'écran ne se redessine en « chargement » :
  // ce drapeau, posé au premier clic, fait ignorer le second. Il retombe dès que l'état change.
  const asked = useRef(false)
  useEffect(() => {
    if (state !== 'loading') asked.current = false
  }, [state])
  const more = () => {
    if (asked.current) return
    asked.current = true
    const node = button.current as unknown as WebNode | null
    hadFocus.current = Platform.OS === 'web' && Boolean(node?.contains?.(activeElement()))
    onMore()
  }
  useEffect(() => {
    if (state !== 'end' || !hadFocus.current) return
    hadFocus.current = false
    ;(end.current as unknown as WebNode | null)?.focus?.({ preventScroll: true })
  }, [state])

  if (state === 'end' && ambiance === 'brand') {
    return (
      <View
        ref={end}
        {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
        style={{
          borderRadius: radii.ambiance,
          overflow: 'hidden',
          alignItems: 'center',
          gap: space.lg,
          paddingVertical: space.huge,
          paddingHorizontal: space.xl,
          marginTop: space.md,
        }}
      >
        <HoneyGlow scheme={scheme} />
        {/* R1 F2 : Mascot sleep ici (l'abeille endormie, au-dessus du verre, centrée). */}
        {/* Le verre au centre du bloc, à la largeur de son texte (Surface, sans `fill`, se range à
            gauche : la vue autour le centre). */}
        <View style={{ alignSelf: 'center', maxWidth: '100%' }}>
          <Surface variant="panel" radius="pill">
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space.sm,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: space.md,
                paddingHorizontal: space.xl,
              }}
            >
              <Icon name="check-circle" size={24} tone="default" />
              <Text variant="title3">{endLabel}</Text>
            </View>
          </Surface>
        </View>
      </View>
    )
  }
  if (state === 'end') {
    return (
      <View
        ref={end}
        {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
        style={{
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: space.lg,
        }}
      >
        <Icon name="check-circle" size={20} tone="muted" />
        <Text tone="muted">{endLabel}</Text>
      </View>
    )
  }
  if (state === 'error') {
    return (
      <View style={{ gap: space.md, paddingVertical: space.md }}>
        {errorLabel ? <Notice message={errorLabel} /> : null}
        <View ref={button} style={{ alignSelf: 'center' }}>
          <Button label={retryLabel ?? moreLabel} onPress={more} variant="secondary" />
        </View>
      </View>
    )
  }
  return (
    // Le même bouton pendant le chargement, occupé : il garde sa place et le focus, et un second
    // appui ne redemande pas la page (Button ignore les appuis tant que loading est vrai).
    <View ref={button} style={{ alignSelf: 'center', paddingVertical: space.md }}>
      <Button label={moreLabel} onPress={more} variant="secondary" loading={state === 'loading'} />
    </View>
  )
}

/**
 * Le miel vif du bloc « Tu es à jour » : la même lumière miel que les écrans de marque (`honeyLight`,
 * @ruche/brand), une ellipse dont le cœur clair est en haut au centre, là où se pose le message, et
 * qui finit dans l'ambre (de nuit, dans le noir). Du décor : caché aux lecteurs d'écran, il ne bouge
 * pas (rien à calmer avec « Réduire les animations »). L'identifiant dépend du thème seulement, pour
 * que la page préparée sur le serveur et le navigateur écrivent le même.
 */
function HoneyGlow({ scheme }: { scheme: Scheme }) {
  const id = `feed-end-honey-${scheme}`
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient
            id={id}
            cx={0.5}
            cy={0.3}
            r={1}
            // Un dégradé SVG ne connaît que des cercles : on l'étire en ellipse autour de son centre,
            // plus large que haute, pour que la lumière s'étale sous le message.
            gradientTransform="translate(0.5 0.3) scale(0.75 1.1) translate(-0.5 -0.3)"
          >
            {honeyLight[scheme].map((stop) => (
              <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}
