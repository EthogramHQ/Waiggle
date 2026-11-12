// La page du fil d'un testeur, pour l'auteur du projet (R7b, docs/scenarios/refonte.md, « Les
// retours » ; planches R7b-Fil et R7b-Fil-Nuit). Son adresse : /projects/<id>/testers/threads/<id
// du testeur>. On y arrive depuis une ligne de l'onglet « Retours » du coin, ou depuis Activité.
//
// De haut en bas : « Retour », l'en-tête du fil (`ThreadHeader` : la photo du testeur, son nom en
// titre, le projet ; sur ordinateur, « Dans les testeurs depuis le 2 nov. »), puis le fil lui-même
// (`TesterThreadView`), dont le compositeur reste collé au bas de l'écran sur téléphone.
//
// Qui est le testeur : le coin le dit pour un testeur actuel (la liste de l'auteur) ; un ancien
// testeur n'y est plus, on le cherche dans les fils (« À traiter », puis « Réglés »), page après page.
// Son fil est alors en lecture seule, avec la phrase qui le dit, comme dans un coin fermé.
// Seul l'auteur entre ici : un testeur lit son fil dans l'onglet « Retours » du coin ; tout autre
// membre, comme un fil inconnu, a la page introuvable (le même écran que pour un projet privé).
//
// Sur ordinateur, la page du fil montre le coin, la liste des fils à gauche et ce fil à droite
// (relecture du plan, ui-B1) : c'est la page du coin qui le fait (`TestersCornerScreen`, avec
// `member`), en reprenant `AuthorThreadPane` ci-dessous pour la colonne de droite.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import type { Project, TesterCorner } from '@ruche/contracts'
import { type ReactNode, type Ref, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useProject } from '../projects/hooks'
import { useTesterCorner, useThreads } from '../testers/corner-api'
import type { Focusable } from '../ui/focus'
import { HiddenHeading } from '../ui/HiddenHeading'
import { shortDate } from '../ui/relativeDate'
import { Screen } from '../ui/Screen'
import { ThreadHeader } from '../ui/ThreadHeader'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useNameOf } from '../useNameOf'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SessionErrorScreen } from './states'
// Les deux pages se rendent l'une l'autre (le coin pose ce fil à droite, ce fil rend le coin sur
// ordinateur) : chacune n'est lue qu'à l'affichage, jamais au chargement du module.
import { TestersCornerScreen } from './TestersCornerScreen'
import { type TesterThreadParts, TesterThreadView } from './TesterThreadView'

/** Le testeur du fil, tel que l'écran le montre : actuel (dans le coin) ou ancien. */
export type ThreadTester = {
  id: string
  name: string
  avatarUrl: string | null
  /** La date d'inscription d'un testeur actuel ; null pour un ancien. */
  since: string | null
  current: boolean
}

export function TesterThreadScreen({ id, member }: { id: string; member: string }) {
  const { state, session, retry } = useMemberSession()
  const hydrated = useHydrated()
  const { columns } = useLayout()
  // Sur ordinateur, une fois la page hydratée : le coin, la liste des fils à gauche et ce fil à
  // droite (ui-B1). Avant l'hydratation, la page pré-rendue ne connaît pas la largeur : le fil seul.
  if (hydrated && columns) return <TestersCornerScreen id={id} member={member} />
  if (state === 'pending') return <LoadingScreen width="page" />
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  // Un visiteur : la page introuvable, comme pour le coin lui-même (scénario R7b ; L5), et comme sur
  // ordinateur, où cette adresse affiche le coin.
  if (!session) return <ThreadNotFound />
  // Les lectures ne partent qu'avec une session : elles vivent dans le composant suivant.
  return <AuthorThread id={id} member={member} memberId={session.user.id} />
}

/** La page introuvable, la même que pour un projet qu'on n'a pas le droit de voir. */
function ThreadNotFound() {
  const { t } = useTranslation()
  return (
    <NotFoundState
      variant="project"
      width="page"
      title={t(($) => $.project.page.notFoundTitle)}
      message={t(($) => $.project.page.notFound)}
    />
  )
}

type ThreadProps = { id: string; member: string; memberId: string }

function AuthorThread({ id, member, memberId }: ThreadProps) {
  const project = useProject(id)
  const corner = useTesterCorner(id)
  for (const query of [corner, project]) {
    if (!query.error) continue
    if (errorKey(query.error) === 'notFound') return <ThreadNotFound />
    return <LoadErrorScreen error={query.error} onRetry={() => void query.refetch()} width="page" />
  }
  if (!corner.data || !project.data) return <LoadingScreen width="page" />
  // Un testeur lit son fil dans le coin ; ici, seul l'auteur entre.
  if (corner.data.role !== 'author') return <ThreadNotFound />
  const listed = corner.data.testers?.find((one) => one.id === member)
  const page = (tester: ThreadTester) => (
    <ThreadPage project={project.data} corner={corner.data} tester={tester} memberId={memberId} />
  )
  if (listed) return page({ ...listed, current: true })
  return <FormerTester projectId={id} member={member} render={page} />
}

/**
 * Un testeur qui n'est plus dans le coin : on le cherche dans les fils de l'auteur, page après page
 * (20 fils par page), « À traiter » et « Réglés » ensemble. Introuvable dans tous : la page
 * introuvable (un ancien testeur sans fil n'a rien à montrer).
 */
function FormerTester({
  projectId,
  member,
  render,
}: {
  projectId: string
  member: string
  render: (tester: ThreadTester) => ReactNode
}) {
  const search = useFormerTester(projectId, member)
  if (search.found) return render(search.found)
  return search.exhausted ? <ThreadNotFound /> : <LoadingScreen width="page" />
}

/** Ce que la recherche d'un ancien testeur a donné jusqu'ici. */
export type FormerTesterSearch = {
  /** Le testeur, une fois son fil trouvé ; null tant qu'il ne l'est pas. */
  found: ThreadTester | null
  /** Toutes les pages lues (ou en échec) sans le trouver. */
  exhausted: boolean
  /** Une lecture a échoué en route : « Réessayer » la relance. */
  failed: boolean
  retry: () => void
}

/**
 * Hook : cherche le fil d'un ancien testeur dans les fils de l'auteur, page après page, « À traiter »
 * et « Réglés » ensemble. Sert à la page du fil (téléphone) et à la colonne de droite du coin
 * (ordinateur, R7b, K8 : elle ne lisait que la première page). `skip` : le testeur est déjà connu
 * (un testeur actuel, dans la liste du coin) : aucune page de plus.
 */
export function useFormerTester(
  projectId: string,
  member: string,
  skip = false,
): FormerTesterSearch {
  const lists = [useThreads(projectId, 'open'), useThreads(projectId, 'settled')]
  const thread = lists
    .flatMap((list) => list.data?.pages.flatMap((one) => one.items) ?? [])
    .find((one) => one.tester.id === member)
  // Pas encore trouvé : la page suivante de chaque liste qui en a une. Sans liste de dépendances :
  // après chaque affichage, tant qu'il le faut (une page à la fois, `isFetchingNextPage`).
  useEffect(() => {
    if (skip || thread) return
    for (const list of lists)
      if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
        void list.fetchNextPage()
  })
  const exhausted = lists.every(
    (list) => list.isError || list.isFetchNextPageError || (list.data && !list.hasNextPage),
  )
  const failed = lists.some((list) => list.isError || list.isFetchNextPageError)
  return {
    found: thread ? { ...thread.tester } : null,
    exhausted,
    failed,
    retry: () => {
      for (const list of lists) {
        // Une première page en échec se relit ; une page suivante en échec se redemande.
        if (list.isError && !list.data) void list.refetch()
        else if (list.isFetchNextPageError) void list.fetchNextPage()
      }
    },
  }
}

type PageProps = {
  project: Project
  corner: TesterCorner
  tester: ThreadTester
  memberId: string
}

function ThreadPage({ project, corner, tester, memberId }: PageProps) {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  // Sans page précédente (un lien d'Activité ouvert dans un nouvel onglet) : l'onglet « Retours ».
  const back = useGoBack(`/projects/${project.id}/testers?tab=feedback`)
  const pageTitle = t(($) => $.project.testers.thread.pageTitle, {
    nameOf: nameOf(tester.name),
    title: project.title,
  })
  return (
    <AuthorThreadPane
      project={project}
      corner={corner}
      tester={tester}
      memberId={memberId}
      // Sur téléphone, la page s'ouvre sur le dernier message, au-dessus du compositeur (K11).
      openAtLatest
      layout={({ head, messages, footer }) => (
        <Screen
          width="page"
          header={<TopNav />}
          onBack={back}
          pageTitle={pageTitle}
          thumbhash={project.visuals[0]?.thumbhash ?? null}
          // Sur téléphone, le compositeur reste collé au bas de l'écran, au-dessus du clavier.
          {...(footer ? { footer } : null)}
        >
          {/* Le titre de la page, pour les lecteurs d'écran ; le nom du testeur, en titre de
              niveau 2 juste dessous, est ce que les yeux lisent. */}
          <HiddenHeading text={pageTitle} />
          {head}
          {messages}
        </Screen>
      )}
    />
  )
}

/**
 * Le fil d'un testeur pour l'auteur : son en-tête et le fil, avec le compositeur ou la phrase de la
 * lecture seule. La page du fil le pose dans un `Screen` ; la page du coin, sur ordinateur, dans sa
 * colonne de droite (ui-B1 : `headingRef` y reçoit le focus à l'ouverture).
 */
export function AuthorThreadPane({
  project,
  corner,
  tester,
  memberId,
  headingRef,
  layout,
  openAtLatest = false,
}: PageProps & {
  /** Le fil s'ouvre sur son dernier message (`TesterThreadView`) : la page du fil seulement. */
  openAtLatest?: boolean
  headingRef?: Ref<Focusable>
  /** Range les trois morceaux ; par défaut, l'un sous l'autre. */
  layout?: (parts: TesterThreadParts & { head: ReactNode }) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const toSource = useMediaSources()
  // « Dans les testeurs depuis le 2 nov. » : sur ordinateur, où la place le permet (planche Desktop).
  const { columns } = useLayout()
  const since = tester.since
  const head = (
    <ThreadHeader
      name={tester.name}
      avatar={toSource(tester.avatarUrl)}
      project={project.title}
      since={
        columns && since
          ? t(($) => $.project.testers.list.sinceLong, { date: shortDate(since, i18n.language) })
          : null
      }
      {...(headingRef ? { headingRef } : null)}
    />
  )
  // Le coin fermé l'emporte : même un testeur actuel n'y lit plus rien de neuf.
  const readOnly = corner.closed
    ? t(($) => $.project.testers.thread.closedCorner)
    : tester.current
      ? null
      : t(($) => $.project.testers.thread.closedFormer, { name: tester.name })
  return (
    <TesterThreadView
      projectId={project.id}
      testerId={tester.id}
      memberId={memberId}
      reader="author"
      authorName={project.author.name}
      testerName={tester.name}
      readOnly={readOnly}
      closed={corner.closed}
      openAtLatest={openAtLatest}
      layout={({ messages, footer }) => (
        <>
          {layout ? (
            layout({ head, messages, footer })
          ) : (
            <>
              {head}
              {messages}
              {footer}
            </>
          )}
        </>
      )}
    />
  )
}
