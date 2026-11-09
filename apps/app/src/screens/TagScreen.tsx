// La page d'un outil du catalogue (tranche R6b, docs/scenarios/refonte.md, « La page d'un outil »,
// planches `R6-Outil` et `R6-Outil-Desktop`). Son adresse reste /tags/<slug>.
//
// De haut en bas : l'en-tête de l'outil (`ToolHeader` : son nom en très grand, « 34 projets · Sans
// code », sa description, qui l'a écrite, son site par la page « Tu quittes… ») ; les filtres (le
// statut, puis la catégorie : un bouton qui ouvre une feuille sur téléphone, une rangée de
// pastilles sur ordinateur) ; les projets en mosaïque de tuiles, 50 par page, puis « Afficher la
// suite ». Un administrateur voit en plus « Modifier », en haut à droite (la feuille de l'outil).
//
// Les filtres vivent dans l'adresse, en anglais (`?status=testable&category=cooking`) : la page se
// partage et se rouvre filtrée. Sur le web, la page est pré-rendue sans connaître l'adresse : elle
// attend d'être hydratée (`useHydrated`) pour lire les filtres, puis envoie une seule lecture, déjà
// filtrée. Un paramètre mal formé est ignoré, sans erreur. Une vieille adresse (un alias, comme
// /tags/chat-gpt) est remplacée par celle de l'outil, filtres gardés.
import {
  type AdminCatalogueTool,
  CategoryCode,
  type ToolAdmit,
  type ToolEdit,
  type ToolPage,
  ToolStatusFilter,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useCategories } from '../categories/api'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { type ToolPageFilters, useAdminTool, useEditTool, useToolPage } from '../tools/api'
import { Button } from '../ui/Button'
import { FilterButton } from '../ui/FilterButton'
import { FilterPills } from '../ui/FilterPills'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { ProjectTile } from '../ui/Tile'
import { TileMosaic } from '../ui/TileMosaic'
import { ToolHeader } from '../ui/ToolHeader'
import { useTapGuard } from '../ui/tapGuard'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { type CategoryFilterChoice, CategoryFilterSheet } from './CategoryFilterSheet'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'
import { type ToolEditResult, ToolEditSheet } from './ToolEditSheet'

export function TagScreen({ slug }: { slug: string }) {
  const { state, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen width="page" />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts). Rien de la
  // page n'est demandé avant : les lectures vivent dans `MemberToolPage`.
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  if (state === 'signedOut') return <SignedOutScreen width="page" />
  return <MemberToolPage slug={slug} />
}

/** Un paramètre d'adresse : Expo Router rend un tableau quand il est répété ; on garde le premier. */
type Param = string | string[] | undefined
const first = (param: Param) => (Array.isArray(param) ? param[0] : param)

/**
 * Les filtres lus dans l'adresse, chacun vérifié par le schéma du contrat : une valeur mal formée
 * (`?category=Cuisine!`) est ignorée, comme si elle n'y était pas.
 */
const filtersOf = (params: { status?: Param; category?: Param }): ToolPageFilters => {
  const status = ToolStatusFilter.safeParse(first(params.status))
  const category = CategoryCode.safeParse(first(params.category))
  return {
    ...(status.success ? { status: status.data } : null),
    ...(category.success ? { category: category.data } : null),
  }
}

/**
 * L'hôte d'un site (« lovable.dev » pour https://lovable.dev/) : le texte du lien. Lu à la main
 * plutôt que par `URL`, dont React Native ne donne pas toutes les parties.
 */
const hostOf = (url: string) => /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url

/** Les champs d'un outil d'administration, comme la feuille les attend. */
const initialOf = (tool: AdminCatalogueTool): Partial<ToolAdmit> => ({
  name: tool.name,
  family: tool.family,
  descriptionFr: tool.descriptionFr ?? '',
  descriptionEn: tool.descriptionEn ?? '',
  siteUrl: tool.siteUrl,
})

/** Ce qui a changé entre l'outil et les valeurs de la feuille : le PATCH n'envoie que cela. */
const changesOf = (before: Partial<ToolAdmit>, after: ToolAdmit): ToolEdit => {
  const changes: ToolEdit = {}
  if (after.name !== before.name) changes.name = after.name
  if (after.family !== before.family) changes.family = after.family
  if (after.descriptionFr !== before.descriptionFr) changes.descriptionFr = after.descriptionFr
  if (after.descriptionEn !== before.descriptionEn) changes.descriptionEn = after.descriptionEn
  if (after.siteUrl !== before.siteUrl) changes.siteUrl = after.siteUrl
  return changes
}

function MemberToolPage({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/tools')
  const hydrated = useHydrated()
  const params = useLocalSearchParams<{ status?: string; category?: string }>()
  // Avant l'hydratation, l'adresse n'est pas connue : aucun filtre, et aucune lecture (plus bas).
  const filters = hydrated ? filtersOf(params) : {}
  const page = useToolPage(slug, filters, hydrated)
  const me = useMe()
  const isAdmin = me.data?.isAdmin === true

  if (page.data) {
    return <ToolPageView slug={slug} filters={filters} page={page} isAdmin={isAdmin} />
  }
  if (page.isError) {
    const notFound = errorKey(page.error) === 'notFound'
    return (
      <Screen width="page" header={<TopNav />} onBack={back}>
        {notFound ? (
          // Un « Autre » ou un nom inconnu : pas de page, et une issue vers tous les outils.
          <StateMessage
            kind="notFound"
            level={1}
            title={t(($) => $.tool.notFoundTitle)}
            message={t(($) => $.tool.notFound)}
            actions={[
              { label: t(($) => $.tool.seeAllTools), onPress: () => router.push('/tools') },
            ]}
          />
        ) : (
          <StateMessage
            kind="error"
            level={1}
            title={t(($) => $.tool.errorTitle)}
            message={t(($) => $.errors[errorKey(page.error)])}
            actions={[{ label: t(($) => $.common.retry), onPress: () => void page.refetch() }]}
          />
        )}
      </Screen>
    )
  }
  return <LoadingScreen width="page" />
}

type ViewProps = {
  slug: string
  filters: ToolPageFilters
  page: ReturnType<typeof useToolPage>
  isAdmin: boolean
}

/** La page lue : l'en-tête, les filtres, la mosaïque, et la feuille d'un administrateur. */
function ToolPageView({ slug, filters, page, isAdmin }: ViewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/tools')
  const { sizeClass } = useLayout()
  const phone = sizeClass === 'compact'
  const openOutside = useOpenOutside()
  const toSource = useMediaSources()
  const guard = useTapGuard()
  const categories = useCategories()
  const pages = page.data?.pages ?? []
  const head = pages[0] as ToolPage
  const tool = head.tool
  const projects = pages.flatMap((one) => one.projects)
  const hasFilters = filters.status !== undefined || filters.category !== undefined

  // Une vieille adresse (un alias) : remplacée par celle de l'outil, filtres gardés, une fois.
  const replaced = useRef(false)
  useEffect(() => {
    if (replaced.current || page.isPlaceholderData || tool.slug === slug) return
    replaced.current = true
    router.replace({ pathname: '/tags/[slug]', params: { slug: tool.slug, ...filters } })
  }, [page.isPlaceholderData, tool.slug, slug, filters, router])

  /** Change un filtre dans l'adresse : `undefined` le retire (Expo Router mêle le reste). */
  const setFilter = (next: { status?: string | undefined; category?: string | undefined }) =>
    router.setParams(next)

  // --- Les catégories : celles des projets de l'outil, dans l'ordre de la feuille de publication.
  // Une catégorie dont le nom n'est pas (encore) lu ne s'affiche pas : jamais le code brut.
  const counts = new Map(head.categories.map((one) => [one.code, one.projectCount]))
  const choices: CategoryFilterChoice[] = (categories.data?.categories ?? [])
    .filter((category) => counts.has(category.code))
    .map((category) => ({
      code: category.code,
      name: category.name,
      icon: category.icon,
      count: counts.get(category.code) ?? 0,
    }))
  const chosen = categories.data?.categories.find((one) => one.code === filters.category)
  const spokenCount = (choice: CategoryFilterChoice) =>
    t(($) => $.tool.categoryWithCount, {
      name: choice.name,
      projects: t(($) => $.tools.projects, { count: choice.count ?? 0 }),
    })

  // --- La feuille des catégories (téléphone) : choisir applique, ferme et rend le focus au bouton.
  const [sheetOpen, setSheetOpen] = useState(false)
  const categoryButton = useRef<Focusable>(null)
  const focusButton = useRef(false)
  useEffect(() => {
    if (sheetOpen || !focusButton.current) return
    focusButton.current = false
    focusWithoutScroll(categoryButton.current)
  }, [sheetOpen])
  const chooseCategory = (code: string | null) => {
    setFilter({ category: code ?? undefined })
    focusButton.current = true
    setSheetOpen(false)
  }

  // --- « Afficher la suite » : quand le bouton disparaît (dernière page arrivée), le focus va à la
  // première tuile arrivée, au lieu de retomber en haut de la page.
  const tiles = useRef(new Map<string, Focusable | null>())
  const focusFrom = useRef<number | null>(null)
  useEffect(() => {
    const from = focusFrom.current
    if (from === null || page.isFetchingNextPage) return
    focusFrom.current = null
    if (page.hasNextPage) return
    const arrived = projects[from]
    if (!arrived) return
    const node = tiles.current.get(arrived.id)
    focusWithoutScroll(node)
    moveReaderTo(node)
  }, [projects, page.isFetchingNextPage, page.hasNextPage])
  const showMore = () => {
    if (page.isFetchingNextPage) return
    focusFrom.current = projects.length
    void page.fetchNextPage()
  }

  // --- « Modifier » (administrateur) : l'outil lu dans ses deux langues, puis la feuille.
  const adminTool = useAdminTool(tool.slug, tool.name, isAdmin)
  const { edit } = useEditTool()
  const [editWanted, setEditWanted] = useState(false)
  const editable = adminTool.data ?? null
  const editInitial = editable ? initialOf(editable) : {}
  const openEdit = () => {
    if (!adminTool.data) void adminTool.refetch()
    setEditWanted(true)
  }
  const submitEdit = async (values: ToolAdmit): Promise<ToolEditResult> => {
    if (!editable) return { ok: false, error: 'notFound' }
    const changes = changesOf(editInitial, values)
    if (Object.keys(changes).length === 0) return { ok: true }
    const result = await edit(editable.slug, changes)
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        ...(result.error === 'toolNameTaken' ? { field: 'name' as const } : null),
      }
    }
    // Un nom changé peut changer le slug : la page prend sa nouvelle adresse (l'ancienne y mène).
    if (result.data.slug !== slug) {
      router.replace({ pathname: '/tags/[slug]', params: { slug: result.data.slug, ...filters } })
    }
    return { ok: true }
  }
  // La lecture d'administration a échoué, ou ne trouve pas l'outil : dit sous la barre, après un
  // appui sur « Modifier » seulement.
  const editProblem =
    editWanted && adminTool.isError
      ? t(($) => $.errors[errorKey(adminTool.error)])
      : editWanted && adminTool.isSuccess && !editable
        ? t(($) => $.errors.notFound)
        : null

  // --- Les filtres.
  const statusLabels = {
    testable: t(($) => $.tool.statusTestable),
    done: t(($) => $.tool.statusDone),
  }
  const statusGroup = {
    label: t(($) => $.tool.statusLabel),
    allLabel: t(($) => $.tool.statusAll),
    value: filters.status ?? null,
    options: ToolStatusFilter.options.map((status) => ({
      value: status,
      label: statusLabels[status],
    })),
    onChange: (status: string | null) => setFilter({ status: status ?? undefined }),
  }
  const categoryGroup = {
    label: t(($) => $.tool.categoryLabel),
    allLabel: t(($) => $.tool.all),
    value: filters.category ?? null,
    options: choices.map((choice) => ({
      value: choice.code,
      label: choice.name,
      icon: choice.icon,
      count: choice.count ?? 0,
      spokenLabel: spokenCount(choice),
    })),
    onChange: (code: string | null) => setFilter({ category: code ?? undefined }),
  }

  const filtersRow = phone ? (
    <Stack gap="sm" align="stretch">
      <FilterPills {...statusGroup} scroll />
      <FilterButton
        ref={categoryButton}
        label={chosen ? chosen.name : t(($) => $.tool.allCategories)}
        spokenLabel={
          chosen
            ? t(($) => $.tool.categoryChosen, { name: chosen.name })
            : t(($) => $.tool.allCategories)
        }
        icon={chosen ? chosen.icon : 'squares-four'}
        onPress={() => setSheetOpen(true)}
      />
    </Stack>
  ) : (
    <FilterPills {...statusGroup} groups={choices.length > 0 ? [categoryGroup] : []} />
  )

  // --- Le contenu sous l'en-tête : un outil sans projet invite à publier ; des filtres sans
  // résultat proposent de les retirer ; sinon, la mosaïque.
  const empty = tool.projectCount === 0 && !hasFilters
  const content = empty ? (
    <StateMessage
      kind="empty"
      title={t(($) => $.tool.emptyTitle)}
      message={t(($) => $.tool.empty)}
      actions={[{ label: t(($) => $.home.publish), onPress: () => router.push('/projects/new') }]}
    />
  ) : (
    <Stack gap="lg" align="stretch">
      {filtersRow}
      {projects.length === 0 ? (
        <StateMessage
          kind="empty"
          message={t(($) => $.tool.emptyFiltered)}
          actions={
            hasFilters
              ? [
                  {
                    label: t(($) => $.tool.clearFilters),
                    onPress: () => setFilter({ status: undefined, category: undefined }),
                  },
                ]
              : []
          }
        />
      ) : (
        <TileMosaic columns={phone ? 2 : 4}>
          {projects.map((project) => {
            const visual = project.portraitCover ?? project.cover
            return (
              <ProjectTile
                key={project.id}
                ref={(node: Focusable | null) => {
                  tiles.current.set(project.id, node)
                }}
                title={project.title}
                author={project.author.name}
                image={
                  visual
                    ? {
                        source: toSource(visual.url),
                        thumbhash: visual.thumbhash,
                        label: project.title,
                      }
                    : null
                }
                onPress={guard(() => router.push(`/projects/${encodeURIComponent(project.id)}`))}
              />
            )
          })}
        </TileMosaic>
      )}
      {page.isFetchNextPageError ? (
        <Notice message={t(($) => $.errors[errorKey(page.error)])} />
      ) : null}
      {page.hasNextPage ? (
        <Button
          label={t(($) => $.tool.more)}
          variant="secondary"
          onPress={showMore}
          loading={page.isFetchingNextPage}
        />
      ) : null}
    </Stack>
  )

  return (
    <Screen
      width="page"
      header={<TopNav />}
      onBack={back}
      pageTitle={tool.name}
      notice={editProblem ? <Notice message={editProblem} /> : undefined}
      topAction={
        isAdmin ? (
          <Button
            label={t(($) => $.tool.edit)}
            icon="pencil-simple"
            variant="secondary"
            size="small"
            onPress={openEdit}
            loading={editWanted && !editable && adminTool.isFetching}
          />
        ) : undefined
      }
    >
      <Stack gap="xl" align="stretch">
        <ToolHeaderOf
          tool={tool}
          layout={phone ? 'phone' : 'wide'}
          onSite={guard(() => (tool.siteUrl ? openOutside(tool.siteUrl) : undefined))}
        />
        {content}
      </Stack>
      <CategoryFilterSheet
        open={sheetOpen}
        categories={choices}
        value={filters.category ?? null}
        onChange={chooseCategory}
        onClose={() => {
          focusButton.current = true
          setSheetOpen(false)
        }}
      />
      {isAdmin ? (
        <ToolEditSheet
          open={editWanted && editable !== null}
          mode="edit"
          initial={editInitial}
          onSubmit={submitEdit}
          onClose={() => setEditWanted(false)}
        />
      ) : null}
    </Screen>
  )
}

/** L'en-tête de l'outil, ses textes traduits ici (le composant les reçoit déjà écrits). */
function ToolHeaderOf({
  tool,
  layout,
  onSite,
}: {
  tool: ToolPage['tool']
  layout: 'phone' | 'wide'
  onSite: () => void
}) {
  const { t } = useTranslation()
  return (
    <ToolHeader
      name={tool.name}
      projects={t(($) => $.tools.projects, { count: tool.projectCount })}
      family={t(($) => $.tools.family[tool.family])}
      description={tool.description}
      disclaimer={t(($) => $.tool.disclaimer)}
      site={tool.siteUrl ? { host: hostOf(tool.siteUrl), onPress: onSite } : null}
      layout={layout}
    />
  )
}
