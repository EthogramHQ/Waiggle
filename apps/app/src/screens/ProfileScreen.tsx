// Page « Mon profil » : photo, nom, pseudo, bio et outils favoris du membre connecté.
// Les réglages d'e-mail (tranche 6c), qui étaient au bas de cette page, vivent depuis R2 dans la
// rubrique « Notifications » des réglages (screens/settings/EmailSettings.tsx).
// Un compte suspendu (tranche 7c) lit son profil sans pouvoir le modifier.
// Depuis la tranche R2, tout se passe dans une feuille posée sur la page (ui/Sheet.tsx) : la photo
// floutée en tête, « Changer la photo » qui la chevauche, « Enregistrer » collé en bas ; sur
// ordinateur, l'aperçu de sa page à droite, qui suit ce qu'on tape. « Fermer » revient aux
// réglages. Les règles du profil, elles, ne changent pas.
import {
  AVATAR_MAX_BYTES,
  BIO_MAX_LENGTH,
  FAVORITE_TOOLS_MAX,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_RESERVATION_DAYS,
  type Me,
  NAME_MAX_LENGTH,
  TOOL_MAX_LENGTH,
} from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMemberSession } from '../accounts/session'
import type { ApiErrorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { pickAvatar, updateProfile, uploadAvatar } from '../profile/api'
import {
  type ProfileForm as FormValues,
  type ProfileFormErrors,
  parseTools,
  toProfileUpdate,
} from '../profile/form'
import { useMe, useSetMe } from '../profile/hooks'
import { AvatarCover } from '../ui/AvatarCover'
import { Button } from '../ui/Button'
import { focusAndReveal } from '../ui/focus'
import { Icon } from '../ui/Icon'
import { MemberHeader } from '../ui/MemberHeader'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { TagInput } from '../ui/TagInput'
import { Text } from '../ui/Text'
import { FieldGroup, TextField, type TextFieldInput } from '../ui/TextField'
import { useCalmMotion } from '../ui/theme/motion'
import { LoadErrorScreen, LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

export function ProfileScreen() {
  const { state, session, retry } = useMemberSession()
  const me = useMe(Boolean(session))

  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />
  if (me.error) {
    return (
      <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} fallback="/account" />
    )
  }
  if (!me.data) return <LoadingScreen />
  // Un compte suspendu (tranche 7c) ne modifie plus son profil : il le lit tel que les autres le
  // voient. Ses réglages d'e-mail restent permis, dans la rubrique « Notifications ».
  if (me.data.suspension) return <LockedProfile me={me.data} />
  // Le formulaire n'est affiché qu'une fois le profil chargé : il part ainsi des bonnes valeurs.
  return <ProfileForm me={me.data} />
}

/**
 * « Mon profil » pendant une suspension : ni champ, ni photo à changer, ni « Enregistrer » (l'API
 * refuserait tout changement autre que la langue). Une phrase dit pourquoi, puis le profil tel
 * que les autres membres le lisent (le même en-tête que sa page). La barre du haut, sur toutes
 * les largeurs, porte le bandeau de la suspension.
 */
function LockedProfile({ me }: { me: Me }) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const sheet = useRouteSheet('/settings')
  const title = t(($) => $.profile.title)
  return (
    // La même feuille, sans champ : le titre « Mon profil » (niveau 1, la feuille est toute la
    // page), puis le profil tel que les autres le lisent (son nom en niveau 2).
    <Screen pageTitle={title}>
      <Sheet open={sheet.open} onClose={sheet.close} title={title} heading={1}>
        {/* Lue à son tour (role « status ») : elle est là dès l'ouverture, ce n'est pas une alerte. */}
        <Notice tone="info" message={t(($) => $.suspension.profileLocked)} polite />
        <MemberHeader
          name={me.name}
          handle={t(($) => $.member.handle, { handle: me.handle })}
          avatar={toSource(me.avatarUrl)}
          bio={me.bio}
          toolsTitle={t(($) => $.member.favoriteTools)}
          // De simples pastilles : le profil ne connaît que le nom des outils, pas leur étiquette.
          tools={me.favoriteTools.map((tool) => ({ label: tool }))}
          heading={2}
        />
      </Sheet>
    </Screen>
  )
}

type Message = { text: string; ok: boolean } | null

function ProfileForm({ me }: { me: Me }) {
  const { t } = useTranslation()
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

  // Ce que le membre a tapé en dernier, lu au retour de l'API. useRef garde une valeur sans
  // redessiner l'écran : après l'attente, onSave lit ici le texte d'à présent, alors que name,
  // handle… lui donneraient celui du moment de l'envoi.
  const typed = useRef<FormValues>({ name, handle, bio, tools })
  // Un envoi à la fois : Entrée tapée deux fois, ou Entrée puis « Enregistrer », n'envoie qu'une
  // fois (l'état busy, lui, n'est à jour qu'au dessin suivant).
  const saving = useRef(false)
  // Les champs, dans l'ordre de la feuille : un refus amène le premier en erreur dans l'écran, avec
  // le focus. Sinon, l'erreur d'un champ du bas (les outils) restait sous le pied collé, et le focus
  // sur « Enregistrer » (relecture de design R2, comme la feuille de suppression).
  const inputs = {
    name: useRef<TextFieldInput>(null),
    handle: useRef<TextFieldInput>(null),
    bio: useRef<TextFieldInput>(null),
    tools: useRef<TextFieldInput>(null),
  }
  const calm = useCalmMotion()
  const revealFirst = (found: ProfileFormErrors) => {
    const first = (['name', 'handle', 'bio', 'tools'] as const).find((field) => found[field])
    if (first) focusAndReveal(inputs[first].current, calm)
  }

  /**
   * Ce qui se passe à chaque lettre tapée dans un champ : la valeur change, et l'erreur de ce champ
   * s'efface (le membre est en train de corriger ; on revérifie au prochain envoi).
   */
  const edit =
    <K extends keyof ProfileFormErrors & keyof FormValues>(
      field: K,
      setValue: (value: string) => void,
    ) =>
    (value: string) => {
      typed.current = { ...typed.current, [field]: value }
      setValue(value)
      setErrors((previous) => {
        if (!previous[field]) return previous
        const { [field]: _cleared, ...others } = previous
        return others
      })
    }

  const onSave = async () => {
    if (saving.current) return
    // Le dernier message reste en place pendant l'envoi, juste au-dessus d'« Enregistrer » : effacé
    // au départ, il faisait bouger le bouton sous le doigt (le panneau d'ordinateur, centré,
    // rétrécissait). La réponse le remplace (relecture de l'interface, C9 ; charte, 6c).
    // Le formulaire tel qu'envoyé, pour savoir au retour ce qui a changé entre-temps.
    const sent = typed.current
    // On vérifie avant d'envoyer : le membre voit tout de suite ce qui ne va pas.
    // me.handle : le pseudo enregistré. Retapé tel quel, il n'est pas envoyé (ce n'est pas un
    // changement, et il ne compte pas dans la limite de changements par jour).
    const former = me.handle
    const checked = toProfileUpdate(sent, former)
    if (!checked.ok) {
      // Rien n'est envoyé : les champs disent ce qui ne va pas, et un ancien « Enregistré » ne
      // reste pas à côté d'eux.
      setMessage(null)
      setErrors(checked.errors)
      revealFirst(checked.errors)
      return
    }
    setErrors({})
    saving.current = true
    setBusy('save')
    const result = await updateProfile(checked.changes).finally(() => {
      saving.current = false
      setBusy(null)
    })
    // Pendant l'attente, le membre a pu continuer à taper (une réponse lente, sur un train) : on
    // ne touche pas à un champ qui a changé depuis l'envoi.
    const handleKept = typed.current.handle === sent.handle
    if (!result.ok) {
      // Un pseudo déjà pris, ou changé trop souvent aujourd'hui, se corrige dans son champ : le
      // message va dessous (le champ l'annonce), et ce qui a été tapé reste, pour n'avoir qu'à
      // le retoucher (« ines » → « ines_m »). Si le pseudo a déjà été retouché, le message parle
      // d'un texte qui n'est plus là : il va dans le message général.
      if ((result.error === 'handleTaken' || result.error === 'handleChangeLimit') && handleKept) {
        setMessage(null)
        setErrors({ handle: result.error })
        revealFirst({ handle: result.error })
        return
      }
      setMessage({ text: t(($) => $.errors[result.error]), ok: false })
      return
    }
    setMe(result.data) // le cache partagé reçoit le profil à jour
    // Les champs non retouchés prennent leur forme enregistrée : le pseudo nettoyé (« @Lea_M »
    // devient « lea_m »), la liste des outils sans doublons.
    if (handleKept) {
      typed.current = { ...typed.current, handle: result.data.handle }
      setHandle(result.data.handle)
    }
    if (typed.current.tools === sent.tools) {
      const cleaned = result.data.favoriteTools.join(', ')
      typed.current = { ...typed.current, tools: cleaned }
      setTools(cleaned)
    }
    void refetchSession() // la session porte aussi le nom (affiché sur l'accueil) : on la relit
    // Un nouveau pseudo : l'ancien reste réservé au membre quelque temps, on le lui dit.
    setMessage({
      text:
        result.data.handle === former
          ? t(($) => $.profile.saved)
          : t(($) => $.profile.savedHandle, { former, days: HANDLE_RESERVATION_DAYS }),
      ok: true,
    })
  }

  const onChangeAvatar = async () => {
    // Le dernier message reste jusqu'au résultat (ou jusqu'au bout, si le membre annule le choix).
    try {
      const picked = await pickAvatar()
      if (!picked) return // le membre a annulé : rien à faire
      setBusy('avatar')
      const result = await uploadAvatar(picked)
      if (result.ok) {
        setMe(result.data)
        setMessage({ text: t(($) => $.profile.avatar.updated), ok: true })
      } else {
        setMessage({ text: avatarError(result.error), ok: false })
      }
    } catch {
      // Image illisible sur l'appareil, par exemple.
      setMessage({ text: t(($) => $.errors.internal), ok: false })
    } finally {
      // finally : exécuté dans tous les cas, réussite ou erreur.
      setBusy(null)
    }
  }

  // Pour l'avatar, des messages plus précis que les messages génériques.
  const avatarError = (error: ApiErrorKey) => {
    if (error === 'payloadTooLarge') {
      return t(($) => $.profile.errors.avatarTooLarge, { max: AVATAR_MAX_BYTES / (1024 * 1024) })
    }
    if (error === 'unsupportedMediaType') return t(($) => $.profile.errors.avatarType)
    return t(($) => $.errors[error])
  }

  // Messages d'erreur des champs (undefined : pas d'erreur).
  const invalid = t(($) => $.profile.errors.invalidCharacters)
  const nameMessages = {
    nameRequired: t(($) => $.auth.errors.nameRequired),
    nameTooLong: t(($) => $.profile.errors.nameTooLong, { max: NAME_MAX_LENGTH }),
    invalidCharacters: invalid,
  }
  const nameError = errors.name && nameMessages[errors.name]
  const handleMessages = {
    handleTooShort: t(($) => $.profile.errors.handleTooShort, { min: HANDLE_MIN_LENGTH }),
    handleTooLong: t(($) => $.profile.errors.handleTooLong, { max: HANDLE_MAX_LENGTH }),
    handleInvalid: t(($) => $.profile.errors.handleInvalid),
    handleReserved: t(($) => $.profile.errors.handleReserved),
    handleTaken: t(($) => $.errors.handleTaken),
    handleChangeLimit: t(($) => $.errors.handleChangeLimit),
  }
  const handleError = errors.handle && handleMessages[errors.handle]
  const bioError =
    errors.bio === 'invalidCharacters'
      ? invalid
      : errors.bio && t(($) => $.profile.errors.bioTooLong, { max: BIO_MAX_LENGTH })
  const toolsKey = errors.tools
  const toolsError =
    toolsKey === 'invalidCharacters'
      ? invalid
      : toolsKey &&
        t(($) => $.profile.errors[toolsKey], {
          max: toolsKey === 'tooManyTools' ? FAVORITE_TOOLS_MAX : TOOL_MAX_LENGTH,
        })

  // « Fermer » revient aux réglages (la page d'avant, ou /settings par un lien direct).
  const sheet = useRouteSheet('/settings')
  const title = t(($) => $.profile.title)
  const save = {
    label: t(($) => $.profile.save),
    onPress: () => void onSave(),
    loading: busy === 'save',
  }
  // Entrée dans un champ d'une ligne enregistre, comme dans un formulaire web.
  const submitOnEnter = { onSubmitEditing: save.onPress, returnKeyType: 'done' } as const

  // Le message de l'envoi, dans le pied (Sheet `notice`) : une alerte pour un refus, un statut poli
  // pour « Profil enregistré. ».
  const notice = message
    ? message.ok
      ? { message: message.text, tone: 'success' as const, polite: true }
      : { message: message.text }
    : null
  const avatar = toSource(me.avatarUrl)

  return (
    <Screen pageTitle={title}>
      <Sheet
        open={sheet.open}
        onClose={sheet.close}
        title={title}
        // La feuille est toute la page : son titre est celui de la page (niveau 1).
        heading={1}
        // « Enregistrer » collé en bas, toujours à portée de pouce ; le message juste au-dessus,
        // en vue du bouton, même après un appui depuis le haut d'un long formulaire.
        notice={notice}
        footer={<Button {...save} />}
        // Sur ordinateur, l'aperçu de sa page, à droite : il suit ce qui est tapé, avant même
        // « Enregistrer » (rien n'est envoyé pour autant).
        // Sa légende, « Aperçu de ta page », dit ce qu'est ce second nom en grand : un titre de
        // niveau 2 sous celui de la feuille, et le nom du membre en niveau 3, dans l'aperçu.
        // La légende est dans la carte de l'aperçu, sur son fond blanc : posée sur le voile, son
        // gris tombait à 2,7:1 de jour (relecture de design R2 ; 5,6:1 sur la carte).
        aside={
          <Surface variant="plain" padding="xl">
            <Stack gap="lg">
              <Text variant="caption" tone="muted" heading={2}>
                {t(($) => $.profile.previewTitle)}
              </Text>
              <MemberHeader
                name={name.trim() || me.name}
                handle={t(($) => $.member.handle, { handle: handle.trim() || me.handle })}
                avatar={avatar}
                bio={bio.trim()}
                toolsTitle={t(($) => $.member.favoriteTools)}
                tools={parseTools(tools).map((tool) => ({ label: tool }))}
                heading={3}
              />
            </Stack>
          </Surface>
        }
      >
        <AvatarCover
          name={name}
          source={avatar}
          label={t(($) => $.profile.avatar.label)}
          action={{
            label: t(($) => $.profile.avatar.change),
            onPress: () => void onChangeAvatar(),
            loading: busy === 'avatar',
          }}
        />
        <Row gap="sm" align="start">
          <Icon name="shield-check" size={18} tone="amber" />
          <Stack grow>
            <Text variant="caption" tone="muted">
              {t(($) => $.profile.avatar.privacy)}
            </Text>
          </Stack>
        </Row>

        <FieldGroup>
          <TextField
            label={t(($) => $.profile.fields.name)}
            // R3 (relecture juridique, jur-J3) : dire, là où l'on choisit son nom, que la
            // recherche trouve les membres par leur nom et leur pseudo.
            hint={t(($) => $.profile.searchable)}
            value={name}
            onChangeText={edit('name', setName)}
            inputRef={inputs.name}
            autoCapitalize="words"
            maxLength={NAME_MAX_LENGTH}
            showCount
            error={nameError}
            {...submitOnEnter}
          />
          {/* Le « @ » est affiché devant, pas dans la valeur : on tape « ines », on lit « @ines ».
            Taper le « @ » quand même ne gêne pas : il est retiré avant l'envoi. Le compteur
            montre la limite sans couper (pas de maxLength) : un « @ » collé ne prend pas la
            place d'une lettre. autoComplete « off » : le navigateur ne propose pas d'adresse. */}
          <TextField
            label={t(($) => $.profile.fields.handle)}
            value={handle}
            onChangeText={edit('handle', setHandle)}
            inputRef={inputs.handle}
            prefix="@"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            limit={HANDLE_MAX_LENGTH}
            showCount
            hint={t(($) => $.profile.fields.handleHint, {
              min: HANDLE_MIN_LENGTH,
              max: HANDLE_MAX_LENGTH,
            })}
            error={handleError}
            {...submitOnEnter}
          />
          <TextField
            label={t(($) => $.profile.fields.bio)}
            value={bio}
            onChangeText={edit('bio', setBio)}
            inputRef={inputs.bio}
            autoCapitalize="sentences"
            multiline
            // Pas de maxLength ici : le compteur montre la limite sans couper le texte en plein milieu.
            limit={BIO_MAX_LENGTH}
            showCount
            error={bioError}
          />
        </FieldGroup>
        <TagInput
          label={t(($) => $.profile.fields.tools)}
          values={parseTools(tools)}
          onChange={(list) => edit('tools', setTools)(list.join(', '))}
          placeholder={t(($) => $.profile.fields.toolsPlaceholder)}
          removeLabel={(item) => t(($) => $.common.remove, { item })}
          limit={t(($) => $.profile.fields.toolsLimit, { max: FAVORITE_TOOLS_MAX })}
          error={toolsError || undefined}
          inputRef={inputs.tools}
        />
      </Sheet>
    </Screen>
  )
}
