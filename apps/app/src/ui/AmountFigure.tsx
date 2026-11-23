// Un montant en grand, suivi de son unité en petit (R19, planches R19-Recolte et R19-Miel) :
// « 85 pollen » de « Cette semaine », « 35 miel » de « Mon miel ». La phrase arrive entière et déjà
// traduite (« {{amount}} pollen », « {{amount}} miel ») : le composant y retrouve le nombre et
// l'écrit en grand, le reste garde la taille du texte courant. Ainsi l'ordre des mots reste celui
// de la langue (« 85 pollen » en français comme en anglais aujourd'hui, mais une langue qui
// mettrait l'unité devant n'aurait rien à changer ici).
//
// Un seul texte, avec un morceau imbriqué en grand : le lecteur d'écran lit « 85 pollen » d'un
// trait, et la phrase se cherche telle quelle dans un test (`getByText('85 pollen')`).
import { Text } from './Text'

type Props = {
  /** La phrase entière, déjà traduite (« 85 pollen »). */
  text: string
  /** Le nombre à écrire en grand ; absent de la phrase, elle s'écrit d'un bloc, sans rien en grand. */
  amount: number
}

export function AmountFigure({ text, amount }: Props) {
  const number = String(amount)
  const at = text.indexOf(number)
  if (at < 0) {
    return (
      <Text variant="headline" tabular>
        {text}
      </Text>
    )
  }
  const before = text.slice(0, at)
  const after = text.slice(at + number.length)
  return (
    // Le texte autour (l'unité) en gras courant ; le nombre, imbriqué, en grand titre. Les chiffres
    // de même largeur : le montant ne fait pas bouger l'unité quand il change d'un chiffre.
    <Text variant="headline">
      {before}
      <Text variant="display" tabular>
        {number}
      </Text>
      {after}
    </Text>
  )
}
