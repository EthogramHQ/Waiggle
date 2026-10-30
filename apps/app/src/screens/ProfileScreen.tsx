// Page « Mon profil » : photo, nom, pseudo, bio et outils favoris du membre connecté.
// Puis la section « E-mails » (tranche 6c) : deux interrupteurs, enregistrés chacun dès qu'on le
// touche, sans passer par « Enregistrer » (qui ne concerne que le formulaire au-dessus).
// Un compte suspendu (tranche 7c) lit son profil sans pouvoir le modifier, et garde ses e-mails.
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
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useEmailPreferences, useUpdateEmailPreferences } from '../email/api'
import { firstParam } from '../navigation/params'
import { useSignInAgain } from '../navigation/signInAgain'
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
import { type Focusable, focusWithoutScroll, revealWithoutJump } from '../ui/focus'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { MemberHeader } from '../ui/MemberHeader'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Switch } from '../ui/Switch'
import { TagInput } from '../ui/TagInput'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { useHydrated } from '../ui/theme/hydration'
import { useCalmMotion } from '../ui/theme/motion'
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
  // Un compte suspendu (tranche 7c) ne modifie plus son profil : il le lit tel que les autres le
  // voient, et garde ses réglages d'e-mail.
  if (me.data.suspension) return <LockedProfile me={me.data} />
  // Le formulaire n'est affiché qu'une fois le profil chargé : il part ainsi des bonnes valeurs.
  return <ProfileForm me={me.data} />
}

/**
 * « Mon profil » pendant une suspension : ni champ, ni photo à changer, ni « Enregistrer » (l'API
 * refuserait tout changement autre que la langue). Une phrase dit pourquoi, puis le profil tel
 * que les autres membres le lisent (le même en-tête que sa page), puis les réglages d'e-mail, qui
 * restent permis. La barre du haut, sur toutes les largeurs, porte le bandeau de la suspension.
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
        <EmailSettings />
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
    setMessage(null)
    // Le formulaire tel qu'envoyé, pour savoir au retour ce qui a changé entre-temps.
    const sent = typed.current
    // On vérifie avant d'envoyer : le membre voit tout de suite ce qui ne va pas.
    // me.handle : le pseudo enregistré. Retapé tel quel, il n'est pas envoyé (ce n'est pas un
    // changement, et il ne compte pas dans la limite de changements par jour).
    const former = me.handle
    const checked = toProfileUpdate(sent, former)
    if (!checked.ok) {
      setErrors(checked.errors)
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
        setErrors({ handle: result.error })
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
    setMessage(null)
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

  const notice = message ? (
    <Notice tone={message.ok ? 'success' : 'error'} message={message.text} />
  ) : null
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
        footer={
          <>
            {notice}
            <Button {...save} />
          </>
        }
        // Sur ordinateur, l'aperçu de sa page, à droite : il suit ce qui est tapé, avant même
        // « Enregistrer » (rien n'est envoyé pour autant).
        aside={
          <Surface variant="plain" padding="xl">
            <MemberHeader
              name={name.trim() || me.name}
              handle={t(($) => $.member.handle, { handle: handle.trim() || me.handle })}
              avatar={avatar}
              bio={bio.trim()}
              toolsTitle={t(($) => $.member.favoriteTools)}
              tools={parseTools(tools).map((tool) => ({ label: tool }))}
              heading={2}
            />
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
            value={name}
            onChangeText={edit('name', setName)}
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
        />
        <EmailSettings />
      </Sheet>
    </Screen>
  )
}

/**
 * La section « E-mails » : le récap de la semaine (activé par défaut) et l'e-mail de mentions et de
 * réponses (désactivé par défaut). Chaque interrupteur s'enregistre au toucher, ce que dit la phrase
 * sous le groupe : la section n'est pas une partie du formulaire à « Enregistrer », d'où aussi son
 * propre titre, plus grand que celui d'un groupe. Entre ce titre et le groupe, la confirmation
 * (« Réglage enregistré. ») ou ce qui n'a pas marché : sur téléphone, la section est au bas de la
 * page, et un message posé sous le groupe sortait de l'écran (relecture de design, 6c).
 */
function EmailSettings() {
  const { t } = useTranslation()
  const preferences = useEmailPreferences()
  const save = useUpdateEmailPreferences()
  const signInAgain = useSignInAgain()
  const data = preferences.data
  // Arrivé depuis « Mon compte » (/profile?section=emails) : la section vient dans l'écran.
  // L'adresse n'est connue que dans le navigateur : on attend d'y être (ui/theme/hydration.ts).
  const section = firstParam(useLocalSearchParams<{ section?: string | string[] }>().section)
  const hydrated = useHydrated()
  const calm = useCalmMotion()
  const sectionRef = useRef<Focusable>(null)
  const revealed = useRef(false)

  // « Réessayer » a marché : la ligne qui portait le bouton disparaît, et le focus du clavier, qui
  // était dessus, irait tout en haut de la page. On le pose sur le premier interrupteur, dès qu'il
  // est dessiné (useEffect, après chaque dessin). focusFirst : une ref, pour ne pas redessiner.
  const firstSwitch = useRef<Focusable>(null)
  const focusFirst = useRef(false)
  useEffect(() => {
    if (!focusFirst.current || !firstSwitch.current) return
    focusFirst.current = false
    focusWithoutScroll(firstSwitch.current)
  })
  // Une nouvelle lecture en cours, demandée par « Réessayer ». React Query remet alors la requête
  // « en attente » et oublie l'erreur : sans cet état, la ligne d'erreur ferait place à
  // « Chargement… », et le bouton qui avait le focus disparaîtrait.
  const [retrying, setRetrying] = useState(false)
  // Combien de « Réessayer » ont échoué : pose à neuf l'alerte qui dit pourquoi (`detailAlert`).
  // Une alerte neuve est lue par le lecteur d'écran ; la même alerte restée en place ne serait pas
  // relue, et le membre n'entendrait que la fin de l'attente (relecture de 6c).
  const [failedRetries, setFailedRetries] = useState(0)
  const retry = () => {
    focusFirst.current = true
    setRetrying(true)
    void preferences
      .refetch()
      .then((result) => {
        // Encore un échec : le focus reste sur « Réessayer », rien à déplacer ; l'alerte est
        // posée à neuf.
        if (result.isError) {
          focusFirst.current = false
          setFailedRetries((count) => count + 1)
        }
      })
      .finally(() => setRetrying(false))
  }

  // La lecture a échoué, et il n'y a rien à montrer : pourquoi (la clé du message d'erreur),
  // gardé pendant la nouvelle lecture (`failedRead`).
  const readFailure = !data && preferences.isError ? errorKey(preferences.error) : null
  const [failedRead, setFailedRead] = useState(readFailure)
  if (readFailure !== null && readFailure !== failedRead) setFailedRead(readFailure)
  const loadFailure = data ? null : (readFailure ?? (retrying ? failedRead : null))

  // La section a sa hauteur finale (les réglages, ou la ligne qui dit qu'ils manquent) : on la fait
  // venir dans l'écran, une seule fois, au dessin suivant (requestAnimationFrame), quand sa place
  // est connue. Sur téléphone, revealWithoutJump ne fait rien : la page s'ouvre en haut.
  const settled = data !== undefined || loadFailure !== null
  useEffect(() => {
    if (!hydrated || section !== 'emails' || !settled || revealed.current) return
    const frame = requestAnimationFrame(() => {
      revealed.current = true
      revealWithoutJump(sectionRef.current, calm)
    })
    return () => cancelAnimationFrame(frame)
  }, [hydrated, section, settled, calm])

  // Ce qu'a donné le dernier changement : enregistré, ou la raison de l'échec. Pendant l'envoi du
  // suivant, le hook ne dit plus rien (ni « enregistré » ni échec) : on garde le message d'avant
  // (`shown`), sinon il disparaîtrait le temps de l'envoi et les interrupteurs, posés sous lui,
  // sauteraient deux fois sous le doigt. (Changer un état pendant le dessin est permis à un
  // composant pour lui-même : React le redessine aussitôt.)
  const outcome: ApiErrorKey | 'saved' | null = save.failure ?? (save.saved ? 'saved' : null)
  const [shown, setShown] = useState(outcome)
  if (outcome !== null && outcome !== shown) setShown(outcome)
  const last = outcome ?? shown

  // Les réglages ne sont pas encore là : une ligne d'attente, plutôt que des interrupteurs dont la
  // position serait fausse. Ils n'ont pas pu se charger : la ligne le dit, puis « Réessayer »
  // (occupé pendant la nouvelle lecture). Une session expirée : réessayer ne servirait à rien, le
  // lien de l'alerte mène à la connexion ; pas de bouton.
  const rows = data
    ? [
        <Switch
          key="weeklyRecap"
          ref={firstSwitch}
          inGroup
          label={t(($) => $.profile.emails.weeklyRecap)}
          hint={t(($) => $.profile.emails.weeklyRecapHint)}
          value={data.weeklyRecap}
          onValueChange={(weeklyRecap) => save.update({ weeklyRecap })}
        />,
        <Switch
          key="mentionEmails"
          inGroup
          label={t(($) => $.profile.emails.mentionEmails)}
          hint={t(($) => $.profile.emails.mentionEmailsHint)}
          value={data.mentionEmails}
          onValueChange={(mentionEmails) => save.update({ mentionEmails })}
        />,
      ]
    : loadFailure
      ? [
          // La ligne dit ce qui manque, et dessous pourquoi : une alerte, posée à neuf à chaque
          // échec (`detailAlert`), pour être relue même si le focus reste sur « Réessayer ». Une
          // session expirée a sa propre notice, au-dessus du groupe, avec son lien.
          <ListRow
            key="loadError"
            label={t(($) => $.profile.emails.loadError)}
            {...(loadFailure === 'unauthorized'
              ? null
              : { detail: t(($) => $.errors[loadFailure]), detailAlert: failedRetries })}
            accessory={
              loadFailure === 'unauthorized' ? null : (
                <Button
                  label={t(($) => $.common.retry)}
                  variant="secondary"
                  size="compact"
                  loading={retrying}
                  onPress={retry}
                />
              )
            }
          />,
        ]
      : [<ListRow key="loading" label={t(($) => $.common.loading)} busy />]

  // Le message entre le titre et le groupe. Une session expirée (à la lecture ou au changement) :
  // le lien mène à la connexion. Une autre panne de lecture : rien ici, la ligne du groupe dit
  // tout (ce qui manque, pourquoi, « Réessayer ») ; une alerte au-dessus redisait la même chose
  // (relecture de design globale du 22/10/2026).
  const failure = loadFailure ?? (last === 'saved' ? null : last)
  const notice =
    failure === 'unauthorized' ? (
      <Notice message={t(($) => $.states.expired)} action={signInAgain()} />
    ) : loadFailure ? null : failure ? (
      <Notice message={t(($) => $.errors[failure])} />
    ) : last === 'saved' ? (
      // Une confirmation, lue sans couper ce que disait le lecteur d'écran (role « status »).
      <Notice tone="success" message={t(($) => $.profile.emails.saved)} polite />
    ) : null

  // paddingY : un peu plus d'air au-dessus du titre, pour que la section se détache du formulaire.
  return (
    <Stack gap="md" paddingY="lg" ref={sectionRef}>
      <Text variant="heading" heading={2}>
        {t(($) => $.profile.emails.title)}
      </Text>
      {notice}
      <ListGroup
        footer={[t(($) => $.profile.emails.instant), t(($) => $.profile.emails.accountEmails)]}
      >
        {rows}
      </ListGroup>
    </Stack>
  )
}
