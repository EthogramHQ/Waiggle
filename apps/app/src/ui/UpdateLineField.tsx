// Une ligne de « Ce qui a changé », dans la feuille « Nouvelle mise à jour » (R7a, scénario
// « Publier une mise à jour ») : devant, la pastille de sa famille (« Nouveau », « Réparé »,
// « Plus joli »), qui est un bouton et ouvre un petit menu des trois familles ; au-dessus du texte,
// le nom de la famille, dans sa couleur ; puis le texte du changement, 120 caractères au plus ; au
// bout, « Retirer cette ligne » (une croix), sauf quand il n'en reste qu'une.
//
// Le texte tient sur plusieurs lignes à l'écran (une phrase longue se lit en entier), mais c'est une
// seule ligne de la liste : Entrée n'y coupe rien, et un texte collé avec des retours à la ligne est
// remis sur une ligne (les retours deviennent des espaces).
//
// Le nom lu du champ dit son rang et sa famille : « Changement 2 sur 3, Réparé ». `index` compte
// depuis 0, comme les rangs des photos ; le nom lu compte depuis 1.
//
// Posée seule, la ligne dessine le cadre de son champ ; dans une liste (`UpdateLinesField`, qui la
// range dans un `FieldGroup`), elle devient une rangée de la carte groupée, et se teinte de miel
// doux tout entière quand on y écrit.

import { layout, radii, space } from '@ruche/brand'
import type { UpdateFamily } from '@ruche/contracts'
import { type Ref, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, type TextInput, View } from 'react-native'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { IconButton } from './IconButton'
import { Text, type TextTone } from './Text'
import { TextField } from './TextField'
import { useTheme } from './theme/ThemeProvider'
import { UpdateFamilyBadge } from './UpdateFamilyBadge'

/** Le nombre de caractères d'une ligne, au plus (le contrat de l'API dit la même chose). */
export const UPDATE_LINE_MAX = 120
/** Le compteur « 105 / 120 » apparaît sous le texte à partir de ce nombre de caractères. */
const COUNT_FROM = 100

/** Les trois familles, dans l'ordre du menu. */
const FAMILIES: UpdateFamily[] = ['new', 'fixed', 'polish']

/** La couleur du nom de chaque famille (les rôles `family<X>Text` de packages/brand). */
const familyTone = {
  new: 'familyNew',
  fixed: 'familyFixed',
  polish: 'familyPolish',
} as const satisfies Record<UpdateFamily, TextTone>

type Props = {
  family: UpdateFamily
  text: string
  onFamilyChange: (family: UpdateFamily) => void
  onTextChange: (text: string) => void
  /** Retire la ligne. Absent (la dernière ligne qui reste) : pas de bouton « Retirer ». */
  onRemove?: (() => void) | undefined
  /** L'exemple de la famille, dans le champ vide (« Par exemple : un mode nuit »). */
  placeholder: string
  /** Le message d'erreur de la ligne (« Écris au moins un changement avant de publier. »). */
  error?: string | undefined
  /** Une poignée vers la saisie, pour y poser le focus (la liste le fait à l'ajout et au retrait). */
  inputRef?: Ref<TextInput> | undefined
  /** Le rang de la ligne, depuis 0. */
  index: number
  /** Le nombre de lignes de la liste. */
  total: number
  /** Faux pendant l'envoi : ni le texte, ni la famille, ni la ligne ne changent. */
  editable?: boolean
}

/**
 * Les retours à la ligne : ceux du clavier, et les deux séparateurs d'Unicode (écrits par leur
 * numéro : ils sont invisibles dans le code).
 */
const BREAKS = String.raw`\r\n` + String.fromCodePoint(0x2028, 0x2029)
const TRAILING_BREAKS = new RegExp(`[${BREAKS}]+$`, 'u')
const INNER_BREAKS = new RegExp(`[^\\S${BREAKS}]*[${BREAKS}]+\\s*`, 'gu')

/**
 * Remet un texte sur une seule ligne : un retour à la ligne tapé à la fin (Entrée) disparaît, ceux
 * d'un texte collé deviennent une espace (avec les blancs qui les entourent).
 */
export const oneLine = (text: string): string =>
  text.replace(TRAILING_BREAKS, '').replace(INNER_BREAKS, ' ')

export function UpdateLineField({
  family,
  text,
  onFamilyChange,
  onTextChange,
  onRemove,
  placeholder,
  error,
  inputRef,
  index,
  total,
  editable = true,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Vrai pendant qu'on écrit dans la ligne : elle se teinte tout entière (la pastille comprise).
  const [focused, setFocused] = useState(false)
  const name = (one: UpdateFamily) => t(($) => $.update.family[one])
  const number = index + 1

  // Les choix du menu : les trois familles, celle de la ligne cochée.
  const items: ActionMenuItem[] = FAMILIES.map((one) => ({
    label: name(one),
    checked: one === family,
    onPress: () => {
      if (one !== family) onFamilyChange(one)
    },
  }))

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: space.xs,
        paddingRight: onRemove ? space.xs : 0,
        ...(focused ? { backgroundColor: colors.honeySoft } : null),
      }}
    >
      {/* La pastille, bouton du menu des familles : son nom dit la famille en cours (« Famille :
          Réparé ») ; le menu dit les trois choix et coche celui-là. */}
      <ActionMenu
        items={items}
        label={t(($) => $.project.updates.familyButton, { family: name(family) })}
        renderTrigger={({ onPress, expanded, ref }) => (
          <Pressable
            ref={ref}
            accessibilityRole="button"
            accessibilityLabel={t(($) => $.project.updates.familyButton, { family: name(family) })}
            aria-expanded={expanded}
            {...(Platform.OS === 'web' ? { 'aria-haspopup': 'menu' } : null)}
            disabled={!editable}
            aria-disabled={!editable}
            onPress={onPress}
            style={{
              width: layout.touchTarget,
              minHeight: layout.touchTarget,
              // Rond : l'anneau du focus clavier suit la forme de la pastille.
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UpdateFamilyBadge family={family} />
          </Pressable>
        )}
      />
      {/* La colonne du texte : elle prend la place qui reste et rétrécit à texte agrandi
          (flexBasis 0 et minWidth 0 : sans eux, le champ du navigateur garde sa largeur de départ
          et pousse la croix hors de la carte). */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
        {/* Le nom de la famille, au-dessus du texte, aligné sur lui (le champ a sa marge). */}
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          <Text variant="caption" weight={600} tone={familyTone[family]}>
            {name(family)}
          </Text>
        </View>
        <TextField
          compact
          multiline
          maxLines={4}
          label={t(($) => $.project.updates.lineLabel, {
            number,
            total,
            family: name(family),
          })}
          value={text}
          onChangeText={(next) => onTextChange(oneLine(next))}
          // Entrée ne coupe pas la ligne (web) : la touche ne fait rien dans le champ.
          onKeyPress={(event) => {
            if (Platform.OS === 'web' && event.nativeEvent.key === 'Enter') event.preventDefault()
          }}
          placeholder={placeholder}
          limit={UPDATE_LINE_MAX}
          countFrom={COUNT_FROM}
          error={error}
          inputRef={inputRef}
          editable={editable}
          autoCapitalize="sentences"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {onRemove ? (
        <IconButton
          icon="x"
          variant="bare"
          size="small"
          label={t(($) => $.project.updates.removeLineLabel, { number })}
          disabled={!editable}
          onPress={onRemove}
        />
      ) : null}
    </View>
  )
}
