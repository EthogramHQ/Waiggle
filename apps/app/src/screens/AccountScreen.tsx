// Page « Réglages » : qui est connecté, profil, langue, apparence, export des données,
// déconnexion. La suppression du compte a sa propre page (DeleteAccountScreen), plus solennelle.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { supportedLanguages } from '@ruche/i18n'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadMyData, signOut, useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { TopNav } from '../navigation/TopNav'
import { useMe } from '../profile/hooks'
import { useChooseLanguage } from '../profile/useChooseLanguage'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import type { Appearance } from '../ui/theme/appearance'
import { useTheme } from '../ui/theme/ThemeProvider'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

export function AccountScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data, isPending } = useSession()
  const me = useMe(Boolean(data))
  const toSource = useMediaSources()
  const { current, choose } = useChooseLanguage()
  const { appearance, setAppearance } = useTheme()
  const [exportMessage, setExportMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  if (isPending) return <Screen title={t('common.loading')}>{null}</Screen>
  // Personne de connecté : on propose de se connecter.
  if (!data) {
    return (
      <Screen title={t('account.title')}>
        <Notice tone="info" message={t('errors.unauthorized')} />
        <Button label={t('home.signIn')} onPress={() => router.replace('/sign-in')} />
      </Screen>
    )
  }

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

      <ListGroup title={t('account.appearance.title')} footer={t('account.appearance.hint')}>
        <Stack padding="md">
          <Segmented<Appearance>
            label={t('account.appearance.title')}
            options={[
              { value: 'auto', label: t('account.appearance.auto'), icon: 'circle-half' },
              { value: 'day', label: t('account.appearance.day'), icon: 'sun' },
              { value: 'night', label: t('account.appearance.night'), icon: 'moon' },
            ]}
            value={appearance}
            onChange={setAppearance}
          />
        </Stack>
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
    </Screen>
  )
}
