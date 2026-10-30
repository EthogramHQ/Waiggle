// Le contenu de chaque rubrique des réglages (tranche R2), repris de l'ancienne page « Mon compte »
// (relecture juridique du plan, jur-11 : chaque entrée d'aujourd'hui se retrouve, avec son aide).
// Le titre de la rubrique n'est pas ici : c'est celui de la page sur téléphone (« Langue »), celui
// de la colonne de droite sur ordinateur (SettingsScreen).
import { contactEmail, sourceUrl } from '@ruche/brand'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { supportedLanguages } from '@ruche/i18n'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Platform } from 'react-native'
import { downloadMyData, signOut } from '../../accounts/api'
import { useOpenOutside } from '../../navigation/links'
import { useChooseLanguage } from '../../profile/useChooseLanguage'
import type { IconName } from '../../ui/Icon'
import { ListGroup, ListRow, type PressEvent } from '../../ui/ListGroup'
import { Notice } from '../../ui/Notice'
import { Text } from '../../ui/Text'
import type { Appearance } from '../../ui/theme/appearance'
import { useTheme } from '../../ui/theme/ThemeProvider'
import { EmailSettings } from './EmailSettings'

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
      return <EmailSettings titled={false} />
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

function LanguageSection() {
  const { t } = useTranslation()
  const { current, choose } = useChooseLanguage()
  return (
    <ListGroup footer={t(($) => $.account.language.hint)} radio>
      {supportedLanguages.map((language) => (
        <ListRow
          key={language}
          label={t(($) => $.common.languages[language])}
          selected={language === current}
          onPress={() => void choose(language)}
        />
      ))}
    </ListGroup>
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
    <>
      <ListGroup>
        <ListRow
          label={t(($) => $.account.export.button)}
          icon="download-simple"
          trailing={exporting ? <Text tone="muted">{t(($) => $.common.loading)}</Text> : undefined}
          onPress={() => void onExport()}
          disabled={exporting} // pas de deuxième export tant que le premier n'est pas fini
        />
      </ListGroup>
      {message ? <Notice tone={message.ok ? 'success' : 'error'} message={message.text} /> : null}
    </>
  )
}

// Tranche 7b : les membres bloqués gardent leur page (app/blocks.tsx). Le mot de passe vit sous
// la rubrique (R2) : la page est écrite par l'écran du mot de passe (ChangePasswordScreen).
function SecuritySection() {
  const { t } = useTranslation()
  const go = useGo()
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
  const router = useRouter()
  const go = useGo()
  const onSignOut = async () => {
    await signOut()
    router.replace('/')
  }
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
      <ListGroup footer={t(($) => $.account.contact.hint)}>
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

// Le code source, accessible depuis l'appli et pas seulement depuis l'accueil des visiteurs : un
// logiciel libre doit pouvoir être consulté par ceux qui l'utilisent (AGPL, article 13). Le lien
// passe par la page « Tu quittes… », et les lecteurs d'écran entendent qu'il ouvre un site externe.
function AboutSection() {
  const { t } = useTranslation()
  const openOutside = useOpenOutside()
  return (
    <ListGroup footer={t(($) => $.home.openSource)}>
      <ListRow
        label={t(($) => $.home.seeCode)}
        hint={t(($) => $.common.externalSite)}
        trailing="arrow-up-right"
        href={`/out?url=${encodeURIComponent(sourceUrl)}`}
        onPress={(event) => {
          if (Platform.OS === 'web') event?.preventDefault?.()
          openOutside(sourceUrl)
        }}
      />
    </ListGroup>
  )
}
