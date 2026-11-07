// Le texte d'un commentaire, avec ses mentions (tranche 6b, puis R5b) : chaque « @pseudo » que l'API
// a reconnu devient une pastille miel au nom actuel du membre, « @Léa Moreau », qui ouvre sa page.
// Le reste du texte reste entier, tel qu'écrit (majuscules comprises).
//
// Le nom, pas le pseudo (R5b, décision D3) : le pseudo écrit dans le texte est celui du jour où le
// commentaire a été écrit ; Inès a pu en changer depuis, et un autre membre le porter aujourd'hui.
// L'API rend avec chaque mention le nom actuel de la personne mentionnée (`mention.name`), et c'est
// lui qu'on montre et qu'on lit (« Léa Moreau, ouvre son profil »). Le pseudo écrit ne paraît
// nulle part, ni à l'œil ni au lecteur d'écran.
//
// Le lien mène au membre gardé avec la mention (son identifiant, trouvé quand le commentaire a été
// écrit), jamais à « qui porte ce pseudo aujourd'hui ». Un « @pseudo » que l'API n'a pas rendu
// (inconnu, au-delà de 5, compte supprimé, membre bloqué) reste du texte simple.
//
// Les pastilles sont dans la phrase (des textes imbriqués) : elles suivent ses retours à la ligne et
// la taille de texte de l'appareil, et la phrase reste un seul nœud lu. Leur zone à toucher est
// celle de la ligne, comme tout lien dans un texte (voir Markdown.tsx).
//
// La forme de la pastille diffère selon la plateforme (relecture du plan R5b, ui-M5) :
// - sur le web, une partie de texte (`<span>`) prend des coins arrondis et un peu de marge autour
//   des lettres : une vraie pastille, qui garde ses coins des deux côtés d'un retour à la ligne ;
// - sur téléphone, React Native ignore le rayon et la marge d'un texte imbriqué : le fond miel y
//   est droit, et une espace fine insécable de chaque côté, dans la pastille, laisse un peu de miel
//   autour des lettres (insécable : elle ne se sépare jamais du nom par un retour à la ligne).
// Le nom lu « Léa Moreau, ouvre son profil » est posé sur la pastille ; VoiceOver (iOS) ignore le
// nom d'un texte imbriqué et lit le texte montré, « @Léa Moreau » : le nom actuel aussi, jamais le
// pseudo écrit. C'est voulu, et suffisant : le lien se trouve par le rotor des liens.
import { radii, space } from '@ruche/brand'
import { type Mention, splitMentions } from '@ruche/contracts'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Text as NativeText, Platform, type TextStyle } from 'react-native'
import { enterActivates } from './keyboard'
import { Text } from './Text'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le texte, tel qu'écrit. */
  text: string
  /** Les mentions rendues par l'API avec ce texte (pseudo en minuscules, son membre, son nom). */
  mentions: readonly Mention[]
  /** Une pastille touchée : l'identifiant du membre. */
  onMemberPress: (memberId: string) => void
  /**
   * Le texte entier s'arrête après ce nombre de lignes (le texte replié d'un long commentaire,
   * `ReadMore`) ; absent : tout le texte.
   */
  numberOfLines?: number | undefined
}

// L'espace fine insécable (U+202F), écrite par son numéro : un éditeur la changerait en espace
// ordinaire sans qu'on le voie.
const THIN = String.fromCodePoint(0x202f)

// La forme de la pastille (voir en tête du fichier). `boxDecorationBreak: 'clone'` : coupée en fin
// de ligne, elle garde ses coins et sa marge des deux côtés. Cette propriété CSS manque aux types
// de React Native, d'où la conversion.
const pillShape = (
  Platform.OS === 'web'
    ? {
        borderRadius: radii.pill,
        paddingHorizontal: space.xs,
        paddingVertical: space.xxs,
        boxDecorationBreak: 'clone',
      }
    : {}
) as TextStyle

/** Ce qui entoure le nom dans la pastille : de la marge sur le web, des espaces fines ailleurs. */
const pad = Platform.OS === 'web' ? '' : THIN

export function MentionText({ text, mentions, onMemberPress, numberOfLines }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // La mention de chaque pseudo reconnu (une Map : pseudo → mention, avec son membre et son nom).
  const known = new Map(mentions.map((mention) => [mention.handle, mention]))
  // La pastille : l'encre sur le miel (couple `text` / `mentionPill` mesuré dans `contrastPairs`,
  // packages/brand), en semi-gras ; elle hérite du reste (taille, hauteur de ligne) de la phrase.
  const pill: TextStyle = {
    backgroundColor: colors.mentionPill,
    color: colors.text,
    fontFamily: fontName('text', 600),
    ...pillShape,
  }
  return (
    // Texte brut ; selectable : on peut le copier. Un mot très long (une adresse) se coupe au lieu
    // de sortir de l'écran ; readable : sur un grand écran, la ligne garde une longueur confortable.
    // Toute la phrase est dans un seul `Text` de src/ui (jamais celui de React Native) : c'est lui
    // que `ReadMore` replie (`numberOfLines`) et dont il mesure les lignes (par le contexte de
    // `textLayout`, que lit `Text`) ; les pastilles sont des textes imbriqués dedans.
    // numberOfLines n'est posé que s'il est donné (un `undefined` explicite irait contre
    // exactOptionalPropertyTypes).
    <Text
      selectable
      breakAnywhere
      readable
      {...(numberOfLines !== undefined ? { numberOfLines } : null)}
    >
      {/* Sans mention, aucun découpage : le texte tel quel. */}
      {known.size === 0
        ? text
        : splitMentions(text).map((segment, index) => {
            const mention = segment.handle ? known.get(segment.handle) : undefined
            // La place du morceau dans le texte lui sert de clé : le texte ne se réordonne jamais.
            const key = `${index}`
            if (!mention) return <Fragment key={key}>{segment.text}</Fragment>
            const { memberId, name } = mention
            const open = () => onMemberPress(memberId)
            return (
              <NativeText
                key={key}
                accessibilityRole="link"
                accessibilityLabel={t(($) => $.mentions.pill, { name })}
                // Entrée ouvre le lien sur le web : sans adresse, ce n'est pas un vrai lien du
                // navigateur, et react-native-web ne s'en charge pas (voir keyboard.ts).
                {...enterActivates(open)}
                onPress={open}
                style={pill}
              >
                {`${pad}@${name}${pad}`}
              </NativeText>
            )
          })}
    </Text>
  )
}
