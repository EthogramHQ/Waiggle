// La section « Ambiances » du catalogue (tranche R1) : les deux fonds d'un écran.
// - Le « miel vif » (BrandAmbiance) des moments de marque : l'accueil d'un visiteur, la connexion,
//   l'inscription. Un dégradé de miel, et une feuille claire qui porte le contenu et les boutons.
//   Montré de jour et de nuit, en version téléphone (bande de miel en haut) et ordinateur (le miel
//   sur toute la page, la feuille en carte à droite d'une scène).
// - La « lumière » (AmbientLight), celle de tous les autres écrans, pour comparer.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { radii } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientLight } from '../ui/AmbientLight'
import { BrandAmbiance } from '../ui/BrandAmbiance'
import { Button } from '../ui/Button'
import { Constellation } from '../ui/Constellation'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { AmbientProvider } from '../ui/theme/ambient'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Ambiances',
  intro:
    'Deux fonds pour un écran. Le miel vif marque les moments de marque (accueil d’un visiteur, connexion, inscription) : le contenu et les boutons sont toujours sur la feuille claire, jamais sur le miel. Les autres écrans gardent la lumière d’ambiance. Rien ne bouge dans le miel : « Réduire les animations » n’a rien à y calmer.',
  phone: 'Miel vif, téléphone',
  desktop: 'Miel vif, ordinateur',
  desktopOnWide: 'La version ordinateur se voit sur un écran large (1 100 points et plus).',
  light: 'Lumière (les autres écrans)',
  day: 'jour',
  night: 'nuit',
  heading: 'Te revoilà',
  subtitle: 'Connecte-toi pour retrouver les projets de tes proches.',
  signIn: 'Me connecter',
  signUp: 'Créer un compte',
}

const en: typeof fr = {
  title: 'Ambiances',
  intro:
    'Two backgrounds for a screen. Bright honey marks the brand moments (a visitor’s home, sign-in, sign-up): the content and the buttons always sit on the light sheet, never on the honey. The other screens keep the ambient light. Nothing moves in the honey: “Reduce motion” has nothing to calm there.',
  phone: 'Bright honey, phone',
  desktop: 'Bright honey, computer',
  desktopOnWide: 'The computer version shows on a wide screen (1,100 points and more).',
  light: 'Light (the other screens)',
  day: 'day',
  night: 'night',
  heading: 'Welcome back',
  subtitle: 'Sign in to find your loved ones’ projects.',
  signIn: 'Sign in',
  signUp: 'Create an account',
}

type Labels = typeof fr
const noop = () => {}

/** Ce qu'un écran de marque pose sur la feuille : un titre, une phrase, l'action miel et l'autre. */
function SheetContent({ l }: { l: Labels }) {
  return (
    <>
      <Stack gap="sm">
        <Text variant="title2">{l.heading}</Text>
        <Text tone="secondary">{l.subtitle}</Text>
      </Stack>
      <Stack gap="md">
        <Button label={l.signIn} onPress={noop} />
        <Button label={l.signUp} variant="secondary" onPress={noop} />
      </Stack>
    </>
  )
}

/** Un cadre arrondi, comme l'écran d'un appareil, qui rogne ce qui dépasse. */
function Frame({ width, children }: { width?: number; children: ReactNode }) {
  return (
    <View style={{ width: width ?? '100%', maxWidth: '100%' }}>
      <Surface padding="none" radius="tile">
        <View style={{ overflow: 'hidden', borderRadius: radii.tile }}>{children}</View>
      </Surface>
    </View>
  )
}

/** Un exemple légendé (« Miel vif, téléphone — nuit »). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      {children}
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

export function AmbiancesCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // La version ordinateur n'a de sens que dans une fenêtre large : plus étroite, la scène et la
  // carte se chevaucheraient.
  const wide = useLayout().sizeClass === 'wide'
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Stack direction="row" gap="lg" wrap>
        {schemes.map((scheme) => (
          // Un thème imposé autour de l'exemple : le jour et la nuit côte à côte, quel que soit le
          // thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
          <ThemeProvider key={scheme} appearance={scheme}>
            <Example caption={`${l.phone} — ${l[scheme]}`}>
              <Frame width={390}>
                <BrandAmbiance size="compact" scene={<Constellation height={220} />}>
                  <SheetContent l={l} />
                </BrandAmbiance>
              </Frame>
            </Example>
          </ThemeProvider>
        ))}
      </Stack>

      {wide ? (
        schemes.map((scheme) => (
          <ThemeProvider key={scheme} appearance={scheme}>
            <Example caption={`${l.desktop} — ${l[scheme]}`}>
              <Frame>
                <BrandAmbiance size="wide" hero={<Constellation height={420} layout="scene" />}>
                  <SheetContent l={l} />
                </BrandAmbiance>
              </Frame>
            </Example>
          </ThemeProvider>
        ))
      ) : (
        <Text variant="caption" tone="muted">
          {l.desktopOnWide}
        </Text>
      )}

      <Stack direction="row" gap="lg" wrap>
        {schemes.map((scheme) => (
          <ThemeProvider key={scheme} appearance={scheme}>
            <Example caption={`${l.light} — ${l[scheme]}`}>
              <Frame width={390}>
                {/* Un fournisseur à lui : la lumière du cadre a sa source, distincte de la page. */}
                <AmbientProvider>
                  <View style={{ minHeight: 360 }}>
                    <AmbientLight />
                    <Stack padding="xl" gap="xl" grow justify="end">
                      <SheetContent l={l} />
                    </Stack>
                  </View>
                </AmbientProvider>
              </Frame>
            </Example>
          </ThemeProvider>
        ))}
      </Stack>
    </Stack>
  )
}
