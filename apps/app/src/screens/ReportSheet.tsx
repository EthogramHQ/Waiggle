// La feuille « Signaler » (R9, scénario « Signaler, dans une feuille », planches `R9-Signaler`,
// `R9-Signaler-Partie`, `R9-Signaler-Danger`, `R9-Signaler-Envoye`, `R9-Signaler-Etats`). Elle
// remplace la page « Signaler » de 7a : un membre signale un projet, une mise à jour, un
// commentaire, un profil, un appel à tester ou un message du coin des testeurs.
//
// La feuille a sa propre adresse (`/report?kind=…&id=…`), posée sur la page d'où l'on vient
// (`sheetRoute` dans app/_layout.tsx). Elle se lit en deux étapes :
// 1. « Quelle partie ? » : « Tout le projet » coché d'avance, puis les parties de l'aperçu (le titre,
//    « La 2e photo »…) ; absente pour un contenu sans partie (un commentaire) ;
// 2. « Qu'est-ce qui ne va pas ? » : huit motifs, une précision (obligatoire pour un contenu dit
//    illégal), la case « Bloquer aussi », puis « Envoyer le signalement ».
// Puis « Merci » rappelle ce qui est parti. En tête, toujours, le rappel de ce qui est signalé, tel
// que l'API le lit (`head`) : un lien fabriqué ne fait jamais signaler autre chose que ce qu'on lit.
//
// Une seule feuille pour tous les états (chargement, introuvable, limite du jour, son propre
// contenu, déjà signalé) : elle ne se referme pas pour se rouvrir, et le focus posé reste.
import { contactEmail } from '@ruche/brand'
import {
  REPORT_DETAILS_MAX,
  REPORTS_PER_DAY,
  type ReportReason,
  ReportTarget,
  type ReportTargetKind,
  type ReportTargetPreview,
} from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import { type Href, usePathname, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'
import { useMemberSession } from '../accounts/session'
import { type ApiErrorKey, type ApiResult, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useBlock } from '../blocks/api'
import { type BlockAsking, BlockDialog } from '../blocks/BlockDialog'
import { nextAfterSignIn, useSignInAgain } from '../navigation/signInAgain'
import { type HeldAction, useLeaveGuard } from '../navigation/useLeaveGuard'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { sendReport, useReportTarget } from '../reports/api'
import { type PartChoice, partChoices } from '../reports/parts'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { ContactLink, contactMailto } from '../ui/ContactLink'
import { DiscardDialog } from '../ui/DiscardDialog'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import type { CoverImage } from '../ui/ProjectCover'
import { ProjectStrip } from '../ui/ProjectStrip'
import { ProjectThumb } from '../ui/ProjectThumb'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { TAP_GUARD_MS } from '../ui/tapGuard'
import { useHydrated } from '../ui/theme/hydration'
import { useNameOf } from '../useNameOf'

type ReasonKey = keyof Translation['report']['reasons']

/** Les huit motifs, dans l'ordre du contrat, et la clé de leur libellé (report.reasons.*). */
const REASONS = [
  { reason: 'illegal', key: 'illegal' },
  { reason: 'harassment', key: 'harassment' },
  { reason: 'sexual_violent', key: 'sexualViolent' },
  { reason: 'scam_spam', key: 'scamSpam' },
  { reason: 'impersonation', key: 'impersonation' },
  { reason: 'privacy', key: 'privacy' },
  { reason: 'dangerous_link', key: 'dangerousLink' },
  { reason: 'other', key: 'other' },
  // satisfies : chaque motif est l'un de ceux du contrat, chaque clé un texte qui existe.
] as const satisfies readonly { reason: ReportReason; key: ReasonKey }[]

/**
 * Les motifs sous lesquels la feuille rappelle le 112 (B8) : quelqu'un peut être en danger
 * maintenant. Sous une arnaque ou un lien dangereux, la phrase détournerait du signalement.
 */
const DANGER_REASONS: readonly ReportReason[] = ['illegal', 'harassment', 'sexual_violent']

/**
 * La cible décrite par l'adresse, vérifiée par le schéma du contrat (la sorte, et un identifiant
 * qui lui va) ; null si elle ne décrit rien de valable.
 */
const targetOf = (kind: string, id: string): ReportTarget | null => {
  const parsed = ReportTarget.safeParse({ kind, id })
  return parsed.success ? parsed.data : null
}

/** Où revenir sans page précédente (lien ouvert directement) : le projet, le profil, ou l'accueil. */
const fallbackOf = (target: ReportTarget | null, projectId: string | null): Href =>
  projectId
    ? { pathname: '/projects/[id]', params: { id: projectId } }
    : target?.kind === 'member'
      ? { pathname: '/members/[id]', params: { id: target.id } }
      : '/'

export function ReportSheet({ kind, id }: { kind: string; id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { state, session, retry } = useMemberSession()
  // L'adresse n'est connue que dans le navigateur : rien n'est demandé au pré-rendu.
  const hydrated = useHydrated()
  // useMemo : la même cible d'un dessin à l'autre, tant que l'adresse ne change pas.
  const target = useMemo(() => targetOf(kind, id), [kind, id])
  // Pas de session, ou une adresse qui ne décrit rien : aucune requête.
  const preview = useReportTarget(session && target && hydrated ? target : null)
  const data = preview.data
  // Fermer revient à la page d'avant ; arrivé par un lien direct, au projet ou au profil.
  const sheet = useRouteSheet(fallbackOf(target, data?.projectId ?? null))

  // Le formulaire existe dès qu'une cible a été lue, et le reste : après « Bloquer aussi », la
  // cible devient invisible (404), et une relecture (retour sur l'onglet) ne doit pas remplacer
  // « Merci » par « introuvable » (relecture de l'interface, 7b).
  const form = useReportForm({ preview: data ?? null, close: sheet.close })

  const title = target ? t(($) => $.report[target.kind]) : t(($) => $.report.title)
  const closeButton = (variant: 'primary' | 'secondary' = 'primary') => (
    <Button label={t(($) => $.report.close)} variant={variant} onPress={sheet.close} />
  )

  // Un état sans formulaire : son contenu, et ses boutons au pied.
  let content: ReactNode = <StateMessage kind="loading" level={2} />
  let footer: ReactNode = null
  const failure = preview.error ? errorKey(preview.error) : null
  if (form) {
    content = form.content
  } else if (state === 'error') {
    // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
    content = (
      <StateMessage
        kind="error"
        level={2}
        title={t(($) => $.states.errorTitle)}
        message={t(($) => $.account.loadError)}
        actions={[{ label: t(($) => $.common.retry), onPress: retry }]}
      />
    )
  } else if (state === 'pending' || !hydrated) {
    // La session se lit encore (ou la page n'est pas hydratée) : le chargement.
    content = <StateMessage kind="loading" level={2} />
  } else if (!session || failure === 'unauthorized') {
    content = (
      <StateMessage
        kind="signedOut"
        level={2}
        title={t(($) => $.states.signedOutTitle)}
        message={session ? t(($) => $.states.expired) : t(($) => $.home.membersOnly)}
        // « Me connecter » ramène ici après la connexion (?next=).
        actions={[
          {
            label: t(($) => $.home.signIn),
            onPress: () =>
              router.push({ pathname: '/sign-in', params: { next: nextAfterSignIn(pathname) } }),
          },
        ]}
      />
    )
  } else if (!target || failure === 'notFound') {
    // Introuvable : la même phrase, que le contenu n'existe pas, soit invisible, ou que l'adresse
    // ne décrive rien (sans rien demander à l'API).
    content = <Text>{t(($) => $.report.gone)}</Text>
    footer = closeButton()
  } else if (failure === 'ownContent') {
    // Son propre contenu (un lien fabriqué) : on le dit, avec de quoi le modifier quand une page le
    // permet (son projet, son profil).
    const edit: Href | null =
      target.kind === 'project'
        ? { pathname: '/projects/[id]/edit', params: { id: target.id } }
        : target.kind === 'member'
          ? '/settings/profile'
          : null
    content = <Text>{t(($) => $.report.own[target.kind])}</Text>
    footer = (
      <>
        {edit ? (
          <Button
            label={t(($) => $.report.own.edit)}
            icon="pencil-simple"
            // La feuille laisse sa place à la page de modification (fermer d'abord, puis aller
            // ailleurs, ferait deux déplacements).
            onPress={() => router.replace(edit)}
          />
        ) : null}
        {closeButton(edit ? 'secondary' : 'primary')}
      </>
    )
  } else if (preview.error) {
    content = (
      <StateMessage
        kind="error"
        level={2}
        title={t(($) => $.states.errorTitle)}
        message={t(($) => $.errors[failure ?? 'internal'])}
        actions={[{ label: t(($) => $.common.retry), onPress: () => void preview.refetch() }]}
      />
    )
  }

  return (
    <>
      <Sheet
        open={sheet.open}
        title={title}
        onClose={sheet.close}
        // La feuille s'ouvre sous le doigt de « Signaler » (un menu) : la seconde tape d'une double
        // tape ne tombe ni sur « Continuer » ni sur « Annuler ».
        guardTaps
        {...(form ? form.sheet : footer ? { footer } : null)}
      >
        {content}
      </Sheet>
      {form?.layers}
    </>
  )
}

type Step = 'part' | 'reason' | 'already' | 'sent'

/** Ce que « Merci » rappelle : ce qui est parti, figé à l'envoi. */
type SentRecap = { text: string; image: CoverImage | null; blocked: 'yes' | 'failed' | null }

/**
 * Hook : le formulaire, une fois la cible lue (`preview`) ; null avant. Il rend ce que la feuille
 * reçoit (`sheet` : pied, retour, garde de fermeture…), son contenu, et les fenêtres posées
 * par-dessus (abandon, blocage).
 */
function useReportForm({
  preview,
  close,
}: {
  preview: ReportTargetPreview | null
  close: () => void
}) {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  const toSource = useMediaSources()
  const signInAgain = useSignInAgain()
  const { block } = useBlock()

  const [step, setStep] = useState<Step>('part')
  const [choiceKey, setChoiceKey] = useState('whole')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [missingReason, setMissingReason] = useState(false)
  const [missingWhy, setMissingWhy] = useState(false)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<ApiErrorKey | null>(null)
  const [recap, setRecap] = useState<SentRecap | null>(null)
  const [asking, setAsking] = useState<BlockAsking | null>(null)
  const [discarding, setDiscarding] = useState(false)
  // Vrai dès la tape sur « Envoyer », avant même que React redessine : une seconde tape n'envoie
  // rien (l'état `sending`, lui, n'est à jour qu'au dessin suivant).
  const inFlight = useRef(false)
  // L'heure de « Continuer » : « Envoyer » prend sa place, et la seconde tape d'une double tape
  // tomberait dessus, avec un motif gardé d'avant (ui-P5). Il l'ignore pendant TAP_GUARD_MS.
  const shownAt = useRef(0)

  // Les vues qui reçoivent le focus : le titre de chaque étape, le choix coché au retour, le
  // message « Choisis un motif », le titre de « Merci ».
  const partTitleRef = useRef<Focusable>(null)
  const reasonTitleRef = useRef<Focusable>(null)
  const checkedRef = useRef<Focusable>(null)
  const missingRef = useRef<Focusable>(null)
  const alreadyRef = useRef<Focusable>(null)
  const sentRef = useRef<Focusable>(null)
  // Ce qui doit recevoir le focus au prochain dessin (après un geste seulement).
  const [focusNext, setFocusNext] = useState<{ current: Focusable | null } | null>(null)
  useEffect(() => {
    if (!focusNext) return
    const node = focusNext.current
    // Sur le web, sans défilement ; sur téléphone, le lecteur d'écran y va aussi (code-appli.md).
    focusWithoutScroll(node)
    moveReaderTo(node)
    setFocusNext(null)
  }, [focusNext])

  const choices = useMemo(() => (preview ? partChoices(preview, t) : []), [preview, t])
  // « Tout … » seul (un message sans capture, un profil sans rien d'autre) : rien à choisir, pas
  // d'étape. Un commentaire n'a même pas ce choix.
  const hasParts = choices.length > 1
  const chosen: PartChoice | undefined =
    choices.find((choice) => choice.key === choiceKey) ?? choices[0]
  const part = chosen?.part ?? null
  // Sans partie (un commentaire), la feuille commence au motif.
  const current: Step = step === 'part' && !hasParts ? 'reason' : step

  // Une précision écrite se perd en fermant : la feuille le demande d'abord. Pendant l'envoi, rien
  // ne la ferme (la réponse dira si c'est parti).
  const dirty = details.trim() !== '' && current !== 'sent'
  const held = useRef<HeldAction | null>(null)
  const guard = useLeaveGuard(dirty || sending, (action) => {
    // Pendant l'envoi : le retour est arrêté, sans question (rien à abandonner, ça part).
    if (inFlight.current) return
    held.current = action
    setDiscarding(true)
  })
  // Sur le web, la fermeture attend que l'étape de plus de l'historique soit retirée.
  const leave = () => void guard.release().then(close)
  const requestClose = () => {
    if (inFlight.current) return
    if (dirty) {
      held.current = null
      setDiscarding(true)
    } else leave()
  }
  const abandon = () => {
    setDiscarding(false)
    const action = held.current
    held.current = null
    if (action) guard.proceed(action)
    else leave()
  }

  if (!preview) return null
  const { author, head } = preview
  const kind: ReportTargetKind = preview.target.kind
  // « Bloquer aussi » : jamais pour un auteur déjà bloqué, ni quand un blocage nous sépare déjà
  // (pseudo retenu, PUT block répondrait 404), ni pour un administrateur (l'API le refuserait).
  const blockable =
    !author.isBlocked && author.handle !== null && !author.isAdmin ? author.handle : null

  // --- Les gestes ---
  const goOn = () => {
    if (!chosen) return
    // Déjà signalé (la partie, ou le tout) : la feuille le dit tout de suite, sans motif à choisir.
    // La ligne de l'aperçu de ce choix : même champ, même photo (la couverture et la 1re photo
    // portent le même identifiant, pas le même champ).
    const entry = part
      ? preview.parts.find(
          (one) =>
            one.field === part.field &&
            (one.mediaId ?? null) === ('mediaId' in part ? (part.mediaId ?? null) : null),
        )
      : null
    const reported = part ? entry?.reportedByMe === true : preview.reportedByMe
    if (reported) {
      setStep('already')
      setFocusNext(alreadyRef)
      return
    }
    shownAt.current = Date.now()
    setStep('reason')
    setFocusNext(reasonTitleRef)
  }
  const goBack = () => {
    setStep('part')
    setMissingReason(false)
    // Le focus revient au choix coché (ui-P5), pas en haut de la feuille.
    setFocusNext(checkedRef)
  }

  const choose = (value: ReportReason) => {
    setReason(value)
    setMissingReason(false)
  }
  const changeDetails = (value: string) => {
    setDetails(value)
    if (value.trim() !== '') setMissingWhy(false)
  }

  /** Ce que « Merci » rappelle : « La 2e photo de Météo, d'Inès Haddad · Arnaque ou spam ». */
  const recapOf = (sentReason: ReportReason): string => {
    const what =
      chosen?.part && head.title
        ? t(($) => $.report.partOf, { part: chosen.label, title: head.title })
        : chosen?.part
          ? chosen.label
          : (head.title ?? t(($) => $.report.target[kind]))
    const reasonKey = REASONS.find((one) => one.reason === sentReason)?.key ?? 'other'
    return t(($) => $.report.sentRecap, {
      what,
      nameOf: nameOf(head.authorName),
      reason: t(($) => $.report.reasons[reasonKey]),
    })
  }

  /** Envoie le signalement ; vrai s'il est parti. L'état d'envoi est tenu par l'appelant. */
  const post = async (sentReason: ReportReason): Promise<boolean> => {
    // Pour le contenu entier, aucune `part` ne part (le contrat refuse `part: null`). Une précision
    // vide ne part pas : elle compte comme aucune.
    const result = await sendReport({
      target: preview.target,
      ...(part ? { part } : null),
      reason: sentReason,
      ...(details.trim() === '' ? null : { details }),
    })
    if (!result.ok) {
      // Refusé : le message s'affiche, le motif et la précision restent pour réessayer.
      setFailure(result.error)
      return false
    }
    setFailure(null)
    return true
  }
  const finish = (sentReason: ReportReason, blocked: SentRecap['blocked']) => {
    const image = head.image
      ? { source: toSource(head.image.url), thumbhash: head.image.thumbhash, label: '' }
      : null
    setRecap({ text: recapOf(sentReason), image, blocked })
    setStep('sent')
    setFocusNext(sentRef)
  }

  const submit = async () => {
    if (inFlight.current || current !== 'reason') return
    // Juste après « Continuer », la tape est la seconde d'une double tape : ignorée.
    if (Date.now() - shownAt.current < TAP_GUARD_MS) return
    if (reason === null) {
      setMissingReason(true)
      setFocusNext(missingRef)
      return
    }
    // Pour un contenu dit illégal, la précision est obligatoire (article 16 du DSA).
    if (reason === 'illegal' && details.trim() === '') {
      setMissingWhy(true)
      return
    }
    // « Bloquer aussi » : la fenêtre de blocage d'abord ; « Bloquer » y envoie, puis bloque.
    if (alsoBlock && blockable) {
      setAsking({
        gesture: 'block',
        member: { id: author.id, name: author.name, handle: blockable },
      })
      return
    }
    inFlight.current = true
    setSending(true)
    const ok = await post(reason)
    inFlight.current = false
    setSending(false)
    if (ok) finish(reason, null)
  }

  /**
   * « Bloquer » de la fenêtre : le signalement d'abord, le blocage ensuite (jamais l'inverse : un
   * blocage rend la cible invisible, et l'envoi répondrait « introuvable »). La fenêtre se ferme
   * toujours (réponse « ok » rendue à BlockDialog) : un envoi refusé se dit dans la feuille, à sa
   * place habituelle ; un blocage refusé, sur « Merci » (jur-P5, décision L4), qui attend sa réponse.
   */
  const sendThenBlock = async (gesture: BlockAsking): Promise<ApiResult<null>> => {
    if (reason === null || inFlight.current) return { ok: true, data: null }
    inFlight.current = true
    setSending(true)
    const sent = await post(reason)
    const blocked = sent ? await block(gesture.member.id) : null
    inFlight.current = false
    setSending(false)
    if (sent) finish(reason, blocked?.ok ? 'yes' : 'failed')
    return { ok: true, data: null }
  }

  // --- Le message au pied (un refus de l'API, un seul à la fois) ---
  const notice: SheetNotice | null =
    failure === null || current !== 'reason'
      ? null
      : failure === 'unauthorized'
        ? { message: t(($) => $.states.expired), action: signInAgain() }
        : failure === 'rateLimited'
          ? {
              message: t(($) => $.report.limitedLead, { max: REPORTS_PER_DAY }),
              // L'adresse, en lien : pour un cas urgent, on peut encore écrire.
              action: {
                // L'adresse elle-même, nom du lien (une donnée, pas un texte à traduire).
                label: contactEmail,
                onPress: () => void Linking.openURL(contactMailto()),
              },
            }
          : failure === 'notFound'
            ? { message: t(($) => $.report.gone) }
            : failure === 'alreadyReported'
              ? {
                  message: part
                    ? t(($) => $.report.alreadyReportedPart)
                    : t(($) => $.report.alreadyReportedWhole),
                }
              : { message: t(($) => $.errors[failure]) }

  // --- Ce qui s'affiche ---
  const headLine = t(($) => $.report.head[kind], { nameOf: nameOf(head.authorName) })
  const headImage: CoverImage | null = head.image
    ? { source: toSource(head.image.url), thumbhash: head.image.thumbhash, label: '' }
    : null
  // Le rappel : à l'étape du motif, la partie choisie en titre (« La 2e photo de Météo »).
  const headTitle =
    current === 'reason' && chosen?.part
      ? head.title
        ? t(($) => $.report.partOf, { part: chosen.label, title: head.title })
        : chosen.label
      : head.title
  const reminder =
    headImage || headTitle ? (
      <ProjectStrip image={headImage} title={headTitle ?? headLine} detail={headLine} />
    ) : (
      <Surface variant="grouped" padding="md" gap="xs">
        <Text weight={600}>{headLine}</Text>
        <Text tone="secondary" selectable breakAnywhere>
          {preview.text}
        </Text>
      </Surface>
    )

  const closeButton = <Button label={t(($) => $.report.close)} onPress={requestClose} key="close" />
  const danger = <Hint icon="warning" text={t(($) => $.report.danger)} />

  let content: ReactNode
  let footer: ReactNode
  if (recap && current === 'sent') {
    content = (
      <StateMessage
        kind="done"
        level={2}
        focusRef={sentRef}
        title={t(($) => $.report.sentTitle)}
        message={t(($) => $.report.sentBody)}
      >
        <Stack gap="md">
          <Surface variant="grouped" padding="md">
            {recap.image ? (
              <ProjectStrip image={recap.image} title={recap.text} />
            ) : (
              <Text>{recap.text}</Text>
            )}
          </Surface>
          {recap.blocked === 'yes' ? (
            <Hint icon="prohibit" text={t(($) => $.report.alsoBlocked, { name: author.name })} />
          ) : null}
          {recap.blocked === 'failed' ? (
            <Notice message={t(($) => $.report.blockFailed, { name: author.name })} />
          ) : null}
        </Stack>
      </StateMessage>
    )
    footer = closeButton
  } else if (preview.remainingToday === 0) {
    // La limite du jour, dès l'ouverture : rien à choisir, mais de quoi écrire pour un cas urgent,
    // et le 112.
    content = (
      <Surface variant="grouped" padding="md" gap="md">
        <Text>{t(($) => $.report.limitedLead, { max: REPORTS_PER_DAY })}</Text>
        <ContactLink />
        {danger}
      </Surface>
    )
    footer = closeButton
  } else if (current === 'already') {
    content = (
      <Stack gap="lg">
        {reminder}
        <Notice
          ref={alreadyRef}
          tone="info"
          message={
            part ? t(($) => $.report.alreadyReportedPart) : t(($) => $.report.alreadyReportedWhole)
          }
        />
      </Stack>
    )
    footer = closeButton
  } else if (current === 'part') {
    content = (
      // Une étape = un `Fragment` à clé : React remplace l'étape entière, rien d'une étape ne
      // reste dans l'autre (un choix, un focus).
      <Stack gap="lg" key="part">
        {reminder}
        <Text variant="headline" heading={2} focusRef={partTitleRef}>
          {t(($) => $.report.partQuestion)}
        </Text>
        <ListGroup radio label={t(($) => $.report.partQuestion)}>
          {choices.map((choice) => (
            <ListRow
              key={choice.key}
              label={choice.label}
              selected={choice.key === chosen?.key}
              onPress={() => setChoiceKey(choice.key)}
              {...(choice.key === chosen?.key ? { ref: checkedRef } : null)}
              accessory={
                choice.thumb ? (
                  <ProjectThumb
                    size="row"
                    image={{
                      source: toSource(choice.thumb.url),
                      thumbhash: choice.thumb.thumbhash,
                      label: '',
                    }}
                  />
                ) : undefined
              }
            />
          ))}
        </ListGroup>
      </Stack>
    )
    footer = <Button label={t(($) => $.report.continue)} onPress={goOn} />
  } else {
    const illegal = reason === 'illegal'
    content = (
      <Stack gap="lg" key="reason">
        {reminder}
        <Text variant="headline" heading={2} focusRef={reasonTitleRef}>
          {t(($) => $.report.reasonLabel)}
        </Text>
        <ListGroup radio label={t(($) => $.report.reasonLabel)}>
          {REASONS.map((item) => {
            // Sous le motif coché, le 112 (trois motifs) ; sous « Lien, démo ou prompt
            // dangereux », toujours, ce qu'il couvre. Lu aussi après le nom (`hint`).
            const help =
              reason === item.reason && DANGER_REASONS.includes(item.reason)
                ? t(($) => $.report.danger)
                : item.key === 'dangerousLink'
                  ? t(($) => $.report.reasonHints.dangerousLink)
                  : undefined
            return (
              <ListRow
                key={item.reason}
                label={t(($) => $.report.reasons[item.key])}
                selected={reason === item.reason}
                onPress={() => choose(item.reason)}
                {...(help ? { detail: help, hint: help } : null)}
              />
            )
          })}
        </ListGroup>
        {/* « Choisis un motif », sous les motifs : « Envoyer », au pied, ne bouge pas ; le focus
            y vient. */}
        {missingReason ? (
          <Notice ref={missingRef} message={t(($) => $.report.reasonRequired)} />
        ) : null}
        <TextField
          label={illegal ? t(($) => $.report.illegalDetails) : t(($) => $.report.details)}
          value={details}
          onChangeText={changeDetails}
          // L'aide reste sous l'erreur : on la lit encore en corrigeant.
          error={illegal && missingWhy ? t(($) => $.report.illegalRequired) : undefined}
          keepHint
          hint={t(($) => $.report.detailsHint)}
          // L'exemple suit ce qui est signalé : une photo, ou le reste.
          placeholder={
            chosen?.part && (chosen.part.field === 'photo' || chosen.part.field === 'cover')
              ? t(($) => $.report.detailsExample.photo)
              : t(($) => $.report.detailsExample.other)
          }
          multiline
          showCount
          maxLength={REPORT_DETAILS_MAX}
        />
        {blockable ? (
          <Checkbox
            label={t(($) => $.report.alsoBlockNamed, { name: author.name, handle: blockable })}
            value={alsoBlock}
            onValueChange={setAlsoBlock}
            disabled={sending}
          />
        ) : null}
        <Hint icon="info" text={t(($) => $.report.goodFaith)} />
        {/* Un message d'un fil de testeur se lit à deux : l'autre personne peut deviner qui
            signale, on le dit avec son nom (R7b, juridique J3). */}
        <Hint
          icon="shield-check"
          text={
            kind === 'message'
              ? t(($) => $.report.anonymityThread, { name: author.name })
              : t(($) => $.report.anonymity)
          }
        />
      </Stack>
    )
    footer = (
      <Button label={t(($) => $.report.submit)} onPress={() => void submit()} loading={sending} />
    )
  }

  // Une des deux étapes est affichée (ni « Merci », ni la limite du jour) : la feuille se remplit.
  const sent = recap !== null && current === 'sent'
  const limited = !sent && preview.remainingToday === 0
  const filling = !sent && !limited && (current === 'part' || current === 'reason')
  // « Retour » dans la tête : de l'étape du motif (ou « déjà signalé ») à « Quelle partie ? ».
  const back =
    hasParts && !sent && !limited && (current === 'reason' || current === 'already')
      ? { back: { label: t(($) => $.report.stepBack), onPress: goBack } }
      : null

  return {
    content,
    sheet: {
      footer,
      notice,
      busy: sending,
      ...back,
      // « Annuler » tant qu'on remplit ; « Merci » et les états n'ont que « Fermer ».
      ...(filling ? { cancelLabel: t(($) => $.report.cancel) } : null),
      closeGuard: requestClose,
      onClose: requestClose,
    },
    layers: (
      <>
        <DiscardDialog
          visible={discarding}
          title={t(($) => $.report.discard.title)}
          message={t(($) => $.report.discard.body)}
          keepLabel={t(($) => $.report.discard.keep)}
          discardLabel={t(($) => $.report.discard.confirm)}
          onKeep={() => setDiscarding(false)}
          onDiscard={abandon}
        />
        {/* Depuis « Bloquer aussi » : pas de case « Signaler aussi son profil », le signalement
            part déjà. */}
        <BlockDialog
          asking={asking}
          send={sendThenBlock}
          onDone={() => setAsking(null)}
          onCancel={() => {
            // « Annuler » : rien n'est parti, la case se décoche, la feuille reste.
            setAsking(null)
            setAlsoBlock(false)
          }}
          onClosed={() => {
            // La fenêtre partie : le focus va à « Merci » (avant, elle le gardait pour elle).
            if (recap) setFocusNext(sentRef)
          }}
        />
      </>
    ),
  }
}
