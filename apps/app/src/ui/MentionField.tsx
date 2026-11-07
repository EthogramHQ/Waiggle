// Le champ d'un commentaire qui propose des membres à mentionner (tranche 6b, puis R5b). Quand on
// tape « @ » suivi de 2 caractères (« @in », « @Lé »), le champ dit à l'écran ce qu'il cherche
// (`onQueryChange`), replié comme l'API le replie (« @Lé » cherche « le » : sans accents ni
// majuscules, `foldForSearch`) ; l'écran lui rend des suggestions (nom, pseudo, photo) et la
// recherche à laquelle elles répondent (`suggestionsFor`), que le champ montre dessous, ou dessus
// dans la feuille des commentaires (`suggestionsPlacement`), les lettres tapées en gras. Un choix
// remplace « @Lé » par le pseudo entier, suivi d'une espace : « @lea_moreau ».
//
// C'est le motif « combobox » des lecteurs d'écran : le champ garde le focus, la liste (rôle
// « listbox ») lui est liée, et le choix en surbrillance est lu sans quitter le champ.
// - au toucher (ou à la souris) : on touche un membre ;
// - au clavier (web) : le premier membre est déjà en surbrillance, Entrée le choisit ; les flèches
//   haut et bas parcourent les autres ; Échap referme la liste sans rien changer au texte (un second
//   Échap fait ce que fait le champ d'habitude, par exemple refermer le commentaire en cours) ;
// - la liste se referme d'elle-même quand le mot est fini (une espace), et quand le focus quitte
//   le champ (Tab, qui va au bouton suivant : la liste n'est pas un arrêt de Tab).
//
// La liste ne montre que des suggestions qui répondent à la recherche en cours : l'écran peut encore
// tenir la réponse d'une recherche précédente (« @in » pendant qu'on tape « @ine », avant que la
// nouvelle réponse n'arrive). Sans cette garde, Entrée choisirait un membre trouvé pour une autre
// recherche. Avant R5b, le champ gardait les membres dont le pseudo commençait par ce qui est tapé ;
// l'API trouve désormais aussi un membre par son nom, ou un mot de son nom (« @le » trouve Hugo
// Lefèvre, @hugo_l) : un tri par pseudo l'écarterait. L'écran dit donc à quelle recherche répondent
// ses suggestions (`suggestionsFor`), et le champ n'en montre aucune tant que ce n'est pas la bonne
// (relecture du plan R5b, ui-B6).
//
// Sous le champ (par défaut), la liste prend sa place dans la page : elle apparaît parce qu'on tape,
// et pousse les boutons dessous plutôt que de les recouvrir. Au-dessus (le champ collé en bas de la
// feuille des commentaires), elle grandit vers le haut et le champ ne bouge pas sous le doigt. Un
// composant qui veut la poser ailleurs prend le champ et la liste séparément (`useMentionField`).

import { type FontWeight, layout, radii, space, textStyles } from '@ruche/brand'
import { foldForSearch, MENTION_QUERY_MAX, MENTION_QUERY_PATTERN } from '@ruche/contracts'
import {
  type ComponentProps,
  type ReactElement,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Text as NativeText,
  Platform,
  Pressable,
  ScrollView,
  type TextInput,
  type TextStyle,
  View,
} from 'react-native'
import { Avatar } from './Avatar'
import { focusWithoutScroll } from './focus'
import { highlightRanges } from './HighlightedText'
import type { ImageSource } from './image'
import { Text, type TextTone } from './Text'
import { TextField } from './TextField'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

/** Un membre proposé : de quoi le reconnaître, la photo déjà prête (ou aucune). */
export type MentionSuggestion = {
  id: string
  name: string
  handle: string
  avatar: ImageSource | null
}

type FieldProps = Omit<
  ComponentProps<typeof TextField>,
  'combobox' | 'inputRef' | 'onBlur' | 'onSelectionChange'
>

type Props = FieldProps & {
  /** Les membres à proposer pour ce qui se tape (l'écran les cherche) ; vide : pas de liste. */
  suggestions: readonly MentionSuggestion[]
  /**
   * La recherche à laquelle répondent `suggestions` (repliée, comme `onQueryChange` la donne :
   * « le »), ou null quand elles ne répondent à rien. La liste ne s'ouvre que si c'est celle qui se
   * tape en ce moment : une réponse en retard ne se montre pas, et Entrée ne la choisit pas.
   * Absente (un écran d'avant R5b, qui ne le sait pas) : le champ garde, comme avant, les membres
   * dont le pseudo commence par ce qui est tapé (un membre trouvé par son nom seul n'est alors pas
   * proposé, mais rien de périmé ne peut être choisi).
   */
  suggestionsFor?: string | null
  /** Le nom de la liste, lu par les lecteurs d'écran (« Membres à mentionner »). */
  suggestionsLabel: string
  /**
   * Où se montre la liste : sous le champ (`below`, par défaut), ou au-dessus (`above`) pour un
   * champ collé au bas de l'écran, comme celui de la feuille des commentaires.
   */
  suggestionsPlacement?: 'above' | 'below'
  /** Un titre affiché en tête de la liste ouverte (« Mentionner quelqu’un ») ; absent : aucun. */
  suggestionsTitle?: string
  /**
   * La hauteur que la liste ne dépasse pas : au-delà, elle défile (une fenêtre basse où elle
   * sortirait le champ de l'écran). Absente : toute la hauteur de ses membres.
   */
  suggestionsMaxHeight?: number
  /** Ce que le champ cherche, replié, sans « @ » (« @Lé » : « le »), ou null. */
  onQueryChange: (query: string | null) => void
  /** Une poignée vers la saisie : pour que le composant qui l'utilise y remette le focus. */
  inputRef?: Ref<TextInput>
}

// Le « @… » qui se tape juste avant le curseur : un « @ » qui ne suit ni une lettre, ni un chiffre,
// ni « _ », « . » ou « @ » (« andré@exemple.fr » est une adresse : la même règle que
// splitMentions, dans @ruche/contracts), puis ce que l'API accepte de chercher
// (`MENTION_QUERY_PATTERN` : une lettre, de n'importe quelle langue, puis des lettres, chiffres ou
// « _ »), jusqu'au curseur ($). Après chaque signe, des accents « combinants » (`\p{M}`) sont
// permis : un clavier peut taper « é » en deux signes (e, puis l'accent), que la forme composée
// (NFC) réunit ensuite. Ce qui est trouvé est vérifié, une fois replié, contre le motif exact du
// contrat (QUERY). Le motif est une chaîne du contrat, compilée ici avec le drapeau u (sans lui,
// `\p{L}` ne veut rien dire).
const TYPING = /(^|[^\p{L}\p{N}_@.])@(\p{L}\p{M}*(?:[\p{L}\p{N}_]\p{M}*)*)$/u
// Le motif de l'API, sur toute la recherche repliée : c'est ce que vérifie `MentionableQuery`.
const QUERY = new RegExp(`^${MENTION_QUERY_PATTERN}$`, 'u')

/** On ne cherche qu'à partir de 2 caractères après « @ » (MENTION_QUERY_MIN, côté API). */
const QUERY_MIN = 2

/**
 * Où commence le « @… » en cours devant `cursor` (en unités UTF-16, celles de `slice`), et ce qu'il
 * cherche, replié comme l'API le replie (« @Lé » : « le ») ; null s'il n'y en a pas, ou si la
 * recherche a moins de 2 ou plus de `MENTION_QUERY_MAX` caractères (l'API la refuserait).
 */
export const mentionAt = (text: string, cursor: number) => {
  const match = TYPING.exec(text.slice(0, cursor))
  const raw = match?.[2]
  if (!match || !raw) return null
  // Replié après la forme composée (NFC), comme `MentionableQuery` : un « é » tapé en deux signes
  // (e + accent) cherche la même chose qu'un « é » d'un seul.
  const query = foldForSearch(raw.normalize('NFC'))
  if (query.length < QUERY_MIN || query.length > MENTION_QUERY_MAX || !QUERY.test(query))
    return null
  return { start: match.index + (match[1] ?? '').length, query }
}

/**
 * Un texte dont les lettres qui répondent à la recherche sont en gras (le nom, le pseudo d'une
 * suggestion), comme `HighlightedText` les surligne : la comparaison se fait sur le texte replié
 * (`highlightRanges`), le texte affiché reste tel quel, et il reste un seul nœud lu (les parties en
 * gras sont des textes imbriqués). Le gras est un indice pour l'œil, il ne change pas ce qui est lu.
 */
function Marked({
  text,
  query,
  prefix = '',
  variant,
  tone,
  weight,
  bold,
}: {
  text: string
  query: string
  /** Un signe devant le texte, jamais en gras (« @ » d'un pseudo). */
  prefix?: string
  variant: 'callout' | 'caption'
  tone: TextTone
  weight: FontWeight
  /** La graisse des lettres trouvées. */
  bold: FontWeight
}) {
  const mark: TextStyle = { fontFamily: fontName(textStyles[variant].family, bold) }
  const parts: (string | ReactElement)[] = prefix ? [prefix] : []
  let from = 0
  for (const [start, end] of highlightRanges(text, [query])) {
    if (start > from) parts.push(text.slice(from, start))
    parts.push(
      <NativeText key={start} style={mark}>
        {text.slice(start, end)}
      </NativeText>,
    )
    from = end
  }
  if (from < text.length) parts.push(text.slice(from))
  return (
    <Text variant={variant} tone={tone} weight={weight} breakAnywhere>
      {parts}
    </Text>
  )
}

// Le rôle « listbox » (une liste de choix) manque aux types de React Native, qui ne connaissent
// que « list » ; react-native-web le transmet tel quel au navigateur.
const LISTBOX = { role: 'listbox' } as object

// La touche reçue par onKeyPress (sur le web, l'évènement du navigateur, qu'on peut arrêter).
type KeyPress = { nativeEvent: { key: string; preventDefault?: () => void } }

// Chrome rend atteignable par Tab une zone qui défile sans élément focalisable : ici, les flèches
// parcourent les choix depuis le champ. `tabIndex` manque aux types du ScrollView de React Native.
const NOT_A_TAB_STOP = { tabIndex: -1 } as object

/** Les choix, dans une zone qui défile si la liste est limitée en hauteur ; sinon tels quels. */
function OptionsScroll({ limited, children }: { limited: boolean; children: ReactElement }) {
  if (!limited) return children
  return (
    // keyboardShouldPersistTaps : un membre touché, clavier ouvert, est choisi du premier coup.
    <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" {...NOT_A_TAB_STOP}>
      {children}
    </ScrollView>
  )
}

/** Le champ et sa liste, tels que `useMentionField` les rend, chacun à poser où l'on veut. */
export type MentionFieldParts = {
  /** La saisie : toujours là. */
  field: ReactElement
  /** La liste des membres : null tant qu'il n'y a rien à proposer. */
  list: ReactElement | null
}

/**
 * Le champ et sa liste, séparés. `MentionField` les pose l'un sur l'autre ; `CommentComposer` pose la
 * liste au-dessus de son bandeau, sur toute sa largeur, alors que la saisie reste dans sa rangée, à
 * côté de la photo et du bouton (relecture design, des-A6). Un hook plutôt qu'un portail : les deux
 * restent dans le même arbre, donc l'ordre de lecture suit l'écran.
 */
export function useMentionField({
  suggestions,
  suggestionsFor,
  suggestionsLabel,
  suggestionsTitle,
  suggestionsMaxHeight,
  onQueryChange,
  value,
  onChangeText,
  onKeyPress,
  inputRef,
  ...fieldProps
}: Omit<Props, 'suggestionsPlacement'>): MentionFieldParts {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const input = useRef<TextInput>(null)
  // La même saisie, partagée avec le composant qui l'a demandée.
  useImperativeHandle(inputRef, () => input.current as TextInput)
  // useId : des identifiants stables, pour relier le champ à sa liste et à son choix actif (web).
  const listId = useId()
  // Le curseur, quand le champ l'a dit depuis la dernière frappe ; sinon, on le suppose au bout.
  const [cursor, setCursor] = useState<number | null>(null)
  // Échap a refermé la liste : elle reste fermée jusqu'à la prochaine frappe.
  const [dismissed, setDismissed] = useState(false)
  // Le choix en surbrillance (clavier), et la recherche à laquelle il appartient : une autre
  // recherche repart sans surbrillance.
  const [active, setActive] = useState<{ query: string; index: number } | null>(null)
  // Un choix touché : le champ perd le focus juste avant, mais la liste ne doit pas se refermer.
  const choosing = useRef(false)

  // -1 : plusieurs lettres sélectionnées, rien à chercher.
  const end = Math.min(cursor ?? value.length, value.length)
  const typing = end < 0 ? null : mentionAt(value, end)
  const query = typing && !dismissed ? typing.query : null
  // Seulement des suggestions qui répondent à la recherche en cours (voir en tête du fichier) :
  // toutes si l'écran dit qu'elles répondent à celle-ci, aucune sinon ; sans ce renseignement,
  // celles dont le pseudo commence par ce qui est tapé (la garde d'avant R5b).
  const shown =
    query === null
      ? []
      : suggestionsFor === undefined
        ? suggestions.filter((suggestion) => foldForSearch(suggestion.handle).startsWith(query))
        : suggestionsFor === query
          ? suggestions
          : []
  const open = shown.length > 0
  // Le choix en surbrillance : celui des flèches pour cette recherche, sinon le premier (Entrée le
  // prend tout de suite, sans passer par les flèches).
  const activeIndex = !open
    ? -1
    : active?.query === query && active.index < shown.length
      ? active.index
      : 0
  const optionId = (index: number) => `${listId}-${index}`

  // Dans une liste limitée en hauteur, le membre atteint par les flèches vient à l'écran : le focus
  // reste dans le champ, le navigateur ne le ferait pas de lui-même. Seulement après une flèche, et
  // seulement là : ailleurs, la liste ne défile pas, et c'est la page qui bougerait.
  const arrowed = active?.query === query ? activeIndex : -1
  const limited = suggestionsMaxHeight !== undefined
  // biome-ignore lint/correctness/useExhaustiveDependencies: `optionId` ne dépend que de `listId`.
  useEffect(() => {
    if (limited && arrowed >= 0 && Platform.OS === 'web' && typeof document !== 'undefined') {
      document.getElementById(optionId(arrowed))?.scrollIntoView({ block: 'nearest' })
    }
  }, [limited, arrowed, listId])

  // L'écran apprend ce qu'on cherche à chaque changement (et null quand on ne cherche plus rien).
  // Une ref garde sa dernière fonction : l'effet ne dépend que de la recherche.
  const report = useRef(onQueryChange)
  report.current = onQueryChange
  useEffect(() => {
    report.current(query)
  }, [query])
  // Le champ disparaît (commentaire publié, annulé) : il ne cherche plus rien.
  useEffect(() => () => report.current(null), [])

  const change = (text: string) => {
    // Une frappe : le curseur suit le texte (le champ le redira), et la liste peut revenir.
    setCursor(null)
    setDismissed(false)
    onChangeText(text)
  }

  const choose = (suggestion: MentionSuggestion) => {
    choosing.current = false
    if (!typing) return
    const after = value.slice(end)
    // « @in » devient « @ines_morel », suivi d'une espace pour continuer d'écrire (sauf s'il y en
    // a déjà une juste après).
    const mention = `@${suggestion.handle}${/^\s/.test(after) ? '' : ' '}`
    setCursor(null)
    setActive(null)
    onChangeText(value.slice(0, typing.start) + mention + after)
    // Touché à la souris, le choix a pris le focus : il revient dans le champ, pour continuer.
    focusWithoutScroll(input.current)
  }

  // Le bouton de la souris s'enfonce sur la liste (web). Le champ va perdre le focus : on note
  // qu'un choix commence, pour que la liste reste ouverte (voir onBlur). Quand le bouton remonte,
  // où que ce soit dans la page (on a pu glisser hors de la liste avant de lâcher), on fait le
  // point juste après le clic : un membre choisi a rendu le focus au champ ; sinon, rien n'est
  // choisi et le champ n'a plus le focus, la liste se referme au lieu de rester orpheline.
  const startChoosing = () => {
    choosing.current = true
    if (typeof document === 'undefined') return
    const release = () => {
      document.removeEventListener('pointerup', release, true)
      document.removeEventListener('pointercancel', release, true)
      // setTimeout 0 : après le clic qui suit le relâchement (c'est lui qui choisit).
      setTimeout(() => {
        choosing.current = false
        if (!input.current?.isFocused()) setDismissed(true)
      }, 0)
    }
    // true : à la phase de capture, avant qu'un élément de la page ne puisse arrêter l'évènement.
    document.addEventListener('pointerup', release, true)
    document.addEventListener('pointercancel', release, true)
  }

  const keyPress = (event: KeyPress) => {
    const { key } = event.nativeEvent
    // Appelée sur l'évènement lui-même : détachée de lui, le navigateur la refuse (« Illegal invocation »).
    const preventDefault = () => event.nativeEvent.preventDefault?.()
    if (open && query !== null) {
      const count = shown.length
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        // preventDefault : le curseur ne saute pas au début ou à la fin du texte.
        preventDefault()
        const next =
          key === 'ArrowDown'
            ? (activeIndex + 1) % count
            : activeIndex <= 0
              ? count - 1
              : activeIndex - 1
        setActive({ query, index: next })
        return
      }
      const chosen = shown[activeIndex]
      if (key === 'Enter' && chosen) {
        // preventDefault : Entrée choisit, sans ajouter de retour à la ligne.
        preventDefault()
        choose(chosen)
        return
      }
      if (key === 'Tab') {
        // Tab quitte le champ vers le bouton suivant, comme d'habitude (pas de preventDefault) ;
        // la liste se referme au passage, sans rien choisir.
        setDismissed(true)
      }
      if (key === 'Escape') {
        // Échap referme d'abord la liste, et rien d'autre (le champ reste ouvert, son texte aussi).
        preventDefault()
        setDismissed(true)
        return
      }
    }
    // Sinon, la touche fait ce que le champ fait d'habitude.
    ;(onKeyPress as ((event: KeyPress) => void) | undefined)?.(event)
  }

  const list =
    open && query !== null ? (
      <View
        // Sur le web, le champ perd le focus dès que le bouton de la souris s'enfonce, avant que
        // le choix ne reçoive son « pressIn » : la liste se fermait et le clic tombait dans le
        // vide. « pointerdown » arrive avant la perte du focus : voir startChoosing. Posé sur le
        // cadre entier, titre compris : un clic sur le titre ne referme pas la liste.
        onPointerDown={startChoosing}
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.group,
          borderWidth: 1,
          borderColor: colors.groupBorder,
          paddingVertical: space.xxs,
          overflow: 'hidden',
          ...(limited ? { maxHeight: suggestionsMaxHeight } : null),
        }}
      >
        {/* Le titre, hors de la liste elle-même : une liste de choix ne contient que des choix. */}
        {suggestionsTitle ? (
          <View
            style={{ paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xxs }}
          >
            <Text variant="caption" weight={600} tone="muted">
              {suggestionsTitle}
            </Text>
          </View>
        ) : null}
        <OptionsScroll limited={limited}>
          <View
            nativeID={listId}
            {...LISTBOX}
            accessibilityLabel={suggestionsLabel}
            // Pas d'« accessible » : sur iOS, il ferait de la liste un seul bloc, et VoiceOver ne
            // pourrait plus atteindre les membres un par un. focusable faux : ce n'est pas un arrêt
            // de Tab (les flèches, dans le champ, parcourent les choix).
            focusable={false}
          >
            {shown.map((suggestion, index) => {
              const selected = index === activeIndex
              return (
                <Pressable
                  key={suggestion.id}
                  nativeID={optionId(index)}
                  role="option"
                  accessibilityLabel={t(($) => $.mentions.option, {
                    name: suggestion.name,
                    handle: suggestion.handle,
                  })}
                  aria-selected={selected}
                  // Pas un arrêt de Tab : on choisit au toucher, ou au clavier depuis le champ. Sur le
                  // web, Pressable pose de lui-même tabIndex 0 : -1 l'en retire.
                  focusable={false}
                  tabIndex={-1}
                  onPressIn={() => {
                    choosing.current = true
                  }}
                  onPressOut={() => {
                    // Le doigt a glissé hors du choix : rien n'est choisi, la liste reste ouverte.
                    if (Platform.OS !== 'web') choosing.current = false
                  }}
                  onPress={() => choose(suggestion)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    minHeight: layout.touchTarget,
                    paddingHorizontal: space.md,
                    paddingVertical: space.xs,
                    backgroundColor: selected || pressed ? colors.honeySoft : colors.surface,
                  })}
                >
                  <View aria-hidden>
                    <Avatar
                      name={suggestion.name}
                      source={suggestion.avatar}
                      label={suggestion.name}
                      size={32}
                    />
                  </View>
                  {/* Le nom, le pseudo dessous, comme le dit le scénario. Les lettres tapées y sont en
                    gras : le nom, d'un poids ordinaire, les fait ressortir. */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Marked
                      text={suggestion.name}
                      query={query}
                      variant="callout"
                      tone="default"
                      weight={400}
                      bold={700}
                    />
                    <Marked
                      text={suggestion.handle}
                      prefix="@"
                      query={query}
                      variant="caption"
                      tone="muted"
                      weight={400}
                      bold={700}
                    />
                  </View>
                </Pressable>
              )
            })}
          </View>
        </OptionsScroll>
      </View>
    ) : null

  const field = (
    <TextField
      {...fieldProps}
      value={value}
      onChangeText={change}
      inputRef={input}
      onKeyPress={keyPress}
      onSelectionChange={(event) => {
        const { start, end } = event.nativeEvent.selection
        // Une sélection de plusieurs lettres : pas de recherche (on ne remplacerait pas la bonne).
        setCursor(start === end ? end : -1)
      }}
      onBlur={() => {
        // Tab vers la suite : la liste se referme. (Un choix touché fait aussi perdre le focus,
        // juste avant d'être pris : on le laisse faire.)
        if (!choosing.current) setDismissed(true)
      }}
      combobox={{
        expanded: open,
        listId,
        activeId: activeIndex >= 0 ? optionId(activeIndex) : undefined,
      }}
    />
  )

  return { field, list }
}

export function MentionField({ suggestionsPlacement = 'below', ...props }: Props) {
  const { field, list } = useMentionField(props)
  return (
    <View style={{ gap: space.xs }}>
      {suggestionsPlacement === 'above' ? list : null}
      {field}
      {suggestionsPlacement === 'below' ? list : null}
    </View>
  )
}
