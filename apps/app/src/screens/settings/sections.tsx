// Le contenu de chaque rubrique des réglages (tranche R2), repris de l'ancienne page « Mon compte »
// (relecture juridique du plan, jur-11 : chaque entrée d'aujourd'hui se retrouve, avec son aide).
// Le titre de la rubrique n'est pas ici : c'est celui de la page sur téléphone (« Langue »), celui
// de la colonne de droite sur ordinateur (SettingsScreen).
import { contactEmail } from '@ruche/brand'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { type Language, supportedLanguages } from '@ruche/i18n'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Platform } from 'react-native'
import { downloadMyData } from '../../accounts/api'
import { useSetHideFromSuggestions } from '../../hives/api'
import { firstParam } from '../../navigation/params'
import { useMe } from '../../profile/hooks'
import { useChooseLanguage } from '../../profile/useChooseLanguage'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../../ui/focus'
import type { IconName } from '../../ui/Icon'
import { LegalLinks } from '../../ui/LegalLinks'
import { ListGroup, ListRow, type PressEvent } from '../../ui/ListGroup'
import { Notice } from '../../ui/Notice'
import { Stack } from '../../ui/Stack'
import { Switch } from '../../ui/Switch'
import type { Appearance } from '../../ui/theme/appearance'
import { useHydrated } from '../../ui/theme/hydration'
import { useTheme } from '../../ui/theme/ThemeProvider'
import { EmailSettings } from './EmailSettings'
import { useSignOut } from './useSignOut'

/** Les rubriques qui ont un contenu ici (Mon profil et Modération ont leur propre page). */
export type ContentSection =
  | 'notifications'
  | 'language'
  | 'appearance'
  | 'data'
  | 'security'
  | 'account'
  | 'about'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

// Les trois apparences proposées, avec leur icône.
const appearances: { value: Appearance; icon: IconName }[] = [
  { value: 'auto', icon: 'circle-half' },
  { value: 'day', icon: 'sun' },
  { value: 'night', icon: 'moon' },
]

/**
 * Le geste d'une ligne-lien : le routeur change de page, et sur le web le navigateur ne recharge
 * pas la page (preventDefault sur le clic du vrai `<a>`).
 */
const useGo = () => {
  const router = useRouter()
  return (href: string) => (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    router.push(href)
  }
}

export function SettingsSection({
  section,
  email,
}: {
  section: ContentSection
  /** L'adresse du compte (lue dans la session), pour la rubrique « Compte ». */
  email: string
}) {
  switch (section) {
    case 'notifications':
      return <EmailSettings />
    case 'language':
      return <LanguageSection />
    case 'appearance':
      return <AppearanceSection />
    case 'data':
      return <DataSection />
    case 'security':
      return <SecuritySection />
    case 'account':
      return <AccountSection email={email} />
    case 'about':
      return <AboutSection />
  }
}

// R18 : une langue autre que le français arrive à la demande. La ligne touchée est occupée le temps
// que ses textes arrivent, l'ancienne reste cochée ; un échec pose le message sous le groupe, avec
// « Réessayer ».
function LanguageSection() {
  const { t } = useTranslation()
  const { current, choose, loading, failed, retry } = useChooseLanguage()
  // Les lignes, pour y ramener le focus du clavier quand « Réessayer » disparaît.
  const rows = useRef<Partial<Record<Language, Focusable | null>>>({})
  const onRetry = () => {
    // Le bouton touché part avec le message : le focus va d'abord à la ligne qu'on recharge,
    // occupée pendant l'essai, puis cochée s'il réussit (sur téléphone, le lecteur d'écran aussi).
    const row = failed ? rows.current[failed] : null
    focusWithoutScroll(row)
    moveReaderTo(row)
    void retry()
  }
  return (
    <Stack gap="sm">
      <ListGroup footer={t(($) => $.account.language.hint)} radio>
        {supportedLanguages.map((language) => (
          <ListRow
            key={language}
            ref={(node) => {
              rows.current[language] = node
            }}
            label={t(($) => $.common.languages[language])}
            selected={language === current}
            busy={language === loading}
            onPress={() => void choose(language)}
          />
        ))}
      </ListGroup>
      {failed ? (
        <Notice
          message={t(($) => $.account.language.loadFailed)}
          action={{ label: t(($) => $.common.retry), role: 'button', onPress: onRetry }}
        />
      ) : null}
    </Stack>
  )
}

// Une liste à cocher, comme la langue : les trois libellés tiennent même sur un petit téléphone,
// quelle que soit la taille du texte.
function AppearanceSection() {
  const { t } = useTranslation()
  const { appearance, setAppearance } = useTheme()
  return (
    <ListGroup footer={t(($) => $.account.appearance.hint)} radio>
      {appearances.map(({ value, icon }) => (
        <ListRow
          key={value}
          label={t(($) => $.account.appearance[value])}
          icon={icon}
          selected={value === appearance}
          onPress={() => setAppearance(value)}
        />
      ))}
    </ListGroup>
  )
}

function DataSection() {
  const { t } = useTranslation()
  const go = useGo()
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    setExporting(true)
    const result = await downloadMyData()
    setExporting(false)
    setMessage(
      result.ok
        ? { text: t(($) => $.account.export.done), ok: true }
        : { text: t(($) => $.auth.errors[result.error], lengths), ok: false },
    )
  }
  return (
    <Stack gap="lg">
      <ListGroup>
        {/* R11 : ce que le membre a écrit et pourrait vouloir relire ou retirer, puis l'export. */}
        <ListRow
          label={t(($) => $.account.data.comments)}
          icon="chat-circle"
          trailing="chevron"
          href="/settings/data/comments"
          onPress={go('/settings/data/comments')}
        />
        <ListRow
          label={t(($) => $.account.data.feedback)}
          icon="chat-circle-dots"
          trailing="chevron"
          href="/settings/data/feedback"
          onPress={go('/settings/data/feedback')}
        />
        <ListRow
          label={t(($) => $.account.export.button)}
          icon="download-simple"
          // R16 (plan, choix 12) : plus de « Chargement… » écrit. L'export est une action en cours,
          // pas une lecture : la ligne garde l'indicateur d'un bouton occupé (`busy`), à droite.
          busy={exporting}
          onPress={() => void onExport()}
          disabled={exporting} // pas de deuxième export tant que le premier n'est pas fini
        />
      </ListGroup>
      {message ? <Notice tone={message.ok ? 'success' : 'error'} message={message.text} /> : null}
      <HideFromSuggestions />
    </Stack>
  )
}

// R10 : « Ne pas me proposer aux autres » (R11 : sans sous-titre au-dessus). L'interrupteur
// se lit sur le profil (GET /v1/me) ; le toucher le change tout de suite, et `set` le remet à la
// valeur du serveur si l'enregistrement échoue (un message le dit alors, sous le groupe).
function HideFromSuggestions() {
  const { t } = useTranslation()
  const me = useMe()
  const hide = useSetHideFromSuggestions()
  const [failed, setFailed] = useState(false)
  return (
    <Stack gap="sm">
      <ListGroup>
        <Switch
          inGroup
          label={t(($) => $.hives.hideFromSuggestions)}
          hint={t(($) => $.hives.hideFromSuggestionsHint)}
          value={me.data?.hideFromSuggestions ?? false}
          disabled={!me.data}
          onValueChange={(value) => {
            setFailed(false)
            void hide.set(value).then((ok) => setFailed(!ok))
          }}
        />
      </ListGroup>
      {failed ? <Notice message={t(($) => $.hives.hideFromSuggestionsError)} /> : null}
    </Stack>
  )
}

// Tranche 7b : les membres bloqués gardent leur page (app/blocks.tsx). Le mot de passe vit sous
// la rubrique (R2) : la page est écrite par l'écran du mot de passe (ChangePasswordScreen).
function SecuritySection() {
  const { t } = useTranslation()
  const go = useGo()
  const router = useRouter()
  // Retour de « Changer ton mot de passe » : ?announce=passwordChanged (relecture de l'interface
  // R2, B2 : le toast ne doit pas être la seule trace). L'adresse n'est connue que dans le
  // navigateur : on attend d'y être (useHydrated). Le message reste, le paramètre quitte l'adresse
  // (setParams) : une page rechargée ou partagée ne le redit pas.
  const params = useLocalSearchParams<{ announce?: string | string[] }>()
  const announce = firstParam(params.announce)
  const hydrated = useHydrated()
  const [changed, setChanged] = useState(false)
  useEffect(() => {
    if (!hydrated || changed || announce !== 'passwordChanged') return
    setChanged(true)
    router.setParams({ announce: undefined })
  }, [hydrated, changed, announce, router])
  // Le focus du clavier va au message dès qu'il paraît (web) : la page « Changer ton mot de passe »
  // vient de se fermer, et le focus serait retombé sur la page entière (relecture de design C3).
  // Le message, lu par le focus, n'est plus annoncé en plus (Notice coupe aria-live avec une ref).
  // Une seule fois, au premier dessin du message (un effet sans liste : il suit chaque dessin).
  const messageRef = useRef<Focusable>(null)
  const focused = useRef(false)
  useEffect(() => {
    if (!changed || focused.current) return
    focused.current = true
    focusWithoutScroll(messageRef.current)
  })
  return (
    <>
      {changed ? (
        <Notice
          ref={messageRef}
          tone="success"
          polite
          message={t(($) => $.settings.changePassword.done)}
        />
      ) : null}
      <SecurityRows go={go} />
    </>
  )
}

/** Les deux lignes de la rubrique Sécurité : le mot de passe, les membres bloqués. */
function SecurityRows({ go }: { go: ReturnType<typeof useGo> }) {
  const { t } = useTranslation()
  return (
    <ListGroup>
      <ListRow
        label={t(($) => $.settings.changePassword.title)}
        icon="key"
        trailing="chevron"
        href="/settings/security/password"
        onPress={go('/settings/security/password')}
      />
      <ListRow
        label={t(($) => $.account.blocks)}
        icon="prohibit"
        trailing="chevron"
        href="/blocks"
        onPress={go('/blocks')}
      />
    </ListGroup>
  )
}

function AccountSection({ email }: { email: string }) {
  const { t } = useTranslation()
  const go = useGo()
  // La déconnexion refusée (serveur, réseau) : on le dit et on reste ici (useSignOut.ts, commun
  // avec l'écran « Accepter » des règles).
  const { signOut: onSignOut, failed: signOutFailed } = useSignOut()
  // Notre adresse de contact (écrite dans @ruche/brand seulement), en clair pour qui veut la
  // recopier, et un lien qui ouvre la messagerie : c'est notre adresse, pas un site tiers, donc
  // sans la page « Tu quittes… ». Sur le web, le vrai lien `mailto:` suffit ; sur téléphone,
  // Linking ouvre l'appli de messagerie.
  const mailto = `mailto:${contactEmail}`
  return (
    <>
      <ListGroup>
        {/* Tranche « adresse » : la ligne montre l'adresse actuelle ; son nom lu dit l'action puis
            l'adresse, car un nom lu remplace le détail affiché (relecture juridique, J9). */}
        <ListRow
          label={t(($) => $.account.email.label)}
          detail={email}
          spokenLabel={t(($) => $.account.email.spoken, { email })}
          trailing="chevron"
          href="/settings/account/email"
          onPress={go('/settings/account/email')}
        />
        <ListRow
          label={t(($) => $.account.signOut)}
          trailing="sign-out"
          onPress={() => void onSignOut()}
        />
        <ListRow
          label={t(($) => $.account.delete.title)}
          tone="danger"
          trailing="trash"
          href="/settings/account/delete"
          onPress={go('/settings/account/delete')}
        />
      </ListGroup>
      {/* Juste sous la ligne touchée, pour que le message se voie là où le membre regarde. */}
      {signOutFailed ? <Notice tone="error" message={t(($) => $.account.signOutError)} /> : null}
      <ListGroup>
        <ListRow
          label={t(($) => $.account.contact.label)}
          detail={contactEmail}
          spokenLabel={t(($) => $.account.contact.spoken, { contactEmail })}
          trailing="envelope-simple"
          href={mailto}
          onPress={() => {
            if (Platform.OS !== 'web') void Linking.openURL(mailto)
          }}
        />
      </ListGroup>
    </>
  )
}

// Les quatre pages publiques (Règles, Confidentialité, Mentions légales, Accessibilité), puis le
// code source, accessible depuis l'appli et pas seulement depuis l'accueil des visiteurs : un
// logiciel libre doit pouvoir être consulté par ceux qui l'utilisent (AGPL, article 13). Tout est
// dans `LegalLinks` ; le code source passe par la page « Tu quittes… ».
function AboutSection() {
  return <LegalLinks variant="rows" />
}
