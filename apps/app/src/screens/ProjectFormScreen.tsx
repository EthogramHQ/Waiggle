// La feuille de publication et de modification (R6a, planches R6-Publier, R6-Publier-Desktop et
// R6-Modifier) : publier un nouveau projet (sans `id`) ou modifier le sien (avec `id`).
//
// La page est une feuille posée par-dessus la page d'où l'on vient : les routes `projects/new` et
// `projects/[id]/edit` sont des fenêtres transparentes (`app/_layout.tsx`). Ouverte sans page
// d'avant (une adresse tapée, un onglet neuf), la feuille dessine elle-même le fil dessous
// (relecture du plan, ui-I1). Ce fichier assemble :
// - la `Sheet` : sur téléphone, poignée, « Annuler », titre et « Publier » / « Enregistrer » dans la
//   tête ; sur ordinateur, deux colonnes, l'aperçu de la carte du fil à droite (`aside`) ;
// - les champs (`ProjectFormFields`), la seconde feuille « Catégorie et outils »
//   (`ProjectCategorySheet`), les photos (`usePhotoTiles`) et la fenêtre de suppression ;
// - la fenêtre « Abandonner ce projet ? », demandée par toute fermeture quand quelque chose a été
//   écrit, y compris le retour du navigateur (`useLeaveGuard`).
// Le profil est lu avant le formulaire : un compte suspendu ne tape jamais un texte qui se perdrait.
import type { Project, ProjectInput } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { nextAfterSignIn } from '../navigation/signInAgain'
import { type HeldAction, useLeaveGuard } from '../navigation/useLeaveGuard'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { useMe } from '../profile/hooks'
import { createProject, updateProject } from '../projects/api'
import { categoryOption } from '../projects/categories'
import { DeleteProjectDialog } from '../projects/DeleteProjectDialog'
import {
  emptyProjectForm,
  formFromProject,
  isDirty,
  type ProjectForm,
  type ProjectFormErrors,
  toProjectChanges,
} from '../projects/form'
import { useProject, useSetProject } from '../projects/hooks'
import { usePhotoTiles } from '../projects/usePhotoTiles'
import { Button } from '../ui/Button'
import { CardPreview } from '../ui/CardPreview'
import { Dialog } from '../ui/Dialog'
import { type Focusable, focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ProjectCard } from '../ui/ProjectCard'
import { Sheet, type SheetNotice, useSheetAside } from '../ui/Sheet'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { type StateKind, StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { useCalmMotion } from '../ui/theme/motion'
import { useToast } from '../ui/theme/toast'
import { HomeScreen } from './HomeScreen'
import { ProjectCategorySheet } from './ProjectCategorySheet'
import {
  audienceSentence,
  type CategoriesOpener,
  type ChangeField,
  firstFieldWithError,
  ProjectAudienceChoice,
  ProjectFormFields,
  useProjectFieldRefs,
} from './ProjectFormFields'

type ScreenProps = {
  id?: string | undefined
  /** Arrivé ici juste après une publication dont des photos n'ont pas pu partir (jur-J11). */
  uploadFailed?: boolean
}

export function ProjectFormScreen({ id, uploadFailed = false }: ScreenProps) {
  const router = useRouter()
  // Sans page d'avant, rien n'est dessous la fenêtre transparente : la feuille pose le fil
  // elle-même (ui-I1). Décidé une fois, à l'ouverture : la pile ne change pas pendant la visite.
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <HomeScreen /> : null}
      <ProjectFormSheet id={id} uploadFailed={uploadFailed} />
    </>
  )
}

/** Un état qui remplace le formulaire, dans la même feuille : titre, phrase et issues. */
type SheetState = {
  kind: StateKind
  title?: string
  message?: string
  actions?: { label: string; onPress: () => void }[]
}

/** Choisit ce que montre la feuille : un état (chargement, suspendu, introuvable…) ou le formulaire. */
function ProjectFormSheet({
  id,
  uploadFailed,
}: {
  id?: string | undefined
  uploadFailed: boolean
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const sheet = useRouteSheet('/')
  const { state, session, retry } = useMemberSession()
  // Le profil (sa suspension) d'abord : rien à taper tant qu'on ne sait pas si l'on peut publier.
  const me = useMe(Boolean(session))
  const project = useProject(id ?? '', Boolean(session && id && me.data))
  const title = id ? t(($) => $.project.form.editTitle) : t(($) => $.project.form.newTitle)

  const shown = (content: ReactNode) => (
    <Sheet open={sheet.open} title={title} heading={1} onClose={sheet.close}>
      {content}
    </Sheet>
  )
  const loading = shown(<SkeletonList count={2} />)
  const stateSheet = ({ actions, ...rest }: SheetState) =>
    shown(<StateMessage level={2} {...rest} actions={actions ?? []} />)
  const seeProject = (projectId: string) => ({
    label: t(($) => $.states.seeProject),
    onPress: () => router.replace({ pathname: '/projects/[id]', params: { id: projectId } }),
  })
  const signedOut = (expired: boolean) =>
    stateSheet({
      kind: 'signedOut',
      title: t(($) => $.states.signedOutTitle),
      message: expired ? t(($) => $.states.expired) : t(($) => $.home.membersOnly),
      actions: [
        {
          label: t(($) => $.home.signIn),
          onPress: () =>
            router.push({ pathname: '/sign-in', params: { next: nextAfterSignIn(pathname) } }),
        },
        { label: t(($) => $.home.signUp), onPress: () => router.push('/sign-up') },
      ],
    })
  const failed = (error: unknown, onRetry: () => void) =>
    errorKey(error) === 'unauthorized'
      ? signedOut(true)
      : stateSheet({
          kind: 'error',
          title: t(($) => $.states.errorTitle),
          message: t(($) => $.errors[errorKey(error)]),
          actions: [{ label: t(($) => $.common.retry), onPress: onRetry }],
        })

  if (state === 'pending') return loading
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') {
    return stateSheet({
      kind: 'error',
      title: t(($) => $.states.errorTitle),
      message: t(($) => $.account.loadError),
      actions: [{ label: t(($) => $.common.retry), onPress: retry }],
    })
  }
  if (!session) return signedOut(false)
  if (!me.data) return me.error ? failed(me.error, () => void me.refetch()) : loading
  if (me.data.suspension) {
    return stateSheet({
      kind: 'signedOut',
      title: t(($) => $.suspension.formTitle),
      message: t(($) => $.suspension.formBody),
      actions: id ? [seeProject(id)] : [{ label: t(($) => $.states.back), onPress: sheet.close }],
    })
  }
  if (!id) {
    return <ProjectFormView initial={emptyProjectForm} open={sheet.open} close={sheet.close} />
  }
  if (project.error) {
    if (errorKey(project.error) === 'notFound') {
      return stateSheet({
        kind: 'notFound',
        title: t(($) => $.project.page.notFoundTitle),
        message: t(($) => $.project.page.notFound),
      })
    }
    return failed(project.error, () => void project.refetch())
  }
  if (!project.data) return loading
  if (!project.data.isMine) {
    return stateSheet({
      kind: 'signedOut',
      title: t(($) => $.states.notMineTitle),
      message: t(($) => $.project.page.notMine),
      actions: [seeProject(project.data.id)],
    })
  }
  return (
    <ProjectFormView
      initial={formFromProject(project.data)}
      project={project.data}
      uploadFailed={uploadFailed}
      open={sheet.open}
      close={sheet.close}
    />
  )
}

type ViewProps = {
  /** Le formulaire à l'ouverture : gardé tel quel, il dit ce qui a changé depuis. */
  initial: ProjectForm
  /** Le projet modifié ; absent : un nouveau projet. */
  project?: Project
  uploadFailed?: boolean
  open: boolean
  /** Ferme la feuille (retour à la page d'avant, ou au fil). */
  close: () => void
}

function ProjectFormView({
  initial: opened,
  project,
  uploadFailed = false,
  open,
  close,
}: ViewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const toast = useToast()
  const calm = useCalmMotion()
  const queryClient = useQueryClient()
  const setProject = useSetProject()
  const beside = useSheetAside()
  const projectId = project?.id
  const editing = projectId !== undefined
  // useState(() => …) : la valeur d'ouverture, gardée même quand le cache du projet change (photos).
  const [initial] = useState(opened)
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Une `ref` en plus de l'état : deux tapes dans la même image voient toutes deux l'ancien `busy`.
  const sending = useRef(false)
  const photos = usePhotoTiles(projectId)
  const fieldRefs = useProjectFieldRefs()
  // La seconde feuille, et la ligne qui l'a ouverte : gardée après la fermeture, pour que la
  // feuille y rende le focus (ui-I10).
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [categoriesFrom, setCategoriesFrom] = useState<CategoriesOpener>('category')
  const openCategories = (from: CategoriesOpener) => {
    setCategoriesFrom(from)
    setCategoriesOpen(true)
  }
  const [deleting, setDeleting] = useState(false)
  const deleteRef = useRef<Focusable>(null)
  // La fenêtre fermée sans rien supprimer (Échap, « Annuler », le retour d'Android) : le focus
  // revient à « Supprimer ce projet » dès qu'elle est retirée. La fenêtre le rend aussi après son
  // fondu (`opener`) ; ici, on n'attend pas le fondu, que tous les appareils ne signalent pas.
  const refocusDelete = useRef(false)
  const cancelDelete = () => {
    refocusDelete.current = true
    setDeleting(false)
  }
  useEffect(() => {
    if (deleting || !refocusDelete.current) return
    refocusDelete.current = false
    if (!focusWithoutScroll(deleteRef.current)) moveReaderTo(deleteRef.current)
  }, [deleting])

  // Ce qui serait perdu en fermant : un champ changé ; à la création, aussi une photo choisie (en
  // modification, les photos sont déjà enregistrées).
  const dirty = isDirty(initial, form) || (!editing && photos.tiles.length > 0)

  // --- Fermer, abandonner ---
  // `asking` : la fenêtre d'abandon est ouverte ; `held` : le retour du navigateur arrêté, à rejouer.
  const [asking, setAsking] = useState(false)
  const held = useRef<HeldAction | null>(null)
  const guard = useLeaveGuard(dirty, (action) => {
    held.current = action
    setAsking(true)
  })
  const leave = () => {
    // En modification, la description d'une photo tapée part même si l'on ferme tout de suite
    // (ui-I12) : l'envoi continue après la fermeture, rien n'attend.
    if (projectId) void photos.flushPending(projectId)
    guard.release()
    close()
  }
  const requestClose = () => {
    if (busy) return
    if (dirty) {
      held.current = null
      setAsking(true)
    } else {
      leave()
    }
  }
  const abandon = () => {
    setAsking(false)
    const action = held.current
    held.current = null
    if (action) guard.proceed(action)
    else leave()
  }
  // Le focus va d'abord à « Continuer », le geste qui ne perd rien (ui-B3).
  const keepRef = useRef<Focusable>(null)
  useEffect(() => {
    if (!asking) return
    focusWithoutScroll(keepRef.current)
    moveReaderTo(keepRef.current)
  }, [asking])

  // --- Changer un champ ---
  const update = (patch: Partial<ProjectForm>) => {
    const next = { ...form, ...patch }
    setForm(next)
    // Après un premier refus, les erreurs suivent la frappe : un champ corrigé n'est plus en rouge,
    // et le message général part quand il ne reste rien à corriger.
    if (Object.keys(errors).length > 0) {
      const checked = projectId ? toProjectChanges(next, initial) : toProjectChanges(next)
      setErrors(checked.ok ? {} : checked.errors)
      if (checked.ok) setMessage(null)
    }
  }
  const change: ChangeField = (key) => (value) => update({ [key]: value } as Partial<ProjectForm>)

  // --- Envoyer ---
  const onSubmit = async () => {
    if (sending.current) return
    setMessage(null)
    photos.clearNotices()
    const checked = projectId ? toProjectChanges(form, initial) : toProjectChanges(form)
    if (!checked.ok) {
      setErrors(checked.errors)
      // Le champ en erreur peut être loin : le message général le dit, et le focus y va.
      setMessage(t(($) => $.project.errors.checkFields))
      const name = firstFieldWithError(checked.errors)
      const node = name ? fieldRefs[name].current : null
      focusAndReveal(node, calm)
      moveReaderTo(node)
      return
    }
    setErrors({})
    sending.current = true
    setBusy(true)
    const result = projectId
      ? await updateProject(projectId, checked.changes)
      : // Sans projet, toProjectChanges(form) rend un ProjectInput complet (sa surcharge).
        await createProject(checked.changes as ProjectInput)
    if (!result.ok) {
      sending.current = false
      setBusy(false)
      setMessage(t(($) => $.errors[result.error]))
      return
    }
    setProject(result.data) // la page du projet s'affichera sans nouvelle requête
    const id = result.data.id
    if (!projectId) {
      // Le fil la montre tout de suite (plan, U5a) ; puis les photos partent, dans l'ordre.
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
      const { failed } = await photos.flushPending(id)
      guard.release()
      if (failed > 0) {
        // Ni danse ni « Projet publié » : la modification dit quelles photos manquent (jur-J11).
        router.replace({ pathname: '/projects/[id]/edit', params: { id, photos: 'failed' } })
      } else if (form.audience === 'private') {
        toast.show(
          t(($) => $.project.form.draftSaved),
          { icon: 'check-circle' },
        )
        router.replace({ pathname: '/projects/[id]', params: { id } })
      } else {
        // Le fil, au-dessus duquel la feuille était ouverte : il danse (HomeScreen, `published`).
        router.dismissTo({ pathname: '/', params: { published: id } })
      }
      return
    }
    await photos.flushPending(projectId)
    guard.release()
    // Un nouveau statut d'un projet visible des membres : la page propose une note toute prête.
    const announce = result.data.status !== initial.status && result.data.visibility === 'public'
    toast.show(
      t(($) => $.project.form.saved),
      { icon: 'check-circle' },
    )
    // dismissTo : retour à la page du projet dessous (ou à sa place), jamais une seconde copie.
    router.dismissTo({
      pathname: '/projects/[id]',
      params: announce ? { id, announce: result.data.status } : { id },
    })
  }

  const onDeleted = () => {
    setDeleting(false)
    guard.release()
    toast.show(
      t(($) => $.project.form.deleted),
      { icon: 'check-circle' },
    )
    // « Mes projets », jamais un retour vers la page supprimée (ui-M3).
    router.dismissTo('/me')
  }

  // --- Ce que la feuille dit au-dessus des champs (un seul message à la fois) ---
  const photoNotice = photos.cut
    ? t(($) => $.project.form.photosCut, photos.cut)
    : photos.problem === 'describeFailed'
      ? t(($) => $.project.form.describeFailed)
      : photos.problem
        ? t(($) => $.errors[photos.problem as Exclude<typeof photos.problem, 'describeFailed'>])
        : null
  const notice: SheetNotice | null = message
    ? { message, tone: 'error' }
    : photoNotice
      ? { message: photoNotice, tone: 'error' }
      : uploadFailed && editing
        ? { message: t(($) => $.project.form.uploadFailed), tone: 'info' }
        : !editing && photos.preparing
          ? { message: t(($) => $.project.visuals.preparing), tone: 'info', polite: true }
          : editing && !dirty
            ? { message: t(($) => $.project.form.unchanged), tone: 'info', polite: true }
            : null

  const cover = photos.tiles[0]?.image ?? null
  const sentence = (
    <Text variant="callout" tone="secondary">
      {audienceSentence(t, form.audience, editing)}
    </Text>
  )

  return (
    <>
      <Sheet
        open={open}
        title={editing ? t(($) => $.project.form.editTitle) : t(($) => $.project.form.newTitle)}
        heading={1}
        {...(editing ? null : { subtitle: t(($) => $.project.form.newIntro) })}
        cancelLabel={t(($) => $.project.form.cancel)}
        action={{
          label: editing ? t(($) => $.project.form.save) : t(($) => $.project.form.publish),
          onPress: () => void onSubmit(),
          busy,
          // Rien à enregistrer, ou des photos encore en préparation : l'action attend, atteignable
          // au clavier et décrite par la phrase de la feuille.
          disabled: editing ? !dirty : photos.preparing,
          focusableWhenDisabled: true,
        }}
        notice={notice}
        busy={busy}
        closeGuard={requestClose}
        onClose={requestClose}
        {...(beside
          ? {
              aside: <FormPreview form={form} cover={cover} change={change} />,
              footerNote: sentence,
            }
          : null)}
      >
        <ProjectFormFields
          form={form}
          change={change}
          errors={errors}
          projectId={projectId}
          tiles={photos.tiles}
          photos={photos.actions}
          descriptions={{
            selectedKey: photos.selectedKey,
            onSelect: photos.select,
            textOf: photos.descriptionOf,
            onChange: photos.describe,
            onLeave: () => {
              if (projectId) void photos.flushPending(projectId)
            },
          }}
          photosBusy={busy}
          onOpenCategories={openCategories}
          fieldRefs={fieldRefs}
          savedPrompts={project?.prompts}
          withAudience={!beside}
        />
        {project ? (
          // La zone rouge, en dernier : supprimer, et qui le peut (jur-J7).
          <Stack gap="sm">
            <Button
              ref={deleteRef}
              label={t(($) => $.project.form.deleteZone)}
              variant="danger"
              icon="trash"
              onPress={() => setDeleting(true)}
            />
            <Text variant="caption" tone="muted">
              {t(($) => $.project.form.deleteOwner)}
            </Text>
          </Stack>
        ) : null}
      </Sheet>
      <ProjectCategorySheet
        open={open && categoriesOpen}
        primary={form.primaryCategory}
        secondary={form.secondaryCategory}
        tools={form.tools}
        onChange={({ primary, secondary, tools }) =>
          update({ primaryCategory: primary, secondaryCategory: secondary, tools })
        }
        onClose={() => setCategoriesOpen(false)}
        returnFocusRef={fieldRefs[categoriesFrom]}
      />
      <Dialog
        visible={asking}
        title={editing ? t(($) => $.project.form.abandonEdit) : t(($) => $.project.form.abandonNew)}
        message={
          editing
            ? t(($) => $.project.form.abandonEditBody)
            : t(($) => $.project.form.abandonNewBody)
        }
        guardTaps
        onDismiss={() => setAsking(false)}
      >
        <Button
          ref={keepRef}
          label={t(($) => $.project.form.keepEditing)}
          variant="secondary"
          onPress={() => setAsking(false)}
        />
        <Button label={t(($) => $.project.form.abandon)} variant="danger" onPress={abandon} />
      </Dialog>
      {project ? (
        <DeleteProjectDialog
          project={{
            id: project.id,
            title: project.title,
            cover,
            removed: Boolean(project.removal),
          }}
          visible={deleting}
          onCancel={cancelDelete}
          onDeleted={onDeleted}
          opener={deleteRef}
        />
      ) : null}
    </>
  )
}

/**
 * La colonne de l'ordinateur : l'aperçu de la carte du fil, qui suit la frappe (caché aux lecteurs
 * d'écran et au clavier par `CardPreview` : il ne fait que répéter les champs), puis « Qui peut le
 * voir ? ».
 */
function FormPreview({
  form,
  cover,
  change,
}: {
  form: ProjectForm
  cover: ReturnType<typeof usePhotoTiles>['tiles'][number]['image'] | null
  change: ChangeField
}) {
  const { t } = useTranslation()
  const me = useMe()
  const category = form.primaryCategory ? categoryOption(t, form.primaryCategory) : null
  // Sans « Tester » : sur la carte, c'est un lien, qui resterait atteignable au clavier d'une
  // tablette (le web, lui, rend tout l'aperçu `inert`) dans un aperçu caché aux lecteurs d'écran.
  return (
    <Stack gap="xl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Text variant="headline" heading={2}>
            {t(($) => $.project.form.preview)}
          </Text>
          <Text variant="callout" tone="secondary">
            {t(($) => $.project.form.previewHint)}
          </Text>
        </Stack>
        <CardPreview image={cover}>
          <ProjectCard
            title={form.title.trim() || t(($) => $.project.form.previewUntitled)}
            pitch={form.pitch.trim() || t(($) => $.project.form.previewNoPitch)}
            author={{ name: me.data?.name ?? '', avatar: null }}
            image={cover}
            when={t(($) => $.project.preview.now)}
            status={{
              label: t(($) => $.project.status[form.status]),
              strong: form.status === 'testable',
            }}
            {...(category ? { category: { label: category.label, icon: category.icon } } : null)}
          />
        </CardPreview>
        <Text variant="caption" tone="muted">
          {t(($) => $.project.form.previewLight)}
        </Text>
      </Stack>
      <ProjectAudienceChoice audience={form.audience} change={change} />
    </Stack>
  )
}
