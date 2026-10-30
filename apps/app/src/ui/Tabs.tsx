// Des onglets (tranche R2) : deux ou trois vues qui se partagent un même panneau, une seule
// visible à la fois (« Se connecter » / « Créer un compte » sur ordinateur). La rangée des onglets
// est une capsule posée sur le verre, l'onglet choisi en relief (la « goutte » blanche, comme le
// choix actif d'un Segmented) ; le contenu de l'onglet choisi s'affiche dessous.
//
// Pour les lecteurs d'écran, c'est le modèle « onglets » de WAI-ARIA : une liste d'onglets
// (`tablist`, nommée), un `tab` par onglet (qui dit s'il est choisi, `aria-selected`, et quel
// panneau il commande, `aria-controls`), et un seul panneau (`tabpanel`), celui de l'onglet choisi,
// nommé par son onglet (`aria-labelledby`).
// Au clavier (web) : Tab ne s'arrête qu'une fois dans la rangée, sur l'onglet choisi (« tabIndex
// itinérant », comme Segmented) ; les flèches gauche et droite passent à l'onglet voisin en le
// choisissant (en faisant le tour), Début et Fin vont au premier et au dernier. Choisir un onglet
// au clavier le montre aussitôt : il n'y a rien à valider.
import { layout, radii, space } from '@ruche/brand'
import { type ReactNode, useId, useRef } from 'react'
import { Platform, Pressable, useWindowDimensions, View } from 'react-native'
import { focusWithoutScroll } from './focus'
import { Surface, type SurfaceVariant } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Un onglet : sa clé (stable, sert d'identifiant), son libellé et ce qu'il montre. */
export type Tab<K extends string> = {
  key: K
  label: string
  content: ReactNode
}

type Props<K extends string> = {
  /** Le nom de la rangée d'onglets, lu par les lecteurs d'écran (« Connexion ou inscription »). */
  label: string
  tabs: readonly Tab<K>[]
  /** La clé de l'onglet choisi. */
  selected: K
  onSelect: (key: K) => void
  /**
   * La matière de la capsule : glass (par défaut) sur le miel ou une lumière, grouped sur une
   * surface pleine.
   */
  variant?: Extract<SurfaceVariant, 'glass' | 'grouped'>
}

type KeyEvent = { key: string; preventDefault: () => void }

export function Tabs<K extends string>({
  label,
  tabs,
  selected,
  onSelect,
  variant = 'glass',
}: Props<K>) {
  const { colors, shadows } = useTheme()
  // fontScale : la taille de texte choisie sur l'appareil. Très agrandis, les onglets vont à la
  // ligne plutôt que de se chevaucher.
  const { fontScale } = useWindowDimensions()
  const large = fontScale >= 1.5
  // useId : un identifiant unique et stable entre le serveur et le navigateur (la page web est
  // pré-rendue), pour relier chaque onglet à son panneau.
  const id = useId()
  const tabId = (key: K) => `${id}-tab-${key}`
  const panelId = (key: K) => `${id}-panel-${key}`
  // Les onglets, pour y poser le focus quand une flèche passe au voisin.
  const refs = useRef<(View | null)[]>([])

  // Le seul onglet que Tab atteint : l'onglet choisi (le premier, si la clé n'est pas parmi les
  // onglets).
  const selectedIndex = tabs.findIndex((tab) => tab.key === selected)
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex

  // Choisir l'onglet de rang `index` et lui donner le focus (flèches, Début, Fin).
  const go = (index: number) => {
    const tab = tabs[index]
    if (!tab) return
    onSelect(tab.key)
    // Sans défilement : la page reste où elle est, l'onglet est déjà en vue.
    focusWithoutScroll(refs.current[index])
  }

  // Sur le web : les flèches, Début et Fin. Espace et Entrée : react-native-web les gère déjà pour
  // un onglet (il le traite comme un bouton).
  const webProps = (index: number) =>
    Platform.OS === 'web'
      ? {
          tabIndex: index === tabStop ? (0 as const) : (-1 as const),
          onKeyDown: (event: KeyEvent) => {
            const last = tabs.length - 1
            const target =
              event.key === 'ArrowRight'
                ? index === last
                  ? 0
                  : index + 1
                : event.key === 'ArrowLeft'
                  ? index === 0
                    ? last
                    : index - 1
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : null
            if (target === null) return
            // preventDefault : la flèche ne fait pas défiler la page.
            event.preventDefault()
            go(target)
          },
        }
      : null

  const current = tabs[tabStop]

  return (
    <View style={{ gap: space.xl }}>
      <Surface variant={variant} radius={large ? 'group' : 'pill'} padding="xxs">
        {/* La rangée : rôle « tablist ». Pas d'`accessible` : sur iOS, VoiceOver doit atteindre
            chaque onglet, pas la rangée d'un bloc. */}
        <View
          role="tablist"
          aria-label={label}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs }}
        >
          {tabs.map((tab, index) => {
            const chosen = index === tabStop
            return (
              <Pressable
                key={tab.key}
                ref={(node) => {
                  refs.current[index] = node
                }}
                nativeID={tabId(tab.key)}
                role="tab"
                accessibilityLabel={tab.label}
                aria-selected={chosen}
                // Le panneau que l'onglet commande (`aria-controls` manque aux types de React
                // Native ; sur téléphone, la propriété est ignorée).
                {...{ 'aria-controls': panelId(tab.key) }}
                onPress={() => onSelect(tab.key)}
                {...webProps(index)}
                style={{
                  // Les onglets se partagent la largeur ; chacun part de la taille de son texte
                  // (flexBasis auto) et passe à la ligne s'il ne tient plus. Très agrandis, chacun
                  // sa ligne entière.
                  flexGrow: 1,
                  flexBasis: large ? '100%' : 'auto',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: layout.touchTarget,
                  paddingHorizontal: space.lg,
                  paddingVertical: space.xs,
                  borderRadius: radii.pill,
                  ...(chosen
                    ? { backgroundColor: colors.surfaceRaised, boxShadow: shadows.soft }
                    : null),
                }}
              >
                {/* L'onglet choisi : l'encre sur la goutte, jour et nuit (paire onHoney /
                    surfaceRaised de packages/brand/src/colors.ts), comme dans Segmented. */}
                <Text
                  variant="callout"
                  weight={chosen ? 700 : 500}
                  tone={chosen ? 'onHoney' : 'muted'}
                  align="center"
                  selectable={false}
                >
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Surface>
      {/* Un seul panneau : celui de l'onglet choisi, nommé par son onglet. Changer d'onglet le
          remplace (clé) : les champs d'un formulaire ne gardent pas la saisie de l'autre. */}
      {current ? (
        <View
          key={current.key}
          nativeID={panelId(current.key)}
          role="tabpanel"
          aria-labelledby={tabId(current.key)}
        >
          {current.content}
        </View>
      ) : null}
    </View>
  )
}
