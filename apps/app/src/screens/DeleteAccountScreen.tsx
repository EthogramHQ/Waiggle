// Page « Supprimer ton compte » : ce qui disparaît, puis deux étapes. 1. Garder une copie de ses
// données (facultatif). 2. Confirmer avec son mot de passe. La suppression est immédiate et
// définitive : la page le dit clairement avant le bouton.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteAccount, downloadMyData, useSession } from '../accounts/api'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Row } from '../ui/Stack'
import { Step } from '../ui/StepNumber'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { LoadingScreen, SignedOutScreen } from './states'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

export function DeleteAccountScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data, isPending } = useSession()
  // Le profil, pour citer le pseudo qui redevient libre (lu dans le cache s'il y est déjà).
  const me = useMe(Boolean(data))
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)

  const back = useGoBack('/account')

  if (isPending) return <LoadingScreen />
  if (!data) return <SignedOutScreen />

  const onExport = async () => {
    setBusy('export')
    const result = await downloadMyData()
    setBusy(null)
    setExportMessage(
      result.ok
        ? { text: t('account.export.done'), ok: true }
        : { text: t(`auth.errors.${result.error}`, lengths), ok: false },
    )
  }

  const onDelete = async () => {
    setBusy('delete')
    const result = await deleteAccount(password)
    setBusy(null)
    if (result.ok) {
      router.replace('/')
      return
    }
    setError(
      result.error === 'wrongPassword'
        ? t('account.delete.wrongPassword')
        : t(`auth.errors.${result.error}`, lengths),
    )
  }

  return (
    <Screen
      onBack={back}
      title={t('account.delete.screenTitle')}
      subtitle={t('account.delete.intro')}
    >
      <ListGroup>
        <ListRow icon="user" label={t('account.delete.profileItem')} detail={data.user.name} />
        {/* Tranche 6a : son pseudo n'est pas mis en réserve, un autre membre peut le prendre. Le
            pseudo vient du profil (la session ne le porte pas) : tant qu'il n'est pas arrivé,
            la ligne reste sans détail plutôt que d'attendre. */}
        <ListRow
          icon="at"
          label={t('account.delete.handleItem')}
          {...(me.data
            ? { detail: t('account.delete.handleDetail', { handle: me.data.handle }) }
            : null)}
        />
        <ListRow
          icon="images"
          label={t('account.delete.projectsItem')}
          detail={t('account.delete.projectsDetail')}
        />
        <ListRow icon="users" label={t('account.delete.followsItem')} />
        {/* Tranche 5 : ses réactions et ses commentaires partent aussi ; un commentaire qui a des
            réponses devient « Commentaire supprimé », pour que les réponses des autres restent. */}
        <ListRow
          icon="chat-circle"
          label={t('account.delete.reactionsItem')}
          detail={t('account.delete.reactionsDetail')}
        />
      </ListGroup>

      {/* Deux étapes, dans l'ordre : on garde d'abord une copie, puis on confirme. */}
      <Step
        value={1}
        control={
          <Button
            label={t('account.export.button')}
            variant="secondary"
            icon="download-simple"
            onPress={() => void onExport()}
            loading={busy === 'export'}
          />
        }
      >
        <Text variant="caption" tone="muted">
          {t('account.delete.exportHint')}
        </Text>
        {exportMessage ? (
          <Notice tone={exportMessage.ok ? 'success' : 'error'} message={exportMessage.text} />
        ) : null}
      </Step>
      <Step
        value={2}
        control={
          <TextField
            label={t('account.delete.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            error={error ?? undefined}
          />
        }
      />

      <Row gap="sm" justify="center">
        <Icon name="warning" size={18} tone="danger" />
        <Text weight={700} tone="danger">
          {t('account.delete.warning')}
        </Text>
      </Row>
      <Button
        label={t('account.delete.submit')}
        variant="confirm"
        icon="trash"
        onPress={() => void onDelete()}
        loading={busy === 'delete'}
        disabled={password.length === 0} // impossible de supprimer sans avoir tapé son mot de passe
      />
      <Row justify="center">
        <TextLink label={t('common.cancel')} onPress={back} role="button" />
      </Row>
    </Screen>
  )
}
