// La feuille « Ton retour » (R7b, scénario « Les retours », planche R7b-Feuille-Retour) : un testeur
// dit à l'auteur ce que donne son projet. « Ça a marché ? » (Oui, En partie, Non) suffit ; il peut
// ajouter sur quoi il a testé, raconter, et joindre une capture d'écran. Le retour arrive dans son fil
// avec l'auteur, qui est prévenu.
//
// La feuille a sa propre adresse, `/projects/<id>/testers/new-feedback` (choix du plan R7b : le Retour
// du navigateur la ferme), posée sur la page d'où l'on vient comme « Nouvel appel » (`CallSheet.tsx`,
// même construction). Elle se ferme en revenant en arrière, ou vers le coin des testeurs quand on est
// arrivé par un lien direct.
//
// Ce qu'elle montre, de haut en bas :
// - « Annuler », le titre et « Envoyer », jamais grisé : sans issue choisie, la question dit pourquoi
//   (« Choisis Oui, En partie ou Non. ») et reçoit le focus ;
// - le projet et à qui l'on écrit (« Projet de Léa », `SheetProjectHead`), et « Effacer le brouillon »
//   quand la feuille s'est rouverte sur un brouillon ;
// - « Ça a marché ? », obligatoire ; « Sur quoi ? », facultatif, qui se vide par « Effacer » ;
// - le texte (1 000 caractères, compteur, exemple du scénario), facultatif ;
// - la capture, facultative (`PhotoTiles`, une seule, sans couverture), et l'aide de la relecture
//   juridique (J8) : retirer ce qui est personnel, à soi ou à d'autres ;
// - au pied, le cadenas (J2) : le retour reste entre l'auteur et soi, et l'auteur est prévenu.
//
// Le brouillon (décision 5 de Louis) : tout ce qu'on choisit ou écrit est gardé en mémoire
// (`testers/drafts.ts`) à chaque geste. Fermer la feuille, par Échap, le voile, « Annuler » ou le
// Retour du navigateur, ne demande donc rien. Il est oublié une fois le retour envoyé, ou par
// « Effacer le brouillon ».
import {
  type FeedbackDevice,
  type FeedbackOutcome,
  MESSAGE_TEXT_MAX,
  type Project,
  TESTER_MESSAGES_PER_DAY,
  type TesterMedia,
} from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { pickImage } from '../media/pick'
import { nextAfterSignIn, useSignInAgain } from '../navigation/signInAgain'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { useMe } from '../profile/hooks'
import { useProject } from '../projects/hooks'
import {
  type CornerFailure,
  useSendMessage,
  useTesterCorner,
  useUploadTesterMedia,
} from '../testers/corner-api'
import { draftKey, readDraft, useDraft, writeDraft } from '../testers/drafts'
import { Choices } from '../ui/Choices'
import { type Focusable, focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Hint } from '../ui/Hint'
import type { IconName } from '../ui/Icon'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { SheetProjectHead } from '../ui/SheetProjectHead'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { type StateKind, StateMessage } from '../ui/StateMessage'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { useCalmMotion } from '../ui/theme/motion'
import { useNameOf } from '../useNameOf'
import { ProjectScreen } from './ProjectScreen'

type ScreenProps = { id: string }

export function FeedbackSheet({ id }: ScreenProps) {
  const router = useRouter()
  // Sans page d'avant (une adresse tapée), rien n'est dessous la fenêtre transparente : la feuille
  // pose la page du projet elle-même. Décidé une fois, à l'ouverture (comme « Nouvel appel »).
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <ProjectScreen id={id} /> : null}
      <FeedbackSheetStates id={id} />
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
function FeedbackSheetStates({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  // Fermer revient à la page d'avant, sinon au coin des testeurs (arrivée par un lien direct).
  const sheet = useRouteSheet({ pathname: '/projects/[id]/testers', params: { id } })
  const { state, session, retry } = useMemberSession()
  // Le profil (sa suspension) d'abord : rien à taper tant qu'on ne sait pas si l'on peut écrire.
  const me = useMe(Boolean(session))
  const project = useProject(id, Boolean(session && me.data))
  // Le coin dit qui regarde : seul un testeur actuel envoie un retour.
  const corner = useTesterCorner(id)
  const title = t(($) => $.project.testers.feedback.sheetTitle)

  // L'auteur, ou un ancien testeur, arrivé par l'adresse : rien à écrire ici, la feuille se ferme
  // vers la page d'avant ou le coin, qui leur montre ce qu'ils peuvent y faire (les fils de ses
  // testeurs pour l'un, son fil en lecture seule et la phrase qui le dit pour l'autre). Une fois.
  const role = corner.data?.role
  const leaving = role !== undefined && role !== 'tester'
  const left = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le rôle lu décide ; `close` change à chaque rendu.
  useEffect(() => {
    if (!leaving || left.current) return
    left.current = true
    sheet.close()
  }, [leaving])

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
  // Un projet privé d'un autre membre, ou un coin fermé (projet retiré, privé, auteur suspendu), répond
  // comme un projet inconnu : « introuvable ».
  const notFound = () =>
    stateSheet({
      kind: 'notFound',
      title: t(($) => $.project.page.notFoundTitle),
      message: t(($) => $.project.page.notFound),
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
    // Comme « Nouvel appel » : le bandeau replié (la date de fin, « Détails » vers le recours), puis
    // la phrase ; aucun champ où taper un texte qui ne pourrait pas partir.
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
    if (errorKey(project.error) === 'notFound') return notFound()
    return failed(project.error, () => void project.refetch())
  }
  if (corner.error) {
    if (errorKey(corner.error) === 'notFound') return notFound()
    return failed(corner.error, () => void corner.refetch())
  }
  if (!project.data || !corner.data || leaving) return loading
  if (corner.data.closed) return notFound()
  return (
    <FeedbackForm
      project={project.data}
      memberId={session.user.id}
      open={sheet.open}
      close={sheet.close}
    />
  )
}

// --- Le brouillon ---

/**
 * La capture du retour. `key` la suit d'un rendu à l'autre ; `uri` est l'image de l'appareil (montrée
 * telle quelle) ; `media` l'image en attente sur le serveur, citée par le retour (`captureId`), une
 * fois l'envoi fini.
 */
type FeedbackCapture = {
  key: string
  uri: string
  state: 'uploading' | 'ready' | 'failed'
  media: TesterMedia | null
}

/** Ce que garde le brouillon : l'issue, l'appareil, le texte et la capture. */
type FeedbackDraft = {
  outcome: FeedbackOutcome | null
  device: FeedbackDevice | null
  text: string
  capture: FeedbackCapture | null
}

const EMPTY_DRAFT: FeedbackDraft = { outcome: null, device: null, text: '', capture: null }

/** Vrai si le brouillon a quelque chose à rendre (un choix, un texte, une capture). */
const hasContent = (draft: FeedbackDraft | undefined): boolean =>
  Boolean(draft && (draft.outcome || draft.device || draft.text.trim() !== '' || draft.capture))

/**
 * Le brouillon gardé, tel qu'une feuille rouverte peut le reprendre. Une capture encore « en envoi »
 * ou refusée est oubliée : la feuille d'avant, fermée pendant l'envoi, n'est plus là pour la suivre
 * (et l'envoi qui finirait après ne réécrit pas ce brouillon, voir `addImage`).
 */
const reopenedDraft = (key: string): FeedbackDraft | undefined => {
  const saved = readDraft<FeedbackDraft>(key)
  if (saved?.capture && saved.capture.state !== 'ready') {
    const kept = { ...saved, capture: null }
    writeDraft(key, kept)
    return kept
  }
  return saved
}

// Les icônes des choix, comme sur la planche et dans la bulle du fil (`OutcomePill`, `MessageBubble`).
// Décoratives : le texte de chaque choix dit tout.
const OUTCOMES: { value: FeedbackOutcome; icon: IconName }[] = [
  { value: 'yes', icon: 'check' },
  { value: 'partly', icon: 'circle-half' },
  { value: 'no', icon: 'x' },
]
const DEVICES: { value: FeedbackDevice; icon: IconName }[] = [
  { value: 'phone', icon: 'device-mobile' },
  { value: 'computer', icon: 'desktop' },
  // Pas d'icône de tablette dans le jeu d'icônes : celle du téléphone, comme la bulle du fil.
  { value: 'tablet', icon: 'device-mobile' },
]

// --- Le formulaire ---

type FormProps = {
  project: Project
  /** Le membre connecté, qui écrit dans son propre fil ; son brouillon ne se mêle à aucun autre. */
  memberId: string
  open: boolean
  /** Ferme la feuille (retour à la page d'avant, ou au coin). */
  close: () => void
}

// Un compteur pour les clés des captures choisies (une capture neuve, une clé neuve).
let captureCount = 0

function FeedbackForm({ project, memberId, open, close }: FormProps) {
  const { t } = useTranslation()
  const calm = useCalmMotion()
  const toSource = useMediaSources()
  const nameOf = useNameOf()
  const signInAgain = useSignInAgain()

  // --- Le brouillon ---
  const key = draftKey(memberId, project.id, 'feedback')
  // Lu une fois, avant `useDraft` : la feuille rouverte sur un brouillon propose de l'effacer.
  const [hadDraft, setHadDraft] = useState(() => hasContent(reopenedDraft(key)))
  const [draft, setDraft, clearDraft] = useDraft<FeedbackDraft>(key, EMPTY_DRAFT)
  // Le brouillon du moment, lu par les gestes qui finissent plus tard (l'envoi d'une capture).
  const latest = useRef(draft)
  latest.current = draft
  const change = (patch: Partial<FeedbackDraft>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setDraft(next)
  }

  // --- Les erreurs ---
  // Sous « Ça a marché ? » : « Choisis Oui, En partie ou Non. », après un envoi sans issue.
  const [outcomeError, setOutcomeError] = useState<string | null>(null)
  // Au pied de la feuille : l'échec de l'envoi (quota, session, capture perdue, coin fermé), ou
  // l'attente de la capture.
  const [message, setMessage] = useState<string | null>(null)
  const [signInNeeded, setSignInNeeded] = useState(false)
  const [uploadProblem, setUploadProblem] = useState<string | null>(null)

  const { send, pending, error: sendFailed, reason } = useSendMessage(project.id, memberId)
  const media = useUploadTesterMedia(project.id, 'capture')
  // Vrai dès la tape sur « Envoyer », avant même que React redessine : une seconde tape n'envoie rien.
  const inFlight = useRef(false)
  // L'entrée de « Ça a marché ? » : son seul arrêt de Tab (le choix coché, sinon « Oui »).
  const outcomeRef = useRef<Focusable | null>(null)

  // --- Le focus sur « Ça a marché ? », après « Effacer le brouillon » ---
  // Le lien disparaît sous le doigt : le focus va à la première question, vide. Posé après le rendu
  // suivant : c'est alors seulement que l'entrée du groupe redevient « Oui » (plus rien de coché).
  const [focusOutcome, setFocusOutcome] = useState(0)
  useEffect(() => {
    if (focusOutcome === 0) return
    const node = outcomeRef.current
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [focusOutcome])

  // --- Fermer ---
  // Le brouillon est déjà gardé à chaque geste : fermer ne demande rien. Pendant l'envoi, rien ne
  // ferme (la feuille est `busy`) : « Annuler » mentirait, le retour partirait quand même.
  const requestClose = () => {
    if (pending || inFlight.current) return
    close()
  }

  // --- Les choix et le texte ---
  const chooseOutcome = (outcome: FeedbackOutcome) => {
    change({ outcome })
    setOutcomeError(null)
  }
  const changeText = (text: string) => {
    // Jamais plus que ce que l'API accepte (comme `maxLength`, qui coupe aussi un texte collé) ; le
    // compteur le montre à l'œil.
    change({ text: text.slice(0, MESSAGE_TEXT_MAX) })
  }

  // --- La capture ---
  const addImage = async (image: { uri: string }) => {
    captureCount += 1
    const captureKey = `feedback-capture-${captureCount}`
    setUploadProblem(null)
    change({ capture: { key: captureKey, uri: image.uri, state: 'uploading', media: null } })
    const uploaded = await media.upload(image)
    // Le brouillon a pu changer pendant l'envoi (capture retirée, brouillon effacé, feuille fermée puis
    // rouverte) : on ne touche qu'à la capture qu'on envoyait, si elle est toujours là.
    const now = readDraft<FeedbackDraft>(key)
    if (now?.capture?.key !== captureKey) return
    const next: FeedbackDraft = {
      ...now,
      capture: uploaded
        ? { ...now.capture, state: 'ready', media: uploaded }
        : { ...now.capture, state: 'failed' },
    }
    latest.current = next
    setDraft(next)
  }
  const onAdd = async () => {
    try {
      const image = await pickImage('free')
      if (image) await addImage(image)
    } catch {
      // La préparation de l'image a échoué : rien n'est posé, le membre peut recommencer.
      setUploadProblem(t(($) => $.errors.internal))
    }
  }
  // Sur le web, une image déposée sur la tuile « Ajouter » (ou sur la zone, sur ordinateur).
  const onDropFiles = (files: File[]) => {
    const file = files.find((one) => one.type.startsWith('image/'))
    if (file) void addImage({ uri: URL.createObjectURL(file) })
  }
  const removeCapture = () => {
    setUploadProblem(null)
    change({ capture: null })
  }

  // Ce qui empêche une capture d'arriver, au-delà de sa tuile (« n'a pas pu être ajoutée ») : le
  // plafond de 100 captures du fil, trop de demandes, la session expirée. Lu dans un effet : la raison
  // n'est connue du hook qu'après son nouveau rendu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule la réponse de l'envoi compte.
  useEffect(() => {
    if (!media.error) return
    setUploadProblem(uploadProblemText(media.reason))
  }, [media.error, media.reason])
  const uploadProblemText = (failure: CornerFailure | undefined): string | null =>
    failure === 'full'
      ? t(($) => $.errors.testerMediaFull)
      : failure === 'limited'
        ? t(($) => $.errors.rateLimited)
        : failure === 'expired'
          ? t(($) => $.errors.unauthorized)
          : null

  // --- Envoyer ---
  const onSend = async () => {
    if (inFlight.current || pending) return
    setMessage(null)
    setSignInNeeded(false)
    const { outcome, device, text, capture } = latest.current
    if (!outcome) {
      // Une nouvelle phrase à chaque refus ; la question reprend le focus (son entrée, « Oui ») et
      // vient dans l'écran, au-dessus du pied. Sur téléphone, le lecteur d'écran y va aussi.
      setOutcomeError(t(($) => $.project.testers.feedback.outcomeRequired))
      const node = outcomeRef.current
      focusAndReveal(node, calm)
      moveReaderTo(node)
      return
    }
    if (capture?.state === 'uploading') {
      setMessage(t(($) => $.project.updates.photosUploading))
      return
    }
    setOutcomeError(null)
    // Une capture refusée n'est pas jointe : sa tuile dit déjà qu'elle n'a pas pu être ajoutée.
    const captureId = capture?.state === 'ready' ? (capture.media?.id ?? null) : null
    const written = text.trim()
    inFlight.current = true
    const sent = await send({
      kind: 'feedback',
      outcome,
      device,
      text: written === '' ? null : written,
      captureId,
    })
    inFlight.current = false
    if (sent) {
      // Le retour est parti : le brouillon n'a plus de raison d'être.
      clearDraft()
      close()
    }
  }

  // L'échec de l'envoi : la raison connue (30 messages du jour, session, capture perdue, coin fermé),
  // sinon « Réessaie ». Tout ce qui est écrit reste ; le message reste jusqu'au prochain envoi.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule la réponse de l'envoi compte.
  useEffect(() => {
    if (!sendFailed) return
    setSignInNeeded(reason === 'expired')
    if (reason === 'invalidPhoto') {
      // La capture en attente n'existe plus sur le serveur (trop vieille, ou retirée) : elle quitte la
      // feuille, « Ajouter une capture » revient, et le reste est gardé (ui-A12).
      const next = { ...latest.current, capture: null }
      latest.current = next
      setDraft(next)
    }
    setMessage(
      reason === 'limited'
        ? t(($) => $.project.testers.feedback.limited, { max: TESTER_MESSAGES_PER_DAY })
        : reason === 'expired'
          ? t(($) => $.errors.unauthorized)
          : reason === 'invalidPhoto'
            ? t(($) => $.project.testers.feedback.invalidCapture)
            : reason === 'closed'
              ? t(($) => $.errors.cornerClosed)
              : reason === 'full'
                ? t(($) => $.errors.testerMediaFull)
                : t(($) => $.project.testers.feedback.error),
    )
  }, [sendFailed, reason])

  // --- Effacer le brouillon ---
  const clearAll = () => {
    clearDraft()
    latest.current = EMPTY_DRAFT
    setHadDraft(false)
    setOutcomeError(null)
    setMessage(null)
    setUploadProblem(null)
    setFocusOutcome((count) => count + 1)
  }

  // --- Le message au pied de la feuille (un seul à la fois) ---
  const noticeText = message ?? uploadProblem
  const notice: SheetNotice | null = noticeText
    ? {
        message: noticeText,
        tone: 'error',
        ...(message && signInNeeded ? { action: signInAgain() } : null),
      }
    : null

  // --- Ce qui s'affiche ---
  const cover = project.visuals[0]
  const authorName = project.author.name
  const capture = draft.capture
  const captureLabel = t(($) => $.project.testers.feedback.captureNameMine)
  const tiles: PhotoTile[] = capture
    ? [
        {
          key: capture.key,
          state: capture.state,
          image: { source: { uri: capture.uri }, thumbhash: null, label: captureLabel },
          ...(capture.state === 'failed'
            ? { error: t(($) => $.project.form.photoUploadError) }
            : null),
        },
      ]
    : []
  const tileLabels: PhotoTilesLabels = {
    list: t(($) => $.project.testers.feedback.capture),
    add: t(($) => $.project.testers.feedback.addCapture),
    addLabel: t(($) => $.project.testers.feedback.addCapture),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    tile: () => captureLabel,
    uploading: (number) => t(($) => $.project.form.photoUploading, { number }),
    failed: (number, why) => t(($) => $.project.form.photoFailed, { number, reason: why }),
    move: (number) => t(($) => $.project.form.movePhoto, { number }),
    makeCover: t(($) => $.project.form.makeCover),
    earlier: t(($) => $.project.form.movePhotoEarlier),
    later: t(($) => $.project.form.movePhotoLater),
    moved: (place) => t(($) => $.project.form.photoMoved, { place }),
    remove: (number) => t(($) => $.project.form.removePhoto, { number }),
  }

  return (
    <Sheet
      open={open}
      title={t(($) => $.project.testers.feedback.sheetTitle)}
      heading={1}
      cancelLabel={t(($) => $.project.testers.feedback.cancel)}
      action={{
        // Jamais grisé : sans issue, la question dit pourquoi (scénario).
        label: t(($) => $.project.testers.feedback.submit),
        onPress: () => void onSend(),
        busy: pending,
      }}
      // La feuille s'ouvre sous le doigt d'« Envoyer un retour » : la seconde tape d'une double tape
      // ne tombe ni sur « Annuler » ni sur « Envoyer ».
      guardTaps
      notice={notice}
      busy={pending}
      onClose={requestClose}
      // Le cadenas (J2) : qui lit ce retour. Au pied sur ordinateur, à la fin du contenu sur téléphone.
      footerNote={
        <Hint
          icon="lock-simple"
          text={t(($) => $.project.testers.feedback.privacy, { name: authorName })}
        />
      }
    >
      <Stack gap="xl">
        <SheetProjectHead
          thumb={cover ? toSource(cover.url) : null}
          title={project.title}
          subtitle={t(($) => $.project.testers.feedback.byAuthor, { nameOf: nameOf(authorName) })}
          {...(hadDraft
            ? {
                action: {
                  label: t(($) => $.project.testers.feedback.clearDraft),
                  onPress: clearAll,
                },
              }
            : null)}
        />
        <Choices
          label={t(($) => $.project.testers.feedback.outcome)}
          options={OUTCOMES.map(({ value, icon }) => ({
            value,
            icon,
            label: t(($) => $.project.testers.feedback.outcomes[value]),
          }))}
          value={draft.outcome}
          onChange={chooseOutcome}
          entryRef={outcomeRef}
          error={outcomeError ?? undefined}
        />
        <Choices
          label={t(($) => $.project.testers.feedback.device)}
          options={DEVICES.map(({ value, icon }) => ({
            value,
            icon,
            label: t(($) => $.project.testers.feedback.devices[value]),
          }))}
          value={draft.device}
          onChange={(device) => change({ device })}
          clearLabel={t(($) => $.project.testers.feedback.clearDevice)}
        />
        <TextField
          label={t(($) => $.project.testers.feedback.text)}
          value={draft.text}
          onChangeText={changeText}
          placeholder={t(($) => $.project.testers.feedback.placeholder)}
          multiline
          maxLines={10}
          autoCapitalize="sentences"
          maxLength={MESSAGE_TEXT_MAX}
          showCount
          editable={!pending}
        />
        <Stack gap="sm">
          <Row gap="xs" wrap>
            <Text variant="caption" weight={600} tone="secondary">
              {t(($) => $.project.testers.feedback.capture)}
            </Text>
            <Text variant="caption" tone="muted">
              {t(($) => $.project.testers.feedback.optional)}
            </Text>
          </Row>
          <PhotoTiles
            tiles={tiles}
            max={1}
            labels={tileLabels}
            selectedKey={null}
            // Une seule capture, sans description (elle a un nom lu fixe, J8) : la toucher ne mène nulle part.
            onSelect={() => {}}
            onAdd={() => void onAdd()}
            onDropFiles={onDropFiles}
            onMove={() => {}}
            onRemove={removeCapture}
            busy={pending}
            cover={false}
          />
          {/* L'aide de la relecture juridique (J8), sous les tuiles, même sans capture : avant de choisir. */}
          <Hint icon="info" text={t(($) => $.project.testers.feedback.captureHint)} />
        </Stack>
      </Stack>
    </Sheet>
  )
}
