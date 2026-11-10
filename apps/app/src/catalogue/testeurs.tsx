// La section « Les testeurs » du catalogue (R7a, U5a) : ce que la page d'un projet montre des
// testeurs, et ses deux feuilles.
// - Les actions de la page (projects/ProjectActions, `ProjectActionsView`) : « Rejoindre les
//   testeurs » sous « Suivre ce projet », pour un autre membre sur un projet « Testable » ; « Tu
//   testes ce projet » une fois inscrit, même sur un projet qui ne cherche plus de testeurs, et pour
//   un compte suspendu (pour pouvoir partir) ; pour l'auteur, « 12 testeurs » à côté des abonnés.
// - Les feuilles (screens/TesterSheet, `useTesterPanel`, posées ouvertes dans la page par
//   `SheetPanel`) : « Rejoindre les testeurs » et « Tu testes ce projet », sur téléphone et sur
//   ordinateur, puis leurs états : en cours, complet, plus « Testable », panne, départ refusé.
// De jour et de nuit. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs
// personnes y travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { type ActionsProject, ProjectActionsView } from '../projects/ProjectActions'
import { type TesterPanelProps, useTesterPanel } from '../screens/TesterSheet'
import { recipesProject } from '../testing/projects'
import { SheetPanel } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Les testeurs',
  intro:
    'Sur la page d’un projet « Testable » qui a une démo, un autre membre lit « Rejoindre les testeurs » sous « Suivre ce projet », en blanc : « Tester la démo » reste la seule action miel. Le bouton ouvre une feuille qui dit ce que l’inscription veut dire ; une fois inscrit, il devient « Tu testes ce projet », qui ouvre la feuille d’où l’on part. L’auteur lit le nombre de ses testeurs à côté de ses abonnés ; personne d’autre ne le voit.',
  actionsTitle: 'Sur la page du projet',
  offer: 'Un autre membre, projet « Testable » : « Rejoindre les testeurs »',
  tester: 'Inscrit : « Tu testes ce projet »',
  noLonger: 'Inscrit, projet passé « En pause » : le bouton reste, pour partir',
  suspended: 'Compte suspendu, inscrit : « Suivre ce projet » inactif, le départ reste possible',
  author: 'L’auteur : « 12 testeurs » à côté des abonnés',
  sheetsTitle: 'Les feuilles',
  joinPhone: '« Rejoindre les testeurs », téléphone',
  memberPhone: '« Tu testes ce projet », téléphone',
  joinDesktop: '« Rejoindre les testeurs », ordinateur',
  memberDesktop: '« Tu testes ce projet », ordinateur',
  statesTitle: 'États des feuilles (téléphone)',
  pending: 'Inscription en cours : le bouton charge, « Annuler » attend',
  full: 'Complet (409 testers_full) : jamais un nombre',
  notTestable: 'Ne cherche plus de testeurs (409 not_testable)',
  failed: 'Panne : réessayer reste possible',
  quitPending: 'Départ en cours',
  quitFailed: 'Départ refusé (panne)',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Testers',
  intro:
    'On the page of a “Testable” project with a demo, another member reads “Join the testers” under “Follow this project”, in white: “Try the demo” stays the only honey action. The button opens a sheet that says what joining means; once in, it becomes “You test this project”, which opens the sheet to leave from. The author reads the number of testers beside the followers; nobody else sees it.',
  actionsTitle: 'On the project page',
  offer: 'Another member, “Testable” project: “Join the testers”',
  tester: 'Joined: “You test this project”',
  noLonger: 'Joined, project now “Paused”: the button stays, to leave',
  suspended: 'Suspended account, joined: “Follow this project” inactive, leaving still possible',
  author: 'The author: “12 testers” beside the followers',
  sheetsTitle: 'The sheets',
  joinPhone: '“Join the testers”, phone',
  memberPhone: '“You test this project”, phone',
  joinDesktop: '“Join the testers”, computer',
  memberDesktop: '“You test this project”, computer',
  statesTitle: 'Sheet states (phone)',
  pending: 'Joining: the button loads, “Cancel” waits',
  full: 'Full (409 testers_full): never a number',
  notTestable: 'No longer looking for testers (409 not_testable)',
  failed: 'Failure: trying again stays possible',
  quitPending: 'Leaving',
  quitFailed: 'Leaving refused (failure)',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/** Le projet de Léa, vu par un autre membre : « Testable », avec une démo, deux abonnés. */
const seen: ActionsProject = {
  ...recipesProject,
  title: 'Décollage !',
  author: { ...recipesProject.author, name: 'Papi Jean' },
  isMine: false,
  isFollowed: true,
  followerCount: 12,
  isTester: false,
  testerCount: null,
}

/** Un exemple légendé (« Inscrit — nuit »). */
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

/** Les actions de la page, sur une carte comme la colonne de la page, dans l'un de leurs états. */
function Actions({ project, suspended = false }: { project: ActionsProject; suspended?: boolean }) {
  return (
    <Surface>
      <ProjectActionsView
        project={project}
        onOpenDemo={noop}
        onEdit={noop}
        onToggleFollow={noop}
        onOpenTesters={noop}
        suspended={suspended}
      />
    </Surface>
  )
}

/** Ce qui ne change pas d'un exemple de feuille à l'autre. */
const sheetBase: Omit<TesterPanelProps, 'mode'> = {
  authorName: 'Papi Jean',
  title: 'Décollage !',
  pending: false,
  problem: null,
  onConfirm: noop,
  onClose: noop,
}

/** Une feuille des testeurs ouverte dans la page, sur le voile, comme posée sur l'écran. */
function SheetExample({
  layout,
  ...panel
}: Partial<TesterPanelProps> & Pick<TesterPanelProps, 'mode'> & { layout: 'phone' | 'desktop' }) {
  const { colors } = useTheme()
  const content = useTesterPanel({ ...sheetBase, ...panel })
  const phone = layout === 'phone'
  return (
    <View
      style={{
        backgroundColor: colors.scrim,
        borderRadius: radii.tile,
        overflow: 'hidden',
        // Téléphone : la feuille courte collée en bas, la page devinée au-dessus ; ordinateur : le
        // panneau centré, de l'air autour.
        ...(phone
          ? { width: 390, maxWidth: '100%', paddingTop: space.xxxl, justifyContent: 'flex-end' }
          : { paddingVertical: space.xxxl }),
      }}
    >
      <SheetPanel layout={layout} {...content} />
    </View>
  )
}

export function TestersCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  // Côte à côte sur un écran large ; l'un sous l'autre ailleurs (un cadre de 390 points déborderait
  // d'une rangée dans un catalogue de 390).
  const wide = useLayout().sizeClass === 'wide'
  const pair = wide ? 'row' : 'column'
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Text variant="heading" heading={3}>
        {l.actionsTitle}
      </Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.offer} — ${l[scheme]}`}>
              <Actions project={seen} />
            </Example>
            <Example caption={`${l.tester} — ${l[scheme]}`}>
              <Actions project={{ ...seen, isTester: true }} />
            </Example>
            {scheme === 'day' ? (
              <>
                <Example caption={l.noLonger}>
                  <Actions project={{ ...seen, isTester: true, status: 'paused' }} />
                </Example>
                <Example caption={l.suspended}>
                  <Actions project={{ ...seen, isTester: true, isFollowed: false }} suspended />
                </Example>
              </>
            ) : null}
            <Example caption={`${l.author} — ${l[scheme]}`}>
              <Actions project={{ ...seen, isMine: true, testerCount: 12 }} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="heading" heading={3}>
        {l.sheetsTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Stack direction={pair} gap="lg" wrap={wide}>
              <Example caption={`${l.joinPhone} — ${l[scheme]}`}>
                <SheetExample layout="phone" mode="join" />
              </Example>
              <Example caption={`${l.memberPhone} — ${l[scheme]}`}>
                <SheetExample layout="phone" mode="member" />
              </Example>
            </Stack>
            {wide ? (
              <>
                <Example caption={`${l.joinDesktop} — ${l[scheme]}`}>
                  <SheetExample layout="desktop" mode="join" />
                </Example>
                <Example caption={`${l.memberDesktop} — ${l[scheme]}`}>
                  <SheetExample layout="desktop" mode="member" />
                </Example>
              </>
            ) : null}
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="heading" heading={3}>
        {l.statesTitle}
      </Text>
      <Stack direction={pair} gap="lg" wrap={wide}>
        <Example caption={l.pending}>
          <SheetExample layout="phone" mode="join" pending />
        </Example>
        <Example caption={l.full}>
          <SheetExample layout="phone" mode="join" problem="full" />
        </Example>
        <Example caption={l.notTestable}>
          <SheetExample layout="phone" mode="join" problem="notTestable" />
        </Example>
        <Example caption={l.failed}>
          <SheetExample layout="phone" mode="join" problem="failed" />
        </Example>
        <Example caption={l.quitPending}>
          <SheetExample layout="phone" mode="member" pending />
        </Example>
        <Example caption={l.quitFailed}>
          <SheetExample layout="phone" mode="member" problem="failed" />
        </Example>
      </Stack>
    </Stack>
  )
}
