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
import { Fragment, useEffect, useRef, useState } from 'react'
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
import { Wordmark } from '../ui/Wordmark'

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

/**
 * Combien de temps « Tout couper » reste sourd après la confirmation : plus qu'une double tape
 * (deux tapes à moins de 300 ms), moins qu'il n'en faut pour lire le message et viser le bouton.
 */
const ALL_OFF_GUARD_MS = 600

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
  // L'étape, connue tout de suite (l'état `step` n'est à jour qu'au dessin suivant) : « Confirmer »
  // n'agit qu'à la question, « Tout couper » qu'après la confirmation. Un appui qui arriverait sur
  // un bouton déjà remplacé ne fait donc rien.
  const stepNow = useRef<Step>('ask')
  // Le moment de la confirmation (horloge en millisecondes). Une double tape sur « Confirmer » a sa
  // seconde tape environ 200 ms après la première : si la page a changé entre-temps, elle peut
  // tomber sur « Tout couper », quelle que soit la place qu'on lui donne (un titre qui raccourcit,
  // un texte agrandi, une autre largeur déplacent tout). « Tout couper » ignore donc les appuis des
  // premiers instants qui suivent la confirmation (relecture de 6c).
  const doneAt = useRef(0)

  // Après « Confirmer », « Tout couper » ou un lien refusé, le bouton touché disparaît. Le focus du
  // clavier va au message qui le remplace (non interactif), jamais sur l'action suivante : un
  // second appui sur Entrée ne coupe ainsi rien de plus que ce qui a été confirmé (relectures de
  // 6c). Sans cela, il retomberait tout en haut de la page.
  const messageRef = useRef<Focusable>(null)
  const focusMessage = useRef(false)
  useEffect(() => {
    if (!focusMessage.current) return
    focusMessage.current = false
    focusWithoutScroll(messageRef.current)
  })

  const send = async (scope?: 'all') => {
    if (busy.current || !token || stepNow.current !== (scope ? 'done' : 'ask')) return
    if (scope && Date.now() - doneAt.current < ALL_OFF_GUARD_MS) return
    busy.current = true
    setSending(true)
    setFailure(null)
    const result = await unsubscribe(token, scope)
    busy.current = false
    setSending(false)
    if (result.ok || result.error === 'validation') {
      // 400 : jeton faux ou compte supprimé (l'API ne dit pas lequel) : le lien est invalide.
      const next: Step = !result.ok ? 'invalid' : scope ? 'allDone' : 'done'
      stepNow.current = next
      doneAt.current = Date.now()
      focusMessage.current = true
      setStep(next)
    } else {
      // Réseau, trop de demandes : le lien reste bon, le même bouton permet de réessayer.
      setFailure(result.error)
    }
  }

  const invalid = hydrated && (kind === null || step === 'invalid')
  // Le titre de l'onglet reste court ; le titre de la page pose la question tant qu'on n'y a pas
  // répondu (relecture de design de 6c), puis redevient « Tes e-mails ».
  const pageTitle = invalid ? t('unsubscribe.invalidTitle') : t('unsubscribe.title')
  const question = kind === 'mentions' ? t('unsubscribe.askMentions') : t('unsubscribe.askRecap')
  const heading = hydrated && !invalid && step === 'ask' ? question : pageTitle
  const manage = (
    <Stack align="center">
      <TextLink label={t('unsubscribe.manage')} onPress={() => router.push('/profile')} />
    </Stack>
  )
  const accountEmails = (
    <Text variant="callout" tone="muted" align="center">
      {t('unsubscribe.accountEmails')}
    </Text>
  )
  const failureNotice = failure ? <Notice message={t(`errors.${failure}`)} /> : null

  // Chaque étape a sa clé (`key`) : React dessine des éléments neufs à chaque changement, au lieu
  // de réutiliser ceux qui sont à la même place. Sans elle, le bouton « Confirmer » devenait
  // « Tout couper », en gardant le focus du clavier.
  const content = invalid ? (
    <Fragment key="invalid">
      {/* La ref (et le focus) seulement quand l'API refuse le lien au clic : le message prend
          alors la place du bouton touché, et c'est le focus qui le fait lire. Un lien abîmé dès
          l'ouverture n'a rien remplacé : le message reste une alerte annoncée. */}
      <Notice
        ref={step === 'invalid' ? messageRef : undefined}
        message={t('unsubscribe.invalid')}
      />
      {manage}
    </Fragment>
  ) : step === 'ask' ? (
    <Fragment key="ask">
      {failureNotice}
      <Button label={t('unsubscribe.confirm')} onPress={() => void send()} loading={sending} />
      <Stack align="center">
        <TextLink label={t('unsubscribe.keep')} onPress={() => router.replace('/')} />
      </Stack>
    </Fragment>
  ) : step === 'done' ? (
    <Fragment key="done">
      {/* Une confirmation, lue sans couper le lecteur d'écran (role « status »). */}
      <Notice
        ref={messageRef}
        tone="success"
        polite
        message={kind === 'mentions' ? t('unsubscribe.doneMentions') : t('unsubscribe.doneRecap')}
      />
      {/* « Gérer mes e-mails » vient avant « Tout couper », pour l'éloigner de la place qu'avait
          « Confirmer » : la page se centre dans la hauteur, et le titre raccourcit après la
          réponse ; sans ce lien entre les deux, « Tout couper » remontait sous le doigt (à 3 pt
          du bas de « Confirmer » sur téléphone, par-dessus sur ordinateur). La garde dans le temps
          de `send` protège aussi, à toutes les largeurs. */}
      {manage}
      {/* « Tout couper » ne touche pas aux e-mails du compte : on le dit juste avant le bouton. */}
      {accountEmails}
      {failureNotice}
      <Button
        label={t('unsubscribe.allOff')}
        variant="secondary"
        onPress={() => void send('all')}
        loading={sending}
      />
    </Fragment>
  ) : (
    <Fragment key="allDone">
      <Notice ref={messageRef} tone="success" polite message={t('unsubscribe.allDone')} />
      {accountEmails}
      {manage}
    </Fragment>
  )

  return (
    <Screen pageTitle={pageTitle}>
      {/* Qui arrive d'un e-mail voit d'abord où il est : le nom de l'appli, comme sur l'accueil. */}
      <Stack align="center">
        <Wordmark size="large" />
      </Stack>
      <Stack align="center">
        {/* Une coche une fois l'e-mail coupé ; l'enveloppe sinon. */}
        <Emblem icon={hydrated && !invalid && step !== 'ask' ? 'check' : 'envelope-simple'} />
      </Stack>
      <Text variant="title2" align="center" accessibilityRole="header">
        {heading}
      </Text>
      {hydrated ? content : null}
    </Screen>
  )
}
