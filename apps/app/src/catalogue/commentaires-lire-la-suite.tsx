// La section « Lire la suite » du catalogue (R5b) : le repli d'un commentaire long, dans ses états.
// - Un commentaire court : il tient dans ses 10 lignes, aucun bouton.
// - Un commentaire long (14 lignes et plus) : replié après 10 lignes, « Lire la suite » dessous.
// - Le même, déplié : le texte entier, et « Réduire ».
// - Un repli après 3 lignes : le réglage `lines`, pour voir le bouton même sur un écran large.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (plusieurs personnes écrivent le
// catalogue en même temps). Ses exemples, un outil de développement absent de l'appli publiée, sont
// écrits ici en français et en anglais. Le jour et la nuit se voient sur les captures du catalogue,
// prises dans les deux thèmes.
import { useTranslation } from 'react-i18next'
import { ReadMore } from '../ui/ReadMore'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Lire la suite (R5b)',
  short: 'Un commentaire court : il tient dans ses 10 lignes, sans bouton.',
  long: 'Un commentaire long : replié après 10 lignes, « Lire la suite » dessous.',
  open: 'Le même, déplié : le texte entier, et « Réduire ».',
  three:
    'Un repli après 3 lignes (le réglage `lines`) : le bouton se voit aussi sur un écran large.',
  shortBody:
    'Trop bien, ton agent de recettes ! Je l’essaie ce soir avec ce qui reste dans le frigo.',
  longBody: [
    'J’ai essayé ton agent de recettes tout le week-end, voici ce que j’en retiens.',
    'D’abord, il comprend très bien les restes : « deux carottes, un oignon, du riz d’hier ».',
    'Il propose trois idées à chaque fois, et la première est presque toujours la bonne.',
    'Les temps de cuisson sont justes, même pour le four de mon studio, qui chauffe mal.',
    'Petit bémol : il oublie parfois le sel dans la liste des ingrédients.',
    'Et quand je dis « sans gluten », il le retient pour la recette, pas pour la suivante.',
    'Mes enfants ont adoré la version « chef pirate » des consignes, ils lisaient tout à voix haute.',
    'Le mode « courses » serait génial s’il regroupait les articles par rayon.',
    'J’ai aussi testé en anglais : les mesures restent en grammes, c’est parfait pour moi.',
    'Une idée : garder les recettes qu’on a aimées, pour les retrouver le soir suivant.',
    'Une autre : demander combien de personnes on est avant de donner les quantités.',
    'En tout cas, merci : c’est le premier outil de ce genre que j’ouvre tous les soirs.',
    'Je le montre à ma sœur demain, elle cherche exactement ça depuis des mois.',
    'Bravo, et vivement la suite !',
  ].join('\n'),
}

const en: typeof fr = {
  title: 'Read more (R5b)',
  short: 'A short comment: it fits in its 10 lines, no button.',
  long: 'A long comment: folded after 10 lines, “Read more” underneath.',
  open: 'The same, unfolded: the whole text, and “Show less”.',
  three: 'Folded after 3 lines (the `lines` setting): the button shows on a wide screen too.',
  shortBody: 'Love your recipe agent! I’m trying it tonight with what’s left in the fridge.',
  longBody: [
    'I tried your recipe agent all weekend, here is what I make of it.',
    'First, it understands leftovers very well: “two carrots, an onion, yesterday’s rice”.',
    'It suggests three ideas each time, and the first one is almost always right.',
    'Cooking times are accurate, even for the oven in my studio, which heats badly.',
    'One small catch: it sometimes forgets salt in the list of ingredients.',
    'And when I say “gluten free”, it remembers for that recipe, not for the next one.',
    'My kids loved the “pirate chef” version of the steps, they read everything out loud.',
    'The “shopping” mode would be great if it grouped items by aisle.',
    'I also tried it in French: measures stay in grams, which is perfect for me.',
    'An idea: keep the recipes we liked, to find them again the next evening.',
    'Another one: ask how many people we are before giving the amounts.',
    'Anyway, thank you: it’s the first tool of its kind I open every evening.',
    'I’m showing it to my sister tomorrow, she has been looking for exactly this for months.',
    'Well done, and can’t wait for what comes next!',
  ].join('\n'),
}

export function ReadMoreCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.short}</Text>
      <ReadMore>
        {(numberOfLines) => <Text numberOfLines={numberOfLines}>{l.shortBody}</Text>}
      </ReadMore>

      <Text tone="secondary">{l.long}</Text>
      <ReadMore>
        {(numberOfLines) => <Text numberOfLines={numberOfLines}>{l.longBody}</Text>}
      </ReadMore>

      <Text tone="secondary">{l.open}</Text>
      <ReadMore initiallyExpanded>
        {(numberOfLines) => <Text numberOfLines={numberOfLines}>{l.longBody}</Text>}
      </ReadMore>

      <Text tone="secondary">{l.three}</Text>
      <ReadMore lines={3}>
        {(numberOfLines) => <Text numberOfLines={numberOfLines}>{l.longBody}</Text>}
      </ReadMore>
    </Stack>
  )
}
