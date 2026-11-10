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
  useCallback,
  useContext,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Platform,
  Pressable,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native'
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
  /**
   * Le champ est en erreur, mais le message est écrit ailleurs, dans un endroit toujours en vue : le
   * pied collé d'une feuille, près du bouton touché (`Sheet` prop `notice`). Le champ prend la
   * couleur et l'état « saisie invalide » d'une erreur, sans répéter la phrase dessous (elle serait
   * lue deux fois, et cachée par le pied quand le champ est tout en bas : relecture de design R2,
   * B2). Une `error` passe avant.
   */
  invalid?: boolean
  /**
   * L'aide reste affichée sous l'erreur, au lieu de lui laisser la place : pour une aide qu'il faut
   * encore lire pour corriger (la phrase de bonne foi de « Signaler », tranche 7b).
   */
  keepHint?: boolean
  /** Affiche « 42 / 140 » à côté de l'étiquette (la limite : maxLength, ou `limit`). */
  showCount?: boolean
  /**
   * Le compteur de `showCount` écrit par l'appelant (R6a, `PromptField`) : `shown` à l'œil
   * (« 148 / 4 000 », le nombre mis en forme par la langue), `spoken` au lecteur d'écran (« 148
   * caractères sur 4 000 » : une barre oblique se lirait « barre oblique »). Le champ le cite alors
   * dans sa description : on l'entend en arrivant dessus.
   */
  counterText?: { shown: string; spoken: string }
  /** La saisie en chasse fixe, comme un bloc de code (un prompt, R6a). */
  code?: boolean
  /**
   * Une limite seulement affichée : on peut la dépasser, l'erreur vient à l'enregistrement (ou de
   * l'écran, qui la dit). À préférer à `maxLength` quand le membre doit voir son dépassement : un
   * `maxLength` couperait en silence un texte collé trop long (relecture du plan R5b, ui-I2).
   */
  limit?: number
  /**
   * Le compteur « 900 / 1000 » apparaît sous le champ à partir de ce nombre de caractères (avec
   * `limit` ou `maxLength`) : la règle se voit avant l'erreur, sans encombrer un texte court. Il est
   * lu « 900 caractères sur 1000 ».
   */
  countFrom?: number
  /**
   * Un champ compact (le bas de la feuille des commentaires) : une ligne de haut, sans libellé
   * affiché au-dessus. Le libellé reste son nom lu ; le texte d'attente (`placeholder`) dit à l'œil
   * ce qu'on y tape.
   */
  compact?: boolean
  /**
   * Avec `multiline`, le champ commence haut d'une ligne et grandit avec son texte, jusqu'à ce
   * nombre de lignes ; au-delà, son texte défile. Absent : la hauteur fixe d'un champ multiligne.
   */
  maxLines?: number
  /**
   * Ce qui décrit aussi le champ, écrit ailleurs par le composant qui l'utilise (la légende sous
   * toute la rangée de `CommentComposer`, son bandeau au-dessus) : lu après le nom, comme une aide.
   * `ids` : les `nativeID` de ces textes, séparés par une espace (web, aria-describedby) ; `spoken` :
   * les mêmes textes, pour l'indice du téléphone, où aria-describedby n'existe pas.
   */
  describedElsewhere?: { ids: string; spoken: string }
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
  /**
   * Le champ a reçu le focus (en plus de ce que le champ en fait lui-même) : une ligne de mise à
   * jour (`UpdateLineField`, R7a) se teinte alors tout entière, pastille comprise.
   */
  onFocus?: () => void
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
  // Où poser le curseur : PromptField le garde après un texte collé dont il a retiré des caractères.
  | 'selection'
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
/**
 * La saisie d'un champ, pour qu'un écran y pose le focus (`inputRef`) sans importer React Native
 * lui-même (les écrans n'assemblent que des composants de src/ui).
 */
export type TextFieldInput = TextInput

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
  invalid: invalidElsewhere = false,
  keepHint = false,
  showCount = false,
  counterText,
  code = false,
  limit,
  countFrom,
  compact = false,
  maxLines,
  describedElsewhere,
  aside,
  success,
  prefix,
  inputRef,
  onFocus,
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
  // Ce qu'on lit sous le champ : l'erreur d'abord, sinon la confirmation, sinon l'aide (et l'aide
  // après l'erreur ou la confirmation, avec `keepHint` : la même règle que l'affichage, Message).
  const status = error || success
  // En erreur, que la phrase soit sous le champ (`error`) ou dans le pied de la feuille (`invalid`).
  const wrong = Boolean(error) || invalidElsewhere
  const message = keepHint && status && hint ? `${status} ${hint}` : status || hint
  const body = code ? textStyles.code : textStyles.body
  const max = limit ?? inputProps.maxLength
  // Le compteur compte comme la limite : en « unités » de texte (value.length), comme maxLength et
  // les schémas Zod de l'API. Un emoji en vaut souvent deux : compter en caractères affichait
  // « 999 / 1000 » quand le champ refusait déjà la lettre suivante.
  const counted = showCount && max ? value.length : null
  const counter = counted !== null ? (counterText?.shown ?? `${counted} / ${max}`) : aside
  // Le compteur écrit par l'appelant est lu par son nom (`spoken`), et décrit le champ.
  const spokenCounter = counted !== null ? counterText?.spoken : undefined
  const topCounterId = useId()
  // Le compteur sous le champ (`countFrom`), compté de la même façon ; null tant qu'il n'est pas dû.
  const below =
    countFrom !== undefined && max && value.length >= countFrom
      ? {
          shown: t(($) => $.project.comments.counter, { count: value.length, max }),
          spoken: t(($) => $.project.comments.counterSpoken, { count: value.length, max }),
          tone: (value.length > max ? 'danger' : value.length >= max ? 'accent' : 'muted') as Tone,
        }
      : null
  const counterId = useId()
  // Ce qui décrit le champ (web) : le message, puis le compteur ; sur téléphone, l'indice les lit.
  const described = [
    spokenCounter ? topCounterId : null,
    message ? messageId : null,
    below ? counterId : null,
    describedElsewhere?.ids,
  ]
    .filter(Boolean)
    .join(' ')
  const spokenHint = [spokenCounter, message, below?.spoken, describedElsewhere?.spoken]
    .filter(Boolean)
    .join(' ')

  // Le champ qui grandit (`multiline` et `maxLines`) : sa hauteur suit celle de son texte, d'une
  // ligne à `maxLines`, plus sa marge. `content` est la hauteur du texte, `line` celle d'une ligne
  // telle que l'écran la dessine (sur le web, la page peut agrandir le texte : on la lit).
  const grows = Boolean(inputProps.multiline) && maxLines !== undefined
  const padY = compact ? space.sm : space.xs
  const [measured, setMeasured] = useState<{ content: number; line: number }>({
    content: body.lineHeight,
    line: body.lineHeight,
  })
  const lines = maxLines ?? 1
  const growHeight = Math.max(
    layout.touchTarget,
    Math.min(Math.max(measured.content, measured.line), lines * measured.line) + 2 * padY,
  )
  // Sur le web, le navigateur ne dit pas la hauteur du texte d'une zone de saisie plus haute que
  // lui (`scrollHeight` ne descend jamais sous la hauteur de la boîte) : on la mesure en ramenant
  // un instant la boîte à zéro, puis en lui rendant sa hauteur (la recette des zones de texte qui
  // s'ajustent). Rien ne se voit : tout se passe avant que le navigateur ne redessine.
  const measureWeb = useCallback(() => {
    const node = input.current as unknown as HTMLTextAreaElement | null
    if (!node || typeof node.scrollHeight !== 'number' || typeof getComputedStyle !== 'function')
      return
    const before = node.style.height
    node.style.height = '0px'
    const content = node.scrollHeight - 2 * padY
    node.style.height = before
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || body.lineHeight
    setMeasured((previous) =>
      previous.content === content && previous.line === line ? previous : { content, line },
    )
  }, [padY, body.lineHeight])
  // useLayoutEffect : après chaque frappe, avant que la page ne soit redessinée.
  // (`value` est lu dans la condition pour que l'effet reparte à chaque texte nouveau.)
  useLayoutEffect(() => {
    if (grows && Platform.OS === 'web' && value !== undefined) measureWeb()
  }, [grows, value, measureWeb])
  // Sur téléphone, la saisie dit elle-même la hauteur de son texte (agrandie avec la taille de texte
  // de l'appareil) ; une ligne y suit la même échelle, bornée à 2 comme les textes de l'appli.
  const { fontScale } = useWindowDimensions()
  const nativeLine = body.lineHeight * Math.min(Math.max(fontScale || 1, 1), 2)
  const growing = grows
    ? Platform.OS === 'web'
      ? { onLayout: measureWeb }
      : {
          maxFontSizeMultiplier: 2,
          onContentSizeChange: (event: {
            nativeEvent: { contentSize: { width: number; height: number } }
          }) => {
            const content = event.nativeEvent.contentSize.height
            setMeasured((previous) =>
              previous.content === content && previous.line === nativeLine
                ? previous
                : { content, line: nativeLine },
            )
          },
        }
    : null
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
      // Sur le web, react-native-web pose quand même tabIndex=0 sur un Pressable (même avec
      // focusable à faux) : la rangée devenait un arrêt de Tab vide avant chaque champ. -1 l'en sort ;
      // le clic de la souris donne toujours le focus au champ (onPress ci-dessous).
      {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
      onPress={() => {
        if (inputProps.editable !== false) input.current?.focus()
      }}
      style={{
        paddingHorizontal: space.lg,
        // Compact : la saisie porte seule sa marge (une ligne, 44 points), sans rangée de libellé.
        paddingTop: compact ? 0 : space.md,
        paddingBottom: compact ? 0 : space.sm,
        // Dans un groupe, le champ n'a pas de cadre à lui : quand il est choisi, sa ligne prend un
        // fond doux (en plus de son libellé en couleur), pour qu'on voie où l'on tape.
        ...(inGroup && focused ? { backgroundColor: colors.honeySoft } : null),
      }}
    >
      {/* Compact, le libellé n'est pas affiché : il reste le nom lu de la saisie. */}
      {compact ? null : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
          <Text
            variant="caption"
            weight={600}
            tone={wrong ? 'danger' : focused ? 'accent' : 'muted'}
          >
            {label}
          </Text>
          {counter ? (
            <Text
              variant="caption"
              tone={counterTone}
              weight={counterTone === 'muted' ? 400 : 700}
              tabular
              {...(spokenCounter
                ? { nativeID: topCounterId, accessibilityLabel: spokenCounter }
                : null)}
            >
              {counter}
            </Text>
          ) : null}
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          marginTop: compact ? 0 : space.xxs,
        }}
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
            accessibilityHint={Platform.OS === 'web' ? undefined : spokenHint || undefined}
            {...describedBy(described || undefined)}
            // « Saisie invalide » : le lecteur d'écran le dit en arrivant sur le champ (web).
            {...invalid(wrong)}
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
            onFocus={() => {
              setFocused(true)
              onFocus?.()
            }}
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
              paddingVertical: padY,
              // Sur le web, le navigateur dessine son propre contour : le groupe s'en charge déjà.
              outlineWidth: 0,
              ...(inputProps.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null),
              // Le champ qui grandit : sa hauteur à lui, d'une ligne à `maxLines` (voir plus haut).
              ...(grows ? { minHeight: layout.touchTarget, height: growHeight } : null),
            }}
            {...growing}
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
            accessibilityLabel={
              revealed ? t(($) => $.common.hidePassword) : t(($) => $.common.showPassword)
            }
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
      {inGroup ? (
        <Message id={messageId} error={error} hint={hint} success={success} keepHint={keepHint} />
      ) : null}
      {inGroup && below ? <Counter id={counterId} {...below} /> : null}
    </Pressable>
  )

  if (inGroup) return row
  return (
    <View>
      <GroupFrame state={wrong ? 'error' : focused ? 'focus' : 'idle'}>{row}</GroupFrame>
      <Message
        id={messageId}
        error={error}
        hint={hint}
        success={success}
        keepHint={keepHint}
        outside
      />
      {below ? <Counter id={counterId} {...below} outside /> : null}
    </View>
  )
}

/**
 * Le compteur sous le champ (`countFrom`), rangé à droite : « 900 / 1000 » à l'œil, « 900
 * caractères sur 1000 » au lecteur d'écran (une barre oblique se lirait « barre oblique »). Ambre à
 * la limite, rouge au-delà. Il n'est pas une région vivante : l'annoncer à chaque lettre serait du
 * bruit ; le champ le cite dans sa description (lue en y arrivant), et l'écran annonce lui-même un
 * dépassement (« 1 caractère de trop. »).
 */
function Counter({
  id,
  shown,
  spoken,
  tone,
  outside = false,
}: {
  /** L'identifiant que le champ cite dans aria-describedby. */
  id: string
  shown: string
  spoken: string
  tone: Tone
  outside?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        ...(outside
          ? { paddingHorizontal: space.sm, paddingTop: space.xs }
          : { paddingBottom: space.xs }),
      }}
    >
      {/* nativeID devient l'attribut id sur le web : celui que cite aria-describedby, qui y lit le
          nom (aria-label) plutôt que le texte affiché. */}
      <Text
        nativeID={id}
        variant="caption"
        tone={tone}
        weight={tone === 'muted' ? 400 : 700}
        tabular
        accessibilityLabel={spoken}
      >
        {shown}
      </Text>
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
  keepHint = false,
  outside = false,
}: {
  /** L'identifiant que le champ cite dans aria-describedby. */
  id: string
  error?: string | undefined
  hint?: string | undefined
  success?: string | undefined
  /** L'aide reste sous l'erreur (voir TextField). */
  keepHint?: boolean
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
      {/* Avec keepHint, l'aide reste là, sous l'erreur : on la lit encore pour corriger. */}
      {status && keepHint && hint ? (
        <View style={padding}>
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
