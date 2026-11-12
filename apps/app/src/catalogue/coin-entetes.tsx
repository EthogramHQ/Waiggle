// La section « En-têtes du coin des testeurs » du catalogue (tranche R7b) : les deux en-têtes que les
// feuilles et le fil du coin reprennent, dans tous leurs états, de jour et de nuit.
// - `SheetProjectHead`, sous le titre d'une feuille (« Nouvel appel », « Ton retour ») : avec
//   « Effacer le brouillon » (feuille rouverte avec un brouillon), sans action, sans photo, avec un
//   titre long, et dans un cadre de 320 points (le plus petit téléphone).
// - `ThreadHeader`, en haut d'un fil : avec la date d'arrivée (ordinateur), sans elle (téléphone),
//   sans photo, avec un nom long. Sa taille suit la largeur de la fenêtre (photo de 44 points et
//   titre de section sur ordinateur, 36 points et titre de barre sur téléphone) : les captures
//   d'ordinateur et de téléphone montrent chacune la leur.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { type ColorName, palettes } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { ImageSource } from '../ui/image'
import { SheetProjectHead } from '../ui/SheetProjectHead'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThreadHeader } from '../ui/ThreadHeader'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'En-têtes du coin des testeurs',
  intro:
    'Sous le titre d’une feuille du coin, la vignette du projet, son titre et pour qui l’on écrit ; « Effacer le brouillon » à droite quand la feuille a été rouverte avec un brouillon. En haut d’un fil, la photo de l’autre personne, son nom en titre (où le focus arrive), le projet, et sur ordinateur la date d’arrivée dans les testeurs.',
  sheetTitle: 'L’en-tête projet d’une feuille',
  draft: 'Retour, brouillon rouvert : « Effacer le brouillon »',
  noAction: 'Appel, sans brouillon : rien à droite',
  noPhoto: 'Projet sans photo : la lumière miel',
  longTitle: 'Titre long, sur 320 points',
  threadTitle: 'L’en-tête d’un fil',
  since: 'Avec la date d’arrivée (ordinateur)',
  noSince: 'Sans date (téléphone)',
  noAvatar: 'Sans photo : les initiales',
  longName: 'Nom long, sur 320 points',
  nameOf: 'de Papi Jean',
  longProject: 'Le carnet de cuisine de Mamie Rose, toutes ses recettes du dimanche',
  longMember: 'Marie-Christine Dupont-Lefèvre',
  date: '2 nov.',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Testers corner heads',
  intro:
    'Under the title of a corner sheet, the project thumb, its title and whom you write to; “Clear the draft” on the right when the sheet was reopened with a draft. At the top of a thread, the other person’s photo, their name as a heading (where the focus lands), the project, and on a computer the date they joined the testers.',
  sheetTitle: 'The project head of a sheet',
  draft: 'Feedback, draft reopened: “Clear the draft”',
  noAction: 'Call, no draft: nothing on the right',
  noPhoto: 'Project without a photo: the honey light',
  longTitle: 'Long title, at 320 points',
  threadTitle: 'The head of a thread',
  since: 'With the join date (computer)',
  noSince: 'Without a date (phone)',
  noAvatar: 'Without a photo: the initials',
  longName: 'Long name, at 320 points',
  nameOf: 'Papi Jean’s',
  longProject: 'Grandma Rose’s cookbook, all her Sunday recipes',
  longMember: 'Marie-Christine Dupont-Lefèvre',
  date: 'Nov 2',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/**
 * Une image d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque, et un disque d'une troisième (comme feuilles.tsx). Les couleurs viennent de @ruche/brand
 * (palette de jour : une image ne change pas avec le thème), jamais écrites à la main.
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="130" cy="70" r="40" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}
/** La photo du projet « Décollage ! » et celle d'Inès. */
const projectPhoto = sample('honey', 'amber', 'honeySoft')
const memberPhoto = sample('honeyLight', 'amberText', 'surface')

/** Un exemple légendé (« Sans photo — nuit »), sur une carte comme le haut d'une feuille. */
function Example({
  caption,
  narrow = false,
  children,
}: {
  caption: string
  /** Dans un cadre de 320 points, le plus petit téléphone. */
  narrow?: boolean
  children: ReactNode
}) {
  return (
    <Stack gap="xs">
      <View style={{ width: narrow ? 320 : 390, maxWidth: '100%' }}>
        <Surface padding="lg">{children}</Surface>
      </View>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

export function TestersCornerHeadsCatalogue() {
  const { t, i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const title = 'Décollage !'
  const forTesters = t(($) => $.project.testers.calls.audience, { count: 12 })
  const byAuthor = t(($) => $.project.testers.feedback.byAuthor, { nameOf: l.nameOf })
  const clear = { label: t(($) => $.project.testers.feedback.clearDraft), onPress: noop }
  const since = t(($) => $.project.testers.list.sinceLong, { date: l.date })
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Text variant="headline" heading={3}>
        {l.sheetTitle}
      </Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.draft} — ${l[scheme]}`}>
              <SheetProjectHead
                thumb={projectPhoto}
                title={title}
                subtitle={byAuthor}
                action={clear}
              />
            </Example>
            <Example caption={`${l.noAction} — ${l[scheme]}`}>
              <SheetProjectHead thumb={projectPhoto} title={title} subtitle={forTesters} />
            </Example>
            <Example caption={`${l.noPhoto} — ${l[scheme]}`}>
              <SheetProjectHead thumb={null} title={title} subtitle={byAuthor} action={clear} />
            </Example>
            <Example caption={`${l.longTitle} — ${l[scheme]}`} narrow>
              <SheetProjectHead
                thumb={projectPhoto}
                title={l.longProject}
                subtitle={byAuthor}
                action={clear}
              />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.threadTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.since} — ${l[scheme]}`}>
              <ThreadHeader name="Inès Haddad" avatar={memberPhoto} project={title} since={since} />
            </Example>
            <Example caption={`${l.noSince} — ${l[scheme]}`}>
              <ThreadHeader name="Inès Haddad" avatar={memberPhoto} project={title} />
            </Example>
            <Example caption={`${l.noAvatar} — ${l[scheme]}`}>
              <ThreadHeader name="Noé Bernard" avatar={null} project={title} since={since} />
            </Example>
            <Example caption={`${l.longName} — ${l[scheme]}`} narrow>
              <ThreadHeader
                name={l.longMember}
                avatar={null}
                project={l.longProject}
                since={since}
              />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
