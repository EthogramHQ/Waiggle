// La section « Les feuilles du compte » du catalogue (tranche R2, profil et suppression) : la photo
// de profil en tête de la feuille (AvatarCover : avec photo, sans photo, en chargement, sans
// bouton), la pile de photos de la feuille de suppression (PhotoStack : avec et sans projets), et
// la feuille d'ordinateur avec son décor et sa colonne à côté (SheetPanel `decoration`, `aside`).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs agents travaillent
// en même temps sur le catalogue. Ses exemples (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais.
import { layout, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AvatarCover } from '../ui/AvatarCover'
import { Button } from '../ui/Button'
import type { ImageSource } from '../ui/image'
import { MemberHeader } from '../ui/MemberHeader'
import { PhotoStack } from '../ui/PhotoStack'
import { SheetPanel } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Les feuilles du compte',
  cover: 'Photo de profil en tête de feuille : avec photo, sans photo, en chargement, sans bouton',
  stack: 'Pile de photos : le membre et trois projets, puis le membre seul',
  aside: 'Feuille d’ordinateur avec un décor et une colonne à côté (l’aperçu de sa page)',
  photo: 'Photo de profil',
  change: 'Changer la photo',
  close: 'Fermer',
  sheetTitle: 'Mon profil',
  body: 'Les champs du profil viennent ici.',
  save: 'Enregistrer',
  tools: 'Outils favoris',
  bio: 'Je bricole des agents IA le week-end.',
}
const en: typeof fr = {
  title: 'Account sheets',
  cover: 'Profile photo at the top of a sheet: with a photo, without, loading, without a button',
  stack: 'Photo stack: the member and three projects, then the member alone',
  aside: 'Computer sheet with a decoration and a column beside it (the preview of the page)',
  photo: 'Profile photo',
  change: 'Change the photo',
  close: 'Close',
  sheetTitle: 'My profile',
  body: 'The profile fields go here.',
  save: 'Save',
  tools: 'Favourite tools',
  bio: 'I tinker with AI agents at the weekend.',
}

/** Une image d'exemple (le dépôt n'en contient aucune) : un dégradé SVG, d'une teinte donnée. */
const sample = (hue: number): ImageSource => ({
  uri: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset="1" stop-color="hsl(${hue + 60} 70% 35%)"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="130" cy="70" r="40" fill="hsl(${hue + 180} 80% 85%)"/></svg>`,
  )}`,
})

const noop = () => {}

export function SheetsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const { colors } = useTheme()
  const covers = [20, 200, 300].map((hue) => ({ key: String(hue), source: sample(hue) }))

  return (
    <Stack gap="lg">
      <Text variant="title3" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.cover}</Text>
      <View style={{ maxWidth: layout.formWidth, gap: space.xl }}>
        <AvatarCover
          name="Léa Martin"
          source={sample(35)}
          label={l.photo}
          action={{ label: l.change, onPress: noop }}
        />
        <AvatarCover
          name="Léa Martin"
          source={null}
          label={l.photo}
          action={{ label: l.change, onPress: noop }}
        />
        <AvatarCover
          name="Léa Martin"
          source={sample(35)}
          label={l.photo}
          action={{ label: l.change, onPress: noop, loading: true }}
        />
        <AvatarCover name="Léa Martin" source={sample(35)} label={l.photo} />
      </View>

      <Text tone="secondary">{l.stack}</Text>
      <Stack direction="row" gap="xl">
        <PhotoStack name="Léa Martin" avatar={sample(35)} covers={covers} />
        <PhotoStack name="Léa Martin" avatar={null} covers={[]} />
      </Stack>

      <Text tone="secondary">{l.aside}</Text>
      <View
        style={{
          backgroundColor: colors.scrim,
          borderRadius: radii.tile,
          paddingVertical: space.xxxl,
        }}
      >
        <SheetPanel
          layout="desktop"
          title={l.sheetTitle}
          closeLabel={l.close}
          onClose={noop}
          decoration={<PhotoStack name="Léa Martin" avatar={sample(35)} covers={covers} />}
          footer={<Button label={l.save} onPress={noop} />}
          aside={
            <Surface variant="plain" padding="xl">
              <MemberHeader
                name="Léa Martin"
                handle="@lea"
                avatar={sample(35)}
                bio={l.bio}
                toolsTitle={l.tools}
                tools={[{ label: 'Claude' }, { label: 'Cursor' }]}
                heading={2}
              />
            </Surface>
          }
        >
          <Text>{l.body}</Text>
        </SheetPanel>
      </View>
    </Stack>
  )
}
