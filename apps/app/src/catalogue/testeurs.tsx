// La section « Les testeurs » du catalogue (R7a, U5a ; R7b) : ce que la page d'un projet montre des
// testeurs, et la feuille d'inscription.
// - Les actions de la page (projects/ProjectActions, `ProjectActionsView`) : « Rejoindre les
//   testeurs » sous « Suivre ce projet », pour un autre membre sur un projet « Testable » ; « Le coin
//   des testeurs » une fois inscrit (R7b), même sur un projet qui ne cherche plus de testeurs, et
//   pour un compte suspendu (pour relire son fil et partir) ; rien pour un membre que l'auteur a
//   retiré ; pour l'auteur, « Le coin des testeurs » et « 12 testeurs » à côté, sous « Modifier ».
// - La feuille d'inscription (screens/TesterSheet, `useTesterPanel`, posée ouverte dans la page par
//   `SheetPanel`), sur téléphone et sur ordinateur, puis ses états : en cours, complet, refus,
//   panne, session expirée. La feuille « Tu testes ce projet » de R7a a disparu (R7b).
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
    'Sur la page d’un projet « Testable » qui a une démo, un autre membre lit « Rejoindre les testeurs » sous « Suivre ce projet », en blanc : « Tester la démo » reste la seule action miel. Le bouton ouvre une feuille qui dit ce que l’inscription veut dire ; une fois inscrit, le même bouton devient « Le coin des testeurs », qui mène à la page du coin (on quitte depuis le coin ou le menu « … »). L’auteur lit « Le coin des testeurs » et le nombre de ses testeurs sous « Modifier » ; personne d’autre ne voit ce nombre.',
  actionsTitle: 'Sur la page du projet',
  offer: 'Un autre membre, projet « Testable » : « Rejoindre les testeurs »',
  tester: 'Inscrit : « Le coin des testeurs »',
  noLonger: 'Inscrit, projet passé « En pause » : le coin reste',
  suspended: 'Compte suspendu, inscrit : « Suivre ce projet » inactif, le coin reste',
  removed: 'Retiré par l’auteur : ni « Rejoindre », ni coin, sans dire pourquoi',
  author: 'L’auteur : « Le coin des testeurs » et « 12 testeurs », sous « Modifier »',
  authorNone: 'L’auteur, projet « Testable » sans testeur : « 0 testeur »',
  authorSuspended: 'L’auteur suspendu : ni « Modifier », le coin reste (fermé aux testeurs)',
  authorIdea: 'L’auteur, projet « Idée » qui n’a jamais eu de testeur : pas de coin',
  sheetsTitle: 'La feuille d’inscription',
  joinPhone: '« Rejoindre les testeurs », téléphone',
  joinDesktop: '« Rejoindre les testeurs », ordinateur',
  statesTitle: 'États de la feuille (téléphone)',
  pending: 'Inscription en cours : le bouton charge, « Annuler » attend',
  full: 'Complet (409 testers_full) : jamais un nombre',
  notTestable: 'Refus (409 not_testable) : vrai pour toutes les causes',
  failed: 'Panne : réessayer reste possible',
  expired: 'Session expirée : « Me reconnecter »',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Testers',
  intro:
    'On the page of a “Testable” project with a demo, another member reads “Join the testers” under “Follow this project”, in white: “Try the demo” stays the only honey action. The button opens a sheet that says what joining means; once in, the same button becomes “The testers’ corner”, which leads to the corner page (one leaves from the corner or the “…” menu). The author reads “The testers’ corner” and the number of testers under “Edit”; nobody else sees that number.',
  actionsTitle: 'On the project page',
  offer: 'Another member, “Testable” project: “Join the testers”',
  tester: 'Joined: “The testers’ corner”',
  noLonger: 'Joined, project now “Paused”: the corner stays',
  suspended: 'Suspended account, joined: “Follow this project” inactive, the corner stays',
  removed: 'Removed by the author: neither “Join” nor corner, without saying why',
  author: 'The author: “The testers’ corner” and “12 testers”, under “Edit”',
  authorNone: 'The author, “Testable” project without testers: “0 testers”',
  authorSuspended: 'Suspended author: no “Edit”, the corner stays (closed to testers)',
  authorIdea: 'The author, “Idea” project that never had testers: no corner',
  sheetsTitle: 'The join sheet',
  joinPhone: '“Join the testers”, phone',
  joinDesktop: '“Join the testers”, computer',
  statesTitle: 'Sheet states (phone)',
  pending: 'Joining: the button loads, “Cancel” waits',
  full: 'Full (409 testers_full): never a number',
  notTestable: 'Refused (409 not_testable): true for every cause',
  failed: 'Failure: trying again stays possible',
  expired: 'Session expired: “Sign in again”',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/** Le projet de Papi Jean, vu par un autre membre : « Testable », avec une démo, douze abonnés. */
const seen: ActionsProject = {
  ...recipesProject,
  title: 'Décollage !',
  author: { ...recipesProject.author, name: 'Papi Jean' },
  isMine: false,
  isFollowed: true,
  followerCount: 12,
  isTester: false,
  testerCount: null,
  testerJoinable: true,
}

/** Le même projet, vu par son auteur : douze testeurs. */
const mine: ActionsProject = { ...seen, isMine: true, testerCount: 12, testerJoinable: false }

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
    <Surface padding="lg">
      <ProjectActionsView
        project={project}
        onOpenDemo={noop}
        onEdit={noop}
        onToggleFollow={noop}
        onOpenTesters={noop}
        onOpenCorner={noop}
        suspended={suspended}
      />
    </Surface>
  )
}

/** Ce qui ne change pas d'un exemple de feuille à l'autre. */
const sheetBase: TesterPanelProps = {
  authorName: 'Papi Jean',
  title: 'Décollage !',
  pending: false,
  problem: null,
  onConfirm: noop,
  onClose: noop,
}

/** La feuille d'inscription ouverte dans la page, sur le voile, comme posée sur l'écran. */
function SheetExample({
  layout,
  ...panel
}: Partial<TesterPanelProps> & { layout: 'phone' | 'desktop' }) {
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
  const { t, i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  // « Me reconnecter », le lien de l'appli sous le message d'une session expirée.
  const signIn = t(($) => $.states.signIn)
  // Côte à côte sur un écran large ; l'un sous l'autre ailleurs (un cadre de 390 points déborderait
  // d'une rangée dans un catalogue de 390).
  const wide = useLayout().sizeClass === 'wide'
  const pair = wide ? 'row' : 'column'
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Text variant="headline" heading={3}>
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
                <Example caption={l.removed}>
                  <Actions project={{ ...seen, testerJoinable: false }} />
                </Example>
              </>
            ) : null}
            <Example caption={`${l.author} — ${l[scheme]}`}>
              <Actions project={mine} />
            </Example>
            {scheme === 'day' ? (
              <>
                <Example caption={l.authorNone}>
                  <Actions project={{ ...mine, testerCount: 0 }} />
                </Example>
                <Example caption={l.authorSuspended}>
                  <Actions project={mine} suspended />
                </Example>
                <Example caption={l.authorIdea}>
                  <Actions project={{ ...mine, status: 'idea', testerCount: 0 }} />
                </Example>
              </>
            ) : null}
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.sheetsTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack direction={pair} gap="lg" wrap={wide}>
            <Example caption={`${l.joinPhone} — ${l[scheme]}`}>
              <SheetExample layout="phone" />
            </Example>
            {wide ? (
              <Example caption={`${l.joinDesktop} — ${l[scheme]}`}>
                <SheetExample layout="desktop" />
              </Example>
            ) : null}
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.statesTitle}
      </Text>
      <Stack direction={pair} gap="lg" wrap={wide}>
        <Example caption={l.pending}>
          <SheetExample layout="phone" pending />
        </Example>
        <Example caption={l.full}>
          <SheetExample layout="phone" problem="full" />
        </Example>
        <Example caption={l.notTestable}>
          <SheetExample layout="phone" problem="notTestable" />
        </Example>
        <Example caption={l.failed}>
          <SheetExample layout="phone" problem="failed" />
        </Example>
        <Example caption={l.expired}>
          <SheetExample
            layout="phone"
            problem="expired"
            problemAction={{ label: signIn, onPress: noop }}
          />
        </Example>
      </Stack>
    </Stack>
  )
}
