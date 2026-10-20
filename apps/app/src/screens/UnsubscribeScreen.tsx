// La page de désinscription (tranche 6c), ouverte depuis le lien « Ne plus recevoir… » d'un e-mail
// (/unsubscribe?token=…), sans connexion. Scénario : docs/scenarios/phase-1.md, « Précisions
// (tranche 6c) ».
//
// Ouvrir la page ne change rien : un antivirus ou une messagerie qui ouvre les liens pour les
// vérifier ne désinscrit personne. Seul « Confirmer » envoie la demande, une seule fois. Ensuite,
// « Tout couper » arrête aussi l'autre sorte d'e-mail de notification ; les e-mails du compte
// (vérification de l'adresse) continuent, et la page le dit.
//
// La sorte d'e-mail (le récap ou les mentions) est écrite dans le jeton : la page la lit pour poser
// la bonne question, mais seule l'API vérifie la signature. La page ne montre aucune donnée du
// membre, ni nom ni adresse, même s'il est connecté (relecture juridique, R6).
import { UnsubscribeToken } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'
import { unsubscribe } from '../email/api'
import { firstParam } from '../navigation/params'
import { Button } from '../ui/Button'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { Emblem } from '../ui/Illustrations'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'

/**
 * Les états de la page : la question, la sorte coupée, tout coupé, ou un lien invalide (jeton
 * abîmé dès l'ouverture, ou refusé par l'API au clic). « En cours » n'est pas un état à part :
 * c'est le bouton qui attend (`sending`), à côté de l'état où l'on était.
 */
type Step = 'ask' | 'done' | 'allDone' | 'invalid'

/** La sorte d'e-mail du jeton (`v1.<id>.<sorte>.<signature>`), ou null s'il n'a pas la bonne forme. */
const kindOf = (token: string | undefined) => {
  const parsed = UnsubscribeToken.safeParse(token ?? '')
  if (!parsed.success) return null
  return parsed.data.split('.')[2] === 'mentions' ? ('mentions' as const) : ('recap' as const)
}

export function UnsubscribeScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string | string[] }>()
  // Le jeton est dans l'adresse, inconnue du serveur qui prépare la page web : rien ne s'affiche
  // ni ne s'envoie avant que la page soit dans le navigateur (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()
  const token = firstParam(params.token)
  const kind = kindOf(token)

  const [step, setStep] = useState<Step>('ask')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<ApiErrorKey | null>(null)
  // Un envoi à la fois : deux touchers rapides n'envoient qu'une demande (l'état `sending`, lui,
  // n'est à jour qu'au dessin suivant).
  const busy = useRef(false)

  // Le focus du clavier, quand le bouton touché disparaît : sur « Tout couper » après « Confirmer »,
  // sur « Gérer mes e-mails » après « Tout couper » ou un lien refusé. Sans cela, il retomberait
  // tout en haut de la page.
  const allOffRef = useRef<Focusable>(null)
  const manageRef = useRef<Focusable>(null)
  const focusNext = useRef<'allOff' | 'manage' | null>(null)
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    focusWithoutScroll(target === 'allOff' ? allOffRef.current : manageRef.current)
  })

  const send = async (scope?: 'all') => {
    if (busy.current || !token) return
    busy.current = true
    setSending(true)
    setFailure(null)
    const result = await unsubscribe(token, scope)
    busy.current = false
    setSending(false)
    if (result.ok) {
      focusNext.current = scope ? 'manage' : 'allOff'
      setStep(scope ? 'allDone' : 'done')
    } else if (result.error === 'validation') {
      // 400 : jeton faux ou compte supprimé (l'API ne dit pas lequel).
      focusNext.current = 'manage'
      setStep('invalid')
    } else {
      // Réseau, trop de demandes : le lien reste bon, le même bouton permet de réessayer.
      setFailure(result.error)
    }
  }

  const invalid = hydrated && (kind === null || step === 'invalid')
  const title = invalid ? t('unsubscribe.invalidTitle') : t('unsubscribe.title')
  const manage = (
    <Stack align="center">
      <TextLink
        ref={manageRef}
        label={t('unsubscribe.manage')}
        onPress={() => router.push('/profile')}
      />
    </Stack>
  )
  const accountEmails = (
    <Text variant="callout" tone="muted" align="center">
      {t('unsubscribe.accountEmails')}
    </Text>
  )
  const failureNotice = failure ? <Notice message={t(`errors.${failure}`)} /> : null

  const content = invalid ? (
    <>
      <Text tone="secondary" align="center">
        {t('unsubscribe.invalid')}
      </Text>
      {manage}
    </>
  ) : step === 'ask' ? (
    <>
      <Text align="center">
        {kind === 'mentions' ? t('unsubscribe.askMentions') : t('unsubscribe.askRecap')}
      </Text>
      {failureNotice}
      <Button label={t('unsubscribe.confirm')} onPress={() => void send()} loading={sending} />
      <Stack align="center">
        <TextLink label={t('unsubscribe.keep')} onPress={() => router.replace('/')} />
      </Stack>
    </>
  ) : step === 'done' ? (
    <>
      {/* Une confirmation, lue sans couper le lecteur d'écran (role « status »). */}
      <Notice
        tone="success"
        polite
        message={kind === 'mentions' ? t('unsubscribe.doneMentions') : t('unsubscribe.doneRecap')}
      />
      {failureNotice}
      <Button
        ref={allOffRef}
        label={t('unsubscribe.allOff')}
        variant="secondary"
        onPress={() => void send('all')}
        loading={sending}
      />
      {/* « Tout couper » ne touche pas aux e-mails du compte : on le dit avant qu'il soit touché. */}
      {accountEmails}
      {manage}
    </>
  ) : (
    <>
      <Notice tone="success" polite message={t('unsubscribe.allDone')} />
      {accountEmails}
      {manage}
    </>
  )

  return (
    <Screen pageTitle={title}>
      <Stack align="center">
        {/* Une coche une fois l'e-mail coupé ; l'enveloppe sinon. */}
        <Emblem icon={hydrated && !invalid && step !== 'ask' ? 'check' : 'envelope-simple'} />
      </Stack>
      <Text variant="title2" align="center" accessibilityRole="header">
        {title}
      </Text>
      {hydrated ? content : null}
    </Screen>
  )
}
