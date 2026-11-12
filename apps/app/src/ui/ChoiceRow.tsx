// Une ligne de choix des réglages, qui s'ouvre sur place (R8, planche `R8-Reglages`) : « Réactions
// · Dans le récap › ». Fermée, elle montre son libellé, le choix actuel et une flèche ; touchée,
// elle s'ouvre sous elle-même en boutons radio (RadioGroup) sur un fond miel pâle, et la flèche se
// tourne vers le haut. Le parent décide laquelle est ouverte (`open`, `onToggle`) : une seule à la
// fois sur l'écran des notifications. Un choix pris garde la ligne ouverte : on voit ce qu'on vient
// de cocher, et les flèches du clavier passent d'un choix à l'autre sans que tout se referme.
//
// Pour les lecteurs d'écran, la ligne est un bouton qui dit s'il est déplié (`aria-expanded`), nommé
// « libellé, choix actuel » (« Réactions, Dans le récap ») : le choix s'entend avant d'ouvrir. Une
// note sous le libellé (« Le récap est coupé : rien ne part ») est lue après ce nom : le nom du
// bouton cache le texte qu'il contient, la note y est donc reliée à part, par `aria-describedby`
// sur le web et par l'indice (`accessibilityHint`) sur téléphone, comme pour Switch.
//
// Elle se pose dans un ListGroup, comme une ListRow : mêmes marges, même hauteur, même anneau de
// focus dessiné à l'intérieur (le groupe rogne ce qui dépasse).
import { layout, space } from '@ruche/brand'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { describedBy } from './aria'
import { Icon } from './Icon'
import { MIN_NAME } from './ListGroup'
import { RadioGroup } from './Radio'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

export type ChoiceRowChoice<T extends string> = { value: T; label: string }

// <T extends string> : un composant « générique », comme RadioGroup. T est le type des valeurs
// possibles ('now' | 'digest' | 'never') : TypeScript vérifie que la valeur et les choix concordent.
type Props<T extends string> = {
  /** Le libellé de la ligne (« Réactions ») ; aussi le nom lu du groupe de choix ouvert. */
  label: string
  /** Le choix actuel. */
  value: T
  /** Les choix offerts, dans l'ordre affiché. */
  choices: ChoiceRowChoice<T>[]
  /** La ligne est ouverte : ses choix se montrent dessous. */
  open: boolean
  /** La ligne touchée : le parent l'ouvre (et ferme l'autre) ou la referme. */
  onToggle: () => void
  /** Un choix pris : la ligne reste ouverte, c'est au parent de l'enregistrer. */
  onChange: (value: T) => void
  /** Une phrase sous le libellé, qui la décrit (« Le récap est coupé : rien ne part ») ; null : rien. */
  note?: string | null
  /** Ni la ligne ni ses choix ne répondent : tout pâlit. */
  disabled?: boolean
}

export function ChoiceRow<T extends string>({
  label,
  value,
  choices,
  open,
  onToggle,
  onChange,
  note = null,
  disabled = false,
}: Props<T>) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie la
  // ligne au texte de sa note.
  const noteId = useId()
  const current = choices.find((choice) => choice.value === value)?.label ?? ''
  const name = t(($) => $.notificationSettings.rowName, { label, choice: current })

  return (
    // Ouverte, la ligne et ses choix partagent le fond miel pâle : on voit d'un coup d'œil à quel
    // type appartiennent les boutons radio (couleurs mesurées sur ce fond, contrastPairs).
    <View style={open ? { backgroundColor: colors.highlightSoft } : null}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        // Sur le web, aria-describedby suffit ; ailleurs, l'indice joue ce rôle.
        {...describedBy(note ? noteId : undefined)}
        accessibilityHint={Platform.OS === 'web' || !note ? undefined : note}
        // Pressable traduit aussi ces états pour les lecteurs d'écran du téléphone.
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={onToggle}
        {...insetFocus}
        style={({ pressed }) => ({
          justifyContent: 'center',
          gap: space.xxs,
          minHeight: layout.controlHeight.regular,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          backgroundColor: pressed && !disabled ? colors.surfaceGrouped : 'transparent',
          opacity: disabled ? 0.55 : 1,
        })}
      >
        {/* La rangée du libellé et du choix. Quand la place manque (320 points, texte à 200 %), le
            choix et la flèche passent sous le libellé au lieu de l'écraser, comme dans une ListRow. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.md,
            rowGap: space.xxs,
          }}
        >
          {/* Le libellé : `flexGrow` et une vraie `flexBasis`, jamais `flex: 1` (sa base nulle ne
              ferait jamais passer le choix à la ligne). Ouverte, il s'appuie : c'est le titre des
              choix du dessous. */}
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: MIN_NAME, minWidth: 0 }}>
            <Text weight={open ? 600 : 400}>{label}</Text>
          </View>
          {/* Le choix actuel et la flèche, d'un seul bloc, rangés à droite même passés à la ligne. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              marginLeft: 'auto',
              maxWidth: '100%',
              flexShrink: 1,
            }}
          >
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text tone="muted">{current}</Text>
            </View>
            {/* La même flèche que les lignes qui mènent ailleurs, tournée vers le haut une fois
                ouverte : elle dit que la ligne se referme. */}
            <View
              style={{ flexShrink: 0, transform: [{ rotate: open ? '-90deg' : '0deg' }] }}
              aria-hidden
            >
              <Icon name="caret-right" size={18} tone="muted" />
            </View>
          </View>
        </View>
        {/* La note, sur toute la largeur de la ligne, sous le libellé (planche) : elle ne se
            serre pas à côté du choix. */}
        {note ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            {/* L'icône dans sa vue : sur le web, un dessin seul rétrécit près d'un texte. */}
            <View style={{ flexShrink: 0 }}>
              <Icon name="bell-slash" size={16} tone="muted" />
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text variant="caption" tone="muted" nativeID={noteId}>
                {note}
              </Text>
            </View>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        // Les choix s'alignent sur le libellé. Leur question n'est pas réécrite (`labelHidden`) :
        // le libellé de la ligne, juste au-dessus, la dit déjà ; elle reste leur nom lu.
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <RadioGroup
            label={label}
            labelHidden
            options={choices.map((choice) => ({ ...choice, disabled }))}
            value={value}
            onChange={onChange}
          />
        </View>
      ) : null}
    </View>
  )
}
