// La section « Socle de la page projet » du catalogue (R5a) : trois composants partagés par
// plusieurs écrans de la tranche, dans tous leurs états.
// - Callout : le ton d'origine et le ton `caution` (la prudence sous un prompt), avec ou sans
//   phrase d'explication.
// - Disclosure : avec sa pastille ou en simple ligne (« Les autres prompts · 2 »), replié et déplié.
// - ButtonPair : deux boutons côte à côte, 360 points au plus chacun, empilés dans une colonne
//   étroite ; un seul bouton ; un bouton et sa légende.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (plusieurs personnes écrivent le
// catalogue en même temps). Ses exemples, un outil de développement absent de l'appli publiée, sont
// écrits ici en français et en anglais. Le jour et la nuit se voient sur les captures du catalogue,
// prises dans les deux thèmes.
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { ButtonPair } from '../ui/ButtonPair'
import { Callout } from '../ui/Callout'
import { CodeBlock } from '../ui/CodeBlock'
import { Disclosure } from '../ui/Disclosure'
import { FollowButton } from '../ui/FollowButton'
import { MetaLine } from '../ui/MetaLine'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Socle de la page projet (R5a)',
  calloutPlain: 'Callout, ton d’origine (changer de mot de passe).',
  plainTitle: 'Tes autres appareils seront déconnectés',
  plainBody: 'Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe.',
  calloutCaution:
    'Callout, ton « caution » : fond ambre doux, titre et icône en ambre foncé, phrase à l’encre. Sans phrase, puis avec.',
  cautionTitle: 'Relis-le avant de t’en servir.',
  cautionBody: 'Ne donne jamais à une IA ton mot de passe, une clé ou un code reçu.',
  cautionWhole:
    'Relis-le avant de t’en servir. Ne donne jamais à une IA ton mot de passe, une clé ou un code reçu.',
  disclosure:
    'Disclosure : avec sa pastille (formulaire), puis en simple ligne, sans pastille (contenu secondaire d’une page). Replié, puis déplié.',
  recipe: 'Ajouter la recette',
  recipeHint: 'Les outils et le temps passé, si tu veux.',
  recipeBody: 'Le contenu de la section, une fois dépliée.',
  others: 'Les autres prompts · 2',
  prompt2: 'Ajoute un niveau « Capitaine de l’espace » après dix bonnes réponses.',
  prompt3: 'Garde le score même si Yanis ferme la page.',
  pair: 'ButtonPair : deux boutons côte à côte, la moitié de la place chacun, 360 points au plus.',
  pairNarrow:
    'Dans une colonne étroite (300 points ici, un téléphone ou le texte à 200 %) : empilés, chacun sur toute la largeur.',
  pairWide:
    'Dans une colonne large (800 points ici) : 360 points chacun, rangés à gauche, jamais étirés.',
  pairSingle: 'Un seul bouton (l’auteur n’a pas « Suivre ce projet ») : la même largeur bornée.',
  pairCaption: 'Un bouton et sa légende : la légende suit la largeur de son bouton.',
  pairLeaving: 'La page de sortie : ouvrir le site ou rester.',
  pairStart:
    'ButtonPair align="start" : les boutons alignés en haut (« Tester la démo » a une ligne sous lui, « Suivre ce projet » non). Par défaut (au-dessus), ils sont centrés l’un par rapport à l’autre.',
  iconAfter:
    'Button iconAfter : l’icône après le libellé (un lien qui sort de l’appli, « Ouvrir le site ↗ »), puis avant, comme d’habitude ; en secondaire.',
  metaLine:
    'MetaLine : des renseignements séparés par des points, sous un titre. Une seule ligne, puis une ligne longue qui passe à la ligne sans couper un morceau.',
  followBell:
    'FollowButton icon="bell" : la cloche de « Suivre ce projet » (la personne avec un « + » reste pour suivre un membre).',
  metaPublished: 'Publié le 3 oct.',
  metaUpdated: 'Mis à jour hier',
  metaLong: 'Publié le 3 octobre 2026 à 18 h 40',
  metaLongUpdated: 'Mis à jour il y a deux jours, par Léa Moreau',
  tryDemo: 'Tester la démo',
  follow: 'Suivre ce projet',
  following: 'Projet suivi',
  edit: 'Modifier',
  host: 'decollage.lovable.app, un site hors de Waiggle',
  followers: '12 abonnés',
  open: 'Ouvrir le site',
  stay: 'Rester sur Waiggle',
}

const en: typeof fr = {
  title: 'Project page groundwork (R5a)',
  calloutPlain: 'Callout, original tone (changing a password).',
  plainTitle: 'Your other devices will be signed out',
  plainBody: 'This device stays signed in. The others will need the new password.',
  calloutCaution:
    'Callout, “caution” tone: soft amber background, title and icon in dark amber, sentence in ink. Without a sentence, then with one.',
  cautionTitle: 'Read it before you use it.',
  cautionBody: 'Never give an AI your password, a key or a code you received.',
  cautionWhole:
    'Read it before you use it. Never give an AI your password, a key or a code you received.',
  disclosure:
    'Disclosure: with its badge (a form), then as a plain row, without a badge (secondary content of a page). Collapsed, then expanded.',
  recipe: 'Add the recipe',
  recipeHint: 'The tools and the time spent, if you like.',
  recipeBody: 'The content of the section, once expanded.',
  others: 'Other prompts · 2',
  prompt2: 'Add a “Space captain” level after ten right answers.',
  prompt3: 'Keep the score even if Yanis closes the page.',
  pair: 'ButtonPair: two buttons side by side, half the room each, 360 points at most.',
  pairNarrow:
    'In a narrow column (300 points here, a phone or text at 200%): stacked, each on the full width.',
  pairWide: 'In a wide column (800 points here): 360 points each, to the left, never stretched.',
  pairSingle: 'A single button (the author has no “Follow this project”): the same bounded width.',
  pairCaption: 'A button and its caption: the caption follows the width of its button.',
  pairLeaving: 'The leaving page: open the site or stay.',
  pairStart:
    'ButtonPair align="start": the buttons aligned at the top (“Try the demo” has a line under it, “Follow this project” has none). By default (above), they are centred on each other.',
  iconAfter:
    'Button iconAfter: the icon after the label (a link that leaves the app, “Open the site ↗”), then before it, as usual; as a secondary.',
  metaLine:
    'MetaLine: small facts separated by dots, under a title. A single line, then a long line that wraps without cutting a piece in two.',
  followBell:
    'FollowButton icon="bell": the bell of “Follow this project” (the person with a “+” stays for following a member).',
  metaPublished: 'Published Oct 3',
  metaUpdated: 'Updated yesterday',
  metaLong: 'Published October 3, 2026 at 6:40 pm',
  metaLongUpdated: 'Updated two days ago, by Léa Moreau',
  tryDemo: 'Try the demo',
  follow: 'Follow this project',
  following: 'Following',
  edit: 'Edit',
  host: 'decollage.lovable.app, a site outside Waiggle',
  followers: '12 followers',
  open: 'Open the site',
  stay: 'Stay on Waiggle',
}

const noop = () => {}

export function ProjectGroundworkCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr

  // Les deux boutons de la page projet, repris dans plusieurs exemples.
  const projectPair = (
    <ButtonPair>
      <Button label={l.tryDemo} icon="arrow-up-right" onPress={noop} />
      <Button label={l.follow} variant="secondary" icon="bell" onPress={noop} />
    </ButtonPair>
  )

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.calloutPlain}</Text>
      <Callout icon="device-mobile" title={l.plainTitle} body={l.plainBody} />

      <Text tone="secondary">{l.calloutCaution}</Text>
      <Callout tone="caution" icon="info" title={l.cautionWhole} />
      <Callout tone="caution" icon="warning" title={l.cautionTitle} body={l.cautionBody} />

      <Text tone="secondary">{l.disclosure}</Text>
      <Disclosure title={l.recipe} hint={l.recipeHint}>
        <Text>{l.recipeBody}</Text>
      </Disclosure>
      <Disclosure title={l.recipe} hint={l.recipeHint} initiallyOpen>
        <Text>{l.recipeBody}</Text>
      </Disclosure>
      <Disclosure title={l.others} icon={null}>
        <CodeBlock>{l.prompt2}</CodeBlock>
      </Disclosure>
      <Disclosure title={l.others} icon={null} initiallyOpen>
        <Callout tone="caution" icon="info" title={l.cautionWhole} />
        <CodeBlock>{l.prompt2}</CodeBlock>
        <CodeBlock>{l.prompt3}</CodeBlock>
      </Disclosure>

      <Text tone="secondary">{l.pair}</Text>
      {projectPair}

      <Text tone="secondary">{l.pairNarrow}</Text>
      {/* Une colonne étroite, posée par le catalogue seulement (un écran ne borne jamais une
          largeur : c'est la page qui la donne). */}
      <View style={{ alignSelf: 'stretch', maxWidth: 300 }}>{projectPair}</View>

      <Text tone="secondary">{l.pairWide}</Text>
      <View style={{ alignSelf: 'stretch', maxWidth: 800 }}>{projectPair}</View>

      <Text tone="secondary">{l.pairSingle}</Text>
      <ButtonPair>
        <Button label={l.edit} variant="secondary" icon="pencil-simple" onPress={noop} />
      </ButtonPair>

      <Text tone="secondary">{l.pairCaption}</Text>
      <ButtonPair>
        <Stack gap="xs">
          <Button label={l.tryDemo} icon="arrow-up-right" onPress={noop} />
          <Text variant="caption" tone="muted">
            {l.host}
          </Text>
        </Stack>
        <Stack gap="xs">
          <Button label={l.following} variant="secondary" icon="bell" checked onPress={noop} />
          <Text variant="caption" tone="muted">
            {l.followers}
          </Text>
        </Stack>
      </ButtonPair>

      <Text tone="secondary">{l.pairLeaving}</Text>
      <ButtonPair>
        <Button label={l.open} icon="arrow-up-right" onPress={noop} />
        <Button label={l.stay} variant="secondary" onPress={noop} />
      </ButtonPair>

      <Text tone="secondary">{l.pairStart}</Text>
      <ButtonPair align="start">
        <Stack gap="xs">
          <Button label={l.tryDemo} icon="arrow-up-right" onPress={noop} />
          <Text variant="caption" tone="muted">
            {l.host}
          </Text>
        </Stack>
        <Button label={l.follow} variant="secondary" icon="bell" onPress={noop} />
      </ButtonPair>

      <Text tone="secondary">{l.iconAfter}</Text>
      <ButtonPair>
        <Button label={l.open} icon="arrow-up-right" iconAfter onPress={noop} />
        <Button label={l.open} variant="secondary" icon="arrow-up-right" iconAfter onPress={noop} />
      </ButtonPair>
      <ButtonPair>
        <Button label={l.open} icon="arrow-up-right" onPress={noop} />
      </ButtonPair>

      <Text tone="secondary">{l.followBell}</Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <FollowButton
          followed={false}
          onPress={noop}
          label={l.follow}
          text={l.follow}
          icon="bell"
          prominent={false}
        />
      </View>

      <Text tone="secondary">{l.metaLine}</Text>
      <MetaLine>
        <Text variant="caption" tone="muted">
          {l.metaPublished}
        </Text>
        <Text variant="caption" tone="muted">
          {l.metaUpdated}
        </Text>
      </MetaLine>
      {/* Une colonne étroite, posée par le catalogue seulement : la ligne passe à la ligne. */}
      <View style={{ alignSelf: 'stretch', maxWidth: 220 }}>
        <MetaLine>
          <Text variant="caption" tone="muted">
            {l.metaLong}
          </Text>
          <Text variant="caption" tone="muted">
            {l.metaLongUpdated}
          </Text>
        </MetaLine>
      </View>
    </Stack>
  )
}
