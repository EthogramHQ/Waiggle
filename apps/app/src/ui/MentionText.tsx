// Le texte d'un commentaire, avec ses mentions (tranche 6b) : chaque « @pseudo » que l'API a
// reconnu devient un lien vers la page du membre. Le texte reste entier, tel qu'écrit (majuscules
// comprises) : seules les mentions changent d'allure, soulignées, couleur ambre.
//
// Le lien mène au membre gardé avec la mention (son identifiant, trouvé quand le commentaire a été
// écrit), jamais à « qui porte ce pseudo aujourd'hui » : si Inès change de pseudo, et qu'un autre
// prend « ines_morel », le lien de l'ancien commentaire mène toujours à Inès. Un « @pseudo » que
// l'API n'a pas rendu (inconnu, au-delà de 5, compte supprimé) reste du texte simple.
//
// Les liens sont dans la phrase (des Text imbriqués) : ils suivent ses retours à la ligne et la
// taille de texte de l'appareil. Leur zone à toucher est celle de la ligne, comme tout lien dans
// un texte (voir Markdown.tsx).
import { type Mention, splitMentions } from '@ruche/contracts'
import { Fragment } from 'react'
import { enterActivates } from './keyboard'
import { Text } from './Text'

type Props = {
  /** Le texte, tel qu'écrit. */
  text: string
  /** Les mentions rendues par l'API avec ce texte (pseudo en minuscules, et son membre). */
  mentions: readonly Mention[]
  /** Un lien de mention touché : l'identifiant du membre. */
  onMemberPress: (memberId: string) => void
}

export function MentionText({ text, mentions, onMemberPress }: Props) {
  // Le membre de chaque pseudo reconnu (une Map : pseudo → identifiant).
  const members = new Map(mentions.map((mention) => [mention.handle, mention.memberId]))
  return (
    // Texte brut ; selectable : on peut le copier. Un mot très long (une adresse) se coupe au lieu
    // de sortir de l'écran ; readable : sur un grand écran, la ligne garde une longueur confortable.
    <Text selectable breakAnywhere readable>
      {/* Sans mention, aucun découpage : le texte tel quel. */}
      {members.size === 0
        ? text
        : splitMentions(text).map((segment, index) => {
            const memberId = segment.handle ? members.get(segment.handle) : undefined
            // La place du morceau dans le texte lui sert de clé : le texte ne se réordonne jamais.
            const key = `${index}`
            if (!memberId) return <Fragment key={key}>{segment.text}</Fragment>
            const open = () => onMemberPress(memberId)
            return (
              <Text
                key={key}
                accessibilityRole="link"
                // Entrée ouvre le lien sur le web : sans adresse, ce n'est pas un vrai lien du
                // navigateur, et react-native-web ne s'en charge pas (voir keyboard.ts).
                {...enterActivates(open)}
                onPress={open}
                tone="accent"
                weight={600}
                underline
              >
                {segment.text}
              </Text>
            )
          })}
    </Text>
  )
}
