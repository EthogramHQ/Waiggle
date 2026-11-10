// La section « Les feuilles du compte » du catalogue (tranche R2, profil et suppression) : la photo
// de profil en tête de la feuille (AvatarCover : avec photo, sans photo, en chargement, sans
// bouton), la pile de photos de la feuille de suppression (PhotoStack : avec et sans projets), et
// la feuille d'ordinateur avec son décor et sa colonne à côté (SheetPanel `decoration`, `aside`),
// et (R5b) la feuille de téléphone dont le titre porte un nombre (`titleCount`), avec et sans
// commentaire.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : le catalogue grossit à
// chaque tranche. Ses exemples (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais.
import { type ColorName, layout, palettes, radii, space } from '@ruche/brand'
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
  busy: 'Feuille pendant son action (busy) : « Fermer » inactif, rien ne la ferme',
  photo: 'Photo de profil',
  change: 'Changer la photo',
  close: 'Fermer',
  sheetTitle: 'Mon profil',
  body: 'Les champs du profil viennent ici.',
  save: 'Enregistrer',
  tools: 'Outils favoris',
  bio: 'Je bricole des agents IA le week-end.',
  counted:
    'Feuille de téléphone avec un nombre après le titre (titleCount, R5b), lue « Commentaires, 6 commentaires » ; sa tête se glisse vers le bas pour fermer',
  countedNone: 'La même sans commentaire : le titre seul, sans « 0 »',
  comments: 'Commentaires',
  spoken: '6 commentaires',
  spokenNone: '0 commentaire',
  comment: 'Super idée, je teste ce soir.',
  send: 'Envoyer le commentaire',
}
const en: typeof fr = {
  title: 'Account sheets',
  cover: 'Profile photo at the top of a sheet: with a photo, without, loading, without a button',
  stack: 'Photo stack: the member and three projects, then the member alone',
  aside: 'Computer sheet with a decoration and a column beside it (the preview of the page)',
  busy: 'Sheet during its action (busy): “Close” disabled, nothing closes it',
  photo: 'Profile photo',
  change: 'Change the photo',
  close: 'Close',
  sheetTitle: 'My profile',
  body: 'The profile fields go here.',
  save: 'Save',
  tools: 'Favourite tools',
  bio: 'I tinker with AI agents at the weekend.',
  counted:
    'Phone sheet with a number after its title (titleCount, R5b), read “Comments, 6 comments”; its head drags down to close',
  countedNone: 'The same with no comment: the title alone, no “0”',
  comments: 'Comments',
  spoken: '6 comments',
  spokenNone: '0 comments',
  comment: 'Great idea, I’ll try it tonight.',
  send: 'Send the comment',
}

/** La hauteur d'une feuille de téléphone montrée dans la page (comme dans compte.tsx). */
const PHONE_SHEET_HEIGHT = 420

/**
 * Une image d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque, et un disque d'une troisième. Les couleurs viennent de @ruche/brand (palette de jour :
 * une image ne change pas avec le thème), jamais écrites à la main (design-rules.test.ts).
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="130" cy="70" r="40" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}
/** Trois couvertures d'exemple, de couleurs bien distinctes. */
const SAMPLES: [ColorName, ColorName, ColorName][] = [
  ['honey', 'amber', 'honeySoft'],
  ['success', 'text', 'honeyLight'],
  ['danger', 'controlChecked', 'surface'],
]
/** La photo de profil d'exemple. */
const photo = sample('honeyLight', 'amberText', 'surface')

const noop = () => {}

export function SheetsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const { colors } = useTheme()
  const covers = SAMPLES.map((colors, index) => ({
    key: String(index),
    source: sample(...colors),
  }))

  return (
    <Stack gap="lg">
      <Text variant="title3" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.cover}</Text>
      <View style={{ maxWidth: layout.formWidth, gap: space.xl }}>
        <AvatarCover
          name="Léa Martin"
          source={photo}
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
          source={photo}
          label={l.photo}
          action={{ label: l.change, onPress: noop, loading: true }}
        />
        <AvatarCover name="Léa Martin" source={photo} label={l.photo} />
      </View>

      <Text tone="secondary">{l.stack}</Text>
      <Stack direction="row" gap="xl">
        <PhotoStack name="Léa Martin" avatar={photo} covers={covers} />
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
          decoration={<PhotoStack name="Léa Martin" avatar={photo} covers={covers} />}
          footer={<Button label={l.save} onPress={noop} />}
          aside={
            <Surface variant="plain" padding="xl">
              <MemberHeader
                name="Léa Martin"
                handle="@lea"
                avatar={photo}
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

      {/* Pendant une action qui ne s'arrête plus (busy) : « Fermer » inactif, le bouton en cours. */}
      <Text tone="secondary">{l.busy}</Text>
      <View
        style={{
          backgroundColor: colors.scrim,
          borderRadius: radii.tile,
          paddingVertical: space.xxxl,
        }}
      >
        <SheetPanel
          layout="desktop"
          busy
          title={l.sheetTitle}
          closeLabel={l.close}
          onClose={noop}
          footer={<Button label={l.save} loading onPress={noop} />}
        >
          <Text>{l.body}</Text>
        </SheetPanel>
      </View>

      {/* R5b : le titre avec son nombre (« Commentaires 6 »), puis avec 0 (le titre seul). */}
      {[
        { key: 'six', caption: l.counted, count: 6, spoken: l.spoken },
        { key: 'none', caption: l.countedNone, count: 0, spoken: l.spokenNone },
      ].map((sample) => (
        <Stack key={sample.key} gap="lg">
          <Text tone="secondary">{sample.caption}</Text>
          <View
            style={{
              height: PHONE_SHEET_HEIGHT,
              maxWidth: layout.formWidth,
              backgroundColor: colors.scrim,
              borderRadius: radii.tile,
              overflow: 'hidden',
            }}
          >
            <SheetPanel
              layout="phone"
              title={l.comments}
              titleCount={{ count: sample.count, spoken: sample.spoken }}
              closeLabel={l.close}
              onClose={noop}
              footer={<Button label={l.send} onPress={noop} />}
            >
              <Text>{l.comment}</Text>
            </SheetPanel>
          </View>
        </Stack>
      ))}
    </Stack>
  )
}
