// La section « La feuille de publication » du catalogue (tranche R6a, planches R6-Publier,
// R6-Publier-Outils, R6-Publier-Desktop et R6-Modifier) : la feuille qui porte son action
// (`SheetPanel action`, `cancelLabel`, `footerNote`), dans ses états :
// - sur téléphone, « Annuler », le titre et « Publier » dans la tête, la phrase du pied à la fin ;
// - « Enregistrer » grisé, qu'on atteint encore par Tab, décrit par le message sous la tête ;
// - un message d'erreur sous la tête, et l'envoi en cours (rien ne ferme la feuille) ;
// - la seconde feuille, « Catégorie et outils » : le titre et « OK », sans « Annuler » ;
// - un titre long dans une feuille étroite : la tête passe sur deux rangées s'il le faut ;
// - sur ordinateur, les deux colonnes dans la feuille (le formulaire, l'aperçu) et le pied ;
// - pour de vrai : une feuille qui en ouvre une autre (Échap ne ferme que celle du dessus, le focus
//   revient à « Catégorie »), et `closeGuard` (la feuille ne se ferme qu'après la réponse).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : le catalogue grossit à
// chaque tranche. Ses exemples (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais.
import { appName, layout, radii, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Sheet, type SheetAction, type SheetNotice, SheetPanel } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La feuille de publication',
  intro:
    'La feuille qui porte son action (R6a) : sur téléphone, « Annuler », le titre et l’action dans la tête ; sur ordinateur, au pied, après la phrase qui dit qui verra le projet. Avec closeGuard, toute fermeture (Annuler, Échap, voile, glisser, retour) demande d’abord à l’écran.',
  phone:
    'Téléphone : « Annuler », « Nouveau projet », « Publier » ; la phrase du pied finit le contenu',
  disabled:
    'Action grisée (focusableWhenDisabled) : « Enregistrer » reste atteignable par Tab, décrit par le message sous la tête',
  error: 'Message d’erreur sous la tête, près de « Publier »',
  busy: 'Envoi en cours (busy) : « Annuler » inactif, « Publier » en chargement, rien ne ferme',
  inner: 'La seconde feuille : le titre et « OK », sans « Annuler »',
  narrow: 'Titre long dans une feuille étroite : la tête passe sur deux rangées s’il le faut',
  desktop:
    'Ordinateur : le formulaire et l’aperçu en deux colonnes dans la feuille, le pied avec la phrase, « Annuler » et « Publier »',
  live: 'Pour de vrai : une feuille dans une feuille, et closeGuard',
  liveHint:
    'Ouvre la feuille, touche « Catégorie » : Échap ne ferme que la seconde, et le focus revient à « Catégorie ». Puis Échap, « Annuler » ou le voile sur la première : closeGuard est appelé, la feuille reste.',
  open: 'Ouvrir la feuille de publication',
  newProject: 'Nouveau projet',
  editProject: 'Modifier le projet',
  longTitle: 'Modifier « Le tri des photos de vacances »',
  subtitle: 'Montre à tes proches ce que tu construis. Tu pourras tout modifier ensuite.',
  cancel: 'Annuler',
  publish: 'Publier',
  save: 'Enregistrer',
  ok: 'OK',
  categories: 'Catégorie et outils',
  category: 'Catégorie : Sciences et espace',
  categoryHint: 'Une principale, et une seconde si tu veux.',
  body: 'Les photos, le titre, « En une phrase », la description et le lien viennent ici.',
  status: 'Où en est le projet ? Testable.',
  audience: `Les membres de ${appName} verront ce projet ; tes abonnés le trouveront dans leur fil et dans leur récap par e‑mail, qui reste dans leur messagerie.`,
  unchanged: 'Rien à enregistrer pour l’instant.',
  failed: 'Impossible de publier pour l’instant. Réessaie dans un moment.',
  preview: 'Aperçu dans le fil',
  previewBody: 'La carte du projet, éclairée par sa première photo.',
  guardAsked:
    'closeGuard appelé : l’écran demanderait « Abandonner ce projet ? ». La feuille reste ouverte.',
  abandon: 'Abandonner (onClose)',
  close: 'Fermer',
}
const en: typeof fr = {
  title: 'The publishing sheet',
  intro:
    'The sheet that carries its action (R6a): on a phone, “Cancel”, the title and the action in the header; on a computer, in the footer, after the sentence saying who will see the project. With closeGuard, every close (Cancel, Escape, scrim, drag, back) asks the screen first.',
  phone: 'Phone: “Cancel”, “New project”, “Publish”; the footer sentence ends the content',
  disabled:
    'Disabled action (focusableWhenDisabled): “Save” stays reachable by Tab, described by the message under the header',
  error: 'Error message under the header, near “Publish”',
  busy: 'Sending (busy): “Cancel” disabled, “Publish” loading, nothing closes it',
  inner: 'The second sheet: the title and “OK”, no “Cancel”',
  narrow: 'Long title in a narrow sheet: the header goes on two rows when it must',
  desktop:
    'Computer: the form and the preview in two columns inside the sheet, the footer with the sentence, “Cancel” and “Publish”',
  live: 'For real: a sheet in a sheet, and closeGuard',
  liveHint:
    'Open the sheet, press “Category”: Escape closes only the second one, and the focus goes back to “Category”. Then Escape, “Cancel” or the scrim on the first one: closeGuard is called, the sheet stays.',
  open: 'Open the publishing sheet',
  newProject: 'New project',
  editProject: 'Edit the project',
  longTitle: 'Edit “Sorting the holiday photos”',
  subtitle: 'Show your people what you are building. You can change everything later.',
  cancel: 'Cancel',
  publish: 'Publish',
  save: 'Save',
  ok: 'OK',
  categories: 'Category and tools',
  category: 'Category: Science and space',
  categoryHint: 'A main one, and a second one if you like.',
  body: 'The photos, the title, “In one sentence”, the description and the link go here.',
  status: 'Where is the project at? Ready to try.',
  audience: `${appName} members will see this project; your followers will find it in their feed and in their email recap, which stays in their inbox.`,
  unchanged: 'Nothing to save for now.',
  failed: 'Can’t publish right now. Try again in a moment.',
  preview: 'Preview in the feed',
  previewBody: 'The project card, lit by its first photo.',
  guardAsked:
    'closeGuard called: the screen would ask “Discard this project?”. The sheet stays open.',
  abandon: 'Discard (onClose)',
  close: 'Close',
}

/** La hauteur d'une feuille de téléphone montrée dans la page (comme dans feuilles.tsx). */
const PHONE_SHEET_HEIGHT = 440
/** Une feuille étroite, la largeur du plus petit téléphone. */
const NARROW_WIDTH = 320

const noop = () => {}

/** Le fond voilé sous une feuille montrée dans la page ; `width` pour une feuille étroite. */
function Backdrop({
  children,
  phone,
  width,
}: {
  children: ReactNode
  phone: boolean
  width?: number
}) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        backgroundColor: colors.scrim,
        borderRadius: radii.tile,
        ...(phone
          ? {
              height: PHONE_SHEET_HEIGHT,
              maxWidth: width ?? layout.formWidth,
              overflow: 'hidden' as const,
            }
          : { paddingVertical: space.xxxl }),
      }}
    >
      {children}
    </View>
  )
}

/** La phrase du pied : qui verra le projet, avec l'œil de la planche. */
function Audience({ text }: { text: string }) {
  return (
    <Stack direction="row" gap="sm">
      <Icon name="eye" size={20} tone="accent" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text tone="secondary">{text}</Text>
      </View>
    </Stack>
  )
}

/** Une feuille de téléphone montrée dans la page, avec sa légende. */
function PhoneSample({
  caption,
  title,
  action,
  cancelLabel,
  notice,
  busy,
  footerNote,
  width,
  body,
}: {
  caption: string
  title: string
  action: SheetAction
  cancelLabel?: string
  notice?: SheetNotice
  busy?: boolean
  footerNote?: ReactNode
  width?: number
  body: string
}) {
  return (
    <Stack gap="lg">
      <Text tone="secondary">{caption}</Text>
      <Backdrop phone {...(width === undefined ? null : { width })}>
        <SheetPanel
          layout="phone"
          title={title}
          action={action}
          onClose={noop}
          {...(cancelLabel === undefined ? null : { cancelLabel })}
          {...(notice === undefined ? null : { notice })}
          {...(busy === undefined ? null : { busy })}
          {...(footerNote === undefined ? null : { footerNote })}
        >
          <Text>{body}</Text>
        </SheetPanel>
      </Backdrop>
    </Stack>
  )
}

/** La feuille pour de vrai : « Catégorie » en ouvre une seconde ; closeGuard garde la première. */
function LiveSample({ l }: { l: typeof fr }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  const [asked, setAsked] = useState(false)
  const close = () => {
    setAsked(false)
    setOpen(false)
  }
  return (
    <Stack gap="lg">
      <Text tone="secondary">{l.live}</Text>
      <Text tone="secondary">{l.liveHint}</Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={l.open} variant="secondary" onPress={() => setOpen(true)} />
      </View>
      <Sheet
        open={open}
        title={l.newProject}
        subtitle={l.subtitle}
        cancelLabel={l.cancel}
        action={{ label: l.publish, onPress: close }}
        footerNote={<Audience text={l.audience} />}
        onClose={close}
        closeGuard={() => setAsked(true)}
        notice={asked ? { message: l.guardAsked, tone: 'info', polite: true } : null}
      >
        <Text>{l.body}</Text>
        <View style={{ alignSelf: 'flex-start', gap: space.md }}>
          <Button label={l.category} variant="secondary" onPress={() => setInner(true)} />
          {asked ? <Button label={l.abandon} variant="danger" onPress={close} /> : null}
        </View>
        <Text>{l.status}</Text>
        <Sheet
          open={inner}
          title={l.categories}
          action={{ label: l.ok, onPress: () => setInner(false) }}
          onClose={() => setInner(false)}
        >
          <Text tone="secondary">{l.categoryHint}</Text>
        </Sheet>
      </Sheet>
    </Stack>
  )
}

export function PublishSheetCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr

  return (
    <Stack gap="lg">
      <Text variant="title3" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <PhoneSample
        caption={l.phone}
        title={l.newProject}
        cancelLabel={l.cancel}
        action={{ label: l.publish, onPress: noop }}
        footerNote={<Audience text={l.audience} />}
        body={l.body}
      />
      <PhoneSample
        caption={l.disabled}
        title={l.editProject}
        cancelLabel={l.cancel}
        action={{ label: l.save, onPress: noop, disabled: true, focusableWhenDisabled: true }}
        notice={{ message: l.unchanged, tone: 'info', polite: true }}
        body={l.body}
      />
      <PhoneSample
        caption={l.error}
        title={l.newProject}
        cancelLabel={l.cancel}
        action={{ label: l.publish, onPress: noop }}
        notice={{ message: l.failed, tone: 'error' }}
        body={l.body}
      />
      <PhoneSample
        caption={l.busy}
        title={l.newProject}
        cancelLabel={l.cancel}
        action={{ label: l.publish, onPress: noop, busy: true }}
        busy
        body={l.body}
      />
      <PhoneSample
        caption={l.inner}
        title={l.categories}
        action={{ label: l.ok, onPress: noop }}
        body={l.categoryHint}
      />
      <PhoneSample
        caption={l.narrow}
        title={l.longTitle}
        cancelLabel={l.cancel}
        action={{ label: l.save, onPress: noop }}
        width={NARROW_WIDTH}
        body={l.body}
      />

      <Text tone="secondary">{l.desktop}</Text>
      <Backdrop phone={false}>
        <SheetPanel
          layout="desktop"
          title={l.newProject}
          subtitle={l.subtitle}
          closeLabel={l.close}
          cancelLabel={l.cancel}
          action={{ label: l.publish, onPress: noop }}
          footerNote={<Audience text={l.audience} />}
          onClose={noop}
          aside={
            <Surface variant="plain" padding="xl">
              <Stack gap="sm">
                <Text variant="heading" heading={3}>
                  {l.preview}
                </Text>
                <Text tone="secondary">{l.previewBody}</Text>
              </Stack>
            </Surface>
          }
        >
          <Text>{l.body}</Text>
          <Text>{l.status}</Text>
        </SheetPanel>
      </Backdrop>

      <LiveSample l={l} />
    </Stack>
  )
}
