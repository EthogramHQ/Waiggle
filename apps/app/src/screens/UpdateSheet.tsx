// La feuille « Nouvelle mise à jour » (R7a, scénario « Publier une mise à jour », planche
// R7-MAJ-Publier) : l'auteur raconte ce qui a changé dans son projet.
//
// La feuille a sa propre adresse, `/projects/<id>/update` (décision de R7a : le Retour du
// navigateur la ferme), posée sur la page du projet comme « Modifier » (`app/_layout.tsx`). Ouverte
// sans page d'avant (une adresse tapée), elle dessine la page du projet dessous.
//
// Ce fichier tient la feuille, ses états et l'envoi ; son contenu est dans `UpdateSheetFields.tsx`
// (que le catalogue montre aussi), fait de composants de `src/ui` :
// - en tête, le projet et sa dernière version (`ProjectStrip`) ;
// - le titre, les lignes de « Ce qui a changé » (`UpdateLinesField`, qui tient son titre, son
//   compteur et son aide), la version, les photos (`PhotoTiles`, par `usePhotoTiles` en mode
//   `update`) et, dès deux photos, l'interrupteur « Avant / après » ;
// - au pied, qui lira la mise à jour (projet public ou privé, textes du juridique).
// Les valeurs et ce qui part à l'API sont des fonctions pures (`updates/form.ts`) ; l'envoi passe
// par `usePublishUpdate` (`updates/api.ts`).
//
// Fermer une feuille où l'on a écrit (Échap, le voile, « Annuler », le Retour du navigateur)
// demande « Abandonner cette mise à jour ? » ; « Abandonner » efface aussi les photos déjà envoyées
// (`discardPending`). Une feuille sans changement, ou seulement préremplie, se ferme tout de suite.
import { type Project, ProjectStatus, UPDATE_LINE_MAX, UPDATE_PHOTOS_MAX } from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { nextAfterSignIn, useSignInAgain } from '../navigation/signInAgain'
import { type HeldAction, useLeaveGuard } from '../navigation/useLeaveGuard'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { useMe } from '../profile/hooks'
import { useProject } from '../projects/hooks'
import { usePhotoTiles } from '../projects/usePhotoTiles'
import { DiscardDialog } from '../ui/DiscardDialog'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { type StateKind, StateMessage } from '../ui/StateMessage'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { Text } from '../ui/Text'
import { useToast } from '../ui/theme/toast'
import { usePublishUpdate } from '../updates/api'
import { emptyLine, isDirty, toPayload, type UpdateFormValues } from '../updates/form'
import { ProjectScreen } from './ProjectScreen'
import { UpdateSheetFields } from './UpdateSheetFields'

type ScreenProps = {
  id: string
  /** Le statut que « Modifier » vient de donner au projet (`?announce=`), tel que lu dans l'adresse. */
  announce?: string
}

export function UpdateSheet({ id, announce }: ScreenProps) {
  const router = useRouter()
  // Sans page d'avant, rien n'est dessous la fenêtre transparente : la feuille pose la page du
  // projet elle-même. Décidé une fois, à l'ouverture (comme la feuille de publication).
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <ProjectScreen id={id} /> : null}
      <UpdateSheetStates id={id} announce={announce} />
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
function UpdateSheetStates({ id, announce }: { id: string; announce: string | undefined }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  // Fermer revient à la page d'avant, sinon à la page du projet (arrivée par un lien direct).
  const sheet = useRouteSheet({ pathname: '/projects/[id]', params: { id } })
  const { state, session, retry } = useMemberSession()
  // Le profil (sa suspension) d'abord : rien à taper tant qu'on ne sait pas si l'on peut publier.
  const me = useMe(Boolean(session))
  const project = useProject(id, Boolean(session && me.data))
  const title = t(($) => $.project.updates.sheetTitle)

  const shown = (content: ReactNode) => (
    <Sheet open={sheet.open} title={title} heading={1} onClose={sheet.close}>
      {content}
    </Sheet>
  )
  const loading = shown(<SkeletonList count={2} />)
  const stateSheet = ({ actions, ...rest }: SheetState) =>
    shown(<StateMessage level={2} {...rest} actions={actions ?? []} />)
  const seeProject = {
    label: t(($) => $.states.seeProject),
    onPress: () => router.replace({ pathname: '/projects/[id]', params: { id } }),
  }
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
    // Comme la feuille de publication : le bandeau replié (la date de fin, « Détails » vers le
    // recours), puis la phrase, sans mascotte ; aucun champ où taper un texte qui se perdrait.
    return (
      <Sheet
        open={sheet.open}
        title={t(($) => $.suspension.formTitle)}
        heading={1}
        onClose={sheet.close}
      >
        <Stack gap="lg">
          <SuspensionBanner suspension={me.data.suspension} initiallyOpen={false} />
          <StateMessage
            kind="signedOut"
            picture={null}
            message={t(($) => $.suspension.formBody)}
            actions={[seeProject]}
          />
        </Stack>
      </Sheet>
    )
  }
  if (project.error) {
    // Un projet privé d'un autre membre répond comme un projet inconnu : « introuvable ».
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
      actions: [seeProject],
    })
  }
  return (
    <UpdateForm project={project.data} announce={announce} open={sheet.open} close={sheet.close} />
  )
}

/** Le statut de `?announce=`, s'il en est un vrai ; une adresse fabriquée ne préremplit rien. */
const announcedStatus = (announce: string | undefined): ProjectStatus | null => {
  const parsed = ProjectStatus.safeParse(announce)
  return parsed.success ? parsed.data : null
}

type FormProps = {
  project: Project
  announce: string | undefined
  open: boolean
  /** Ferme la feuille (retour à la page d'avant, ou à celle du projet). */
  close: () => void
}

function UpdateForm({ project, announce, open, close }: FormProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const toSource = useMediaSources()
  const signInAgain = useSignInAgain()
  const isPrivate = project.visibility === 'private'

  // Le statut annoncé, lu une fois : la ligne préremplie et l'aide qui dit pourquoi la feuille
  // s'est ouverte. Le texte est traduit ici : il part tel quel dans la mise à jour.
  const [status] = useState(() => announcedStatus(announce))
  const statusName = status ? t(($) => $.project.status[status]) : null
  // useState(() => …) : les valeurs d'ouverture, gardées telles quelles ; `isDirty` les compare au
  // formulaire, pour qu'une feuille seulement préremplie se ferme sans question.
  const [initial] = useState<UpdateFormValues>(() => ({
    title: '',
    version: '',
    lines: [
      statusName
        ? {
            ...emptyLine('new'),
            text: t(($) => $.project.updates.statusPrefill, { status: statusName }),
          }
        : emptyLine(),
    ],
    beforeAfter: false,
  }))
  const [form, setForm] = useState(initial)
  // Le refus de publier sans ligne, posé sur la première ligne (qui reçoit le focus).
  const [linesError, setLinesError] = useState<string | null>(null)
  // La ligne qui porte ce refus : celle qui est trop longue ; null (« rien d'écrit ») : la première.
  const [linesErrorId, setLinesErrorId] = useState<string | null>(null)
  // Le message de la feuille : « Attends la fin de l'envoi des photos. », ou l'échec de l'envoi.
  const [message, setMessage] = useState<string | null>(null)
  const [signInNeeded, setSignInNeeded] = useState(false)

  const photos = usePhotoTiles(project.id, { slot: 'update', max: UPDATE_PHOTOS_MAX })
  const { publish, pending, error: failed, reason } = usePublishUpdate(project.id)
  // Vrai dès la tape sur « Publier », avant même que React redessine : une seconde tape n'envoie rien.
  const inFlight = useRef(false)

  const kept = photos.photos.length
  const canCompare = kept >= 2
  // Sous deux photos, « Avant / après » s'éteint (l'interrupteur disparaît ; l'API refuserait).
  useEffect(() => {
    if (!canCompare && form.beforeAfter) setForm((now) => ({ ...now, beforeAfter: false }))
  }, [canCompare, form.beforeAfter])

  const dirty = isDirty(initial, form, photos.photos)

  // --- Fermer, abandonner ---
  // `asking` : la fenêtre d'abandon est ouverte ; `held` : le retour du navigateur arrêté, à rejouer.
  const [asking, setAsking] = useState(false)
  const held = useRef<HeldAction | null>(null)
  const guard = useLeaveGuard(dirty, (action) => {
    held.current = action
    setAsking(true)
  })
  // Sur le web, la fermeture attend que l'étape de plus de l'historique soit retirée.
  const leave = () => void guard.release().then(close)
  const requestClose = () => {
    if (pending || inFlight.current) return
    if (dirty) {
      held.current = null
      setAsking(true)
    } else {
      leave()
    }
  }
  const abandon = () => {
    setAsking(false)
    // Les photos déjà envoyées attendaient cette mise à jour : elles sont effacées du serveur
    // (sans attendre la fin : la feuille se ferme tout de suite, l'effacement suit).
    void photos.discardPending()
    const action = held.current
    held.current = null
    if (action) guard.proceed(action)
    else leave()
  }

  // --- Changer un champ ---
  const change = (next: UpdateFormValues) => {
    setForm(next)
    // Une ligne écrite après un refus : le message de la première ligne s'en va.
    if (linesError && toPayload(next, []).ok) {
      setLinesError(null)
      setLinesErrorId(null)
    }
  }

  // --- Publier ---
  const onPublish = async () => {
    if (inFlight.current || pending) return
    setMessage(null)
    setSignInNeeded(false)
    photos.clearNotices()
    const checked = toPayload(form, photos.photos)
    if (!checked.ok) {
      if (checked.error === 'required') {
        // Une nouvelle phrase à chaque refus : le champ reprend le focus (UpdateLinesField).
        setLinesError(null)
        setLinesErrorId(null)
        setLinesError(t(($) => $.project.updates.required))
      } else if (checked.error === 'lineTooLong') {
        // Sur la ligne fautive, qui reçoit le focus ; rien n'est envoyé.
        setLinesError(null)
        setLinesErrorId(checked.lineId)
        setLinesError(t(($) => $.project.updates.lineTooLong, { max: UPDATE_LINE_MAX }))
      } else {
        setMessage(t(($) => $.project.updates.photosUploading))
      }
      return
    }
    setLinesError(null)
    setLinesErrorId(null)
    inFlight.current = true
    const published = await publish(checked.payload)
    inFlight.current = false
    if (published) {
      toast.show(
        t(($) => $.project.updates.published),
        { icon: 'check-circle' },
      )
      leave()
    }
  }

  // L'échec de l'envoi : la raison connue (limite du jour, session, photo perdue), sinon « Réessaie ».
  // Lu dans un effet : la raison n'est connue du hook qu'après son nouveau rendu, pas au retour de
  // `publish`. Le message reste jusqu'au prochain envoi (rien ne saute au-dessus des boutons).
  useEffect(() => {
    if (!failed) return
    setSignInNeeded(reason === 'expired')
    setMessage(
      reason === 'limited'
        ? t(($) => $.project.updates.limited)
        : reason === 'expired'
          ? t(($) => $.errors.unauthorized)
          : reason === 'invalidPhotos'
            ? t(($) => $.errors.invalidPhotos)
            : t(($) => $.project.updates.error),
    )
  }, [failed, reason, t])

  // --- Le message au pied de la feuille (un seul à la fois) ---
  const cut = photos.cut
  const problem = photos.problem
  const problemText =
    problem === 'photoGone'
      ? t(($) => $.project.form.photoGone)
      : problem === 'describeFailed'
        ? t(($) => $.project.form.describeFailed)
        : problem
          ? t(($) => $.errors[problem])
          : null
  const noticeText =
    message ?? problemText ?? (cut ? t(($) => $.project.form.photosCut, cut) : null)
  const notice: SheetNotice | null = noticeText
    ? {
        message: noticeText,
        tone: 'error',
        ...(message && signInNeeded ? { action: signInAgain() } : null),
      }
    : null

  // --- Ce qui s'affiche ---
  const cover = project.visuals[0]
  const announceText = statusName
    ? isPrivate
      ? t(($) => $.project.updates.hintAnnouncePrivate, { status: statusName })
      : t(($) => $.project.updates.hintAnnounce, { status: statusName })
    : null

  return (
    <>
      <Sheet
        open={open}
        title={t(($) => $.project.updates.sheetTitle)}
        heading={1}
        // Arrivée depuis « Modifier » : pourquoi la feuille s'est ouverte, et qu'on peut l'ignorer.
        {...(announceText ? { subtitle: announceText } : null)}
        cancelLabel={t(($) => $.project.updates.cancel)}
        action={{
          // Jamais grisé : sans ligne écrite, la première ligne dit pourquoi (scénario).
          label: t(($) => $.project.updates.publish),
          onPress: () => void onPublish(),
          busy: pending,
        }}
        // La feuille s'ouvre sous le doigt de « Publier une mise à jour » : la seconde tape d'une
        // double tape ne tombe ni sur « Annuler » ni sur « Publier ».
        guardTaps
        notice={notice}
        busy={pending}
        closeGuard={requestClose}
        onClose={requestClose}
        // Qui lira la mise à jour, et qui est prévenu (textes du juridique, mot pour mot).
        footerNote={
          <Text variant="callout" tone="secondary">
            {isPrivate
              ? t(($) => $.project.updates.hintPrivate)
              : t(($) => $.project.updates.hintPublic)}
          </Text>
        }
      >
        <UpdateSheetFields
          project={{
            title: project.title,
            image: cover
              ? { source: toSource(cover.url), thumbhash: cover.thumbhash, label: project.title }
              : null,
            latestAt: project.latestUpdate?.createdAt ?? null,
            version: project.version,
          }}
          form={form}
          onChange={change}
          linesError={linesError}
          linesErrorId={linesErrorId}
          photos={{
            tiles: photos.tiles,
            actions: photos.actions,
            selectedKey: photos.selectedKey,
            select: photos.select,
            descriptionOf: photos.descriptionOf,
            describe: photos.describe,
            count: kept,
          }}
          busy={pending}
        />
      </Sheet>
      <DiscardDialog
        visible={asking}
        title={t(($) => $.project.updates.discardTitle)}
        message={t(($) => $.project.updates.discardBody)}
        onKeep={() => setAsking(false)}
        onDiscard={abandon}
      />
    </>
  )
}
