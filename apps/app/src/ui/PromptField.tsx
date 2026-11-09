// Le champ d'un prompt (tranche R6a, planche `R6-Publier-Suite`) : « Le prompt de départ » et « Les
// autres prompts » du formulaire de publication. Un TextField multiligne en chasse fixe, avec trois
// protections de plus :
// - son compteur est toujours visible (« 148 / 4 000 ») et lu en clair (« 148 caractères sur
//   4 000 ») ; la limite est seulement affichée : un texte collé trop long n'est jamais coupé en
//   silence, l'erreur vient de l'écran ;
// - un texte collé est nettoyé à la saisie par `cleanPrompt` (le contrat, la même fonction que
//   l'API) : les caractères invisibles sont retirés, une ligne le dit et l'annonce, et le curseur
//   reste après le texte collé (relecture du plan, ui-I9) ;
// - une clé d'API collée (`findApiKeys`, le contrat) est montrée masquée dans un encadré sous le
//   champ (« Clé : sk-proj…a91f »), avec l'avertissement et « Retirer la clé », qui la remplace par
//   `removedPlaceholder` (« [clé retirée] »). Le champ ne surligne pas une partie de son texte
//   (ui-I9). En modification, une clé déjà enregistrée ajoute « désactive-la chez son fournisseur ».
//
// L'encadré prévient, il ne bloque pas : on peut publier quand même (choix 3 du scénario).
//
// Confidentialité (sec-A5) : le prompt et la clé, même masquée, ne vont qu'à l'écran. Aucun
// `console.*`, aucun stockage, aucune adresse ; la recherche se fait ici, sur l'appareil.
import { borders, radii, space } from '@ruche/brand'
import { type ApiKeyMatch, cleanPrompt, findApiKeys, removeApiKey } from '@ruche/contracts'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { type TextInput, View } from 'react-native'
import { Button } from './Button'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import { LiveStatus } from './LiveStatus'
import { Text } from './Text'
import { TextField } from './TextField'
import { useTheme } from './theme/ThemeProvider'

/** Les textes du champ, venus de t() par l'écran (`project.form.*`). */
export type PromptFieldLabels = {
  /** Le compteur : « 148 / 4 000 » à l'œil, « 148 caractères sur 4 000 » au lecteur d'écran. */
  counter: (count: number, max: number) => { shown: string; spoken: string }
  /** « 2 caractères invisibles ont été retirés. » */
  invisibleRemoved: (count: number) => string
  /** « Clé : sk-proj…a91f » */
  keyFound: (masked: string) => string
  /** « Une clé d'API est collée ici. Les membres qui liront ce prompt… » */
  keyWarning: string
  /** « Si elle a déjà été visible, la retirer ne suffit pas : désactive-la chez son fournisseur. » */
  keyRevoke: string
  /** « Retirer la clé », quand il n'y en a qu'une. */
  removeKey: string
  /** « Retirer la clé sk-proj…a91f », quand il y en a plusieurs : chaque bouton dit la sienne. */
  removeKeyNamed: (masked: string) => string
}

type Props = {
  label: string
  /** Le prompt, déjà nettoyé (le champ ne rend que du texte nettoyé). */
  value: string
  onChange: (text: string) => void
  /** La limite affichée par le compteur (`PROJECT_PROMPT_MAX_LENGTH`). */
  max: number
  /** « Retire ce qui est personnel : noms, adresses, mots de passe. » */
  hint: string
  labels: PromptFieldLabels
  /** Ce qui remplace une clé retirée : « [clé retirée] ». */
  removedPlaceholder: string
  error?: string | undefined
  /**
   * Le prompt tel qu'il est enregistré (modification). Une clé qui s'y trouve déjà a peut-être été
   * vue : l'encadré ajoute alors `keyRevoke`. Absent : un nouveau projet, aucune clé n'a été vue.
   */
  savedValue?: string | undefined
}

type Selection = { start: number; end: number }

/** Le nombre de caractères (points de code) d'un texte : un caractère retiré en vaut un. */
const characters = (text: string) => [...text].length

export function PromptField({
  label,
  value,
  onChange,
  max,
  hint,
  labels,
  removedPlaceholder,
  error,
  savedValue,
}: Props) {
  const { colors } = useTheme()
  const input = useRef<TextInput>(null)
  // Où était le curseur avant la frappe ou le collage (onSelectionChange) : pour savoir où finit
  // le texte collé. Une ref : le changer ne redessine rien.
  const selection = useRef<Selection | null>(null)
  // Le curseur à poser après un collage nettoyé ; null le reste du temps, pour ne jamais retenir le
  // curseur que le membre déplace lui-même.
  const [caret, setCaret] = useState<Selection | null>(null)
  // Le nombre de caractères invisibles retirés au dernier collage qui en contenait. La ligne reste
  // jusqu'à ce que le champ soit vidé : elle dit encore vrai, et ce qui suit ne remonte pas à la
  // frappe suivante.
  const [removed, setRemoved] = useState(0)
  // Le focus à rendre après un retrait : au champ après la dernière clé, sinon au bouton qui a pris
  // la place de celui touché (même rang, ou le dernier).
  const pendingFocus = useRef<'field' | number | null>(null)
  const buttons = useRef<(View | null)[]>([])
  const hintId = useId()

  // Les clés, cherchées dans le texte nettoyé, celui qu'on voit et qu'on publie (sec-A4).
  const keys = useMemo(() => findApiKeys(value), [value])
  // Déjà enregistrées : présentes, telles quelles, dans le prompt enregistré.
  const alreadySaved = useMemo(() => {
    if (!savedValue) return false
    const saved = new Set(findApiKeys(savedValue).map((match) => match.raw))
    return keys.some((match) => saved.has(match.raw))
  }, [keys, savedValue])

  const change = (raw: string) => {
    const cleaned = cleanPrompt(raw)
    const lost = characters(raw) - characters(cleaned)
    if (lost > 0) {
      // Où le navigateur a laissé le curseur dans le texte brut : après le texte collé, qui a
      // remplacé la sélection d'avant. Le même endroit dans le texte nettoyé : la longueur de ce
      // qui le précède, une fois nettoyé. (Sans sélection connue : à la fin du texte d'avant.)
      const before = selection.current ?? { start: value.length, end: value.length }
      const end = Math.min(
        Math.max(before.start + raw.length - (value.length - (before.end - before.start)), 0),
        raw.length,
      )
      const at = cleanPrompt(raw.slice(0, end)).length
      setCaret({ start: at, end: at })
      setRemoved(lost)
    } else if (cleaned === '') {
      setRemoved(0)
    }
    onChange(cleaned)
  }

  // Un texte reçu de l'écran qui contient encore des invisibles (un brouillon rouvert, le
  // catalogue) : nettoyé dès qu'il arrive, et dit de la même façon. Le champ ne montre jamais un
  // texte autre que celui qui sera publié. (Ce que le membre tape passe par `change`, déjà nettoyé :
  // l'effet ne trouve alors rien.)
  useEffect(() => {
    const cleaned = cleanPrompt(value)
    if (cleaned === value) return
    setRemoved(characters(value) - characters(cleaned))
    onChange(cleaned)
  }, [value, onChange])

  const remove = (match: ApiKeyMatch, index: number) => {
    const next = removeApiKey(value, match, removedPlaceholder)
    // Les positions des clés suivantes ont bougé : elles sont recalculées au rendu (findApiKeys
    // sur le nouveau texte), jamais reprises de l'ancien (sec-A5).
    pendingFocus.current = findApiKeys(next).length === 0 ? 'field' : index
    onChange(next)
  }

  // Après le rendu qui suit un retrait : le focus revient au champ (la dernière clé partie, son
  // bouton avec elle) ou au bouton qui suit. Sans cela, le focus tomberait en haut de la page.
  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    if (target === 'field') {
      if (!focusWithoutScroll(input.current)) input.current?.focus()
      return
    }
    const button = buttons.current[Math.min(target, keys.length - 1)]
    if (button) focusWithoutScroll(button)
  }, [keys])

  const counter = labels.counter(value.length, max)
  const several = keys.length > 1
  // Ce que la région polie annonce quand une clé paraît : chaque clé masquée, puis l'avertissement.
  const keyAnnouncement =
    keys.length > 0
      ? [...keys.map((match) => labels.keyFound(match.masked)), labels.keyWarning].join(' ')
      : ''

  return (
    <View style={{ gap: space.sm }}>
      <TextField
        label={label}
        value={value}
        onChangeText={change}
        error={error}
        multiline
        maxLines={12}
        code
        showCount
        limit={max}
        counterText={counter}
        // L'aide est écrite plus bas, sous l'encadré d'une clé (planche) : le champ la cite.
        describedElsewhere={{ ids: hintId, spoken: hint }}
        autoCorrect={false}
        spellCheck={false}
        inputRef={input}
        onSelectionChange={(event) => {
          selection.current = event.nativeEvent.selection
          if (caret) setCaret(null)
        }}
        {...(caret ? { selection: caret } : null)}
      />
      {/* La région qui annonce une clé : toujours montée, vide sans clé (LiveStatus). L'encadré,
          lui, se voit ; la région ne se dessine pas, pour ne pas le dire deux fois à l'œil. */}
      <LiveStatus message={keyAnnouncement} visible={false} />
      {keys.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            gap: space.sm,
            padding: space.md,
            borderRadius: radii.small,
            backgroundColor: colors.errorBand,
            borderWidth: borders.hairline,
            borderColor: colors.errorBorder,
          }}
        >
          <View aria-hidden style={{ paddingTop: space.xxs }}>
            <Icon name="key" size={20} tone="danger" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
            <Text variant="callout" weight={600} tone="danger">
              {labels.keyWarning}
            </Text>
            {alreadySaved ? (
              <Text variant="callout" tone="danger">
                {labels.keyRevoke}
              </Text>
            ) : null}
            {keys.map((match, index) => (
              // Le rang pour clé : quand la première clé part, le bouton suivant reprend la place
              // (et le focus) de celui touché, au lieu de disparaître avec lui.
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: le rang est voulu (voir au-dessus).
                key={index}
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: space.sm,
                }}
              >
                {/* Sans flexGrow : sur ordinateur, le bouton reste juste après sa clé au lieu de
                    partir au bout de la ligne ; sur téléphone, il passe dessous. */}
                <View style={{ flexShrink: 1, flexBasis: 'auto', maxWidth: '100%' }}>
                  <Text variant="mono" tone="danger">
                    {labels.keyFound(match.masked)}
                  </Text>
                </View>
                <Button
                  ref={(node) => {
                    buttons.current[index] = node
                  }}
                  label={several ? labels.removeKeyNamed(match.masked) : labels.removeKey}
                  variant="secondary"
                  size="small"
                  onPress={() => remove(match, index)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View nativeID={hintId} style={{ paddingHorizontal: space.sm }}>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space.sm }}>
        <LiveStatus message={removed > 0 ? labels.invisibleRemoved(removed) : ''} small />
      </View>
    </View>
  )
}
