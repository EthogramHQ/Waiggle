// Page « Signaler » (tranche 6d) : un membre signale un projet, une note, un commentaire (ou une
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
import {
  REPORT_DETAILS_MAX,
  type ReportReason,
  ReportTarget,
  type ReportTargetKind,
} from '@ruche/contracts'
import type { Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { sendReport, useReportTarget } from '../reports/api'
import { Button } from '../ui/Button'
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
      fallback={fallbackOf(target.kind, target.id, preview.data.projectId)}
    />
  )
}

/** Le formulaire, une fois la cible lue : ses états ne redessinent pas les états de chargement. */
function ReportForm({
  target,
  text,
  fallback,
}: {
  target: ReportTarget
  text: string
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

  const submit = async () => {
    if (busy.current || reason === null || sent) return
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

  // Le message d'un refus. Une session expirée a son lien « Me reconnecter », qui revient ici.
  const failureMessage =
    failure === null
      ? null
      : failure === 'unauthorized'
        ? t('states.expired')
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
                onPress={() => setReason(item.reason)}
              />
            ))}
          </ListGroup>
          {/* Pour un contenu illégal, la précision dit pourquoi, de bonne foi (article 16 du DSA). */}
          <TextField
            label={illegal ? t('report.illegalDetails') : t('report.details')}
            value={details}
            onChangeText={setDetails}
            hint={
              illegal
                ? `${t('report.illegalHint')} ${t('report.detailsHint')}`
                : t('report.detailsHint')
            }
            multiline
            showCount
            maxLength={REPORT_DETAILS_MAX}
          />
          <Hint icon="shield-check" text={t('report.anonymity')} />
          {failureMessage ? (
            <Notice
              message={failureMessage}
              action={failure === 'unauthorized' ? signInAgain() : undefined}
            />
          ) : null}
          {/* Sans motif, rien à envoyer : le bouton attend qu'on en choisisse un. */}
          <Button
            label={t('report.submit')}
            onPress={() => void submit()}
            loading={sending}
            disabled={reason === null}
          />
        </>
      )}
    </Screen>
  )
}
