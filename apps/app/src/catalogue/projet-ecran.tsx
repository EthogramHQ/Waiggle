// La section « Cadre de la page projet » du catalogue (tranche R5a) : les trois pièces du cadre de
// page que la page d'un projet assemble, de jour et de nuit :
// - la place flottante de Screen (`floating`) : la capsule posée en bas, sans barre d'onglets
//   (la page projet) et au-dessus d'une barre, avec le toast qui monte au-dessus d'elle ;
// - le bouton du haut (`backLabel`) : l'icône seule sur téléphone, l'icône et « Retour » sur
//   ordinateur ;
// - les rangées de Columns, séparées par un trait (la galerie | l'en-tête, puis la description |
//   les commentaires), dans l'ordre de lecture.
// La capsule montrée ici est une silhouette (des icônes et des nombres) : la vraie,
// ui/ReactionCapsule.tsx, a sa propre section. Les cadres imitent un écran de téléphone : la place
// flottante s'y pose comme dans Screen, par le même composant (ScreenFloating).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { borders, radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Columns } from '../ui/Columns'
import { Icon, type IconName } from '../ui/Icon'
import { BackButton, ScreenFloating } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { Toast } from '../ui/Toast'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'
import { toastBottom } from '../ui/theme/toast'

const fr = {
  title: 'Cadre de la page projet',
  intro:
    'Ce que Screen et Columns offrent à la page d’un projet. En bas, une place flottante qui reste en vue pendant que la page défile : sa hauteur est réservée sous le contenu (rien ne passe dessous au focus), et un toast monte au-dessus d’elle. En haut, « Retour » écrit en toutes lettres sur ordinateur. Sur ordinateur, deux rangées de colonnes séparées par un trait, lues dans l’ordre : rangée 1 à gauche, rangée 1 à droite, puis la rangée 2.',
  floating: 'Place flottante, page sans barre d’onglets',
  floatingTabBar: 'Place flottante au-dessus de la barre d’onglets',
  floatingToast: 'Un toast au-dessus de la place flottante',
  back: 'Bouton du haut',
  backPhone: 'Téléphone : l’icône seule, nommée « Retour »',
  backWide: 'Ordinateur et tablette : l’icône et le texte',
  rows: 'Deux rangées de colonnes, un trait entre elles',
  day: 'jour',
  night: 'nuit',
  backLabel: 'Retour',
  copied: 'Prompt copié',
  tabBar: 'Barre d’onglets',
  paragraph:
    'Ce quiz grandit avec Yanis : plus il répond juste, plus c’est difficile. Le contenu défile sous la capsule, qui reste en bas de l’écran.',
  gallery: 'Galerie et capsule',
  header: 'Statut, titre, auteur, « Tester la démo », la recette',
  description: 'Description, prompt de départ, mises à jour, « Signaler ce projet »',
  comments: 'Commentaires',
}

const en: typeof fr = {
  title: 'Project page frame',
  intro:
    'What Screen and Columns offer the page of a project. At the bottom, a floating place that stays in view while the page scrolls: its height is reserved under the content (nothing goes under it on focus), and a toast rises above it. At the top, “Back” written out on a computer. On a computer, two rows of columns divided by a line, read in order: row 1 left, row 1 right, then row 2.',
  floating: 'Floating place, page without a tab bar',
  floatingTabBar: 'Floating place above the tab bar',
  floatingToast: 'A toast above the floating place',
  back: 'Top button',
  backPhone: 'Phone: the icon alone, named “Back”',
  backWide: 'Computer and tablet: the icon and the text',
  rows: 'Two rows of columns, a line between them',
  day: 'day',
  night: 'night',
  backLabel: 'Back',
  copied: 'Prompt copied',
  tabBar: 'Tab bar',
  paragraph:
    'This quiz grows with Yanis: the more he gets right, the harder it gets. The content scrolls under the capsule, which stays at the bottom of the screen.',
  gallery: 'Gallery and capsule',
  header: 'Status, title, author, “Try the demo”, the recipe',
  description: 'Description, starting prompt, updates, “Report this project”',
  comments: 'Comments',
}

type Labels = typeof fr

const noop = () => {}

// La silhouette de la capsule : les cinq icônes de réaction et leur nombre.
const capsuleItems: readonly { icon: IconName; count: number }[] = [
  { icon: 'sparkle', count: 9 },
  { icon: 'lightbulb', count: 14 },
  { icon: 'wrench', count: 4 },
  { icon: 'smiley', count: 6 },
  { icon: 'hands-clapping-fill', count: 21 },
]

// La hauteur simulée de la barre d'onglets et de la capsule, pour placer le toast comme le ferait
// le fournisseur (toastBottom), qui reçoit ces hauteurs mesurées.
const TAB_BAR = 72
const CAPSULE = 56

export function ProjectFrameCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.floating} — ${l[scheme]}`}>
              <PhoneFrame l={l} lift={space.lg} />
            </Example>
            <Example caption={`${l.floatingTabBar} — ${l[scheme]}`}>
              <PhoneFrame l={l} lift={TAB_BAR + space.sm} tabBar />
            </Example>
            <Example caption={`${l.floatingToast} — ${l[scheme]}`}>
              <PhoneFrame l={l} lift={space.lg} toast />
            </Example>
            <Example caption={`${l.back} — ${l[scheme]}`}>
              <Text variant="caption" tone="secondary">
                {l.backPhone}
              </Text>
              <BackButton label={l.backLabel} onPress={noop} />
              <Text variant="caption" tone="secondary">
                {l.backWide}
              </Text>
              <BackButton label={l.backLabel} withText onPress={noop} />
            </Example>
            <Example caption={`${l.rows} — ${l[scheme]}`}>
              <Columns
                divided
                rows={[
                  { main: <Block text={l.gallery} tall />, side: <Block text={l.header} tall /> },
                  { main: <Block text={l.description} />, side: <Block text={l.comments} /> },
                ]}
              />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/**
 * Un écran de téléphone en miniature : du contenu, la place flottante posée en bas (par
 * ScreenFloating, comme dans Screen), et au choix une barre d'onglets simulée ou un toast.
 */
function PhoneFrame({
  l,
  lift,
  tabBar = false,
  toast = false,
}: {
  l: Labels
  lift: number
  tabBar?: boolean
  toast?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height: 300,
        width: '100%',
        maxWidth: 390,
        overflow: 'hidden',
        borderRadius: radii.tile,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ padding: space.lg, gap: space.md }}>
        <Text variant="heading">{l.title}</Text>
        <Text>{l.paragraph}</Text>
        <Text>{l.paragraph}</Text>
      </View>
      {tabBar ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: TAB_BAR,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.sheet,
            borderTopWidth: borders.hairline,
            borderTopColor: colors.line,
          }}
        >
          <Text variant="caption" tone="muted">
            {l.tabBar}
          </Text>
        </View>
      ) : null}
      <ScreenFloating lift={lift}>
        <CapsuleSilhouette />
      </ScreenFloating>
      {toast ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            alignItems: 'center',
            bottom: toastBottom('compact', 0, lift + CAPSULE),
          }}
        >
          <Toast text={l.copied} icon="check" leaving={false} calm />
        </View>
      ) : null}
    </View>
  )
}

/** La silhouette de la capsule : une pilule de verre, cinq icônes et leur nombre. */
function CapsuleSilhouette() {
  return (
    // La pilule garde la largeur de son contenu, centrée par la place flottante (une Surface
    // s'étire par défaut : `fill={false}` dans un cadre centré).
    <View style={{ alignSelf: 'center' }}>
      <Surface variant="glass" padding="md" fill={false}>
        <Stack direction="row" gap="lg" align="center">
          {capsuleItems.map((item) => (
            <Stack key={item.icon} direction="row" gap="xs" align="center">
              <Icon name={item.icon} size={20} tone={item.count > 20 ? 'honey' : 'default'} />
              <Text variant="callout">{String(item.count)}</Text>
            </Stack>
          ))}
        </Stack>
      </Surface>
    </View>
  )
}

/** Un bloc de colonne, pour montrer la place de chaque partie de la page. */
function Block({ text, tall = false }: { text: string; tall?: boolean }) {
  return (
    <Surface variant="grouped" padding="lg">
      <View style={{ minHeight: tall ? 160 : 80 }}>
        <Text tone="secondary">{text}</Text>
      </View>
    </Surface>
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
