// La section « La recette d'un projet » du catalogue (R6a, correction C4) : `RecipeFact`, une ligne de
// « La recette » de la page d'un projet. Ses états : l'icône du calendrier (« Commencé en… »), le
// rond de couleur de chaque niveau de difficulté (vert, jaune, rouge), et une phrase longue dans une
// colonne étroite (le texte à 200 % sur un téléphone) qui passe à la ligne à côté du dessin, qui
// garde sa taille. Jour et nuit. Les phrases sont celles de l'appli ; seuls les libellés de
// l'exemple sont écrits ici (un outil de développement, absent de l'appli publiée).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne.
import type { ProjectDifficulty } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { DIFFICULTY_DOTS } from '../ui/difficultyDots'
import { RecipeFact } from '../ui/RecipeFact'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La recette d’un projet',
  intro:
    'RecipeFact : une ligne de « La recette ». Devant la phrase, une icône (le calendrier) ou un rond de couleur (la difficulté, les mêmes ronds que les choix de la feuille de publication). Le dessin est caché aux lecteurs d’écran : la phrase dit tout, la couleur n’est jamais seule.',
  icon: 'Une icône : « Commencé en… »',
  dots: 'Un rond de couleur : les trois niveaux, alignés sur le même bord',
  narrow:
    'Colonne étroite (150 points ici, ou le texte à 200 %) : la phrase passe à la ligne, le dessin garde sa taille',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'A project’s recipe',
  intro:
    'RecipeFact: one line of “The recipe”. Before the sentence, an icon (the calendar) or a coloured dot (the difficulty, the same dots as the choices in the publishing sheet). The drawing is hidden from screen readers: the sentence says it all, colour is never alone.',
  icon: 'An icon: “Started in…”',
  dots: 'A coloured dot: the three levels, lined up on the same edge',
  narrow:
    'Narrow column (150 points here, or text at 200%): the sentence wraps, the drawing keeps its size',
  day: 'day',
  night: 'night',
}

const LEVELS: ProjectDifficulty[] = ['easy', 'medium', 'hard']

export function RecipeCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const started = t(($) => $.project.page.startedOn, { month: 'septembre 2026' })
  const level = (one: ProjectDifficulty) =>
    t(($) => $.project.page.difficulty, { level: t(($) => $.project.difficulty[one]) })
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.icon} — ${l[scheme]}`}>
              <RecipeFact icon="calendar-blank" label={started} />
            </Example>
            <Example caption={`${l.dots} — ${l[scheme]}`}>
              <Stack gap="sm">
                {LEVELS.map((one) => (
                  <RecipeFact key={one} dot={DIFFICULTY_DOTS[one]} label={level(one)} />
                ))}
              </Stack>
            </Example>
            <Example caption={`${l.narrow} — ${l[scheme]}`}>
              <View style={{ alignSelf: 'stretch', maxWidth: 150 }}>
                <Stack gap="sm">
                  <RecipeFact icon="calendar-blank" label={started} />
                  <RecipeFact dot={DIFFICULTY_DOTS.easy} label={level('easy')} />
                </Stack>
              </View>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
