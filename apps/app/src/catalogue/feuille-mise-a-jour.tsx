// La section « La feuille Nouvelle mise à jour » du catalogue (R7a, U3a, planche R7-MAJ-Publier) :
// le vrai contenu de la feuille (`UpdateSheetFields`, celui de l'écran) dans une `SheetPanel`, dans
// ses états : vide (première mise à jour), remplie, à cinq lignes, avec l'avant / après, en erreur
// (« Publier » sans rien écrire, puis un échec de l'API), pendant l'envoi, préremplie par un statut,
// sur ordinateur ; puis la fenêtre « Abandonner cette mise à jour ? », pour de vrai.
// Chaque exemple est vivant : on peut y écrire, ajouter ou retirer des lignes, allumer l'avant /
// après ; rien ne part (les photos sont des images dessinées ici, sans API).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne.
// Outil de développement : les exemples sont écrits ici ; les libellés viennent des traductions.
import { layout, palettes, radii, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { PhotoActions } from '../projects/usePhotoTiles'
import { UpdateSheetFields, type UpdateSheetProject } from '../screens/UpdateSheetFields'
import { Button } from '../ui/Button'
import { DiscardDialog } from '../ui/DiscardDialog'
import type { PhotoTile } from '../ui/PhotoTiles'
import { type SheetNotice, SheetPanel } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useTheme } from '../ui/theme/ThemeProvider'
import { emptyLine, type UpdateFormValues } from '../updates/form'

const fr = {
  title: 'La feuille « Nouvelle mise à jour »',
  intro:
    'La feuille de l’auteur (R7a) : le projet et sa dernière version en tête, un titre, « Ce qui a changé » (1 à 5 lignes), la version, jusqu’à 4 photos et, dès deux, l’interrupteur « Avant / après ». « Publier » n’est jamais grisé ; fermer une feuille modifiée demande « Abandonner cette mise à jour ? ».',
  empty: 'Vide : la première mise à jour d’un projet public',
  filled: 'Remplie : un titre, deux lignes, une version, une photo',
  five: 'À cinq lignes : plus d’« Ajouter une ligne »',
  beforeAfter: 'Avant / après : deux photos étiquetées « Avant » et « Après »',
  error: 'En erreur : « Publier » sans rien écrire (la première ligne)',
  failed: 'Échec de l’envoi : le message au pied, rien n’est perdu',
  sending: 'Pendant l’envoi : tout en lecture seule, la feuille ne se ferme pas',
  announced: 'Préremplie par le statut « Testable », projet privé',
  desktop: 'Sur ordinateur : la phrase du pied à côté des boutons',
  discard: 'La fenêtre d’abandon (Échap, voile, « Annuler » ou Retour sur une feuille modifiée)',
  open: 'Ouvrir « Abandonner cette mise à jour ? »',
  project: 'Décollage !',
  updateTitle: 'Le décompte de la fusée',
  lines: [
    'Un compte à rebours avant chaque question',
    'Le score ne repart plus à zéro au niveau 3',
    'Des étoiles qui scintillent',
    'Un mode nuit',
    'La lune ne disparaît plus à minuit',
  ],
}

const en: typeof fr = {
  title: 'The “New update” sheet',
  intro:
    'The author’s sheet (R7a): the project and its last version at the top, a title, “What changed” (1 to 5 lines), the version, up to 4 photos and, from two, the “Before / after” switch. “Publish” is never greyed; closing a changed sheet asks “Discard this update?”.',
  empty: 'Empty: the first update of a public project',
  filled: 'Filled: a title, two lines, a version, one photo',
  five: 'At five lines: no more “Add a line”',
  beforeAfter: 'Before / after: two photos labelled “Before” and “After”',
  error: 'In error: “Publish” with nothing written (the first line)',
  failed: 'Sending failed: the message in the footer, nothing is lost',
  sending: 'While sending: all read-only, the sheet does not close',
  announced: 'Prefilled by the “Testable” status, private project',
  desktop: 'On a computer: the footer sentence next to the buttons',
  discard: 'The discard window (Escape, scrim, “Cancel” or Back on a changed sheet)',
  open: 'Open “Discard this update?”',
  project: 'Lift-off!',
  updateTitle: 'The rocket countdown',
  lines: [
    'A countdown before each question',
    'The score no longer resets at level 3',
    'Twinkling stars',
    'A night mode',
    'The moon no longer disappears at midnight',
  ],
}

type Labels = typeof fr

/** Une image dessinée (un dégradé et un disque), comme dans la section des photos. */
const drawn = (from: string, to: string, disc: string) => ({
  uri: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="110" r="70" fill="${disc}"/></svg>`,
  )}`,
})
const day = palettes.day
const SOURCES = [
  drawn(day.honeySoft, day.honey, day.amber),
  drawn(day.text, day.controlChecked, day.honey),
  drawn(day.success, day.text, day.honeyLight),
]

const tile = (index: number): PhotoTile => ({
  key: `update-photo-${index}`,
  state: 'ready',
  image: { source: SOURCES[index % SOURCES.length] ?? null, label: '' },
})

const noopActions: PhotoActions = {
  onAdd: () => {},
  onDropFiles: () => {},
  onMove: () => {},
  onRemove: () => {},
}

// Une heure fixe : « il y a 3 semaines » ne bouge pas d'une capture à l'autre.
const NOW = new Date('2026-11-10T09:00:00.000Z')
const THREE_WEEKS_AGO = '2026-10-20T09:00:00.000Z'

/**
 * La hauteur d'une feuille de téléphone montrée dans la page (la feuille défile dedans) ; plus haute
 * avec des photos, pour que la capture montre les tuiles et l'interrupteur « Avant / après ».
 */
const PHONE_SHEET_HEIGHT = 620
const PHONE_SHEET_HEIGHT_PHOTOS = 1180

type SampleProps = {
  l: Labels
  caption: string
  initial: UpdateFormValues
  project?: Partial<UpdateSheetProject>
  photos?: number
  announce?: string | null
  linesError?: string | null
  notice?: SheetNotice
  busy?: boolean
  footer: string
  desktop?: boolean
}

/** Une feuille montrée dans la page, avec sa légende ; on peut y écrire. */
function Sample({
  l,
  caption,
  initial,
  project,
  photos = 0,
  announce = null,
  linesError = null,
  notice,
  busy = false,
  footer,
  desktop = false,
}: SampleProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [form, setForm] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const tiles = Array.from({ length: photos }, (_, index) => tile(index))
  return (
    <Stack gap="md">
      <Text tone="secondary">{caption}</Text>
      <View
        style={{
          backgroundColor: colors.scrim,
          borderRadius: radii.tile,
          ...(desktop
            ? { paddingVertical: space.xxxl }
            : {
                height: photos > 0 ? PHONE_SHEET_HEIGHT_PHOTOS : PHONE_SHEET_HEIGHT,
                maxWidth: layout.formWidth,
                overflow: 'hidden' as const,
              }),
        }}
      >
        <SheetPanel
          layout={desktop ? 'desktop' : 'phone'}
          title={t(($) => $.project.updates.sheetTitle)}
          heading={2}
          {...(announce ? { subtitle: announce } : null)}
          cancelLabel={t(($) => $.project.updates.cancel)}
          action={{ label: t(($) => $.project.updates.publish), onPress: () => {}, busy }}
          onClose={() => {}}
          busy={busy}
          {...(notice ? { notice } : null)}
          footerNote={<Text tone="secondary">{footer}</Text>}
        >
          <UpdateSheetFields
            project={{
              title: l.project,
              image: { source: SOURCES[0] ?? null, label: l.project },
              latestAt: null,
              version: null,
              ...project,
            }}
            form={form}
            onChange={setForm}
            linesError={linesError}
            photos={{
              tiles,
              actions: noopActions,
              selectedKey: selected,
              select: setSelected,
              descriptionOf: (key) => descriptions[key] ?? '',
              describe: (key, text) => setDescriptions((now) => ({ ...now, [key]: text })),
              count: tiles.length,
            }}
            busy={busy}
            now={NOW}
          />
        </SheetPanel>
      </View>
    </Stack>
  )
}

/** La fenêtre d'abandon, pour de vrai : un bouton l'ouvre, « Continuer » et « Abandonner » la ferment. */
function DiscardSample({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Stack gap="md">
      <Text tone="secondary">{l.discard}</Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={l.open} variant="secondary" onPress={() => setOpen(true)} />
      </View>
      <DiscardDialog
        visible={open}
        title={t(($) => $.project.updates.discardTitle)}
        message={t(($) => $.project.updates.discardBody)}
        onKeep={() => setOpen(false)}
        onDiscard={() => setOpen(false)}
      />
    </Stack>
  )
}

/** Un formulaire de départ : des lignes (famille, texte), un titre et une version. */
const values = (
  lines: { family: 'new' | 'fixed' | 'polish'; text: string }[],
  extra: Partial<UpdateFormValues> = {},
): UpdateFormValues => ({
  title: '',
  version: '',
  lines: lines.map(({ family, text }) => ({ ...emptyLine(family), text })),
  beforeAfter: false,
  ...extra,
})

export function UpdateSheetCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const hintPublic = t(($) => $.project.updates.hintPublic)
  const hintPrivate = t(($) => $.project.updates.hintPrivate)
  const [first, second, third, fourth, fifth] = l.lines as [string, string, string, string, string]
  const known = { latestAt: THREE_WEEKS_AGO, version: 'v1.2' }
  const status = t(($) => $.project.status.testable)
  const samples: ReactNode[] = [
    <Sample
      key="empty"
      l={l}
      caption={l.empty}
      initial={values([{ family: 'new', text: '' }])}
      footer={hintPublic}
    />,
    <Sample
      key="filled"
      l={l}
      caption={l.filled}
      initial={values(
        [
          { family: 'new', text: first },
          { family: 'fixed', text: second },
        ],
        { title: l.updateTitle, version: 'v1.3' },
      )}
      project={known}
      photos={1}
      footer={hintPublic}
    />,
    <Sample
      key="five"
      l={l}
      caption={l.five}
      initial={values([
        { family: 'new', text: first },
        { family: 'fixed', text: second },
        { family: 'polish', text: third },
        { family: 'new', text: fourth },
        { family: 'fixed', text: fifth },
      ])}
      project={known}
      footer={hintPublic}
    />,
    <Sample
      key="before-after"
      l={l}
      caption={l.beforeAfter}
      initial={values([{ family: 'polish', text: third }], { beforeAfter: true })}
      project={{ ...known, version: null }}
      photos={2}
      footer={hintPublic}
    />,
    <Sample
      key="error"
      l={l}
      caption={l.error}
      initial={values([{ family: 'new', text: '' }])}
      linesError={t(($) => $.project.updates.required)}
      footer={hintPublic}
    />,
    <Sample
      key="failed"
      l={l}
      caption={l.failed}
      initial={values([{ family: 'new', text: first }], { title: l.updateTitle })}
      project={known}
      notice={{ message: t(($) => $.project.updates.error), tone: 'error' }}
      footer={hintPublic}
    />,
    <Sample
      key="sending"
      l={l}
      caption={l.sending}
      initial={values([{ family: 'new', text: first }], { title: l.updateTitle })}
      project={known}
      busy
      footer={hintPublic}
    />,
    <Sample
      key="announced"
      l={l}
      caption={l.announced}
      initial={values([
        { family: 'new', text: t(($) => $.project.updates.statusPrefill, { status }) },
      ])}
      project={known}
      announce={t(($) => $.project.updates.hintAnnouncePrivate, { status })}
      footer={hintPrivate}
    />,
    <Sample
      key="desktop"
      l={l}
      caption={l.desktop}
      initial={values(
        [
          { family: 'new', text: first },
          { family: 'fixed', text: second },
        ],
        { title: l.updateTitle, version: 'v1.3' },
      )}
      project={known}
      photos={2}
      footer={hintPublic}
      desktop
    />,
  ]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {samples}
      <DiscardSample l={l} />
    </Stack>
  )
}
