// La feuille « Nouvel appel » (R7b, scénario « Les appels à tester », planche R7b-Feuille-Appel) :
// l'auteur d'un projet écrit à tous ses testeurs (« Essayez le niveau 3 ce week-end »), avec une
// photo s'il le veut. L'appel paraît dans le coin des testeurs et chacun est prévenu dans Activité.
//
// La feuille a sa propre adresse, `/projects/<id>/testers/new-call` (choix du plan R7b : le Retour du
// navigateur la ferme), posée sur la page d'où l'on vient comme « Nouvelle mise à jour »
// (`app/_layout.tsx`, `sheetRoute`). Elle se ferme en revenant en arrière, ou vers le coin quand on
// est arrivé par un lien direct.
//
// Ce qu'elle montre, de haut en bas :
// - « Annuler », le titre et « Envoyer », jamais grisé : sans texte, le champ dit pourquoi ;
// - le projet et à qui l'on écrit (« Pour tes 12 testeurs », `SheetProjectHead`), et « Effacer le
//   brouillon » quand la feuille s'est rouverte sur un brouillon ;
// - le texte (500 caractères, compteur, exemple du scénario), et sous lui l'aide de la relecture
//   juridique (J8) : tous les testeurs, même futurs, liront l'appel ;
// - la photo, facultative (`PhotoTiles`, une seule, sans couverture), l'aide du droit à l'image, et
//   sa description lue par les lecteurs d'écran.
//
// Le brouillon (décision 5 de Louis) : tout ce qu'on écrit est gardé en mémoire (`testers/drafts.ts`)
// à chaque frappe. Fermer la feuille, par Échap, le voile, « Annuler » ou le Retour du navigateur, ne
// demande donc rien : on retrouve son appel en rouvrant la feuille. Il est oublié une fois l'appel
// envoyé, ou par « Effacer le brouillon ».
import {
  CALL_TEXT_MAX,
  CALLS_PER_DAY_PER_PROJECT,
  PHOTO_DESCRIPTION_MAX,
  type Project,
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
import { type CornerFailure, useSendCall, useUploadTesterMedia } from '../testers/corner-api'
import { draftKey, readDraft, useDraft, writeDraft } from '../testers/drafts'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { SheetProjectHead } from '../ui/SheetProjectHead'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { type StateKind, StateMessage } from '../ui/StateMessage'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { Text } from '../ui/Text'
import { TextField, type TextFieldInput } from '../ui/TextField'
import { useCalmMotion } from '../ui/theme/motion'
import { ProjectScreen } from './ProjectScreen'

type ScreenProps = { id: string }

export function CallSheet({ id }: ScreenProps) {
  const router = useRouter()
  // Sans page d'avant (une adresse tapée), rien n'est dessous la fenêtre transparente : la feuille
  // pose la page du projet elle-même. Décidé une fois, à l'ouverture (comme « Nouvelle mise à jour »).
  const [alone] = useState(() => !router.canGoBack())
  return (
    <>
      {alone ? <ProjectScreen id={id} /> : null}
      <CallSheetStates id={id} />
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
function CallSheetStates({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  // Fermer revient à la page d'avant, sinon au coin des testeurs (arrivée par un lien direct).
  const sheet = useRouteSheet({ pathname: '/projects/[id]/testers', params: { id } })
  const { state, session, retry } = useMemberSession()
  // Le profil (sa suspension) d'abord : rien à taper tant qu'on ne sait pas si l'on peut écrire.
  const me = useMe(Boolean(session))
  const project = useProject(id, Boolean(session && me.data))
  const title = t(($) => $.project.testers.calls.sheetTitle)

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
    // Comme « Nouvelle mise à jour » : le bandeau replié (la date de fin, « Détails » vers le
    // recours), puis la phrase ; aucun champ où taper un texte qui ne pourrait pas partir.
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
  // Seul l'auteur lance un appel : un testeur (ou tout autre membre) arrivé par l'adresse lit « pas à
  // toi », sans champ (l'API refuserait de toute façon, 403).
  if (!project.data.isMine) {
    return stateSheet({
      kind: 'signedOut',
      title: t(($) => $.states.notMineTitle),
      message: t(($) => $.project.page.notMine),
      actions: [seeProject],
    })
  }
  return (
    <CallForm
      project={project.data}
      memberId={session.user.id}
      open={sheet.open}
      close={sheet.close}
    />
  )
}

// --- Le brouillon ---

/**
 * La photo de l'appel. `key` la suit d'un rendu à l'autre ; `uri` est l'image de l'appareil (montrée
 * telle quelle : pas besoin de la relire au serveur) ; `media` l'image en attente sur le serveur,
 * citée par l'appel (`photoId`), une fois l'envoi fini.
 */
type CallPhoto = {
  key: string
  uri: string
  state: 'uploading' | 'ready' | 'failed'
  media: TesterMedia | null
}

/** Ce que garde le brouillon : le texte, la photo et sa description. */
type CallDraft = { text: string; photo: CallPhoto | null; description: string }

const EMPTY_DRAFT: CallDraft = { text: '', photo: null, description: '' }

/** Vrai si le brouillon a quelque chose à rendre (un texte, une photo, une description). */
const hasContent = (draft: CallDraft | undefined): boolean =>
  Boolean(draft && (draft.text.trim() !== '' || draft.photo || draft.description.trim() !== ''))

/**
 * Le brouillon gardé, tel qu'une feuille rouverte peut le reprendre. Une photo encore « en envoi »
 * ou refusée est oubliée : la feuille d'avant, fermée pendant l'envoi, n'est plus là pour le suivre
 * (et l'envoi qui finirait après ne réécrit pas ce brouillon, voir `addPhoto`).
 */
const reopenedDraft = (key: string): CallDraft | undefined => {
  const saved = readDraft<CallDraft>(key)
  if (saved?.photo && saved.photo.state !== 'ready') {
    const kept = { ...saved, photo: null }
    writeDraft(key, kept)
    return kept
  }
  return saved
}

// --- Le formulaire ---

type FormProps = {
  project: Project
  /** Le membre connecté : son brouillon ne se mêle jamais à celui d'un autre compte. */
  memberId: string
  open: boolean
  /** Ferme la feuille (retour à la page d'avant, ou au coin). */
  close: () => void
}

// Un compteur pour les clés des photos choisies (une photo neuve, une clé neuve).
let photoCount = 0

function CallForm({ project, memberId, open, close }: FormProps) {
  const { t } = useTranslation()
  const calm = useCalmMotion()
  const toSource = useMediaSources()
  const signInAgain = useSignInAgain()

  // --- Le brouillon ---
  const key = draftKey(memberId, project.id, 'call')
  // Lu une fois, avant `useDraft` : la feuille rouverte sur un brouillon propose de l'effacer.
  const [hadDraft, setHadDraft] = useState(() => hasContent(reopenedDraft(key)))
  const [draft, setDraft, clearDraft] = useDraft<CallDraft>(key, EMPTY_DRAFT)
  // Le brouillon du moment, lu par les gestes qui finissent plus tard (l'envoi d'une photo).
  const latest = useRef(draft)
  latest.current = draft
  const change = (patch: Partial<CallDraft>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setDraft(next)
  }

  // --- Les erreurs ---
  // Sous le champ : « Écris ton appel. », après un envoi sans texte.
  const [textError, setTextError] = useState<string | null>(null)
  // Au pied de la feuille : l'échec de l'envoi (quota, session, photo perdue), ou l'attente de la photo.
  const [message, setMessage] = useState<string | null>(null)
  const [signInNeeded, setSignInNeeded] = useState(false)
  const [uploadProblem, setUploadProblem] = useState<string | null>(null)

  const { send, pending, error: sendFailed, reason } = useSendCall(project.id)
  const media = useUploadTesterMedia(project.id, 'call')
  // Vrai dès la tape sur « Envoyer », avant même que React redessine : une seconde tape n'envoie rien.
  const inFlight = useRef(false)
  const fieldRef = useRef<TextFieldInput>(null)
  const descriptionRef = useRef<TextFieldInput>(null)

  // --- Fermer ---
  // Le brouillon est déjà gardé à chaque frappe : fermer ne demande rien. Pendant l'envoi, rien ne
  // ferme (la feuille est `busy`) : « Annuler » mentirait, l'appel partirait quand même.
  const requestClose = () => {
    if (pending || inFlight.current) return
    close()
  }

  // --- Le texte ---
  const changeText = (text: string) => {
    // Jamais plus que ce que l'API accepte (comme `maxLength`, qui coupe aussi un texte collé) ; le
    // compteur le montre à l'œil.
    const kept = text.slice(0, CALL_TEXT_MAX)
    change({ text: kept })
    if (textError && kept.trim() !== '') setTextError(null)
  }

  // --- La photo ---
  const addImage = async (image: { uri: string }) => {
    photoCount += 1
    const photoKey = `call-photo-${photoCount}`
    setUploadProblem(null)
    change({ photo: { key: photoKey, uri: image.uri, state: 'uploading', media: null } })
    const uploaded = await media.upload(image)
    // Le brouillon a pu changer pendant l'envoi (photo retirée, brouillon effacé, feuille fermée puis
    // rouverte) : on ne touche qu'à la photo qu'on envoyait, si elle est toujours là.
    const now = readDraft<CallDraft>(key)
    if (now?.photo?.key !== photoKey) return
    const next: CallDraft = {
      ...now,
      photo: uploaded
        ? { ...now.photo, state: 'ready', media: uploaded }
        : { ...now.photo, state: 'failed' },
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
  const removePhoto = () => {
    setUploadProblem(null)
    change({ photo: null })
  }

  // Ce qui empêche une photo d'arriver, au-delà de sa tuile (« n'a pas pu être ajoutée ») : le plafond
  // de 100 images du coin, trop de demandes, la session expirée. Lu dans un effet : la raison n'est
  // connue du hook qu'après son nouveau rendu.
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
    const text = latest.current.text.trim()
    if (text === '') {
      // Une nouvelle phrase à chaque refus (null puis la phrase) ; le champ reprend le focus.
      setTextError(t(($) => $.project.testers.calls.required))
      focusAndReveal(fieldRef.current, calm)
      return
    }
    const photo = latest.current.photo
    if (photo?.state === 'uploading') {
      setMessage(t(($) => $.project.updates.photosUploading))
      return
    }
    setTextError(null)
    // Une photo refusée n'est pas jointe : sa tuile dit déjà qu'elle n'a pas pu être ajoutée.
    const photoId = photo?.state === 'ready' ? (photo.media?.id ?? null) : null
    const description = latest.current.description.trim()
    inFlight.current = true
    const sent = await send({
      text,
      photoId,
      photoDescription: photoId && description !== '' ? description : null,
    })
    inFlight.current = false
    if (sent) {
      // L'appel est parti : le brouillon n'a plus de raison d'être.
      clearDraft()
      close()
    }
  }

  // L'échec de l'envoi : la raison connue (limite du jour, session, photo perdue, coin fermé), sinon
  // « Réessaie ». Le texte reste dans le champ ; le message reste jusqu'au prochain envoi.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule la réponse de l'envoi compte.
  useEffect(() => {
    if (!sendFailed) return
    setSignInNeeded(reason === 'expired')
    if (reason === 'invalidPhoto') {
      // La photo en attente n'existe plus sur le serveur (trop vieille, ou retirée) : elle quitte la
      // feuille, « Ajouter une photo » revient, et le texte est gardé.
      const now = latest.current
      const next = { ...now, photo: null }
      latest.current = next
      setDraft(next)
    }
    setMessage(
      reason === 'limited'
        ? t(($) => $.project.testers.calls.limited, { max: CALLS_PER_DAY_PER_PROJECT })
        : reason === 'expired'
          ? t(($) => $.errors.unauthorized)
          : reason === 'invalidPhoto'
            ? t(($) => $.project.testers.calls.invalidPhoto)
            : reason === 'closed'
              ? t(($) => $.errors.cornerClosed)
              : reason === 'full'
                ? t(($) => $.errors.testerMediaFull)
                : t(($) => $.project.testers.calls.error),
    )
  }, [sendFailed, reason])

  // --- Effacer le brouillon ---
  const clearAll = () => {
    clearDraft()
    latest.current = EMPTY_DRAFT
    setHadDraft(false)
    setTextError(null)
    setMessage(null)
    setUploadProblem(null)
    // Le lien disparaît sous le doigt : le focus va au champ, vide, prêt à écrire.
    const node = fieldRef.current
    if (!focusWithoutScroll(node)) moveReaderTo(node)
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
  const count = project.testerCount ?? 0
  const audience =
    count > 0
      ? t(($) => $.project.testers.calls.audience, { count })
      : t(($) => $.project.testers.calls.audienceNone)
  const photo = draft.photo

  const photoLabel = t(($) => $.project.testers.calls.photoName)
  const tiles: PhotoTile[] = photo
    ? [
        {
          key: photo.key,
          state: photo.state,
          image: { source: { uri: photo.uri }, thumbhash: null, label: photoLabel },
          ...(photo.state === 'failed'
            ? { error: t(($) => $.project.form.photoUploadError) }
            : null),
        },
      ]
    : []
  const tileLabels: PhotoTilesLabels = {
    list: t(($) => $.project.testers.calls.photo),
    add: t(($) => $.project.testers.calls.addPhoto),
    addLabel: t(($) => $.project.testers.calls.addPhoto),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    tile: () => photoLabel,
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
      title={t(($) => $.project.testers.calls.sheetTitle)}
      heading={1}
      cancelLabel={t(($) => $.project.testers.calls.cancel)}
      action={{
        // Jamais grisé : sans texte, le champ dit pourquoi (scénario).
        label: t(($) => $.project.testers.calls.send),
        onPress: () => void onSend(),
        busy: pending,
      }}
      // La feuille s'ouvre sous le doigt de « Lancer un appel » : la seconde tape d'une double tape
      // ne tombe ni sur « Annuler » ni sur « Envoyer ».
      guardTaps
      notice={notice}
      busy={pending}
      onClose={requestClose}
    >
      <Stack gap="xl">
        <SheetProjectHead
          thumb={cover ? toSource(cover.url) : null}
          title={project.title}
          subtitle={audience}
          {...(hadDraft
            ? {
                action: {
                  label: t(($) => $.project.testers.feedback.clearDraft),
                  onPress: clearAll,
                },
              }
            : null)}
        />
        <TextField
          inputRef={fieldRef}
          label={t(($) => $.project.testers.calls.field)}
          value={draft.text}
          onChangeText={changeText}
          placeholder={t(($) => $.project.testers.calls.placeholder)}
          multiline
          maxLines={10}
          autoCapitalize="sentences"
          maxLength={CALL_TEXT_MAX}
          showCount
          // L'aide de la relecture juridique (J8) reste sous l'erreur : il faut encore la lire.
          hint={t(($) => $.project.testers.calls.hint)}
          keepHint
          error={textError ?? undefined}
          editable={!pending}
        />
        <Stack gap="sm">
          <Row gap="xs" wrap>
            <Text variant="caption" weight={600} tone="secondary">
              {t(($) => $.project.testers.calls.photo)}
            </Text>
            <Text variant="caption" tone="muted">
              {t(($) => $.project.testers.calls.optional)}
            </Text>
          </Row>
          <PhotoTiles
            tiles={tiles}
            max={1}
            labels={tileLabels}
            selectedKey={null}
            // Une seule photo : la toucher mène à sa description.
            onSelect={() => {
              const node = descriptionRef.current
              if (!focusWithoutScroll(node)) moveReaderTo(node)
            }}
            onAdd={() => void onAdd()}
            onDropFiles={onDropFiles}
            onMove={() => {}}
            onRemove={removePhoto}
            busy={pending}
            cover={false}
          />
          {/* Le droit à l'image (juridique J8), sous les tuiles, même sans photo : avant de choisir. */}
          <Text variant="caption" tone="muted">
            {t(($) => $.project.testers.calls.photoConsent)}
          </Text>
          {photo ? (
            <TextField
              key={photo.key}
              inputRef={descriptionRef}
              label={t(($) => $.project.testers.calls.photoDescription)}
              value={draft.description}
              onChangeText={(text) => change({ description: text.slice(0, PHOTO_DESCRIPTION_MAX) })}
              autoCapitalize="sentences"
              hint={t(($) => $.project.testers.calls.photoDescriptionHint)}
              maxLength={PHOTO_DESCRIPTION_MAX}
              countFrom={PHOTO_DESCRIPTION_MAX - 50}
              editable={!pending}
            />
          ) : null}
        </Stack>
      </Stack>
    </Sheet>
  )
}
