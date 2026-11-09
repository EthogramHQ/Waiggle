// La page « Outils » de la Modération (tranche R6b, « /moderation/tools » ; scénario
// docs/scenarios/refonte.md, « Ranger les « Autre » »), réservée aux administrateurs. Deux onglets :
// - « À vérifier » : les autres outils tapés par les membres (« Make.com »), du plus récent au plus
//   ancien, chacun avec ses projets visibles. Trois décisions par carte : « Ajouter au catalogue »
//   (la feuille d'un outil, nom prérempli), « Rattacher à un outil » (choisir l'outil du catalogue,
//   puis confirmer dans une fenêtre qui dit combien de projets et de profils changeront, jur-T5) et
//   « Laisser hors du catalogue » (en un geste) ;
// - « Catalogue » : chercher un outil, le modifier, en ajouter un.
// En bas, « Changements récents » : qui a changé quoi au catalogue.
//
// Les règles de la file de modération (tranche 7a), reprises ici :
// - une carte décidée reste à sa place, son résultat à la place de ses boutons, jusqu'au changement
//   d'onglet : la carte suivante ne remonte pas sous le doigt ;
// - la garde contre la double tape : chaque bouton de carte a la sienne (600 ms, `PendingToolCard`) ;
//   au-delà, c'est l'état de la page qui refuse un second effet : une feuille déjà ouverte, une
//   écriture en cours (une tape 700 ms après n'ouvre pas une seconde feuille, n'écrit pas deux fois) ;
// - le focus ne se perd pas : après une décision prise dans une feuille, le bouton qui l'a ouverte
//   n'existe plus ; le focus va au résultat de la carte (sinon la feuille le rendrait au bouton de
//   même nom de la carte voisine).
//
// Pour tout autre membre, la page n'existe pas (« Page introuvable »), comme `/moderation` : l'appli
// lit `me.isAdmin`, et l'API, qui refait la vérification à chaque demande, répond 404.
import {
  type AdminCatalogueTool,
  CATALOGUE_PAGE_SIZE,
  foldTool,
  type PendingTool,
  type ToolAdmit,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { type ApiErrorKey, type ApiResult, errorKey } from '../api/errors'
import {
  pendingToolsKey,
  useAdminTools,
  useCatalogueChanges,
  useCatalogueRefresh,
  useDismissTool,
  useMergeTool,
  usePendingTools,
  useToolImpact,
} from '../moderation/catalogue-api'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { useAdmitTool, useCreateTool, useEditTool, useTools } from '../tools/api'
import { changesOf, initialOf } from '../tools/edit'
import { useToolLabels } from '../tools/labels'
import { isCatalogueName, matchTools } from '../tools/match'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { FeedEnd } from '../ui/FeedEnd'
import type { Focusable } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { PendingToolCard, type PendingToolOutcome } from '../ui/PendingToolCard'
import { Screen } from '../ui/Screen'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { ToolField } from '../ui/ToolField'
import { CatalogueRecentChanges, listState } from './CatalogueRecentChanges'
import { ProjectAbandonDialog } from './ProjectAbandonDialog'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'
import type { ToolEditResult } from './ToolEditSheet'
import { ToolEditSheet } from './ToolEditSheet'

type Tab = 'pending' | 'catalogue'

/** Où va le focus à la fermeture d'une feuille de carte : le résultat de la carte décidée. */
const RESULT = 'result'

/** Une décision prise sur une carte : jamais « rien encore » (la carte est alors sans entrée). */
type Outcome = NonNullable<PendingToolOutcome>

/**
 * Une carte décidée : la liste de l'API ne la donnera plus à sa prochaine lecture ; l'écran la garde
 * à la place qu'elle avait (`index`, son rang parmi les cartes affichées), avec son résultat.
 */
type Decided = { index: number; tool: PendingTool; outcome: Outcome }

/** Une carte affichée : un « Autre » de la liste, et son résultat s'il a été décidé. */
type Shown = { tool: PendingTool; outcome: Outcome | null }

/**
 * Les cartes affichées : celles de la liste reçue, et les cartes décidées remises à leur rang. Une
 * carte décidée encore présente dans la liste n'y figure qu'une fois, avec son résultat.
 */
const keepDecided = (items: readonly PendingTool[], decided: readonly Decided[]): Shown[] => {
  const done = new Set(decided.map((entry) => entry.tool.slug))
  const shown: Shown[] = items
    .filter((tool) => !done.has(tool.slug))
    .map((tool) => ({ tool, outcome: null }))
  // Du plus petit rang au plus grand : chaque carte retrouve sa place parmi celles déjà posées.
  for (const entry of [...decided].sort((a, b) => a.index - b.index)) {
    shown.splice(Math.min(entry.index, shown.length), 0, {
      tool: entry.tool,
      outcome: entry.outcome,
    })
  }
  return shown
}

/**
 * Le résultat d'une écriture d'outil, tel que la feuille l'attend : un nom déjà pris se lit sous le
 * champ « Nom », les autres refus au pied de la feuille.
 */
const sheetResult = (result: ApiResult<unknown>): ToolEditResult =>
  result.ok
    ? { ok: true }
    : {
        ok: false,
        error: result.error,
        ...(result.error === 'toolNameTaken' ? { field: 'name' as const } : null),
      }

/** Ce que la feuille d'un outil fait en ce moment : admettre un « Autre », créer, ou modifier. */
type Form =
  | { mode: 'admit'; tool: PendingTool; index: number }
  | { mode: 'create' }
  | { mode: 'edit'; tool: AdminCatalogueTool }

export function ModerationToolsScreen() {
  const { t } = useTranslation()
  const { state, session, retry } = useMemberSession()
  // Le profil dit si le membre est administrateur ; personne de connecté : on ne demande rien.
  const me = useMe(Boolean(session))
  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />
  if (!me.data) {
    if (me.isError) return <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} />
    return <LoadingScreen />
  }
  // Un membre qui n'est pas administrateur : la page n'existe pas pour lui, rien n'est demandé.
  if (!me.data.isAdmin) return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  return <AdminTools />
}

function AdminTools() {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/moderation')
  const [tab, setTab] = useState<Tab>('pending')
  const pending = usePendingTools()
  const changes = useCatalogueChanges()
  const { changed, refreshList } = useCatalogueRefresh()
  const { admit } = useAdmitTool()
  const { create } = useCreateTool()
  const { edit } = useEditTool()
  const { dismiss } = useDismissTool()

  // Les cartes décidées, gardées à leur place jusqu'au changement d'onglet.
  const [decided, setDecided] = useState<Decided[]>([])
  // La panne de la dernière décision en un geste (« Laisser hors »), en tête de page : elle reste
  // jusqu'à la réponse de la décision suivante (charte du design : rien ne saute sous le doigt).
  const [failure, setFailure] = useState<string | null>(null)
  // Une écriture sur un « Autre » est en route : un ref, lu au moment de l'appui, sans attendre que
  // l'écran se redessine (la seconde tape d'une double tape arrive avant).
  const deciding = useRef(false)

  // Le focus à la fermeture d'une feuille de carte (« Ajouter », « Rattacher ») :
  // - après une décision, le résultat de la carte : le bouton qui a ouvert la feuille n'existe plus
  //   (la feuille le rendrait au bouton de même nom de la carte voisine) ;
  // - sans décision, le bouton qui l'a ouverte (sur le web, la feuille ne le connaît pas toujours :
  //   un bouton touché du doigt n'a pas forcément eu le focus).
  // La feuille pose elle-même le focus à cette place (`returnFocusTo`) : à la fermeture, puis encore
  // à la fin de son fondu de sortie, pendant lequel le piège à focus du Modal du web le ramène en
  // elle. Posé par l'écran à la seule fermeture, il finissait sur le bouton de même nom de la carte
  // voisine (R6b, u8f).
  const [lastDecided, setLastDecided] = useState<string | null>(null)
  const resultRef = useRef<Focusable | null>(null)
  const openers = useRef(new Map<string, Focusable | null>())
  const decidedInSheet = useRef(false)
  const focusAfterClose = useRef<string | null>(null)
  /** Une feuille de carte se ferme : où va le focus (voir plus haut) ; null pour les autres feuilles. */
  const focusOnClose = (opener: string | null) => {
    focusAfterClose.current = opener && decidedInSheet.current ? RESULT : opener
    decidedInSheet.current = false
  }
  /** La place du focus à la fermeture, lue par la feuille ; null : son ouvreur. */
  const closedFocus = () => {
    const target = focusAfterClose.current
    if (target === null) return null
    return target === RESULT ? resultRef.current : (openers.current.get(target) ?? null)
  }
  /** La ref d'un bouton de carte, rangée par carte et par geste (« make-com:merge »). */
  const openerRef = (key: string) => (node: Focusable | null) => {
    openers.current.set(key, node)
  }

  /** Garde la carte décidée à sa place, avec son résultat. */
  const settle = (tool: PendingTool, index: number, outcome: Outcome) => {
    setDecided((previous) => [
      ...previous.filter((entry) => entry.tool.slug !== tool.slug),
      { index, tool, outcome },
    ])
    setLastDecided(tool.slug)
  }

  /** Changer d'onglet est le geste qui range les cartes décidées : la liste est relue. */
  const changeTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    if (decided.length > 0) refreshList(pendingToolsKey)
    setDecided([])
    setFailure(null)
    setLastDecided(null)
  }

  // --- La feuille d'un outil (admettre, créer, modifier). `form` reste rempli pendant le fondu de
  // fermeture, pour que son titre ne change pas sous les yeux ; `formOpen` dit si elle est ouverte.
  const [form, setForm] = useState<Form | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const openForm = (next: Form) => {
    setForm(next)
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    // Créer, modifier : la feuille rend le focus à son ouvreur, toujours là (null).
    focusOnClose(form?.mode === 'admit' ? `${form.tool.slug}:admit` : null)
  }

  const formInitial: Partial<ToolAdmit> =
    form?.mode === 'admit'
      ? { name: form.tool.name }
      : form?.mode === 'edit'
        ? initialOf(form.tool)
        : {}

  const submitForm = async (values: ToolAdmit): Promise<ToolEditResult> => {
    if (!form) return { ok: false, error: 'notFound' }
    if (form.mode === 'admit') {
      deciding.current = true
      const result = await admit(form.tool.slug, values)
      deciding.current = false
      if (result.ok) {
        settle(form.tool, form.index, { kind: 'admitted' })
        decidedInSheet.current = true
        changed({ catalogue: true })
      }
      return sheetResult(result)
    }
    if (form.mode === 'create') {
      const result = await create(values)
      if (result.ok) changed({ catalogue: true })
      return sheetResult(result)
    }
    const changes = changesOf(initialOf(form.tool), values)
    if (Object.keys(changes).length === 0) return { ok: true }
    const result = await edit(form.tool.slug, changes)
    if (result.ok) changed({ catalogue: true })
    return sheetResult(result)
  }

  // --- « Rattacher à un outil » : la feuille du choix, puis la fenêtre de confirmation.
  const [merging, setMerging] = useState<{ tool: PendingTool; index: number } | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)

  /** Une décision ne s'ouvre pas pendant une autre : feuille ouverte, écriture en route. */
  const busy = () => formOpen || mergeOpen || deciding.current

  const onAdmit = (tool: PendingTool, index: number) => {
    if (busy()) return
    openForm({ mode: 'admit', tool, index })
  }
  const onMerge = (tool: PendingTool, index: number) => {
    if (busy()) return
    setMerging({ tool, index })
    setMergeOpen(true)
  }
  const onDismiss = async (tool: PendingTool, index: number) => {
    if (busy()) return
    deciding.current = true
    const result = await dismiss(tool.slug)
    deciding.current = false
    // Déjà décidé ailleurs (un autre administrateur) : l'API ne le connaît plus, la carte le dit
    // quand même hors de la liste, comme si on venait de le faire.
    if (result.ok || result.error === 'notFound') {
      setFailure(null)
      settle(tool, index, { kind: 'dismissed' })
    } else {
      setFailure(t(($) => $.errors[result.error]))
    }
  }
  const onMerged = (target: string) => {
    if (!merging) return
    settle(merging.tool, merging.index, { kind: 'merged', target })
    decidedInSheet.current = true
  }
  const closeMerge = () => {
    setMergeOpen(false)
    if (merging) focusOnClose(`${merging.tool.slug}:merge`)
  }

  // --- Le catalogue (onglet « Catalogue ») : lu seulement une fois l'onglet ouvert.
  const [search, setSearch] = useState('')
  const catalogue = useAdminTools(search, tab === 'catalogue')

  // La liste affichée, et ses refus qui changent toute la page (un administrateur révoqué : l'API
  // ne connaît plus la page).
  const fatal = !pending.data && pending.isError ? errorKey(pending.error) : null
  if (fatal === 'notFound') return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  if (fatal === 'unauthorized') return <SignedOutScreen expired />

  const pendingItems = pending.data?.pages.flatMap((page) => page.items) ?? []
  const shown = keepDecided(pendingItems, decided)
  const catalogueItems = catalogue.data?.pages.flatMap((page) => page.items) ?? []

  const pendingContent =
    pending.isError && !pending.data ? (
      <StateMessage
        kind="error"
        level={2}
        title={t(($) => $.moderation.errorTitle)}
        message={t(($) => $.errors[errorKey(pending.error)])}
        actions={[
          {
            label: t(($) => $.common.retry),
            onPress: () => void pending.refetch({ cancelRefetch: false }),
            loading: pending.isFetching,
          },
        ]}
      />
    ) : !pending.data ? (
      <StateMessage kind="loading" message={t(($) => $.common.loading)} />
    ) : shown.length === 0 ? (
      <StateMessage kind="empty" message={t(($) => $.moderation.catalogue.emptyPending)} />
    ) : (
      <Stack gap="lg">
        {/* Une liste annoncée : « liste, 3 éléments », et on saute d'une carte à l'autre. */}
        <Stack gap="md" accessibilityRole="list">
          {shown.map(({ tool, outcome }, index) => (
            <PendingToolCard
              key={tool.slug}
              tool={tool}
              outcome={outcome}
              onAdmit={() => onAdmit(tool, index)}
              onMerge={() => onMerge(tool, index)}
              onDismiss={() => void onDismiss(tool, index)}
              onOpenProject={(id) => router.push(`/projects/${encodeURIComponent(id)}`)}
              resultRef={tool.slug === lastDecided ? resultRef : undefined}
              admitRef={openerRef(`${tool.slug}:admit`)}
              mergeRef={openerRef(`${tool.slug}:merge`)}
            />
          ))}
        </Stack>
        <FeedEnd
          state={listState(pending)}
          moreLabel={t(($) => $.moderation.more)}
          errorLabel={t(($) => $.moderation.moreError)}
          retryLabel={t(($) => $.common.retry)}
          // Une seule demande à la fois, même après un double clic.
          onMore={() => {
            if (!pending.isFetchingNextPage) void pending.fetchNextPage()
          }}
        />
      </Stack>
    )

  const catalogueContent = (
    <Stack gap="lg">
      <SearchField
        label={t(($) => $.moderation.catalogue.searchCatalogue)}
        placeholder={t(($) => $.moderation.catalogue.searchCatalogue)}
        value={search}
        onChangeText={setSearch}
        // La liste suit ce qui se tape : Entrée ne fait rien de plus.
        onSubmit={() => {}}
        action={
          <Button
            label={t(($) => $.moderation.catalogue.createTool)}
            icon="plus"
            variant="secondary"
            onPress={() => {
              if (!formOpen) openForm({ mode: 'create' })
            }}
          />
        }
      />
      {catalogue.isError && !catalogue.data ? (
        <StateMessage
          kind="error"
          level={2}
          title={t(($) => $.moderation.errorTitle)}
          message={t(($) => $.errors[errorKey(catalogue.error)])}
          actions={[
            {
              label: t(($) => $.common.retry),
              onPress: () => void catalogue.refetch({ cancelRefetch: false }),
              loading: catalogue.isFetching,
            },
          ]}
        />
      ) : !catalogue.data ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : catalogueItems.length === 0 ? (
        <StateMessage kind="empty" message={t(($) => $.moderation.catalogue.emptyCatalogue)} />
      ) : (
        <Stack gap="lg">
          <Stack gap="md" accessibilityRole="list">
            {catalogueItems.map((tool) => (
              <CatalogueToolRow
                key={tool.slug}
                tool={tool}
                onEdit={() => {
                  if (!formOpen) openForm({ mode: 'edit', tool })
                }}
              />
            ))}
          </Stack>
          {catalogueItems.length >= CATALOGUE_PAGE_SIZE || catalogue.hasNextPage ? (
            <FeedEnd
              state={listState(catalogue)}
              moreLabel={t(($) => $.moderation.more)}
              errorLabel={t(($) => $.moderation.moreError)}
              retryLabel={t(($) => $.common.retry)}
              onMore={() => {
                if (!catalogue.isFetchingNextPage) void catalogue.fetchNextPage()
              }}
            />
          ) : null}
        </Stack>
      )}
    </Stack>
  )

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={t(($) => $.moderation.catalogue.title)}
      subtitle={t(($) => $.moderation.catalogue.subtitle)}
      notice={failure ? <Notice message={failure} /> : undefined}
    >
      <Stack gap="xl">
        <Stack gap="lg">
          <Segmented<Tab>
            label={t(($) => $.moderation.catalogue.title)}
            options={[
              { value: 'pending', label: t(($) => $.moderation.catalogue.tabPending) },
              { value: 'catalogue', label: t(($) => $.moderation.catalogue.tabCatalogue) },
            ]}
            value={tab}
            onChange={changeTab}
          />
          {tab === 'pending' ? pendingContent : catalogueContent}
        </Stack>
        <CatalogueRecentChanges changes={changes} />
      </Stack>

      <ToolEditSheet
        open={formOpen}
        mode={form?.mode ?? 'create'}
        initial={formInitial}
        onSubmit={submitForm}
        onClose={closeForm}
        returnFocusTo={closedFocus}
      />
      <MergeSheet
        open={mergeOpen}
        tool={merging?.tool ?? null}
        deciding={deciding}
        onMerged={onMerged}
        onClose={closeMerge}
        returnFocusTo={closedFocus}
      />
    </Screen>
  )
}

/**
 * Une ligne du catalogue : le nom de l'outil, sa famille et son nombre de projets, et « Modifier ».
 * Toutes les lignes ont le même bouton : il est relié au nom de son outil (aria-describedby sur le
 * web, indice sur téléphone), pour que le lecteur d'écran dise lequel.
 */
function CatalogueToolRow({ tool, onEdit }: { tool: AdminCatalogueTool; onEdit: () => void }) {
  const { t } = useTranslation()
  const nameId = `catalogue-tool-${tool.slug}`
  const projects =
    tool.projectCount === 0
      ? t(($) => $.tools.noProjects)
      : t(($) => $.tools.projects, { count: tool.projectCount })
  return (
    <Stack direction="row" wrap align="center" justify="between" gap="md">
      <Stack gap="xxs" grow>
        <Text variant="headline" breakAnywhere nativeID={nameId}>
          {tool.name}
        </Text>
        <Text variant="callout" tone="secondary">
          {t(($) => $.tools.detail, {
            family: t(($) => $.tools.family[tool.family]),
            projects,
          })}
        </Text>
      </Stack>
      <Button
        label={t(($) => $.moderation.catalogue.edit)}
        icon="pencil-simple"
        variant="secondary"
        size="small"
        onPress={onEdit}
        describedById={nameId}
        hint={tool.name}
      />
    </Stack>
  )
}

/**
 * La feuille « Rattacher « Make.com » » : le champ des outils, limité au catalogue et à un seul
 * choix ; « Rattacher » reste inactif tant que rien n'est choisi. Puis la fenêtre de confirmation,
 * qui dit combien de projets (privés compris) et de profils changeront, et que cela ne s'annule pas
 * (jur-T5) : ces nombres sont lus dès l'ouverture de la feuille, pour que la fenêtre les ait
 * aussitôt.
 */
function MergeSheet({
  open,
  tool,
  deciding,
  onMerged,
  onClose,
  returnFocusTo,
}: {
  open: boolean
  tool: PendingTool | null
  /** L'écriture en route sur un « Autre », partagée avec l'écran (un ref, lu à l'appui). */
  deciding: { current: boolean }
  /** Le rattachement a réussi, vers l'outil de ce nom. */
  onMerged: (target: string) => void
  onClose: () => void
  /** Où va le focus quand la feuille se ferme (voir `Sheet`) : le résultat après un rattachement. */
  returnFocusTo: () => unknown
}) {
  const { t } = useTranslation()
  const labels = useToolLabels('public')
  const catalogue = useTools().data?.tools
  const impact = useToolImpact(tool?.slug ?? null, open)
  const { merge } = useMergeTool()
  const [chosen, setChosen] = useState<string[]>([])
  const [query, setQuery] = useState('')
  // « Rattacher » touché : la fenêtre s'ouvre dès que les nombres sont là.
  const [confirming, setConfirming] = useState(false)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<ApiErrorKey | null>(null)
  const cancelRef = useRef<Focusable>(null)

  // Chaque ouverture repart de rien (aucun choix, aucune erreur) ; changer un état pendant le rendu,
  // quand une prop change, est la façon que React recommande.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setChosen([])
      setQuery('')
      setConfirming(false)
      setAsking(false)
      setProblem(null)
    }
  }

  const match = matchTools(catalogue ?? [], query, chosen)
  const chosenName = chosen[0] ?? null
  const target = chosenName
    ? (catalogue?.find((one) => foldTool(one.name) === foldTool(chosenName)) ?? null)
    : null

  /** Toute demande de fermeture : refusée pendant l'écriture, posée en question après un choix. */
  const requestClose = () => {
    if (saving) return
    if (chosen.length > 0) setAsking(true)
    else onClose()
  }

  const ask = () => {
    if (!target || saving) return
    setProblem(null)
    setConfirming(true)
    // Les nombres ont échoué : on les redemande (le message reste jusqu'à la réponse).
    if (impact.isError) void impact.refetch({ cancelRefetch: false })
  }

  const confirm = async () => {
    if (!tool || !target || deciding.current) return
    deciding.current = true
    setSaving(true)
    setProblem(null)
    const result = await merge(tool.slug, target.slug)
    deciding.current = false
    setSaving(false)
    if (result.ok) {
      setConfirming(false)
      onMerged(target.name)
      onClose()
      return
    }
    setProblem(result.error)
  }

  const dialogOpen = open && confirming && impact.data !== undefined
  const impactProblem = confirming && impact.isError ? errorKey(impact.error) : null
  const noticeKey = dialogOpen ? null : (impactProblem ?? null)
  const name = tool?.name ?? ''
  const targetName = target?.name ?? ''

  return (
    <>
      <Sheet
        open={open}
        title={t(($) => $.moderation.catalogue.mergeTitle, { name })}
        onClose={onClose}
        returnFocusTo={returnFocusTo}
        closeGuard={chosen.length > 0 ? requestClose : undefined}
        busy={saving}
        compact
        notice={noticeKey ? { message: t(($) => $.errors[noticeKey]), tone: 'error' } : null}
        action={{
          label: t(($) => $.moderation.catalogue.mergeAction),
          onPress: ask,
          disabled: target === null,
          busy: confirming && impact.isFetching && !dialogOpen,
        }}
        cancelLabel={t(($) => $.moderation.catalogue.cancel)}
      >
        <ToolField
          label={t(($) => $.moderation.catalogue.mergeSearch)}
          values={chosen}
          onChange={(next) => {
            setChosen(next)
            setConfirming(false)
          }}
          suggestions={match.suggestions}
          onQuery={setQuery}
          limit={1}
          labels={labels}
          known={match.known}
          catalogueReady={catalogue !== undefined}
          isOther={(one) => catalogue !== undefined && !isCatalogueName(catalogue, one)}
          allowOther={false}
        />
      </Sheet>
      <Dialog
        visible={dialogOpen}
        title={t(($) => $.moderation.catalogue.mergeConfirmTitle, { name, target: targetName })}
        message={t(($) => $.moderation.catalogue.mergeConfirm, {
          name,
          target: targetName,
          projects: t(($) => $.moderation.catalogue.mergeProjects, {
            count: impact.data?.projects ?? 0,
          }),
          profiles: t(($) => $.moderation.catalogue.mergeProfiles, {
            count: impact.data?.profiles ?? 0,
          }),
        })}
        // La fenêtre s'ouvre sous le doigt qui vient de toucher « Rattacher » : ses boutons ignorent
        // les tapes juste après l'ouverture ; le focus arrive sur « Annuler » (une Entrée distraite
        // ne rattache rien).
        guardTaps
        initialFocusRef={cancelRef}
        busy={saving}
        error={problem ? t(($) => $.errors[problem]) : undefined}
        onDismiss={() => {
          if (!saving) setConfirming(false)
        }}
      >
        <Button
          label={t(($) => $.moderation.catalogue.mergeAction)}
          onPress={() => void confirm()}
          loading={saving}
        />
        <Button
          ref={cancelRef}
          label={t(($) => $.moderation.catalogue.cancel)}
          variant="secondary"
          onPress={() => setConfirming(false)}
          disabled={saving}
        />
      </Dialog>
      <ProjectAbandonDialog
        visible={asking}
        editing
        onKeep={() => setAsking(false)}
        onAbandon={() => {
          setAsking(false)
          onClose()
        }}
      />
    </>
  )
}
