// La section « En-tête et actions d'un projet » du catalogue (R5a, U7a) : ce que la page projet pose
// sous la galerie. L'en-tête (statut et catégorie, titre, ligne de dates, auteur et sa pastille « Suivre »,
// pitch) et les actions (« Tester la démo » et son site, « Suivre ce projet » ou « Modifier », et
// leurs abonnés ; le bandeau d'un projet privé), vus par un autre membre, par l'auteur, et pour un
// projet privé, de jour et de nuit. Puis la ligne de l'auteur seule, dans ses autres états : pas
// encore lue (ni pastille, ni pseudo : leur place est gardée), suivie, en échec, inactive.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { Project } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProjectActionsView } from '../projects/ProjectActions'
import { ProjectHeaderView } from '../projects/ProjectHeader'
import { recipesProject } from '../testing/projects'
import { type AuthorFollow, AuthorLine, type AuthorLineProps } from '../ui/AuthorLine'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { useNameOf } from '../useNameOf'

const fr = {
  title: 'En-tête et actions d’un projet',
  intro:
    'Sous la galerie : le statut, le titre, « Publié le … · Mis à jour … » (« Créé le … » pour un projet privé), l’auteur et sa pastille « Suivre » (jamais sur sa propre page), le pitch. Puis « Tester la démo », la seule action miel, et à côté « Suivre ce projet » ou, pour l’auteur, « Modifier » : côte à côte quand ils tiennent, l’un sous l’autre sinon.',
  other: 'Vu par un autre membre (touche « Suivre » et « Suivre ce projet »)',
  mine: 'Vu par l’auteur',
  private: 'Projet privé, vu par l’auteur (une seule catégorie)',
  legacy: 'Projet publié avant les catégories (R6a) : rien à côté du statut',
  lineTitle: 'La ligne de l’auteur, ses autres états',
  unknown: 'Pas encore lue : ni pastille ni pseudo, leur place est gardée',
  followed: 'Déjà suivie à l’ouverture',
  failed: 'Le dernier geste a échoué (session expirée)',
  disabled: 'Compte suspendu, l’abonnement retiré : à sa place, inactive',
  expired: 'Ta session a expiré. Reconnecte-toi pour continuer.',
  signIn: 'Me reconnecter',
  sampleTitle: 'Décollage !',
  samplePitch: 'Un quiz sur l’espace qui s’adapte à l’âge de Yanis, 8 ans.',
  author: 'Papi Jean',
  handle: '@papi_jean',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Project header and actions',
  intro:
    'Under the gallery: the status, the title, “Published … · Updated …” (“Created …” for a private project), the author and the “Follow” chip (never on one’s own page), the pitch. Then “Try the demo”, the only honey action, and beside it “Follow this project” or, for the author, “Edit”: side by side when they fit, one under the other otherwise.',
  other: 'Seen by another member (tap “Follow” and “Follow this project”)',
  mine: 'Seen by the author',
  private: 'Private project, seen by the author (a single category)',
  legacy: 'Project published before categories (R6a): nothing beside the status',
  lineTitle: 'The author line, its other states',
  unknown: 'Not read yet: no chip, no handle, their place is kept',
  followed: 'Already followed at opening',
  failed: 'The last gesture failed (session expired)',
  disabled: 'Suspended account, follow removed: in place, inactive',
  expired: 'Your session has expired. Sign in again to continue.',
  signIn: 'Sign in again',
  sampleTitle: 'Lift-off!',
  samplePitch: 'A space quiz that adapts to the age of Yanis, 8.',
  author: 'Grandpa Jean',
  handle: '@papi_jean',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr

/** L'heure figée du catalogue : « Publié le 3 oct. · Mis à jour hier ». */
const NOW = new Date('2026-10-20T10:00:00.000Z')
const noop = () => {}

/** Le projet d'exemple, publié le 3 octobre et mis à jour la veille de NOW. */
const sample = (l: Labels): Project => ({
  ...recipesProject,
  title: l.sampleTitle,
  pitch: l.samplePitch,
  author: { id: 'u9', name: l.author, avatarUrl: null },
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-19T17:00:00.000Z',
  demoUrl: 'https://decollage.lovable.app',
  followerCount: 12,
  // R6a : la catégorie à côté du statut, « Sciences et espace · Apprendre ».
  primaryCategory: 'science',
  secondaryCategory: 'learning',
})

export function ProjectPartsCatalogue() {
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
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.other} — ${l[scheme]}`}>
              <OtherMember l={l} />
            </Example>
            <Example caption={`${l.mine} — ${l[scheme]}`}>
              <Parts l={l} project={{ ...sample(l), isMine: true }} />
            </Example>
            <Example caption={`${l.private} — ${l[scheme]}`}>
              <Parts
                l={l}
                project={{
                  ...sample(l),
                  isMine: true,
                  visibility: 'private',
                  secondaryCategory: null,
                }}
              />
            </Example>
            <Example caption={`${l.legacy} — ${l[scheme]}`}>
              <Parts
                l={l}
                project={{
                  ...sample(l),
                  isMine: true,
                  primaryCategory: null,
                  secondaryCategory: null,
                }}
              />
            </Example>
            <Example caption={`${l.lineTitle} — ${l[scheme]}`}>
              <LineStates l={l} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Les textes de la ligne de l'auteur, comme `useAuthorLine` les écrit. */
/** `read` faux : la page du membre n'est pas encore lue, le pseudo pas encore connu. */
const useLine = (l: Labels, read = true): AuthorLineProps => {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  return {
    name: l.author,
    handle: read ? l.handle : undefined,
    avatar: null,
    openLabel: t(($) => $.member.open, { nameOf: nameOf(l.author) }),
    onOpen: noop,
  }
}

/** La pastille dans l'état donné, avec les textes de l'appli. */
const useChip = (l: Labels, followed: boolean, onPress: (shown: boolean) => void): AuthorFollow => {
  const { t } = useTranslation()
  const name = l.author
  return {
    followed,
    label: followed
      ? t(($) => $.follow.memberFollowing, { name })
      : t(($) => $.follow.member, { name }),
    text: followed ? t(($) => $.follow.memberFollowing, { name }) : t(($) => $.follow.follow),
    onPress: (shown) => onPress(!shown),
  }
}

/** Vu par un autre membre : la pastille et « Suivre ce projet » changent au toucher. */
function OtherMember({ l }: { l: Labels }) {
  const [author, setAuthor] = useState(false)
  const [project, setProject] = useState(false)
  const line = useLine(l)
  const chip = useChip(l, author, setAuthor)
  const base = sample(l)
  return (
    <Parts
      l={l}
      project={{
        ...base,
        isMine: false,
        isFollowed: project,
        followerCount: base.followerCount + (project ? 1 : 0),
      }}
      author={{ ...line, follow: chip }}
      onToggleFollow={(shown) => setProject(!shown)}
    />
  )
}

/** L'en-tête et les actions, comme sur la page. */
function Parts({
  l,
  project,
  author,
  onToggleFollow = noop,
}: {
  l: Labels
  project: Project
  author?: AuthorLineProps
  onToggleFollow?: (shown: boolean) => void
}) {
  const line = useLine(l)
  return (
    <Stack gap="lg">
      <ProjectHeaderView project={project} author={author ?? line} now={NOW} />
      <ProjectActionsView
        project={project}
        onOpenDemo={noop}
        onEdit={noop}
        onToggleFollow={onToggleFollow}
      />
    </Stack>
  )
}

/** La ligne de l'auteur seule : pas encore lue, suivie, en échec, inactive. */
function LineStates({ l }: { l: Labels }) {
  const unread = useLine(l, false)
  const line = useLine(l)
  const followed = useChip(l, true, noop)
  const notFollowed = useChip(l, false, noop)
  return (
    <Stack gap="lg">
      <Captioned caption={l.unknown}>
        <AuthorLine {...unread} />
      </Captioned>
      <Captioned caption={l.followed}>
        <AuthorLine {...line} follow={followed} />
      </Captioned>
      <Captioned caption={l.failed}>
        <AuthorLine
          {...line}
          follow={notFollowed}
          error={l.expired}
          errorAction={{ label: l.signIn, onPress: noop }}
        />
      </Captioned>
      <Captioned caption={l.disabled}>
        <AuthorLine {...line} follow={{ ...notFollowed, disabled: true }} />
      </Captioned>
    </Stack>
  )
}

function Captioned({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
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
