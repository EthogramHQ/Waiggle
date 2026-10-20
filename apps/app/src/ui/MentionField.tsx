// Le champ d'un commentaire qui propose des membres à mentionner (tranche 6b). Quand on tape « @ »
// suivi de 2 caractères (« @in »), le champ dit à l'écran ce qu'il cherche (`onQueryChange`) ;
// l'écran lui rend des suggestions (nom, pseudo, photo), que le champ montre juste dessous. Un
// choix remplace « @in » par le pseudo entier, suivi d'une espace : « @ines_morel ».
//
// C'est le motif « combobox » des lecteurs d'écran : le champ garde le focus, la liste (rôle
// « listbox ») lui est liée, et le choix en surbrillance est lu sans quitter le champ.
// - au toucher (ou à la souris) : on touche un membre ;
// - au clavier (web) : flèches haut et bas pour parcourir, Entrée pour choisir, Échap pour refermer
//   la liste sans rien changer au texte (un second Échap fait ce que fait le champ d'habitude, par
//   exemple refermer le commentaire en cours) ;
// - la liste se referme d'elle-même quand le mot est fini (une espace), et quand le focus quitte
//   le champ (Tab).
//
// La liste prend sa place sous le champ, dans la page : elle apparaît parce qu'on tape, et pousse
// les boutons dessous plutôt que de les recouvrir.

import { layout, radii, space } from '@ruche/brand'
import { HANDLE_MAX_LENGTH } from '@ruche/contracts'
import { type ComponentProps, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, type TextInput, View } from 'react-native'
import { Avatar } from './Avatar'
import { focusWithoutScroll } from './focus'
import type { ImageSource } from './image'
import { Text } from './Text'
import { TextField } from './TextField'
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
  /** Le nom de la liste, lu par les lecteurs d'écran (« Membres à mentionner »). */
  suggestionsLabel: string
  /** Ce que le champ cherche : le début du pseudo, sans « @ » (« in »), ou null. */
  onQueryChange: (query: string | null) => void
}

// Le « @pseudo » qui se tape juste avant le curseur : un « @ » qui ne suit ni une lettre, ni un
// chiffre, ni « _ », « . » ou « @ » (« andré@exemple.fr » est une adresse : la même règle que
// splitMentions, dans @ruche/contracts), puis une lettre et des lettres, chiffres ou « _ »,
// jusqu'au curseur ($).
const TYPING = /(^|[^\p{L}\p{N}_@.])@([A-Za-z][A-Za-z0-9_]*)$/u

/** On ne cherche qu'à partir de 2 caractères après « @ » (MENTION_QUERY_MIN, côté API). */
const QUERY_MIN = 2

/** Où commence le « @pseudo » en cours devant `cursor`, et ce qu'il cherche ; null s'il n'y en a pas. */
export const mentionAt = (text: string, cursor: number) => {
  const match = TYPING.exec(text.slice(0, cursor))
  const raw = match?.[2]
  if (!match || !raw || raw.length < QUERY_MIN || raw.length > HANDLE_MAX_LENGTH) return null
  return { start: match.index + (match[1] ?? '').length, query: raw.toLowerCase() }
}

// Le rôle « listbox » (une liste de choix) manque aux types de React Native, qui ne connaissent
// que « list » ; react-native-web le transmet tel quel au navigateur.
const LISTBOX = { role: 'listbox' } as object

// La touche reçue par onKeyPress (sur le web, l'évènement du navigateur, qu'on peut arrêter).
type KeyPress = { nativeEvent: { key: string; preventDefault?: () => void } }

export function MentionField({
  suggestions,
  suggestionsLabel,
  onQueryChange,
  value,
  onChangeText,
  onKeyPress,
  ...fieldProps
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const input = useRef<TextInput>(null)
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
  const open = query !== null && suggestions.length > 0
  const activeIndex =
    open && active?.query === query && active.index < suggestions.length ? active.index : -1
  const optionId = (index: number) => `${listId}-${index}`

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

  const keyPress = (event: KeyPress) => {
    const { key } = event.nativeEvent
    // Appelée sur l'évènement lui-même : détachée de lui, le navigateur la refuse (« Illegal invocation »).
    const preventDefault = () => event.nativeEvent.preventDefault?.()
    if (open && query !== null) {
      const count = suggestions.length
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
      const chosen = suggestions[activeIndex]
      if (key === 'Enter' && chosen) {
        // preventDefault : Entrée choisit, sans ajouter de retour à la ligne.
        preventDefault()
        choose(chosen)
        return
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

  return (
    <View style={{ gap: space.xs }}>
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
      {open ? (
        <View
          nativeID={listId}
          {...LISTBOX}
          accessibilityLabel={suggestionsLabel}
          // accessible : la liste est un élément nommé pour les lecteurs d'écran ; focusable faux :
          // ce n'est pas un arrêt de Tab (les flèches, dans le champ, parcourent les choix).
          accessible
          focusable={false}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.group,
            borderWidth: 1,
            borderColor: colors.groupBorder,
            paddingVertical: space.xxs,
            overflow: 'hidden',
          }}
        >
          {suggestions.map((suggestion, index) => {
            const selected = index === activeIndex
            return (
              <Pressable
                key={suggestion.id}
                nativeID={optionId(index)}
                role="option"
                accessibilityLabel={t('mentions.option', {
                  name: suggestion.name,
                  handle: suggestion.handle,
                })}
                aria-selected={selected}
                // Pas un arrêt de Tab : on choisit au toucher, ou au clavier depuis le champ.
                focusable={false}
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
                {/* Le nom puis le pseudo ; ils passent l'un sous l'autre quand la place manque. */}
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    columnGap: space.sm,
                  }}
                >
                  <Text variant="callout" weight={700} breakAnywhere>
                    {suggestion.name}
                  </Text>
                  <Text variant="caption" tone="muted" breakAnywhere>
                    {`@${suggestion.handle}`}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}
