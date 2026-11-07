// Le champ compact des commentaires (R5b) : fixé en bas de la feuille sur téléphone, sous la liste
// dans la colonne de droite sur ordinateur. De haut en bas :
// - le bandeau « Réponse à Léa Moreau » ou « Modifier ton commentaire », avec sa croix ;
// - l'erreur d'un envoi raté, avec « Réessayer » ;
// - la rangée : la photo du membre, le champ (qui propose des mentions après « @ », et grandit jusqu'à
//   5 lignes), le bouton d'envoi : une flèche ronde dans la feuille, « Envoyer » dans la colonne ;
// - « N caractères de trop. » si le texte dépasse la limite, puis la légende, qui dit qui lira.
//
// Le composant ne garde aucun texte : l'écran (`useCommentDraft`) le lui donne, décide de la légende
// et du bandeau. Il garde ce qui se règle ici, repris de `NoteComposer` :
// - rien ne part d'un champ vide, fait d'espaces ou trop long ; un double toucher n'envoie qu'une fois ;
// - pendant l'envoi, le texte est figé (ce qui part est ce qu'on voit), le bouton est annoncé occupé,
//   et la croix attend (« Annuler » mentirait : le commentaire part quand même) ;
// - l'erreur reste affichée pendant un nouvel envoi : elle disparaîtrait au moment où l'on touche
//   « Réessayer », et la rangée sauterait sous le doigt dans la colonne ;
// - le focus ne se perd jamais : un contrôle qui disparaît ou devient inactif le rend au champ.
//
// Le membre suspendu n'a pas ce champ du tout : l'écran ne le rend pas (relecture du plan, ui-I1).
import { layout, space } from '@ruche/brand'
import { COMMENT_COUNTER_FROM, COMMENT_MAX } from '@ruche/contracts'
import { type Ref, useEffect, useId, useImperativeHandle, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { focusWithoutScroll, holdsFocus } from './focus'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'
import type { ImageSource } from './image'
import { escapeCloses } from './keyboard'
import { MentionField, type MentionSuggestion } from './MentionField'
import { Notice, type NoticeAction } from './Notice'
import { Text } from './Text'
import type { TextFieldInput } from './TextField'
import { useTapGuard } from './tapGuard'

/** Ce que dit le bandeau au-dessus du champ : à qui l'on répond, ou que l'on modifie ; sinon rien. */
export type CommentBanner = { kind: 'reply'; name: string } | { kind: 'edit' } | null

type Props = {
  value: string
  onChangeText: (text: string) => void
  /** Le membre envoie : seulement avec un texte qui peut partir, et une seule fois par double tape. */
  onSend: () => void
  /** L'envoi est en route : le bouton est annoncé occupé, le texte et la croix attendent. */
  pending: boolean
  /** L'envoi a échoué : le message, au-dessus du champ (le texte reste dans le champ). */
  error?: string | undefined
  /** Ce qu'on peut faire après le message (« Réessayer », « Me reconnecter »). */
  errorAction?: NoticeAction | undefined
  banner: CommentBanner
  /** La croix du bandeau, ou Échap dans le champ. Le focus revient au champ. */
  onCancelBanner: () => void
  /** La légende : qui lira ce commentaire. C'est l'écran qui la choisit (relecture jur-P1). */
  caption: string
  avatar: ImageSource | null
  memberName: string
  /** `sheet` : la feuille d'un téléphone (la flèche ronde) ; `column` : la colonne d'un ordinateur. */
  place: 'sheet' | 'column'
  /** Les membres à proposer après « @ », et la recherche à laquelle ils répondent (MentionField). */
  suggestions: readonly MentionSuggestion[]
  suggestionsFor: string | null
  onQueryChange: (query: string | null) => void
  /** La saisie, pour que l'écran y pose le focus (« Répondre », après un envoi). */
  inputRef: Ref<TextFieldInput>
}

/** La taille de la photo, en points : plus petite que la rangée d'un champ d'une ligne (44). */
const PHOTO_SIZE = 36

/** Les icônes du bandeau : la flèche de « Répondre », le crayon de « Modifier ». */
const BANNER_ICON: Record<'reply' | 'edit', IconName> = {
  reply: 'arrow-bend-up-left',
  edit: 'pencil-simple',
}

/** Rend le focus au champ. Sur le web, sans défiler ; sur téléphone, le clavier reste ouvert. */
const focusField = (field: TextFieldInput | null) => {
  if (Platform.OS === 'web') focusWithoutScroll(field)
  else field?.focus()
}

/** Sur le web, le focus est-il retombé sur la page ? (L'élément qui l'avait a disparu.) */
const focusFell = () => {
  const document = (globalThis as { document?: { activeElement: unknown; body: unknown } }).document
  return !document?.activeElement || document.activeElement === document.body
}

export function CommentComposer({
  value,
  onChangeText,
  onSend,
  pending,
  error,
  errorAction,
  banner,
  onCancelBanner,
  caption,
  avatar,
  memberName,
  place,
  suggestions,
  suggestionsFor,
  onQueryChange,
  inputRef,
}: Props) {
  const { t } = useTranslation()
  const input = useRef<TextFieldInput>(null)
  // La même saisie, partagée avec l'écran (useImperativeHandle : ce que voit la `ref` du parent).
  useImperativeHandle(inputRef, () => input.current as TextFieldInput)
  const sendControl = useRef<View>(null)
  // useTapGuard : une `ref`, car la seconde tape arrive avant que l'écran ait pu passer `pending`.
  const guard = useTapGuard()
  // La sienne pour l'action sous le message : « Réessayer » suit un envoi raté de près, et ce n'est
  // pas la seconde tape de la flèche, posée ailleurs ; seule sa propre double tape se garde.
  const actionGuard = useTapGuard()
  // useId : des identifiants stables, qui relient le champ aux textes qui le décrivent (web).
  const bannerId = useId()
  const tooLongId = useId()
  const captionId = useId()

  // Compté comme la limite du serveur (`value.length`, les unités du `max` de Zod), comme le compteur.
  const over = value.length - COMMENT_MAX
  const tooLong = over > 0 ? t(($) => $.project.comments.tooLong, { count: over }) : ''
  const blocked = value.trim() === '' || over > 0

  const send = () => {
    if (!pending && !blocked) guard(onSend)()
  }

  // La région vivante polie dit le dépassement sur le web et sur Android ; iOS n'en a pas : on demande
  // à VoiceOver de lire chaque nouveau texte (comme `LiveStatus`).
  useEffect(() => {
    if (tooLong !== '' && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(tooLong)
  }, [tooLong])

  // Le bouton d'envoi devient inactif avec le focus (le commentaire est parti, le champ s'est vidé) :
  // inactif, Tab ne le retrouverait plus. Le focus revient au champ, pour écrire la suite.
  useEffect(() => {
    if (blocked && holdsFocus(sendControl.current)) focusField(input.current)
  }, [blocked])

  // Le dernier message reste pendant un nouvel envoi (voir en tête du fichier). Une `ref` écrite
  // pendant le rendu : elle ne fait que retenir ce qu'on vient de recevoir.
  const shownError = useRef({ error, errorAction })
  if (!pending || error) shownError.current = { error, errorAction }
  const message = shownError.current.error
  const action = shownError.current.errorAction

  // « Réessayer » a réussi : le lien qui avait le focus a disparu avec le message.
  const hadMessage = useRef(false)
  useEffect(() => {
    const gone = hadMessage.current && !message
    hadMessage.current = Boolean(message)
    if (gone && Platform.OS === 'web' && focusFell()) focusField(input.current)
  }, [message])

  const cancelBanner = () => {
    onCancelBanner()
    focusField(input.current)
  }

  const bannerText =
    banner?.kind === 'reply'
      ? t(($) => $.project.comments.replyTo, { name: banner.name })
      : banner?.kind === 'edit'
        ? t(($) => $.project.comments.editing)
        : ''
  // Le focus arrive dans le champ quand on touche « Répondre » : le lecteur d'écran y lit à qui l'on
  // répond, puis qui lira, sans région vivante de plus (voir `describedElsewhere` de TextField).
  const describedElsewhere = {
    ids: [banner ? bannerId : null, tooLong ? tooLongId : null, captionId]
      .filter(Boolean)
      .join(' '),
    spoken: [bannerText, tooLong, caption].filter(Boolean).join(' '),
  }

  return (
    <View style={{ gap: space.sm }}>
      {banner ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name={BANNER_ICON[banner.kind]} size={18} tone="muted" />
          {/* minWidth 0 : un nom long passe à la ligne au lieu de pousser la croix hors de l'écran. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text nativeID={bannerId} variant="callout" tone="secondary">
              <BannerWords text={bannerText} name={banner.kind === 'reply' ? banner.name : null} />
            </Text>
          </View>
          <IconButton
            icon="x"
            variant="plain"
            label={
              banner.kind === 'reply'
                ? t(($) => $.project.comments.cancelReply)
                : t(($) => $.project.comments.cancelEdit)
            }
            onPress={cancelBanner}
            disabled={pending}
          />
        </View>
      ) : null}
      {message ? (
        <Notice
          message={message}
          action={
            action && {
              ...action,
              // Pendant un nouvel envoi, et sur une double tape, « Réessayer » ne renvoie rien.
              onPress: () => {
                if (!pending) actionGuard(action.onPress)()
              },
            }
          }
        />
      ) : null}
      {/* En bas : quand le champ grandit, ses voisins ne bougent pas sous le doigt (le champ est collé
          au bas de la feuille, il grandit vers le haut). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        {/* La photo est un décor : son nom n'apporte rien à qui écrit. Dans une boîte haute d'une
            ligne de champ, pour rester centrée sur lui quand il n'a qu'une ligne. */}
        <View aria-hidden style={{ height: layout.touchTarget, justifyContent: 'center' }}>
          <Avatar name={memberName} source={avatar} label={memberName} size={PHOTO_SIZE} />
        </View>
        {/* minWidth 0 : sans lui, un champ du navigateur déborde de la rangée à texte agrandi. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <MentionField
            // Échap referme le bandeau, comme la croix (web), sauf pendant l'envoi. Sans bandeau, elle
            // fait ce qu'elle fait d'habitude. (Avec une liste de membres, elle la referme d'abord.)
            {...(banner ? escapeCloses(cancelBanner, pending) : null)}
            inputRef={input}
            label={t(($) => $.project.comments.add)}
            placeholder={t(($) => $.project.comments.add)}
            value={value}
            onChangeText={onChangeText}
            compact
            multiline
            maxLines={5}
            limit={COMMENT_MAX}
            countFrom={COMMENT_COUNTER_FROM}
            invalid={over > 0}
            describedElsewhere={describedElsewhere}
            autoCapitalize="sentences"
            editable={!pending}
            suggestions={suggestions}
            suggestionsFor={suggestionsFor}
            suggestionsLabel={t(($) => $.mentions.suggestions)}
            suggestionsPlacement="above"
            suggestionsTitle={t(($) => $.mentions.title)}
            onQueryChange={onQueryChange}
          />
        </View>
        {place === 'sheet' ? (
          <IconButton
            ref={sendControl}
            icon="arrow-up"
            variant="honey"
            label={t(($) => $.project.comments.sendLabel)}
            onPress={send}
            disabled={blocked}
            loading={pending}
          />
        ) : (
          // Blanc, pas miel : sur la page d'un projet, l'action miel est « Tester la démo ».
          <Button
            ref={sendControl}
            icon="arrow-up"
            variant="secondary"
            size="compact"
            label={t(($) => $.project.comments.send)}
            spokenLabel={t(($) => $.project.comments.sendLabel)}
            onPress={send}
            disabled={blocked}
            loading={pending}
          />
        )}
      </View>
      {/* Dans la colonne, sous le champ, au bord de son texte ; dans la feuille, où la place manque,
          sur toute la largeur. */}
      <View style={place === 'column' ? { paddingLeft: PHOTO_SIZE + space.sm } : undefined}>
        {/* La région existe toujours, même vide : un lecteur d'écran ne suit que les régions qu'il
            connaît déjà. Polie : elle n'interrompt pas la frappe. Vide, elle ne prend aucune place. */}
        <View nativeID={tooLongId} aria-live="polite">
          {tooLong ? (
            <View style={{ paddingBottom: space.xxs }}>
              <Text variant="caption" tone="danger" weight={600}>
                {tooLong}
              </Text>
            </View>
          ) : null}
        </View>
        <Text nativeID={captionId} variant="caption" tone="muted">
          {caption}
        </Text>
      </View>
    </View>
  )
}

/**
 * Le texte du bandeau, le nom en gras (« Réponse à **Léa Moreau** »). Le gras se pose sur le texte déjà
 * traduit : la phrase reste à la traduction, et elle reste un seul texte lu.
 */
function BannerWords({ text, name }: { text: string; name: string | null }) {
  const at = name ? text.indexOf(name) : -1
  if (name === null || at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <Text variant="callout" tone="default" weight={700}>
        {name}
      </Text>
      {text.slice(at + name.length)}
    </>
  )
}
