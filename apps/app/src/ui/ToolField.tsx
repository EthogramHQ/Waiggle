// Le champ des outils d'un projet (tranche R6a, planche `R6-Publier-Outils`, relecture du plan
// ui-B4) : « Outils 2 / 15 », les outils choisis en pastilles qu'une croix retire, et un champ de
// recherche qui propose les outils déjà utilisés par les membres, avec leur nombre de projets
// (« Claude · 41 projets », lu « Claude, 41 projets »). Un nom que personne n'a encore utilisé
// s'ajoute tel quel (« Ajouter « Teachable Machine » ») ; jamais plus de `limit` outils.
//
// L'écran cherche les suggestions : le champ lui dit ce qui se tape (`onQuery`, sans les espaces du
// bord) et montre ce que l'écran lui rend, tel quel, sauf les outils déjà choisis. Champ vide et
// choisi, la liste s'ouvre aussi, avec ce que l'écran donne pour une recherche vide (les outils les
// plus utilisés) : on voit ce qu'on peut prendre avant de taper.
//
// C'est le motif « combobox » de `MentionField`, avec ses gardes de la tranche 6b :
// - le champ garde le focus ; la liste (rôle « listbox ») lui est liée (`aria-controls`) et le
//   choix en surbrillance est lu sans quitter le champ (`aria-activedescendant`) ;
// - au clavier (web) : dès qu'on a tapé, le premier choix est en surbrillance et Entrée le prend ;
//   les flèches parcourent les autres ; Échap ne ferme que la liste (la touche est « prise », pour
//   que la feuille autour ne se ferme pas avec elle) et un second Échap revient à la feuille ; Tab
//   quitte le champ et referme la liste, qui n'est pas un arrêt de Tab ;
// - à la souris : le champ perd le focus dès que le bouton s'enfonce, avant que le choix ne soit
//   touché ; `pointerdown` sur la liste le note, pour qu'elle ne se referme pas sous le clic.
//
// Après un choix, le champ se vide et la liste se ferme ; elle revient à la frappe suivante. Après
// le retrait d'un outil, le focus va à la croix de la pastille suivante, sinon de la précédente,
// sinon au champ de recherche : il ne retombe jamais en haut de la page.
import { borders, layout, radii, space, textStyles } from '@ruche/brand'
import { TOOL_MAX_LENGTH } from '@ruche/contracts'
import { useEffect, useId, useRef, useState } from 'react'
import { Platform, Pressable, TextInput, View } from 'react-native'
import { comboboxLinks, describedBy } from './aria'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import { usePill } from './SearchField'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { placeholderCopy } from './theme/document'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

/** Un outil proposé : son nom, et le nombre de projets qui le citent déjà. */
export type ToolSuggestion = { name: string; uses: number }

/** Les textes du champ, tirés des traductions par l'écran. */
export type ToolFieldLabels = {
  /** Le texte d'attente du champ (« Chercher un outil »). */
  search: string
  /** Le nom de la liste des suggestions (« Outils déjà utilisés »). */
  suggestions: string
  /** Le nom de la liste des pastilles (« Outils choisis »). */
  chosen: string
  /** Le compteur : affiché (« 2 / 15 ») et lu (« 2 outils choisis sur 15 »). */
  counter: (count: number, max: number) => { shown: string; spoken: string }
  /** Le nombre de projets affiché sous un nom (« 41 projets »). */
  uses: (count: number) => string
  /** Le nom lu d'une suggestion (« Claude, 41 projets »). */
  suggestion: (name: string, count: number) => string
  /** Le choix qui ajoute un nom nouveau (« Ajouter « Teachable Machine » »). */
  add: (name: string) => string
  /** Le nom de la croix d'une pastille (« Retirer Claude »). */
  remove: (name: string) => string
}

type Props = {
  /** Le nom du champ, affiché au-dessus et lu (« Outils »). */
  label: string
  /** Les outils choisis, dans l'ordre. */
  values: readonly string[]
  onChange: (values: string[]) => void
  /** Les outils que l'écran propose pour ce qui se tape (les plus utilisés, champ vide). */
  suggestions: readonly ToolSuggestion[]
  /** Ce qui se tape, sans les espaces du bord : l'écran y cherche des outils. */
  onQuery: (query: string) => void
  /** Le nombre d'outils au plus (`PROJECT_TOOLS_MAX`) : à la limite, rien ne s'ajoute. */
  limit: number
  labels: ToolFieldLabels
  /**
   * Un texte déjà tapé au premier affichage, liste ouverte : pour montrer cet état au catalogue
   * (une capture ne tape pas). Absent : un champ vide, liste fermée jusqu'au focus.
   */
  initialText?: string
}

/** Un choix de la liste : un outil proposé, ou le nom tapé, à ajouter tel quel. */
type Option = { kind: 'suggestion'; tool: ToolSuggestion } | { kind: 'add'; name: string }

// Les majuscules ne comptent pas : « claude » et « Claude » sont le même outil (comme
// `uniqueIgnoringCase` du contrat, qui les dédoublonne à l'enregistrement).
const same = (name: string) => name.toLowerCase()

// Le rôle « listbox » (une liste de choix) manque aux types de React Native, qui ne connaissent que
// « list » ; react-native-web le transmet tel quel au navigateur.
const LISTBOX = { role: 'listbox' } as object
// Les pastilles : une liste (« liste, 2 éléments »), chacune un élément. Posées à la main plutôt que
// par `Stack accessibilityRole="list"` : l'élément doit pouvoir rétrécir (un nom long passe à la
// ligne au lieu de déborder à texte agrandi), ce que la case de `Stack` ne fait pas.
const LIST = { role: 'list' } as object
const LIST_ITEM = { role: 'listitem' } as object
// Hors de l'ordre de Tab sur le web, où Pressable s'y met de lui-même.
const NOT_A_TAB_STOP = Platform.OS === 'web' ? ({ tabIndex: -1 } as object) : {}
// Sur le web, Entrée ne fait pas perdre le focus au champ (react-native-web lit encore
// `blurOnSubmit`, absent des types) : on continue d'ajouter des outils.
const KEEP_FOCUS_ON_ENTER = Platform.OS === 'web' ? ({ blurOnSubmit: false } as object) : {}

// La touche reçue par onKeyPress (sur le web, l'évènement du navigateur, qu'on peut arrêter).
type KeyPress = { nativeEvent: { key: string; preventDefault?: () => void } }

export function ToolField({
  label,
  values,
  onChange,
  suggestions,
  onQuery,
  limit,
  labels,
  initialText = '',
}: Props) {
  const { colors } = useTheme()
  const body = textStyles.body
  const input = useRef<TextInput>(null)
  // useId : des identifiants stables, pour relier le champ à sa liste, à son choix actif et à son
  // compteur (web).
  const listId = useId()
  const counterId = useId()
  const [text, setText] = useState(initialText)
  const [focused, setFocused] = useState(false)
  // La liste est-elle demandée : au focus et à la frappe ; plus après un choix, Échap, Tab ou la
  // perte du focus.
  const [wanted, setWanted] = useState(initialText !== '')
  // Le choix en surbrillance, et la recherche à laquelle il appartient : une autre recherche repart
  // du premier.
  const [active, setActive] = useState<{ query: string; index: number } | null>(null)
  // Un choix touché : le champ perd le focus juste avant, mais la liste ne doit pas se refermer.
  const choosing = useRef(false)
  // Le focus rendu au champ après un choix ne rouvre pas la liste qu'on vient de fermer.
  const quietFocus = useRef(false)
  // La croix de chaque pastille (par nom, sans majuscules), pour y poser le focus après un retrait.
  const removeNodes = useRef(new Map<string, View>())
  const [focusTarget, setFocusTarget] = useState<{ to: string | null } | null>(null)
  // Une garde pour toutes les croix : la seconde tape d'une double tape tombe sur la pastille qui
  // vient de glisser sous le doigt, et ne la retire pas.
  const guard = useTapGuard()
  const pill = usePill(focused, false)

  const query = text.trim()
  const full = values.length >= limit
  const chosen = new Set(values.map(same))
  const options: Option[] = full
    ? []
    : [
        ...suggestions
          .filter((tool) => !chosen.has(same(tool.name)))
          .map((tool): Option => ({ kind: 'suggestion', tool })),
        // Le nom tapé, seulement s'il n'est ni proposé ni déjà choisi.
        ...(query !== '' &&
        !chosen.has(same(query)) &&
        !suggestions.some((tool) => same(tool.name) === same(query))
          ? [{ kind: 'add', name: query } as const]
          : []),
      ]
  const open = wanted && options.length > 0
  // Le choix en surbrillance : celui des flèches pour cette recherche ; sinon le premier, dès qu'on
  // a tapé (Entrée le prend). Champ vide, rien n'est en surbrillance avant une flèche : Entrée
  // n'ajoute pas un outil qu'on n'a pas demandé.
  const activeIndex = !open
    ? -1
    : active?.query === query && active.index < options.length
      ? active.index
      : query === ''
        ? -1
        : 0
  const optionId = (index: number) => `${listId}-${index}`
  const counter = labels.counter(values.length, limit)

  // Le focus, une fois la page redessinée après un retrait (web seulement : focusWithoutScroll ne
  // fait rien ailleurs), sans faire défiler la page.
  useEffect(() => {
    if (!focusTarget) return
    const node = focusTarget.to === null ? input.current : removeNodes.current.get(focusTarget.to)
    focusWithoutScroll(node ?? input.current)
  }, [focusTarget])

  const change = (next: string) => {
    setText(next)
    setWanted(true)
    onQuery(next.trim())
  }

  const choose = (option: Option) => {
    choosing.current = false
    const name = option.kind === 'add' ? option.name : option.tool.name
    if (full || chosen.has(same(name))) return
    onChange([...values, name])
    setText('')
    setWanted(false)
    setActive(null)
    onQuery('')
    // Touché à la souris, le choix a pris le focus : il revient dans le champ, pour continuer, sans
    // rouvrir la liste.
    if (input.current && !input.current.isFocused?.()) {
      quietFocus.current = true
      if (!focusWithoutScroll(input.current)) quietFocus.current = false
    }
  }

  const remove = (index: number) => {
    const name = values[index]
    if (name === undefined) return
    // La pastille suivante prend la place de celle-ci ; sinon la précédente ; sinon le champ.
    const next = values[index + 1] ?? values[index - 1]
    onChange(values.filter((_, i) => i !== index))
    setFocusTarget({ to: next === undefined ? null : same(next) })
  }

  // Le bouton de la souris s'enfonce sur la liste (web) : voir `MentionField`. Quand il remonte, où
  // que ce soit, on fait le point juste après le clic : un choix a rendu le focus au champ ; sinon,
  // rien n'est choisi et la liste se referme au lieu de rester orpheline.
  const startChoosing = () => {
    choosing.current = true
    if (typeof document === 'undefined') return
    const release = () => {
      document.removeEventListener('pointerup', release, true)
      document.removeEventListener('pointercancel', release, true)
      // setTimeout 0 : après le clic qui suit le relâchement (c'est lui qui choisit).
      setTimeout(() => {
        choosing.current = false
        if (!input.current?.isFocused?.()) setWanted(false)
      }, 0)
    }
    // true : à la phase de capture, avant qu'un élément de la page ne puisse arrêter l'évènement.
    document.addEventListener('pointerup', release, true)
    document.addEventListener('pointercancel', release, true)
  }

  const keyPress = (event: KeyPress) => {
    const { key } = event.nativeEvent
    // Appelée sur l'évènement lui-même : détachée de lui, le navigateur la refuse (« Illegal
    // invocation »).
    const preventDefault = () => event.nativeEvent.preventDefault?.()
    if (!open) {
      // Liste fermée (Échap) : la flèche du bas la rouvre, comme une liste déroulante.
      if (key === 'ArrowDown' && options.length > 0) {
        preventDefault()
        setWanted(true)
      }
      return
    }
    const count = options.length
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
    const option = options[activeIndex]
    if (key === 'Enter' && option) {
      // preventDefault : Entrée ajoute l'outil, et rien d'autre (le formulaire ne se publie pas).
      preventDefault()
      choose(option)
      return
    }
    if (key === 'Tab') {
      // Tab quitte le champ, comme d'habitude (pas de preventDefault) ; la liste se referme.
      setWanted(false)
      return
    }
    if (key === 'Escape') {
      // Échap referme d'abord la liste, et rien d'autre : la touche est prise, la feuille reste.
      preventDefault()
      setWanted(false)
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      {/* « Outils » et « 2 / 15 ». Toucher le nom donne le focus à la saisie ; ce n'est pas un
          contrôle de plus (ni rôle, ni arrêt de Tab) : la saisie porte déjà ce nom. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: space.md,
        }}
      >
        <Pressable
          accessible={false}
          focusable={false}
          {...NOT_A_TAB_STOP}
          onPress={() => input.current?.focus()}
          style={{ flexShrink: 1, maxWidth: '100%' }}
        >
          <Text variant="headline">{label}</Text>
        </Pressable>
        {/* nativeID devient l'attribut id sur le web : celui que cite aria-describedby du champ,
            qui y lit le nom (« 2 outils choisis sur 15 ») plutôt que le texte affiché. */}
        <Text
          nativeID={counterId}
          variant="mono"
          tone={full ? 'default' : 'muted'}
          tabular
          accessibilityLabel={counter.spoken}
        >
          {counter.shown}
        </Text>
      </View>

      {values.length > 0 ? (
        <View
          {...LIST}
          accessibilityLabel={labels.chosen}
          style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xs }}
        >
          {values.map((name, index) => (
            // La clé est le nom : la pastille qui glisse à la place d'une autre reste la même (son
            // focus, sa croix), au lieu d'être redessinée à la place de la précédente.
            <View
              key={same(name)}
              {...LIST_ITEM}
              style={{
                maxWidth: '100%',
                flexShrink: 1,
                // La zone de la croix fait 44 points : la rangée aussi, pour que deux rangées de
                // pastilles ne se chevauchent pas au toucher.
                minHeight: layout.touchTarget,
                justifyContent: 'center',
              }}
            >
              <Chip
                name={name}
                removeLabel={labels.remove(name)}
                onRemove={guard(() => remove(index))}
                removeRef={(node) => {
                  if (node) removeNodes.current.set(same(name), node)
                  else removeNodes.current.delete(same(name))
                }}
              />
            </View>
          ))}
        </View>
      ) : null}

      {/* Le champ : une pilule avec une loupe. Toute la pilule se touche (la loupe donne le focus à
          la saisie) ; ce n'est pas un contrôle de plus : ni rôle, ni arrêt de Tab. */}
      <Pressable
        accessible={false}
        focusable={false}
        {...NOT_A_TAB_STOP}
        onPress={() => input.current?.focus()}
        style={pill}
      >
        <Icon name="magnifying-glass" size={20} tone="muted" />
        <View
          style={{ flex: 1, minWidth: 0, minHeight: layout.touchTarget, justifyContent: 'center' }}
        >
          {text === '' ? (
            // Le texte d'attente, dessiné par l'appli : il passe à la ligne à texte agrandi, là où
            // celui du navigateur serait coupé (comme `SearchField`).
            <View
              aria-hidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              {...placeholderCopy}
              style={{ paddingVertical: space.xs, paddingRight: space.md }}
            >
              <Text tone="muted" selectable={false}>{`${labels.search}​`}</Text>
            </View>
          ) : null}
          <TextInput
            ref={input}
            accessibilityLabel={label}
            role="combobox"
            aria-expanded={open}
            {...comboboxLinks(listId, open, activeIndex >= 0 ? optionId(activeIndex) : undefined)}
            {...describedBy(counterId)}
            value={text}
            onChangeText={change}
            // À la limite, le champ refuse la saisie : le compteur dit pourquoi (« 15 / 15 »).
            editable={!full}
            // Un nom d'outil n'a pas plus de caractères que le contrat n'en accepte.
            maxLength={TOOL_MAX_LENGTH}
            placeholder={labels.search}
            placeholderTextColor="transparent"
            autoCapitalize="none"
            autoCorrect={false}
            {...KEEP_FOCUS_ON_ENTER}
            onKeyPress={keyPress}
            onFocus={() => {
              setFocused(true)
              if (quietFocus.current) {
                quietFocus.current = false
                return
              }
              setWanted(true)
            }}
            onBlur={() => {
              setFocused(false)
              // Tab vers la suite : la liste se referme. (Un choix touché fait aussi perdre le
              // focus, juste avant d'être pris : on le laisse faire.)
              if (!choosing.current) setWanted(false)
            }}
            style={{
              // Posée par-dessus le texte d'attente dessiné, sur toute la place de la zone.
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              minWidth: 0,
              minHeight: layout.touchTarget,
              paddingVertical: space.xs,
              paddingRight: space.md,
              fontFamily: fontName(body.family, body.weight),
              fontSize: body.size,
              lineHeight: body.lineHeight,
              color: colors.text,
              // La bordure de la pilule montre déjà le focus.
              outlineWidth: 0,
            }}
          />
        </View>
      </Pressable>

      {open ? (
        <View
          // Voir startChoosing : posé sur le cadre entier, un clic sur un bord ne referme pas la
          // liste avant que le choix ne soit pris.
          onPointerDown={startChoosing}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.group,
            borderWidth: borders.hairline,
            borderColor: colors.groupBorder,
            paddingVertical: space.xxs,
            overflow: 'hidden',
          }}
        >
          <View
            nativeID={listId}
            {...LISTBOX}
            accessibilityLabel={labels.suggestions}
            // Pas d'« accessible » : sur iOS, il ferait de la liste un seul bloc. Pas un arrêt de
            // Tab : les flèches, dans le champ, parcourent les choix.
            focusable={false}
          >
            {options.map((option, index) => {
              const selected = index === activeIndex
              const name = option.kind === 'add' ? option.name : option.tool.name
              return (
                <Pressable
                  key={`${option.kind}-${same(name)}`}
                  nativeID={optionId(index)}
                  role="option"
                  accessibilityLabel={
                    option.kind === 'add'
                      ? labels.add(option.name)
                      : labels.suggestion(option.tool.name, option.tool.uses)
                  }
                  aria-selected={selected}
                  // Pas un arrêt de Tab : on choisit au toucher, ou au clavier depuis le champ.
                  focusable={false}
                  tabIndex={-1}
                  onPressIn={() => {
                    choosing.current = true
                  }}
                  onPressOut={() => {
                    // Le doigt a glissé hors du choix : rien n'est choisi, la liste reste ouverte.
                    if (Platform.OS !== 'web') choosing.current = false
                  }}
                  onPress={() => choose(option)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    minHeight: layout.touchTarget,
                    paddingHorizontal: space.md,
                    paddingVertical: space.xs,
                    backgroundColor: selected || pressed ? colors.honeySoft : colors.surface,
                    ...(index > 0
                      ? { borderTopWidth: borders.hairline, borderTopColor: colors.groupSeparator }
                      : null),
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {option.kind === 'add' ? (
                      <Text variant="callout" weight={600} breakAnywhere>
                        {labels.add(option.name)}
                      </Text>
                    ) : (
                      <>
                        {/* Le nom en police à chasse fixe, comme les pastilles d'outils ; le nombre
                            de projets dessous, plus discret. */}
                        <Text variant="mono" breakAnywhere>
                          {option.tool.name}
                        </Text>
                        <Text variant="caption" tone="muted" tabular>
                          {labels.uses(option.tool.uses)}
                        </Text>
                      </>
                    )}
                  </View>
                  <Icon name="plus-circle" size={22} tone={selected ? 'amber' : 'muted'} />
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}
    </View>
  )
}

/** Une pastille d'outil choisi, avec sa croix « Retirer Claude ». */
function Chip({
  name,
  removeLabel,
  onRemove,
  removeRef,
}: {
  name: string
  removeLabel: string
  onRemove: () => void
  removeRef: (node: View | null) => void
}) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '100%',
        minHeight: layout.chipHeight,
        paddingLeft: space.lg,
        borderRadius: radii.pill,
        borderWidth: borders.hairline,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexShrink: 1, minWidth: 0, paddingVertical: space.xs }}>
        <Text variant="mono" breakAnywhere>
          {name}
        </Text>
      </View>
      <Pressable
        ref={removeRef}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        onPress={onRemove}
        // La zone à toucher fait 44 points, le rond dessiné 28 ; elle déborde de la pastille (36)
        // en haut et en bas, sans la faire grandir.
        style={({ pressed }) => ({
          width: layout.touchTarget,
          height: layout.touchTarget,
          marginVertical: -(layout.touchTarget - layout.chipHeight) / 2,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          ...(pressed ? { opacity: 0.6 } : null),
        })}
      >
        <View
          style={{
            width: layout.chipControl,
            height: layout.chipControl,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={14} tone="muted" />
        </View>
      </Pressable>
    </View>
  )
}
