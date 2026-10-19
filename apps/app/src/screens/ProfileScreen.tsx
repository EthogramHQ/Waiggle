// Page « Mon profil » : photo, nom, pseudo, bio et outils favoris du membre connecté.
import {
  AVATAR_MAX_BYTES,
  BIO_MAX_LENGTH,
  FAVORITE_TOOLS_MAX,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  type Me,
  NAME_MAX_LENGTH,
  TOOL_MAX_LENGTH,
} from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import type { ApiErrorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { pickAvatar, updateProfile, uploadAvatar } from '../profile/api'
import { type ProfileFormErrors, parseTools, toProfileUpdate } from '../profile/form'
import { useMe, useSetMe } from '../profile/hooks'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { SheetHeader } from '../ui/SheetHeader'
import { Row, Stack } from '../ui/Stack'
import { TagInput } from '../ui/TagInput'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { useLayout } from '../ui/theme/layout'
import { LoadErrorScreen, LoadingScreen, SignedOutScreen } from './states'

export function ProfileScreen() {
  const { data: session, isPending } = useSession()
  const me = useMe(Boolean(session))

  if (isPending) return <LoadingScreen />
  if (!session) return <SignedOutScreen />
  if (me.error) {
    return (
      <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} fallback="/account" />
    )
  }
  if (!me.data) return <LoadingScreen />
  // Le formulaire n'est affiché qu'une fois le profil chargé : il part ainsi des bonnes valeurs.
  return <ProfileForm me={me.data} />
}

type Message = { text: string; ok: boolean } | null

function ProfileForm({ me }: { me: Me }) {
  const { t } = useTranslation()
  const wide = useLayout().sizeClass === 'wide'
  const { refetch: refetchSession } = useSession()
  const setMe = useSetMe()
  const toSource = useMediaSources()

  // Un useState par champ : la valeur affichée, et la fonction pour la changer.
  const [name, setName] = useState(me.name)
  const [handle, setHandle] = useState(me.handle)
  const [bio, setBio] = useState(me.bio)
  const [tools, setTools] = useState(me.favoriteTools.join(', '))
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [message, setMessage] = useState<Message>(null)
  const [busy, setBusy] = useState<'save' | 'avatar' | null>(null)

  const onSave = async () => {
    setMessage(null)
    // On vérifie avant d'envoyer : le membre voit tout de suite ce qui ne va pas.
    // me.handle : le pseudo enregistré. Retapé tel quel, il n'est pas envoyé (ce n'est pas un
    // changement, et il ne compte pas dans la limite de changements par jour).
    const checked = toProfileUpdate({ name, handle, bio, tools }, me.handle)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setErrors({})
    setBusy('save')
    const result = await updateProfile(checked.changes)
    setBusy(null)
    if (!result.ok) {
      // Un pseudo déjà pris se corrige dans son champ : le message va dessous, et ce qui a été
      // tapé reste, pour n'avoir qu'à le retoucher (« ines » → « ines_m »).
      if (result.error === 'handleTaken') {
        setErrors({ handle: 'handleTaken' })
        return
      }
      setMessage({ text: t(`errors.${result.error}`), ok: false })
      return
    }
    setMe(result.data) // le cache partagé reçoit le profil à jour
    setHandle(result.data.handle) // le pseudo tel qu'enregistré (« @Lea_M » devient « lea_m »)
    setTools(result.data.favoriteTools.join(', ')) // affiche la liste nettoyée (sans doublons)
    void refetchSession() // la session porte aussi le nom (affiché sur l'accueil) : on la relit
    setMessage({ text: t('profile.saved'), ok: true })
  }

  const onChangeAvatar = async () => {
    setMessage(null)
    try {
      const picked = await pickAvatar()
      if (!picked) return // le membre a annulé : rien à faire
      setBusy('avatar')
      const result = await uploadAvatar(picked)
      if (result.ok) {
        setMe(result.data)
        setMessage({ text: t('profile.avatar.updated'), ok: true })
      } else {
        setMessage({ text: avatarError(result.error), ok: false })
      }
    } catch {
      // Image illisible sur l'appareil, par exemple.
      setMessage({ text: t('errors.internal'), ok: false })
    } finally {
      // finally : exécuté dans tous les cas, réussite ou erreur.
      setBusy(null)
    }
  }

  // Pour l'avatar, des messages plus précis que les messages génériques.
  const avatarError = (error: ApiErrorKey) => {
    if (error === 'payloadTooLarge') {
      return t('profile.errors.avatarTooLarge', { max: AVATAR_MAX_BYTES / (1024 * 1024) })
    }
    if (error === 'unsupportedMediaType') return t('profile.errors.avatarType')
    return t(`errors.${error}`)
  }

  // Messages d'erreur des champs (undefined : pas d'erreur).
  const invalid = t('profile.errors.invalidCharacters')
  const nameMessages = {
    nameRequired: t('auth.errors.nameRequired'),
    nameTooLong: t('profile.errors.nameTooLong', { max: NAME_MAX_LENGTH }),
    invalidCharacters: invalid,
  }
  const nameError = errors.name && nameMessages[errors.name]
  const handleMessages = {
    handleTooShort: t('profile.errors.handleTooShort', { min: HANDLE_MIN_LENGTH }),
    handleTooLong: t('profile.errors.handleTooLong', { max: HANDLE_MAX_LENGTH }),
    handleInvalid: t('profile.errors.handleInvalid'),
    handleReserved: t('profile.errors.handleReserved'),
    handleTaken: t('errors.handleTaken'),
  }
  const handleError = errors.handle && handleMessages[errors.handle]
  const bioError =
    errors.bio === 'invalidCharacters'
      ? invalid
      : errors.bio && t('profile.errors.bioTooLong', { max: BIO_MAX_LENGTH })
  const toolsError =
    errors.tools === 'invalidCharacters'
      ? invalid
      : errors.tools &&
        t(`profile.errors.${errors.tools}`, {
          max: errors.tools === 'tooManyTools' ? FAVORITE_TOOLS_MAX : TOOL_MAX_LENGTH,
        })

  const back = useGoBack('/account')
  const save = { label: t('profile.save'), onPress: () => void onSave(), loading: busy === 'save' }

  const notice = message ? (
    <Notice tone={message.ok ? 'success' : 'error'} message={message.text} />
  ) : null

  return (
    <Screen
      pageTitle={t('profile.title')}
      // Sur téléphone, « Annuler » et « Enregistrer » restent en haut, à portée de pouce ; sur
      // ordinateur, la barre de navigation en haut et les deux boutons sous le formulaire.
      header={
        wide ? (
          <TopNav />
        ) : (
          <SheetHeader
            title={t('profile.title')}
            cancel={{ label: t('common.cancel'), onPress: back }}
            action={save}
          />
        )
      }
      stickyHeader={!wide}
      {...(wide ? null : { notice })}
      {...(wide ? { title: t('profile.title') } : null)}
    >
      <Stack gap="md" align="center">
        <Avatar
          name={name}
          source={toSource(me.avatarUrl)}
          label={t('profile.avatar.label')}
          size={132}
        />
        <Button
          label={t('profile.avatar.change')}
          variant="glass"
          size="compact"
          icon="camera"
          onPress={onChangeAvatar}
          loading={busy === 'avatar'}
        />
        <Row gap="sm" align="start">
          <Icon name="shield-check" size={18} tone="amber" />
          <Stack grow>
            <Text variant="caption" tone="muted">
              {t('profile.avatar.privacy')}
            </Text>
          </Stack>
        </Row>
      </Stack>

      <FieldGroup>
        <TextField
          label={t('profile.fields.name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={NAME_MAX_LENGTH}
          showCount
          error={nameError}
        />
        {/* Le « @ » est affiché devant, pas dans la valeur : on tape « ines », on lit « @ines ».
            Taper le « @ » quand même ne gêne pas : il est retiré avant l'envoi. */}
        <TextField
          label={t('profile.fields.handle')}
          value={handle}
          onChangeText={setHandle}
          prefix="@"
          autoCorrect={false}
          spellCheck={false}
          hint={t('profile.fields.handleHint')}
          error={handleError}
        />
        <TextField
          label={t('profile.fields.bio')}
          value={bio}
          onChangeText={setBio}
          autoCapitalize="sentences"
          multiline
          // Pas de maxLength ici : le compteur montre la limite sans couper le texte en plein milieu.
          limit={BIO_MAX_LENGTH}
          showCount
          error={bioError}
        />
      </FieldGroup>
      <TagInput
        label={t('profile.fields.tools')}
        values={parseTools(tools)}
        onChange={(list) => setTools(list.join(', '))}
        placeholder={t('profile.fields.toolsPlaceholder')}
        removeLabel={(item) => t('common.remove', { item })}
        limit={t('profile.fields.toolsLimit', { max: FAVORITE_TOOLS_MAX })}
        error={toolsError || undefined}
      />

      {/* Sur téléphone, le message est dans la barre fixe, en vue du bouton « Enregistrer ». */}
      {wide && notice}
      {wide ? (
        <Row gap="md" justify="end">
          <Button label={t('common.cancel')} variant="secondary" onPress={back} />
          <Button {...save} />
        </Row>
      ) : null}
    </Screen>
  )
}
