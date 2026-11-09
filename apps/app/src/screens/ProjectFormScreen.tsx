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
//   (`ProjectCategorySheet`), les photos (`usePhotoTiles`), la couverture verticale
//   (`usePortraitCover`) et la fenêtre de suppression ;
// - la fenêtre « Abandonner ce projet ? », demandée par toute fermeture quand quelque chose a été
//   écrit, y compris le retour du navigateur (`useLeaveGuard`).
// Le profil est lu avant le formulaire : un compte suspendu ne tape jamais un texte qui se perdrait.
//
// Après les relectures (ui-C6), l'envoi et ses issues vivent dans `projects/useSubmitProject.ts`,
// le choix du message de la feuille dans `projects/form.ts` (`formNoticeKind`), l'aperçu de
// l'ordinateur dans `ProjectFormPreview.tsx` et les photos dans `ProjectPhotoFields.tsx`.
import type { Project } from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { nextAfterSignIn } from '../navigation/signInAgain'
import { type HeldAction, useLeaveGuard } from '../navigation/useLeaveGuard'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { useMe } from '../profile/hooks'
import { DeleteProjectDialog } from '../projects/DeleteProjectDialog'
import {
  emptyProjectForm,
  FORM_NOTICE_TONES,
  type FormNoticeKind,
  formFromProject,
  formNoticeKind,
  isDirty,
  type ProjectForm,
  type ProjectFormErrors,
  toProjectChanges,
} from '../projects/form'
import { useProject } from '../projects/hooks'
import { usePhotoTiles } from '../projects/usePhotoTiles'
import { usePortraitCover } from '../projects/usePortraitCover'
import { useSubmitProject } from '../projects/useSubmitProject'
import { Button } from '../ui/Button'
import { type Focusable, focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Sheet, type SheetNotice, useSheetAside } from '../ui/Sheet'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { type StateKind, StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { useCalmMotion } from '../ui/theme/motion'
import { useToast } from '../ui/theme/toast'
import { HomeScreen } from './HomeScreen'
import { ProjectAbandonDialog } from './ProjectAbandonDialog'
import { audienceSentence } from './ProjectAudienceChoice'
import { ProjectCategorySheet } from './ProjectCategorySheet'
import {
  type CategoriesOpener,
  type ChangeField,
  firstFieldWithError,
  ProjectFormFields,
  useProjectFieldRefs,
} from './ProjectFormFields'
import { ProjectFormPreview } from './ProjectFormPreview'

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
  const beside = useSheetAside()
  const projectId = project?.id
  const editing = projectId !== undefined
  // useState(() => …) : la valeur d'ouverture, gardée même quand le cache du projet change (photos).
  const [initial] = useState(opened)
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const photos = usePhotoTiles(projectId)
  // La couverture verticale du téléphone, à côté des photos, avec les mêmes deux modes.
  const portrait = usePortraitCover(projectId)
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

  // Ce qui serait perdu en fermant : un champ changé ; à la création, aussi une photo ou une
  // couverture verticale choisie (en modification, elles sont déjà enregistrées).
  const dirty = isDirty(initial, form) || (!editing && (photos.tiles.length > 0 || portrait.chosen))
  // Une photo ou la couverture se prépare encore sur l'appareil : « Publier » attend.
  const preparing = photos.preparing || portrait.preparing

  // --- Fermer, abandonner ---
  // `asking` : la fenêtre d'abandon est ouverte ; `held` : le retour du navigateur arrêté, à rejouer.
  const [asking, setAsking] = useState(false)
  const held = useRef<HeldAction | null>(null)
  const guard = useLeaveGuard(dirty, (action) => {
    held.current = action
    setAsking(true)
  })
  // L'envoi et ses issues (le fil qui danse, le brouillon, les photos qui manquent).
  const submit = useSubmitProject({
    projectId,
    initial,
    flushPhotos: photos.flushPending,
    flushPortrait: portrait.flush,
    release: guard.release,
  })
  const busy = submit.busy
  const leave = () => {
    // En modification, la description d'une photo tapée part même si l'on ferme tout de suite
    // (ui-I12) : l'envoi continue après la fermeture, rien n'attend.
    if (projectId) void photos.flushPending(projectId)
    // Sur le web, la fermeture attend que l'étape de plus de l'historique soit retirée.
    void guard.release().then(close)
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
    if (submit.inFlight()) return
    setMessage(null)
    photos.clearNotices()
    portrait.clearProblem()
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
    // La feuille reste ouverte sur un échec de l'API, qui se lit au-dessus des champs.
    const failed = await submit.send(form, checked.changes)
    if (failed) setMessage(t(($) => $.errors[failed]))
  }

  const onDeleted = () => {
    setDeleting(false)
    toast.show(
      t(($) => $.project.form.deleted),
      { icon: 'check-circle' },
    )
    // « Mes projets », jamais un retour vers la page supprimée (ui-M3).
    void guard.release().then(() => router.dismissTo('/me'))
  }

  // --- Ce que la feuille dit au-dessus des champs (un seul message à la fois) ---
  // Le choix est une fonction pure (`formNoticeKind`, testée seule) ; ici, son texte. Recopiés dans
  // des constantes : le sélecteur de `t` ne garde pas le rétrécissement de `null` d'une propriété.
  const cut = photos.cut
  const photoError = photos.problem === 'describeFailed' ? null : photos.problem
  const portraitProblem = portrait.problem
  const noticeTexts: Record<FormNoticeKind, () => string> = {
    message: () => message ?? '',
    photosCut: () => (cut ? t(($) => $.project.form.photosCut, cut) : ''),
    describeFailed: () => t(($) => $.project.form.describeFailed),
    photoProblem: () => (photoError ? t(($) => $.errors[photoError]) : ''),
    portraitProblem: () => (portraitProblem ? t(($) => $.errors[portraitProblem]) : ''),
    uploadFailed: () => t(($) => $.project.form.uploadFailed),
    preparing: () => t(($) => $.project.visuals.preparing),
    unchanged: () => t(($) => $.project.form.unchanged),
  }
  const noticeKind = formNoticeKind({
    message: Boolean(message),
    photosCut: Boolean(cut),
    photoProblem:
      photos.problem === 'describeFailed' ? 'describeFailed' : photoError ? 'other' : null,
    portraitProblem: Boolean(portraitProblem),
    uploadFailed,
    editing,
    preparing,
    dirty,
  })
  const notice: SheetNotice | null = noticeKind
    ? { message: noticeTexts[noticeKind](), ...FORM_NOTICE_TONES[noticeKind] }
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
          disabled: editing ? !dirty : preparing,
          focusableWhenDisabled: true,
        }}
        notice={notice}
        busy={busy}
        closeGuard={requestClose}
        onClose={requestClose}
        {...(beside
          ? {
              aside: <ProjectFormPreview form={form} cover={cover} change={change} />,
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
          portrait={{
            tile: portrait.tile,
            onPick: portrait.onPick,
            onRemove: portrait.onRemove,
            busy: portrait.busy,
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
      <ProjectAbandonDialog
        visible={asking}
        editing={editing}
        onKeep={() => setAsking(false)}
        onAbandon={abandon}
      />
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
