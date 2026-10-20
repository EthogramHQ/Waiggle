// Un champ de saisie avec son étiquette, une aide facultative, un compteur et un message d'erreur.
// Présentation « réglages » : un groupe blanc arrondi, l'étiquette en petit au-dessus de la valeur.
// Plusieurs champs placés dans un <FieldGroup> partagent le même groupe, séparés par un trait.
//
// L'étiquette est aussi donnée aux lecteurs d'écran (accessibilityLabel) : c'est ce qui permet à une
// personne aveugle de savoir quoi taper, et aux tests de retrouver le champ par son nom. L'aide et
// l'erreur lui sont liées aussi : lues après le nom quand on arrive sur le champ, et l'erreur
// annoncée dès qu'elle apparaît (voir Message, plus bas).
import { borders, layout, radii, space, textStyles } from '@ruche/brand'
import {
  Children,
  createContext,
  Fragment,
  type ReactNode,
  type Ref,
  useContext,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, TextInput, type TextInputProps, View } from 'react-native'
import { comboboxLinks, describedBy, invalid } from './aria'
import { Icon } from './Icon'
import { Text, type Tone } from './Text'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  value: string
  onChangeText: (text: string) => void
  hint?: string | undefined
  error?: string | undefined
  /** Affiche « 42 / 140 » à côté de l'étiquette (la limite : maxLength, ou `limit`). */
  showCount?: boolean
  /** Une limite seulement affichée : on peut la dépasser, l'erreur vient à l'enregistrement. */
  limit?: number
  /** Un petit texte à droite de l'étiquette (« 12 caractères minimum »). */
  aside?: string
  /** Une confirmation sous le champ, en vert (« Lien vérifié »). Une erreur passe avant. */
  success?: string | undefined
  /**
   * Un signe collé devant la saisie, qui n'en fait pas partie (« @ » devant un pseudo) : il dit la
   * forme attendue sans que le membre ait à le taper. Décoratif : l'étiquette dit déjà ce qu'on tape.
   */
  prefix?: string
  /** Une poignée vers la saisie elle-même : pour y remettre le focus (MentionField). */
  inputRef?: Ref<TextInput>
  /** Le champ a perdu le focus (en plus de ce que le champ en fait lui-même). */
  onBlur?: () => void
  /**
   * Le champ propose une liste de choix pendant qu'on tape (rôle « combobox », MentionField) :
   * la liste est-elle ouverte, son identifiant, et le choix en surbrillance s'il y en a un.
   */
  combobox?: { expanded: boolean; listId: string; activeId?: string | undefined }
} & Pick<
  TextInputProps,
  | 'secureTextEntry'
  | 'autoCorrect'
  | 'spellCheck'
  | 'autoComplete'
  | 'keyboardType'
  | 'textContentType'
  | 'multiline'
  | 'maxLength'
  | 'autoCapitalize'
  | 'placeholder'
  | 'autoFocus'
  | 'editable'
  | 'onKeyPress'
  // Entrée dans un champ d'une ligne : l'écran décide (enregistrer le formulaire, par exemple).
  | 'onSubmitEditing'
  | 'returnKeyType'
  // Où est le curseur : MentionField cherche le « @pseudo » qui se tape juste avant lui.
  | 'onSelectionChange'
>

// Vrai quand le champ est dans un FieldGroup : il ne dessine alors pas son propre groupe.
const InGroup = createContext(false)

/** Le cadre blanc d'un groupe de champs. */
function GroupFrame({
  children,
  state,
}: {
  children: ReactNode
  state: 'idle' | 'focus' | 'error'
}) {
  const { colors, shadows } = useTheme()
  const border = { idle: colors.groupBorder, focus: colors.focusRing, error: colors.dangerBorder }
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: state === 'idle' ? borders.hairline : borders.strong,
        borderColor: border[state],
        boxShadow: shadows.soft,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  )
}

/** Regroupe plusieurs champs dans un même cadre, séparés par un trait fin. */
export function FieldGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  // Children.toArray : la liste des enfants, sans les vides (un champ affiché sous condition).
  const fields = Children.toArray(children)
  return (
    <InGroup.Provider value>
      <GroupFrame state="idle">
        {fields.map((field, i) => (
          <Fragment key={(field as { key?: string }).key ?? i}>
            {i > 0 ? (
              <View
                style={{
                  height: borders.hairline,
                  backgroundColor: colors.groupSeparator,
                  marginLeft: space.lg,
                }}
              />
            ) : null}
            {field}
          </Fragment>
        ))}
      </GroupFrame>
    </InGroup.Provider>
  )
}

export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  showCount = false,
  limit,
  aside,
  success,
  prefix,
  inputRef,
  onBlur,
  combobox,
  secureTextEntry = false,
  ...inputProps
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const inGroup = useContext(InGroup)
  const [focused, setFocused] = useState(false)
  // Un mot de passe est masqué, mais on peut l'afficher le temps de vérifier ce qu'on a tapé.
  const [revealed, setRevealed] = useState(false)
  // useRef : une « poignée » vers le champ dessiné, pour lui donner le focus depuis son libellé.
  const input = useRef<TextInput>(null)
  // La même saisie, partagée avec l'écran ou le composant qui l'a demandée (inputRef).
  useImperativeHandle(inputRef, () => input.current as TextInput)
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie le
  // champ au texte affiché dessous (aria-describedby).
  const messageId = useId()
  // Ce qu'on lit sous le champ : l'erreur d'abord, sinon la confirmation, sinon l'aide.
  const message = error || success || hint
  const body = textStyles.body
  const max = limit ?? inputProps.maxLength
  // Le compteur compte comme la limite : en « unités » de texte (value.length), comme maxLength et
  // les schémas Zod de l'API. Un emoji en vaut souvent deux : compter en caractères affichait
  // « 999 / 1000 » quand le champ refusait déjà la lettre suivante.
  const counted = showCount && max ? value.length : null
  const counter = counted !== null ? `${counted} / ${max}` : aside
  // À la limite, le compteur prévient (ambre) ; au-delà (limite seulement affichée), il alerte.
  const counterTone: Tone =
    counted !== null && max && counted > max
      ? 'danger'
      : counted !== null && max && counted >= max
        ? 'accent'
        : 'muted'

  const row = (
    // Toute la rangée mène au champ : toucher le libellé ou le « @ » y met le curseur, comme une
    // étiquette <label> sur une page web. accessible et focusable à faux : la rangée n'est ni un
    // bouton ni un arrêt de Tab ; le lecteur d'écran et le clavier vont droit au champ. (Une touche
    // dans le champ lui-même reste au champ : React Native le laisse gérer son toucher.)
    <Pressable
      accessible={false}
      focusable={false}
      onPress={() => {
        if (inputProps.editable !== false) input.current?.focus()
      }}
      style={{
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.sm,
        // Dans un groupe, le champ n'a pas de cadre à lui : quand il est choisi, sa ligne prend un
        // fond doux (en plus de son libellé en couleur), pour qu'on voie où l'on tape.
        ...(inGroup && focused ? { backgroundColor: colors.honeySoft } : null),
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
        <Text variant="caption" weight={600} tone={error ? 'danger' : focused ? 'accent' : 'muted'}>
          {label}
        </Text>
        {counter ? (
          <Text
            variant="caption"
            tone={counterTone}
            weight={counterTone === 'muted' ? 400 : 700}
            tabular
          >
            {counter}
          </Text>
        ) : null}
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xxs }}
      >
        {/* Le préfixe touche la saisie (« @lea », pas « @ lea ») : d'où ce rang à part, sans
            écart. aria-hidden : un lecteur d'écran lirait « arobase » à chaque passage. */}
        {/* minWidth 0 (ici et sur la saisie) : sans lui, un champ du navigateur garde sa largeur
            de départ et dépasse du cadre à texte agrandi, au lieu de rétrécir. */}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
          {prefix ? (
            <View aria-hidden>
              <Text tone="muted">{prefix}</Text>
            </View>
          ) : null}
          <TextInput
            ref={input}
            accessibilityLabel={label}
            // Ce qui est écrit sous le champ, lu après son nom : sur le web par aria-describedby
            // (le navigateur relie le champ au texte), sur téléphone par l'indice.
            accessibilityHint={Platform.OS === 'web' ? undefined : message}
            {...describedBy(message ? messageId : undefined)}
            // « Saisie invalide » : le lecteur d'écran le dit en arrivant sur le champ (web).
            {...invalid(Boolean(error))}
            // Un champ à suggestions : le lecteur d'écran annonce « liste déroulante, réduite ou
            // développée », et lit le choix en surbrillance sans quitter le champ (aria-activedescendant).
            {...(combobox
              ? {
                  role: 'combobox' as const,
                  'aria-expanded': combobox.expanded,
                  ...comboboxLinks(combobox.listId, combobox.expanded, combobox.activeId),
                }
              : null)}
            // Entrée enregistre sans quitter le champ (web) : le focus ne part pas sur la page, et
            // on peut corriger tout de suite si le serveur refuse.
            {...(Platform.OS === 'web' && inputProps.onSubmitEditing
              ? { blurOnSubmit: false }
              : null)}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              onBlur?.()
            }}
            autoCapitalize="none"
            placeholderTextColor={colors.textPlaceholder}
            // Le champ utilise la police et la taille du texte courant.
            secureTextEntry={secureTextEntry && !revealed}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: fontName(body.family, body.weight),
              fontSize: body.size,
              lineHeight: body.lineHeight,
              color: colors.text,
              minHeight: layout.touchTarget,
              paddingVertical: space.xs,
              // Sur le web, le navigateur dessine son propre contour : le groupe s'en charge déjà.
              outlineWidth: 0,
              ...(inputProps.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null),
            }}
            {...inputProps} // les autres réglages (type de clavier, saisie automatique…) sont transmis tels quels
            // Un mot de passe, même affiché, ne passe jamais par le correcteur orthographique ni par le
            // dictionnaire du clavier : certains correcteurs envoient le texte à un service en ligne,
            // et un clavier pourrait le proposer plus tard en suggestion. Placé après inputProps pour
            // qu'aucun écran ne puisse le réactiver.
            {...(secureTextEntry
              ? {
                  autoCorrect: false,
                  spellCheck: false,
                  ...(revealed && Platform.OS === 'android'
                    ? { keyboardType: 'visible-password' as const }
                    : null),
                }
              : null)}
          />
        </View>
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            onPress={() => setRevealed((previous) => !previous)}
            style={{
              width: layout.touchTarget,
              height: layout.touchTarget,
              // Rond : l'anneau de focus clavier suit sa forme.
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={revealed ? 'eye-slash' : 'eye'} size={22} tone="muted" />
          </Pressable>
        ) : null}
      </View>
      {/* Dans un groupe, le message reste dans la ligne du champ concerné. */}
      {inGroup ? <Message id={messageId} error={error} hint={hint} success={success} /> : null}
    </Pressable>
  )

  if (inGroup) return row
  return (
    <View>
      <GroupFrame state={error ? 'error' : focused ? 'focus' : 'idle'}>{row}</GroupFrame>
      <Message id={messageId} error={error} hint={hint} success={success} outside />
    </View>
  )
}

/**
 * L'erreur si elle existe, sinon la confirmation, sinon l'aide, sinon rien.
 *
 * L'erreur et la confirmation sont dans une « région vivante » polie (aria-live, que React Native
 * traduit pour Android et le web) : un texte qui y apparaît est lu par le lecteur d'écran, après ce
 * qu'il dit déjà. Le membre qui vient de toucher « Enregistrer » entend ainsi « Ce pseudo est déjà
 * pris » sans avoir à chercher le champ. La région existe toujours, même vide : un lecteur d'écran
 * ne suit que les régions déjà présentes. L'aide, elle, reste hors de la région : elle ne change
 * pas, et la relire à chaque lettre tapée après une erreur serait du bruit.
 */
function Message({
  id,
  error,
  hint,
  success,
  outside = false,
}: {
  /** L'identifiant que le champ cite dans aria-describedby. */
  id: string
  error?: string | undefined
  hint?: string | undefined
  success?: string | undefined
  outside?: boolean
}) {
  // L'écart avec le champ n'existe que s'il y a un texte : un champ sans aide garde sa hauteur.
  const padding = outside
    ? { paddingHorizontal: space.sm, paddingTop: space.sm }
    : { paddingTop: space.xxs, paddingBottom: space.xs }
  const status = error ? (
    <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', ...padding }}>
      <Icon name="warning-circle" size={16} tone="danger" />
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      </View>
    </View>
  ) : success ? (
    <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', ...padding }}>
      <Icon name="check-circle" size={16} tone="success" />
      <View style={{ flex: 1 }}>
        <Text variant="caption" weight={600} tone="success">
          {success}
        </Text>
      </View>
    </View>
  ) : null
  return (
    // nativeID devient l'attribut id sur le web : c'est lui que cite aria-describedby.
    <View nativeID={id}>
      {!status && hint ? (
        <View style={padding}>
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        </View>
      ) : null}
      <View aria-live="polite">{status}</View>
    </View>
  )
}
