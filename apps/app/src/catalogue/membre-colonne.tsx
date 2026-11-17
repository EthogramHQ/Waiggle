// La section « Le profil en colonne » du catalogue (tranche R15, planche R15-Membre-1920) : l'en-tête
// d'un membre dans sa forme d'ordinateur (`MemberHeader layout="column"`), à la largeur de la
// colonne du profil (`layout.profileColumn`) : avec une photo (la bannière floue tirée d'elle), sans
// photo (un miel pâle et les initiales), le compte d'exemples, et un nom long qui passe à la ligne,
// de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { type ColorName, layout, palettes } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import type { ImageSource } from '../ui/image'
import { MemberHeader } from '../ui/MemberHeader'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le profil en colonne',
  intro:
    'Sur ordinateur, le profil d’un membre est une colonne à gauche de ses projets : une bannière floue tirée de sa photo, la photo qui en chevauche le bas, puis tout rangé à gauche.',
  photo: 'Avec une photo',
  noPhoto: 'Sans photo',
  example: 'Le compte d’exemples',
  exampleNote: 'Les projets de ce compte sont fictifs.',
  longName: 'Un nom long passe à la ligne',
  longNameValue: 'Marie-Bénédicte de La Rochefoucauld-Montmorency',
  bio: 'Barista le week-end, développeuse le reste du temps. J’apprends à faire des apps avec l’IA.',
  tools: 'Outils favoris',
  followers: '12 abonnés',
  follow: 'Suivre Léa',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The profile as a column',
  intro:
    'On a computer, a member’s profile is a column to the left of their projects: a banner blurred from their photo, the photo overlapping its bottom, then everything aligned to the left.',
  photo: 'With a photo',
  noPhoto: 'Without a photo',
  example: 'The examples account',
  exampleNote: 'The projects of this account are made up.',
  longName: 'A long name wraps',
  longNameValue: 'Marie-Bénédicte de La Rochefoucauld-Montmorency',
  bio: 'Barista at the weekend, developer the rest of the time. Learning to build apps with AI.',
  tools: 'Favourite tools',
  followers: '12 followers',
  follow: 'Follow Léa',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque, et un disque d'une troisième, comme dans les autres sections du catalogue. Les couleurs
 * viennent de @ruche/brand (palette de jour : une photo ne change pas avec le thème).
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="130" cy="70" r="40" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}
const photo = sample('danger', 'honey', 'surface')

/** Un exemple légendé, à la largeur de la colonne du profil. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <View style={{ width: layout.profileColumn, maxWidth: '100%' }}>{children}</View>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

/** L'en-tête de Léa en colonne, avec ses outils et son bouton « Suivre ». */
function Lea({ l, avatar }: { l: Labels; avatar: ImageSource | null }) {
  return (
    <MemberHeader
      layout="column"
      heading={2}
      name="Léa Moreau"
      handle="@lea_moreau"
      avatar={avatar}
      bio={l.bio}
      toolsTitle={l.tools}
      tools={[
        { label: 'Claude', onPress: noop },
        { label: 'Lovable', onPress: noop },
        { label: 'Supabase', onPress: noop },
      ]}
      action={
        <Stack gap="md" align="stretch">
          <Text variant="callout" tone="secondary">
            {l.followers}
          </Text>
          <Stack direction="row">
            <Button label={l.follow} icon="user-plus" size="compact" onPress={noop} />
          </Stack>
        </Stack>
      }
    />
  )
}

export function MemberColumnCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="title3" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="grouped" padding="xl">
            <Stack direction="row" wrap gap="huge">
              <Example caption={`${l.photo} — ${l[scheme]}`}>
                <Lea l={l} avatar={photo} />
              </Example>
              <Example caption={`${l.noPhoto} — ${l[scheme]}`}>
                <Lea l={l} avatar={null} />
              </Example>
              <Example caption={`${l.example} — ${l[scheme]}`}>
                <MemberHeader
                  layout="column"
                  heading={2}
                  name="WaiggleBot"
                  handle="@waigglebot"
                  avatar={null}
                  bio=""
                  exampleNote={l.exampleNote}
                  toolsTitle={l.tools}
                  tools={[]}
                />
              </Example>
              <Example caption={`${l.longName} — ${l[scheme]}`}>
                <MemberHeader
                  layout="column"
                  heading={2}
                  name={l.longNameValue}
                  avatar={photo}
                  bio=""
                  toolsTitle={l.tools}
                  tools={[]}
                />
              </Example>
            </Stack>
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
