// Le pollen de la semaine par famille de gestes (R19, rubrique « Cette semaine » de « Ma récolte »,
// planche R19-Recolte) : une ligne par famille, son icône, son nom, son pollen, et une barre dessous
// dont la longueur compare les familles entre elles (la plus fournie remplit le rail).
//
// Les familles se nomment par leurs gestes (« Tests et retours »), jamais par leur titre
// (« Gardienne », qui reste au profil) : option a15 des planches. Une famille sans pollen cette
// semaine n'a pas de ligne : une barre vide ne dirait rien. Les lignes vont de la plus fournie à la
// moins fournie, comme sur la planche ; à égalité, dans l'ordre du contrat (`FAMILIES`).
//
// Pour un lecteur d'écran, c'est une liste : chaque ligne est un élément lu d'un tenant, « Tests et
// retours, 12 pollen ». La barre seule ne dirait rien (et son rail ne contraste qu'à 1,48 : elle est
// décorative, le chiffre écrit à côté porte l'information).

import { radii, space } from '@ruche/brand'
import { FAMILIES, type Family } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le pollen de la semaine par famille (`Harvest.week.byFamily` du contrat). */
  byFamily: Record<Family, number>
}

/** L'icône de chaque famille, dans sa pastille : ce que ses gestes font. */
const familyIcons: Record<Family, IconName> = {
  // Commentaires et réactions.
  forager: 'chat-circle',
  // Projets et mises à jour.
  builder: 'rocket-launch',
  // Tests et retours : le doigt qui teste une démo.
  keeper: 'hand-tap',
  // Ruches et invitations.
  dancer: 'hexagon',
}

/** La pastille de l'icône (points), et la hauteur de la barre : celles de la planche. */
const ICON_DISC = 36
const BAR_HEIGHT = 8
/** L'écart entre la pastille et le nom : la barre commence sous le nom, décalée d'autant. */
const ICON_GAP = space.sm

export function FamilyBars({ byFamily }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Les familles qui ont du pollen, de la plus fournie à la moins fournie. `sort` garde l'ordre
  // d'origine à égalité (tri stable) : celui du contrat.
  const rows = FAMILIES.filter((family) => byFamily[family] > 0).sort(
    (a, b) => byFamily[b] - byFamily[a],
  )
  const top = rows.length > 0 ? byFamily[rows[0] as Family] : 0
  if (rows.length === 0) return null

  return (
    <View role="list" style={{ gap: space.md }}>
      {rows.map((family) => {
        const amount = byFamily[family]
        const name = t(($) => $.game.families[family])
        // La part du rail que la barre remplit ; au moins un peu, pour qu'une petite famille se voie.
        const share = Math.max(0.04, amount / top)
        return (
          <View
            key={family}
            // Lu d'un seul tenant, sur téléphone comme sur le web (rôle d'élément de liste, nommé).
            accessible
            role="listitem"
            accessibilityLabel={t(($) => $.game.harvest.week.family, { family: name, amount })}
            style={{ gap: space.xs }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: ICON_GAP }}>
              <View
                style={{
                  width: ICON_DISC,
                  height: ICON_DISC,
                  flexShrink: 0,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.honeySoft,
                }}
              >
                <Icon name={familyIcons[family]} size={18} tone="amber" />
              </View>
              {/* Le nom rétrécit et passe à la ligne (texte agrandi, colonne étroite) ; le chiffre
                  garde sa place à droite. */}
              <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                <Text variant="callout" weight={600}>
                  {name}
                </Text>
              </View>
              <Text variant="callout" weight={700} tabular>
                {String(amount)}
              </Text>
            </View>
            <View
              style={{
                marginLeft: ICON_DISC + ICON_GAP,
                height: BAR_HEIGHT,
                borderRadius: radii.pill,
                overflow: 'hidden',
                backgroundColor: colors.surfaceGrouped,
              }}
            >
              <View
                style={{
                  width: `${share * 100}%`,
                  height: '100%',
                  borderRadius: radii.pill,
                  backgroundColor: colors.honey,
                }}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}
