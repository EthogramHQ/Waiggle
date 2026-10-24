// Page « Réglages » : qui est connecté, profil, langue, apparence, e-mails, export des données,
// déconnexion, l'adresse pour nous écrire, la modération pour un administrateur (tranche 7a) et
// les membres bloqués (tranche 7b).
// La suppression du compte a sa propre page (DeleteAccountScreen), plus solennelle.

import { contactEmail, sourceUrl } from '@ruche/brand'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { supportedLanguages } from '@ruche/i18n'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'
import { downloadMyData, signOut, useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { useChooseLanguage } from '../profile/useChooseLanguage'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import type { IconName } from '../ui/Icon'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import type { Appearance } from '../ui/theme/appearance'
import { useTheme } from '../ui/theme/ThemeProvider'
import { LoadingScreen, SignedOutScreen } from './states'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

// Les trois apparences proposées, avec leur icône.
const appearances: { value: Appearance; icon: IconName }[] = [
  { value: 'auto', icon: 'circle-half' },
  { value: 'day', icon: 'sun' },
  { value: 'night', icon: 'moon' },
]

export function AccountScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data, isPending } = useSession()
  const me = useMe(Boolean(data))
  const toSource = useMediaSources()
  const { current, choose } = useChooseLanguage()
  const { appearance, setAppearance } = useTheme()
  const openOutside = useOpenOutside()
  const [exportMessage, setExportMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)

  const back = useGoBack('/')

  if (isPending) return <LoadingScreen />
  // Personne de connecté : on propose de se connecter (et de revenir ici ensuite).
  if (!data) return <SignedOutScreen />

  const onSignOut = async () => {
    await signOut()
    router.replace('/')
  }

  const onExport = async () => {
    setExporting(true)
    const result = await downloadMyData()
    setExporting(false)
    setExportMessage(
      result.ok
        ? { text: t('account.export.done'), ok: true }
        : { text: t(`auth.errors.${result.error}`, lengths), ok: false },
    )
  }

  return (
    <Screen header={<TopNav />} onBack={back} title={t('account.title')}>
      {/* Qui est connecté, et le chemin vers son profil. */}
      <Surface variant="grouped" padding="lg">
        <Row gap="md">
          <Avatar
            name={data.user.name}
            source={toSource(me.data?.avatarUrl)}
            label={t('profile.avatar.label')}
            size={56}
          />
          <Stack gap="xxs" grow>
            <Text variant="headline">{data.user.name}</Text>
          </Stack>
        </Row>
      </Surface>
      <Button
        label={t('account.editProfile')}
        variant="secondary"
        icon="pencil-simple"
        onPress={() => router.push('/profile')}
      />

      <ListGroup>
        {/* Tranche 7b : les membres que j'ai bloqués, et de quoi les débloquer (app/blocks.tsx).
            Pour tous les membres, même sans blocage : la page dit alors « Tu n'as bloqué personne ». */}
        <ListRow
          label={t('account.blocks')}
          icon="prohibit"
          trailing="chevron"
          onPress={() => router.push('/blocks')}
        />
        {/* Tranche 7a : la modération, pour un administrateur seulement. La ligne apparaît quand le
            profil est arrivé ; ce champ ne donne aucun droit, l'API refait la vérification. */}
        {me.data?.isAdmin ? (
          <ListRow
            key="moderation"
            label={t('account.moderation')}
            icon="shield-check"
            trailing="chevron"
            onPress={() => router.push('/moderation')}
          />
        ) : null}
      </ListGroup>

      <ListGroup title={t('account.language.title')} footer={t('account.language.hint')} radio>
        {supportedLanguages.map((language) => (
          <ListRow
            key={language}
            label={t(`common.languages.${language}`)}
            selected={language === current}
            onPress={() => void choose(language)}
          />
        ))}
      </ListGroup>

      {/* Une liste à cocher, comme la langue : les trois libellés tiennent même sur un petit
          téléphone, quelle que soit la taille du texte. */}
      <ListGroup title={t('account.appearance.title')} footer={t('account.appearance.hint')} radio>
        {appearances.map(({ value, icon }) => (
          <ListRow
            key={value}
            label={t(`account.appearance.${value}`)}
            icon={icon}
            selected={value === appearance}
            onPress={() => setAppearance(value)}
          />
        ))}
      </ListGroup>

      {/* Les réglages d'e-mail vivent dans « Mon profil », tout en bas : la ligne y mène et la
          page amène la section à l'écran (?section=emails). La langue, plus haut, dit déjà que les
          e-mails suivent la langue choisie : on trouve ici le reste. */}
      <ListGroup title={t('account.emails.title')}>
        <ListRow
          label={t('account.emails.row')}
          trailing="chevron"
          onPress={() => router.push({ pathname: '/profile', params: { section: 'emails' } })}
        />
      </ListGroup>

      <ListGroup title={t('account.data.title')}>
        <ListRow
          label={t('account.export.button')}
          trailing={exporting ? <Text tone="muted">{t('common.loading')}</Text> : 'download-simple'}
          onPress={() => void onExport()}
          disabled={exporting} // pas de deuxième export tant que le premier n'est pas fini
        />
      </ListGroup>
      {exportMessage ? (
        <Notice tone={exportMessage.ok ? 'success' : 'error'} message={exportMessage.text} />
      ) : null}

      <ListGroup title={t('account.section.title')}>
        <ListRow
          label={t('account.email.label')}
          detail={data.user.email}
          trailing={
            <Row gap="xs">
              <Icon name="lock-simple" size={14} tone="accent" />
              <Text variant="caption" weight={600} tone="accent">
                {t('account.email.soon')}
              </Text>
            </Row>
          }
        />
        <ListRow
          label={t('account.signOut')}
          trailing="sign-out"
          onPress={() => void onSignOut()}
        />
        <ListRow
          label={t('account.delete.title')}
          tone="danger"
          trailing="trash"
          onPress={() => router.push('/account/delete')}
        />
      </ListGroup>

      {/* Tranche 7a : nous écrire, à l'adresse de contact (écrite dans @ruche/brand seulement).
          Elle s'affiche en clair, pour qui veut la recopier, et s'ouvre directement dans la
          messagerie : c'est notre adresse, pas un site tiers, donc sans la page « Tu quittes… ». */}
      <ListGroup footer={t('account.contact.hint')}>
        <ListRow
          label={t('account.contact.label')}
          detail={contactEmail}
          spokenLabel={t('account.contact.spoken', { contactEmail })}
          trailing="envelope-simple"
          onPress={() => void Linking.openURL(`mailto:${contactEmail}`)}
        />
      </ListGroup>

      {/* Le code source, accessible depuis l'appli et pas seulement depuis l'accueil des visiteurs :
          un logiciel libre doit pouvoir être consulté par ceux qui l'utilisent. */}
      <ListGroup title={t('account.about.title')} footer={t('home.openSource')}>
        <ListRow
          label={t('home.seeCode')}
          trailing="arrow-up-right"
          onPress={() => openOutside(sourceUrl)}
        />
      </ListGroup>
    </Screen>
  )
}
