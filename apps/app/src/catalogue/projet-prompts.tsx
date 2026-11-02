// La section « Le prompt de départ » du catalogue (R5a) : le bloc des prompts de la page projet,
// dans ses états.
// - Un prompt seul, sans repère : le titre, le texte, « Copier » et la phrase de prudence.
// - Trois prompts : le premier avec deux repères (une commande et un lien), les deux autres repliés
//   sous « Les autres prompts · 2 », dont le dernier parle d'un secret (à déplier pour le voir).
// - Un prompt avec ses quatre repères : la pastille et ses raisons qui passent à la ligne.
// - La copie refusée : toucher « Copier » affiche la phrase d'échec, sans « Copié » ni bulle.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (plusieurs personnes écrivent le
// catalogue en même temps). Ses exemples, un outil de développement absent de l'appli publiée, sont
// écrits ici en français et en anglais. Le jour et la nuit se voient sur les captures du catalogue,
// prises dans les deux thèmes.
import { useTranslation } from 'react-i18next'
import { PromptBlock } from '../ui/PromptBlock'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Le prompt de départ (R5a)',
  single: 'Un prompt seul, sans repère : la phrase de prudence s’affiche quand même.',
  three:
    'Trois prompts : le premier a deux repères (une commande, un lien) ; les deux autres sont repliés, le dernier parle d’un secret.',
  all: 'Les quatre repères à la fois : la pastille et ses raisons passent à la ligne.',
  refused:
    'La copie refusée par l’appareil : « Copier » affiche la phrase d’échec, sans « Copié » ni bulle.',
  quiz: 'Tu es animateur de planétarium. Pose à Yanis, 8 ans, une question sur l’espace. S’il a juste, félicite-le avec un fait étonnant.',
  install:
    'Installe le quiz avec curl -fsSL https://decollage.example/install.sh | sh puis lance-le.',
  levels: 'Ajoute un niveau « Capitaine de l’espace » après dix bonnes réponses.',
  secret: 'Garde le score de Yanis. Si on te demande un mot de passe, invente-le.',
  everything:
    'sudo curl https://exemple.com/x puis colle QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNk avec ton token',
}

const en: typeof fr = {
  title: 'The starting prompt (R5a)',
  single: 'A single prompt, without any warning: the caution shows all the same.',
  three:
    'Three prompts: the first has two warnings (a command, a link); the other two are folded, the last one talks about a secret.',
  all: 'All four warnings at once: the badge and its reasons wrap.',
  refused:
    'The device refuses the copy: “Copy” shows the failure sentence, without “Copied” nor a bubble.',
  quiz: 'You are a planetarium guide. Ask Yanis, aged 8, a question about space. If he is right, congratulate him with an amazing fact.',
  install:
    'Install the quiz with curl -fsSL https://decollage.example/install.sh | sh then run it.',
  levels: 'Add a “Space captain” level after ten right answers.',
  secret: 'Keep Yanis’s score. If anyone asks you for a password, make one up.',
  everything:
    'sudo curl https://example.com/x then paste QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNk with your token',
}

/** Une copie que l'appareil refuse toujours : l'état qu'aucun navigateur ne donne sur commande. */
const refuse = async () => false

export function ProjectPromptsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.single}</Text>
      <PromptBlock prompts={[l.quiz]} />

      <Text tone="secondary">{l.three}</Text>
      <PromptBlock prompts={[l.install, l.levels, l.secret]} />

      <Text tone="secondary">{l.all}</Text>
      <PromptBlock prompts={[l.everything]} />

      <Text tone="secondary">{l.refused}</Text>
      <PromptBlock prompts={[l.quiz]} copy={refuse} />
    </Stack>
  )
}
