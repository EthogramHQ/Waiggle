// La page « Catégories » de la Modération (tranche R6b, « /moderation/categories » ; scénario
// docs/scenarios/refonte.md, « Ranger les « Autre » »), réservée aux administrateurs. Deux onglets :
// - « À ranger » : les projets visibles des membres classés « Autre », du plus ancien au plus récent.
//   « Ranger dans une catégorie » ouvre une feuille à un seul choix (les catégories, sans « Autre »),
//   puis « Ranger » écrit ;
// - « Catégories » : chacune avec son nombre de projets, et « Nouvelle catégorie » (son nom en
//   français et en anglais, une icône choisie dans une grille, l'aperçu de sa pastille). Elle prend
//   place juste avant « Autre », partout dans l'appli.
// En bas, « Changements récents » : qui a changé quoi au catalogue.
//
// Les règles de la file de modération (tranche 7a), comme la page « Outils » :
// - une carte rangée reste à sa place, son résultat (« Rangé dans Animaux. ») à la place de son
//   bouton, jusqu'au changement d'onglet : la carte suivante ne remonte pas sous le doigt ;
// - une feuille ne s'ouvre pas pendant une autre ni pendant une écriture ; une seconde tape sur
//   « Ranger » n'écrit pas deux fois ;
// - le focus ne se perd pas : après un rangement, le bouton qui a ouvert la feuille n'existe plus ;
//   le focus va au résultat de la carte (sinon la feuille le rendrait au bouton de même nom de la
//   carte voisine). Sans décision, il revient au bouton.
// Les feuilles (relecture du plan, « sorties ») : modifiées, elles demandent avant de se fermer
// (`closeGuard`) ; pendant l'écriture, rien ne les ferme (`busy`) ; le Retour du navigateur quitte
// la page.
//
// Pour tout autre membre, la page n'existe pas (« Page introuvable »), comme `/moderation` : l'appli
// lit `me.isAdmin`, et l'API, qui refait la vérification à chaque demande, répond 404.
import {
  CATEGORY_ICON_CHOICES,
  CATEGORY_NAME_MAX,
  type Category,
  type CategoryCode,
  CategoryCreate,
  type CategoryIcon,
  OTHER_CATEGORY,
  type UncategorizedProject,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { categoryOf, useCategories } from '../categories/api'
import {
  uncategorizedKey,
  useCatalogueChanges,
  useCatalogueRefresh,
  useCreateCategory,
  useRecategorize,
  useUncategorizedProjects,
} from '../moderation/catalogue-api'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { DiscardDialog } from '../ui/DiscardDialog'
import { FeedEnd } from '../ui/FeedEnd'
import type { Focusable } from '../ui/focus'
import { IconGrid } from '../ui/IconGrid'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { TextField, type TextFieldInput } from '../ui/TextField'
import { UncategorizedCard } from '../ui/UncategorizedCard'
import { CatalogueRecentChanges, listState } from './CatalogueRecentChanges'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'

type Tab = 'uncategorized' | 'categories'

/** Où va le focus à la fermeture de la feuille du choix : le résultat de la carte rangée. */
const RESULT = 'result'

/**
 * Une carte rangée : la liste de l'API ne la donnera plus à sa prochaine lecture ; l'écran la garde
 * à la place qu'elle avait (`index`, son rang parmi les cartes affichées), avec le nom de sa
 * catégorie.
 */
type Decided = { index: number; project: UncategorizedProject; filedInto: string }

/** Une carte affichée : un projet de la liste, et sa catégorie s'il vient d'être rangé. */
type Shown = { project: UncategorizedProject; filedInto: string | null }

/**
 * Les cartes affichées : celles de la liste reçue, et les cartes rangées remises à leur rang. Une
 * carte rangée encore présente dans la liste n'y figure qu'une fois, avec son résultat.
 */
const keepDecided = (
  items: readonly UncategorizedProject[],
  decided: readonly Decided[],
): Shown[] => {
  const done = new Set(decided.map((entry) => entry.project.id))
  const shown: Shown[] = items
    .filter((project) => !done.has(project.id))
    .map((project) => ({ project, filedInto: null }))
  // Du plus petit rang au plus grand : chaque carte retrouve sa place parmi celles déjà posées.
  for (const entry of [...decided].sort((a, b) => a.index - b.index)) {
    shown.splice(Math.min(entry.index, shown.length), 0, {
      project: entry.project,
      filedInto: entry.filedInto,
    })
  }
  return shown
}

export function ModerationCategoriesScreen() {
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
  return <AdminCategories />
}

function AdminCategories() {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/moderation')
  const [tab, setTab] = useState<Tab>('uncategorized')
  const pending = useUncategorizedProjects()
  const categories = useCategories()
  const changes = useCatalogueChanges()
  const { refreshList } = useCatalogueRefresh()

  // Les cartes rangées, gardées à leur place jusqu'au changement d'onglet.
  const [decided, setDecided] = useState<Decided[]>([])
  // Une écriture est en route : un ref, lu au moment de l'appui, sans attendre que l'écran se
  // redessine (la seconde tape d'une double tape arrive avant).
  const deciding = useRef(false)
  // L'annonce d'une catégorie créée, lue par les lecteurs d'écran (la liste s'allonge plus bas).
  const [announce, setAnnounce] = useState('')

  // Le focus à la fermeture de la feuille du choix (même règle que la page « Outils ») :
  // - après un rangement, le résultat de la carte : le bouton qui a ouvert la feuille n'existe plus ;
  // - sans décision, le bouton qui l'a ouverte (sur le web, la feuille ne le connaît pas toujours :
  //   un bouton touché du doigt n'a pas forcément eu le focus).
  // La feuille pose elle-même le focus à cette place (`returnFocusTo`) : à la fermeture, puis encore
  // à la fin de son fondu de sortie, pendant lequel le piège à focus du Modal du web le ramène en
  // elle. Posé par un effet de l'écran à la seule fermeture, il était repris par ce piège, puis
  // rendu par la feuille au bouton de même nom de la carte voisine (R6b, u9f).
  const [lastDecided, setLastDecided] = useState<string | null>(null)
  const resultRef = useRef<Focusable | null>(null)
  const openers = useRef(new Map<string, Focusable | null>())
  const decidedInSheet = useRef(false)
  const focusAfterClose = useRef<string | null>(null)
  /** La place du focus à la fermeture, lue par la feuille ; null : son ouvreur. */
  const closedFocus = () => {
    const target = focusAfterClose.current
    if (target === null) return null
    return target === RESULT ? resultRef.current : (openers.current.get(target) ?? null)
  }

  // --- « Ranger dans une catégorie » : la feuille du choix. `filing` reste rempli pendant le fondu
  // de fermeture, pour que son titre ne change pas sous les yeux ; `filingOpen` dit si elle est
  // ouverte.
  const [filing, setFiling] = useState<{ project: UncategorizedProject; index: number } | null>(
    null,
  )
  const [filingOpen, setFilingOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  /** Une feuille ne s'ouvre pas pendant une autre, ni pendant une écriture. */
  const busy = () => filingOpen || createOpen || deciding.current

  const onFile = (project: UncategorizedProject, index: number) => {
    if (busy()) return
    setFiling({ project, index })
    setFilingOpen(true)
  }
  const onFiled = (code: CategoryCode) => {
    if (!filing) return
    const name = categoryOf(categories.data?.categories, code)?.name ?? ''
    setDecided((previous) => [
      ...previous.filter((entry) => entry.project.id !== filing.project.id),
      { index: filing.index, project: filing.project, filedInto: name },
    ])
    setLastDecided(filing.project.id)
    decidedInSheet.current = true
  }
  const closeFiling = () => {
    setFilingOpen(false)
    if (!filing) return
    focusAfterClose.current = decidedInSheet.current ? RESULT : filing.project.id
    decidedInSheet.current = false
  }

  /** Changer d'onglet est le geste qui range les cartes décidées : la liste est relue. */
  const changeTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    if (decided.length > 0) refreshList(uncategorizedKey)
    setDecided([])
    setLastDecided(null)
    setAnnounce('')
  }

  // La liste affichée, et ses refus qui changent toute la page (un administrateur révoqué : l'API
  // ne connaît plus la page).
  const fatal = !pending.data && pending.isError ? errorKey(pending.error) : null
  if (fatal === 'notFound') return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  if (fatal === 'unauthorized') return <SignedOutScreen expired />

  const shown = keepDecided(pending.data?.pages.flatMap((page) => page.items) ?? [], decided)

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
      <StateMessage kind="empty" message={t(($) => $.moderation.categories.emptyUncategorized)} />
    ) : (
      <Stack gap="lg">
        {/* Une liste annoncée : « liste, 3 éléments », et on saute d'une carte à l'autre. */}
        <Stack gap="md" accessibilityRole="list">
          {shown.map(({ project, filedInto }, index) => (
            <UncategorizedCard
              key={project.id}
              project={project}
              filedInto={filedInto}
              onFile={() => onFile(project, index)}
              onOpenProject={() => router.push(`/projects/${encodeURIComponent(project.id)}`)}
              resultRef={project.id === lastDecided ? resultRef : undefined}
              fileRef={(node) => {
                openers.current.set(project.id, node)
              }}
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

  const categoriesContent = (
    <Stack gap="lg">
      <Stack direction="row">
        <Button
          label={t(($) => $.moderation.categories.create)}
          icon="plus"
          variant="secondary"
          onPress={() => {
            if (busy()) return
            setAnnounce('')
            setCreateOpen(true)
          }}
        />
      </Stack>
      {categories.isError && !categories.data ? (
        <StateMessage
          kind="error"
          level={2}
          title={t(($) => $.moderation.errorTitle)}
          message={t(($) => $.errors[errorKey(categories.error)])}
          actions={[
            {
              label: t(($) => $.common.retry),
              onPress: () => void categories.refetch({ cancelRefetch: false }),
              loading: categories.isFetching,
            },
          ]}
        />
      ) : !categories.data ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : (
        <ListGroup>
          {categories.data.categories.map((category) => (
            <CategoryRow key={category.code} category={category} />
          ))}
        </ListGroup>
      )}
    </Stack>
  )

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={t(($) => $.moderation.categories.title)}
      subtitle={t(($) => $.moderation.categories.subtitle)}
    >
      <Stack gap="xl">
        <Stack gap="lg">
          <Segmented<Tab>
            label={t(($) => $.moderation.categories.title)}
            options={[
              {
                value: 'uncategorized',
                label: t(($) => $.moderation.categories.tabUncategorized),
              },
              { value: 'categories', label: t(($) => $.moderation.categories.tabCategories) },
            ]}
            value={tab}
            onChange={changeTab}
          />
          {tab === 'uncategorized' ? pendingContent : categoriesContent}
        </Stack>
        <CatalogueRecentChanges changes={changes} />
      </Stack>
      <LiveStatus message={announce} visible={false} />

      <FileSheet
        open={filingOpen}
        project={filing?.project ?? null}
        categories={categories.data?.categories}
        deciding={deciding}
        onFiled={onFiled}
        onClose={closeFiling}
        returnFocusTo={closedFocus}
      />
      <CreateSheet
        open={createOpen}
        onCreated={() => setAnnounce(t(($) => $.moderation.categories.created))}
        onClose={() => setCreateOpen(false)}
      />
    </Screen>
  )
}

/**
 * Une ligne de l'onglet « Catégories » : son icône, son nom et son nombre de projets. « Autre »
 * dit en plus qu'elle reste la dernière : une catégorie créée se place juste avant elle.
 */
function CategoryRow({ category }: { category: Category }) {
  const { t } = useTranslation()
  const projects = t(($) => $.moderation.categories.projects, { count: category.projectCount })
  return (
    <ListRow
      icon={category.icon}
      label={category.name}
      detail={
        category.code === OTHER_CATEGORY
          ? t(($) => $.moderation.categories.otherDetail, { projects })
          : projects
      }
    />
  )
}

/**
 * La feuille « Ranger « La cabane à oiseaux » » : les catégories en un groupe à un seul choix (avec
 * leurs icônes, sans « Autre »), puis « Ranger », inactif tant que rien n'est choisi. Un refus
 * (catégorie inconnue, son propre projet) se lit au pied de la feuille, qui reste ouverte.
 */
function FileSheet({
  open,
  project,
  categories,
  deciding,
  onFiled,
  onClose,
  returnFocusTo,
}: {
  open: boolean
  project: UncategorizedProject | null
  categories: readonly Category[] | undefined
  /** L'écriture en route, partagée avec l'écran (un ref, lu à l'appui). */
  deciding: { current: boolean }
  /** Le rangement a réussi, dans la catégorie de ce code. */
  onFiled: (code: CategoryCode) => void
  onClose: () => void
  /** Où va le focus à la fermeture (le résultat de la carte rangée, ou son bouton) : voir `Sheet`. */
  returnFocusTo: () => unknown
}) {
  const { t } = useTranslation()
  const { recategorize } = useRecategorize()
  const [chosen, setChosen] = useState<CategoryCode | null>(null)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<ApiErrorKey | null>(null)

  // Chaque ouverture repart de rien (aucun choix, aucune erreur) ; changer un état pendant le rendu,
  // quand une prop change, est la façon que React recommande.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setChosen(null)
      setAsking(false)
      setProblem(null)
    }
  }

  /** Toute demande de fermeture : refusée pendant l'écriture, posée en question après un choix. */
  const requestClose = () => {
    if (deciding.current) return
    if (chosen !== null) setAsking(true)
    else onClose()
  }

  const file = async () => {
    if (!project || chosen === null || deciding.current) return
    deciding.current = true
    setSaving(true)
    setProblem(null)
    const result = await recategorize(project.id, chosen)
    deciding.current = false
    setSaving(false)
    if (result.ok) {
      onFiled(chosen)
      onClose()
      return
    }
    setProblem(result.error)
  }

  // Les catégories où ranger : toutes, sauf « Autre », d'où viennent ces projets.
  const options = (categories ?? [])
    .filter((category) => category.code !== OTHER_CATEGORY)
    .map((category) => ({ value: category.code, label: category.name, icon: category.icon }))

  return (
    <>
      <Sheet
        open={open}
        title={t(($) => $.moderation.categories.sortTitle, { title: project?.title ?? '' })}
        onClose={onClose}
        closeGuard={chosen !== null ? requestClose : undefined}
        busy={saving}
        returnFocusTo={returnFocusTo}
        compact
        notice={problem ? { message: t(($) => $.errors[problem]), tone: 'error' } : null}
        action={{
          label: t(($) => $.moderation.categories.sortAction),
          onPress: () => void file(),
          disabled: chosen === null,
          busy: saving,
        }}
        cancelLabel={t(($) => $.moderation.categories.cancel)}
      >
        {categories === undefined ? (
          <StateMessage kind="loading" message={t(($) => $.common.loading)} />
        ) : (
          <Choices<CategoryCode>
            label={t(($) => $.moderation.categories.sortChoice)}
            options={options}
            value={chosen}
            onChange={(code) => {
              setChosen(code)
              setProblem(null)
            }}
          />
        )}
      </Sheet>
      <DiscardDialog
        visible={asking}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false)
          onClose()
        }}
      />
    </>
  )
}

/** Ce qui est tapé dans « Nouvelle catégorie » : les deux noms, et l'icône ou rien. */
type Draft = { nameFr: string; nameEn: string; icon: CategoryIcon | null }
const EMPTY: Draft = { nameFr: '', nameEn: '', icon: null }
type DraftField = keyof Draft

/** Le problème montré : la clé du message, et les champs en cause (aucun : au pied seulement). */
type Problem = { error: ApiErrorKey; fields: DraftField[] }

/**
 * La feuille « Nouvelle catégorie » : le nom en français et en anglais (30 caractères au plus,
 * compteur visible), l'icône choisie dans une grille, et l'aperçu de la pastille telle que les
 * membres la verront. L'aide (relecture juridique jur-T15) rappelle qu'une catégorie décrit un
 * sujet, jamais une personne. Un nom déjà pris (409) se lit au pied, les deux noms marqués, et ce
 * qui est tapé reste.
 */
function CreateSheet({
  open,
  onCreated,
  onClose,
}: {
  open: boolean
  onCreated: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { create } = useCreateCategory()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  // La garde de la double tape : un `ref`, lu avant que React ait redessiné le bouton.
  const savingNow = useRef(false)
  const nameRef = useRef<TextFieldInput>(null)

  // Chaque ouverture repart d'un formulaire vide, sans l'erreur d'un envoi précédent.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(EMPTY)
      setProblem(null)
      setAsking(false)
    }
  }

  const dirty = draft.nameFr !== '' || draft.nameEn !== '' || draft.icon !== null
  const change = <K extends DraftField>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  /** Toute demande de fermeture : refusée pendant l'écriture, posée en question si modifiée. */
  const requestClose = () => {
    if (savingNow.current) return
    if (dirty) setAsking(true)
    else onClose()
  }

  const save = async () => {
    if (savingNow.current) return
    // Le schéma du contrat vérifie tout avant l'envoi : un nom vide, trop long ou sur deux lignes,
    // une icône qui manque.
    const parsed = CategoryCreate.safeParse(draft)
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0] as DraftField))]
      setProblem({ error: 'validation', fields })
      return
    }
    savingNow.current = true
    setSaving(true)
    setProblem(null)
    const result = await create(parsed.data)
    savingNow.current = false
    setSaving(false)
    if (result.ok) {
      onCreated()
      onClose()
      return
    }
    setProblem({
      error: result.error,
      fields: result.error === 'categoryNameTaken' ? ['nameFr', 'nameEn'] : [],
    })
  }

  const invalid = (field: DraftField) => problem?.fields.includes(field) ?? false
  const previewName = draft.nameFr.trim()

  return (
    <>
      <Sheet
        open={open}
        title={t(($) => $.moderation.categories.createTitle)}
        onClose={onClose}
        closeGuard={dirty ? requestClose : undefined}
        busy={saving}
        initialFocusRef={nameRef}
        notice={problem ? { message: t(($) => $.errors[problem.error]), tone: 'error' } : null}
        // Un formulaire à plusieurs champs : ses boutons au pied, comme la feuille d'un outil, et
        // « Fermer » reste en haut (la tête « Annuler / titre / action » est celle d'un choix).
        footer={
          <Stack gap="sm">
            <Button
              label={t(($) => $.moderation.categories.createAction)}
              onPress={() => void save()}
              loading={saving}
            />
            <Button
              label={t(($) => $.moderation.categories.cancel)}
              variant="secondary"
              onPress={requestClose}
              disabled={saving}
            />
          </Stack>
        }
      >
        <Stack gap="lg">
          <Text variant="callout" tone="secondary">
            {t(($) => $.moderation.categories.createHint)}
          </Text>
          <TextField
            label={t(($) => $.moderation.categories.nameFr)}
            value={draft.nameFr}
            onChangeText={(text) => change('nameFr', text)}
            inputRef={nameRef}
            limit={CATEGORY_NAME_MAX}
            showCount
            invalid={invalid('nameFr')}
          />
          <TextField
            label={t(($) => $.moderation.categories.nameEn)}
            value={draft.nameEn}
            onChangeText={(text) => change('nameEn', text)}
            limit={CATEGORY_NAME_MAX}
            showCount
            invalid={invalid('nameEn')}
          />
          <IconGrid
            label={t(($) => $.moderation.categories.icon)}
            icons={CATEGORY_ICON_CHOICES.map((name) => ({
              name,
              label: t(($) => $.moderation.categories.iconName[name]),
            }))}
            value={draft.icon}
            onChange={(name) => {
              // La grille ne propose que les icônes du contrat : le nom en est une.
              const icon = CATEGORY_ICON_CHOICES.find((one) => one === name)
              if (icon) change('icon', icon)
            }}
          />
          {/* L'aperçu de la pastille, telle qu'elle paraîtra sur les cartes : seulement quand il y a
              un nom à montrer. */}
          {previewName !== '' ? (
            <Stack gap="xs">
              <Text variant="callout" weight={600}>
                {t(($) => $.moderation.categories.preview)}
              </Text>
              <Stack direction="row">
                <Tag kind="category" label={previewName} icon={draft.icon ?? undefined} />
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      </Sheet>
      <DiscardDialog
        visible={asking}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false)
          onClose()
        }}
      />
    </>
  )
}
