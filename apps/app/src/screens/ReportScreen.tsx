// Page « Signaler » (tranche 7a) : un membre signale un projet, une note, un commentaire (ou une
// réponse) ou un profil. La page montre ce qu'il signale, tel que l'API le lit (jamais le texte de
// l'adresse), propose les sept motifs et une précision facultative, puis remercie.
//
// La cible vient de l'adresse (`/report?kind=comment&id=…`) : une sorte inconnue ou un identifiant
// qui ne lui va pas, et la page dit « introuvable » sans rien demander à l'API. Ce que l'API ne
// montre pas (inconnu, privé, retiré, masqué, supprimé) est « introuvable » aussi ; son propre
// contenu ne se signale pas.
//
// Chaque refus de l'envoi a son texte : déjà signalé, quota atteint, contenu disparu, son propre
// contenu, session expirée (avec « Me reconnecter », qui ramène ici). Le motif et la précision
// restent en place pour réessayer.
import { contactEmail } from '@ruche/brand'
import {
  BLOCKS_PER_DAY,
  REPORT_DETAILS_MAX,
  REPORTS_PER_DAY,
  type ReportReason,
  ReportTarget,
  type ReportTargetKind,
  type ReportTargetPreview,
} from '@ruche/contracts'
import type { Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useBlock } from '../blocks/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { sendReport, useReportTarget } from '../reports/api'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { useHydrated } from '../ui/theme/hydration'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SignedOutScreen } from './states'

/** Les motifs, dans l'ordre du contrat, et la clé de leur libellé (report.reasons.*). */
const REASONS = [
  { reason: 'illegal', key: 'illegal' },
  { reason: 'harassment', key: 'harassment' },
  { reason: 'sexual_violent', key: 'sexualViolent' },
  { reason: 'scam_spam', key: 'scamSpam' },
  { reason: 'impersonation', key: 'impersonation' },
  { reason: 'privacy', key: 'privacy' },
  { reason: 'other', key: 'other' },
  // as const : les clés gardent leur valeur exacte, que le typage des textes vérifie ; satisfies :
  // chaque motif est bien l'un de ceux du contrat.
] as const satisfies readonly { reason: ReportReason; key: string }[]

/**
 * La cible décrite par l'adresse, vérifiée par le schéma du contrat (la sorte, et un identifiant
 * qui lui va) ; null si elle ne décrit rien de valable.
 */
const targetOf = (kind: string, id: string): ReportTarget | null => {
  const parsed = ReportTarget.safeParse({ kind, id })
  return parsed.success ? parsed.data : null
}

/** Où revenir sans page précédente (lien ouvert directement) : le projet, le profil, ou l'accueil. */
const fallbackOf = (kind: ReportTargetKind, id: string, projectId: string | null): Href =>
  projectId
    ? { pathname: '/projects/[id]', params: { id: projectId } }
    : kind === 'member'
      ? { pathname: '/members/[id]', params: { id } }
      : '/'

export function ReportScreen({ kind, id }: { kind: string; id: string }) {
  const { t } = useTranslation()
  const { data: session, isPending } = useSession()
  // L'adresse n'est connue que dans le navigateur : la page pré-rendue en reste au chargement
  // (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()
  // useMemo : la même cible d'un dessin à l'autre, tant que l'adresse ne change pas.
  const target = useMemo(() => targetOf(kind, id), [kind, id])
  // Pas de session, ou une adresse qui ne décrit rien : aucune requête.
  const preview = useReportTarget(session && target ? target : null)

  if (isPending || !hydrated) return <LoadingScreen />
  if (!session) return <SignedOutScreen />
  if (!target) return <NotFoundState title={t('states.notFoundTitle')} />
  if (preview.error) {
    const key = errorKey(preview.error)
    // Introuvable : le même écran, que le contenu n'existe pas ou qu'il soit invisible.
    if (key === 'notFound') {
      return <NotFoundState title={t('states.notFoundTitle')} message={t('errors.notFound')} />
    }
    // Son propre contenu (un lien fabriqué) : on le dit, sans formulaire.
    if (key === 'ownContent') {
      return <NotFoundState title={t('report.title')} message={t('errors.ownContent')} />
    }
    return <LoadErrorScreen error={preview.error} onRetry={() => void preview.refetch()} />
  }
  if (!preview.data) return <LoadingScreen />
  return (
    <ReportForm
      target={target}
      text={preview.data.text}
      author={preview.data.author}
      fallback={fallbackOf(target.kind, target.id, preview.data.projectId)}
    />
  )
}

/** Le formulaire, une fois la cible lue : ses états ne redessinent pas les états de chargement. */
function ReportForm({
  target,
  text,
  author,
  fallback,
}: {
  target: ReportTarget
  text: string
  /** L'auteur de la cible (le membre lui-même pour un profil), pour « Bloquer aussi @x ». */
  author: ReportTargetPreview['author']
  fallback: Href
}) {
  const { t } = useTranslation()
  const back = useGoBack(fallback)
  const signInAgain = useSignInAgain()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<ApiErrorKey | null>(null)
  const [sent, setSent] = useState(false)
  // Un envoi à la fois : deux touchers rapides n'envoient qu'un signalement (l'état `sending`,
  // lui, n'est à jour qu'au dessin suivant).
  const busy = useRef(false)

  // Après l'envoi, « Envoyer » disparaît : le focus du clavier va au remerciement qui le remplace,
  // jamais sur « Revenir » (un second appui sur Entrée quitterait la page sans l'avoir lu).
  const thanksRef = useRef<Focusable>(null)
  useEffect(() => {
    if (sent) focusWithoutScroll(thanksRef.current)
  }, [sent])

  const illegal = reason === 'illegal'
  // Pour un contenu dit illégal, la précision est obligatoire (article 16 du DSA : une explication
  // suffisamment étayée). Le bouton reste actif : un appui sans précision dit ce qui manque, sous le
  // champ, plutôt qu'un bouton grisé qui ne dit pas pourquoi.
  const [missingWhy, setMissingWhy] = useState(false)
  const changeDetails = (value: string) => {
    setDetails(value)
    if (value.trim() !== '') setMissingWhy(false)
  }

  // Sans motif, rien ne part : « Envoyer » reste actif, et son appui dit ce qui manque (design.md,
  // tranche 7b) au lieu d'un bouton grisé qui ne dit pas pourquoi. Le message part au premier choix.
  const [missingReason, setMissingReason] = useState(false)
  const choose = (value: ReportReason) => {
    setReason(value)
    setMissingReason(false)
  }

  const submit = async () => {
    if (busy.current || sent) return
    if (reason === null) {
      setMissingReason(true)
      return
    }
    if (illegal && details.trim() === '') {
      setMissingWhy(true)
      return
    }
    busy.current = true
    setSending(true)
    // Une précision vide ne part pas : elle compte comme aucune.
    const result = await sendReport({
      target,
      reason,
      ...(details.trim() === '' ? null : { details }),
    })
    busy.current = false
    setSending(false)
    if (result.ok) {
      setFailure(null)
      setSent(true)
      return
    }
    // Refusé : le message s'affiche, le motif et la précision restent pour réessayer. L'ancien
    // message, lui, est resté en place pendant l'envoi : rien n'a sauté sous le doigt.
    setFailure(result.error)
  }

  // Le message d'un refus. Une session expirée a son lien « Me reconnecter », qui revient ici. Le
  // quota (REPORTS_PER_DAY par jour, avec l'adresse de contact pour un cas urgent) et un contenu
  // disparu entre-temps ont leurs propres phrases : les messages généraux (« quelques minutes »,
  // « Cette page n'existe pas ») seraient faux sur ce formulaire.
  const failureMessage =
    failure === null
      ? null
      : failure === 'unauthorized'
        ? t('states.expired')
        : failure === 'rateLimited'
          ? t('report.limited', { max: REPORTS_PER_DAY, contactEmail })
          : failure === 'notFound'
            ? t('report.gone')
            : t(`errors.${failure}`)

  return (
    <Screen header={<TopNav />} onBack={back} title={t('report.title')}>
      {/* Ce qui est signalé, tel que l'API le lit : on sait toujours ce qu'on envoie. */}
      <Surface variant="grouped" padding="lg" gap="xs">
        <Text variant="caption" weight={600} tone="muted">
          {t(`report.target.${target.kind}`)}
        </Text>
        <Text selectable breakAnywhere>
          {text}
        </Text>
      </Surface>
      {sent ? (
        <>
          {/* polite : un remerciement se lit sans interrompre ; la ref lui donne le focus. */}
          <Notice ref={thanksRef} tone="success" message={t('report.sent')} polite />
          <Button label={t('report.back')} variant="secondary" onPress={back} />
        </>
      ) : (
        <>
          {/* Un danger immédiat ne passe pas par un signalement : on le dit avant tout. */}
          <Hint icon="warning" text={t('report.danger')} />
          <ListGroup title={t('report.reasonLabel')} radio>
            {REASONS.map((item) => (
              <ListRow
                key={item.reason}
                label={t(`report.reasons.${item.key}`)}
                selected={reason === item.reason}
                onPress={() => choose(item.reason)}
              />
            ))}
          </ListGroup>
          {/* Pour un contenu illégal, la précision dit pourquoi, de bonne foi (article 16 du DSA). */}
          <TextField
            label={illegal ? t('report.illegalDetails') : t('report.details')}
            value={details}
            onChangeText={changeDetails}
            error={illegal && missingWhy ? t('report.illegalRequired') : undefined}
            // L'aide (la phrase de bonne foi, pas d'informations personnelles) reste sous l'erreur :
            // on la lit encore en corrigeant. Sans sa première phrase, que l'erreur vient de dire.
            keepHint
            hint={
              illegal
                ? `${missingWhy ? t('report.goodFaith') : t('report.illegalHint')} ${t('report.detailsHint')}`
                : t('report.detailsHint')
            }
            multiline
            showCount
            maxLength={REPORT_DETAILS_MAX}
          />
          <Hint icon="shield-check" text={t('report.anonymity')} />
          {/* Ce qui empêche l'envoi, juste au-dessus d'« Envoyer » : là où l'on regarde après
              l'avoir touché, même au bas d'un téléphone. */}
          {missingReason ? <Notice message={t('report.reasonRequired')} /> : null}
          {failureMessage ? (
            <Notice
              message={failureMessage}
              action={failure === 'unauthorized' ? signInAgain() : undefined}
            />
          ) : null}
          <Button label={t('report.submit')} onPress={() => void submit()} loading={sending} />
        </>
      )}
      {sent && !author.isBlocked ? <AlsoBlock author={author} /> : null}
    </Screen>
  )
}

/**
 * Après l'envoi : « Bloquer aussi @x » (tranche 7b, scénario « Après un signalement »). Une action
 * secondaire, jamais choisie d'avance, absente si @x est déjà bloqué (règle 21 de la relecture du
 * plan, J14). Elle passe par la même fenêtre que sur la page d'un membre (règle 20) : ce qu'on ne
 * verra plus, les abonnements retirés, que @x n'est pas prévenu, et que la modération ne l'est pas.
 * Une fois fait, « Tu as bloqué @x. » prend sa place.
 */
function AlsoBlock({ author }: { author: ReportTargetPreview['author'] }) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  const { block } = useBlock()
  const [asking, setAsking] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [failure, setFailure] = useState<ApiErrorKey | null>(null)
  const [blocked, setBlocked] = useState(false)
  // Un envoi à la fois : un double appui sur « Bloquer » ne bloque qu'une fois.
  const busy = useRef(false)
  // Le bouton touché laisse la place à la confirmation : le focus du clavier y va, une fois la
  // fenêtre refermée (avant, elle le garde pour elle).
  const doneRef = useRef<Focusable>(null)
  const focusAfterClose = useRef(false)
  const handle = author.handle

  const open = () => {
    // Une fenêtre neuve ne montre pas le refus de la précédente.
    setFailure(null)
    setAsking(true)
  }

  const close = () => {
    // Pendant l'envoi, la fenêtre reste ouverte : la fermer perdrait le focus prévu après.
    if (!busy.current) setAsking(false)
  }

  const confirm = async () => {
    if (busy.current) return
    busy.current = true
    setBlocking(true)
    const result = await block(author.id)
    busy.current = false
    setBlocking(false)
    // Refusé : la fenêtre reste ouverte, avec le message ; « Bloquer » permet de réessayer.
    if (!result.ok) {
      setFailure(result.error)
      return
    }
    setFailure(null)
    focusAfterClose.current = true
    setBlocked(true)
    setAsking(false)
  }

  // Le message d'un refus : la session expirée a son lien, le quota du jour sa propre phrase.
  const failureMessage =
    failure === null
      ? null
      : failure === 'unauthorized'
        ? t('states.expired')
        : failure === 'rateLimited'
          ? t('block.limited', { max: BLOCKS_PER_DAY })
          : t('block.error')

  return (
    <>
      {blocked ? (
        <Notice ref={doneRef} tone="success" message={t('block.done', { handle })} polite />
      ) : (
        <>
          <Hint icon="prohibit" text={t('report.alsoBlockHint')} />
          <Button label={t('report.alsoBlock', { handle })} variant="secondary" onPress={open} />
        </>
      )}
      <Dialog
        visible={asking}
        title={t('block.title', { handle })}
        // Les quatre phrases du blocage (J9), chacune son paragraphe.
        message={[
          t('block.hidden'),
          t('block.follows'),
          t('block.notTold', { handle }),
          t('block.notModeration'),
        ].join('\n\n')}
        onDismiss={close}
        onClosed={() => {
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          requestAnimationFrame(() => focusWithoutScroll(doneRef.current))
        }}
      >
        {/* Refusé : le message reste dans la fenêtre, et « Bloquer » permet de réessayer. */}
        {failureMessage ? (
          <Notice
            message={failureMessage}
            action={failure === 'unauthorized' ? signInAgain(() => setAsking(false)) : undefined}
          />
        ) : null}
        <Button
          label={t('block.confirm')}
          variant="confirm"
          onPress={() => void confirm()}
          loading={blocking}
        />
        <Button label={t('block.cancel')} variant="secondary" onPress={close} disabled={blocking} />
      </Dialog>
    </>
  )
}
