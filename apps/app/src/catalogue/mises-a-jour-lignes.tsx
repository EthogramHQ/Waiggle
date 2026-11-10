// La section « Mises à jour : ce qui a changé » du catalogue (R7a, U1c) : la liste des lignes de la
// feuille « Nouvelle mise à jour » (`UpdateLinesField`), faite de lignes `UpdateLineField`, dans
// ses états : une ligne seule (sans « Retirer »), chaque famille vide avec son exemple, en erreur
// (« Publier » sans rien écrire), à cinq lignes (plus d'« Ajouter une ligne », un texte près de la
// limite et un au-delà), pendant l'envoi. Chaque exemple est vivant : on peut y écrire, changer la
// famille, ajouter et retirer des lignes, comme dans la feuille.
// Outil de développement : les exemples sont écrits ici ; les libellés des lignes viennent des
// traductions, comme dans l'appli.
import type { UpdateFamily } from '@ruche/contracts'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { UpdateLinesField, type UpdateLineValue } from '../ui/UpdateLinesField'

const fr = {
  section: 'Mises à jour : ce qui a changé',
  intro:
    'La liste des changements de la feuille « Nouvelle mise à jour » : de 1 à 5 lignes dans une carte groupée. La pastille ouvre le menu des familles ; la ligne où l’on écrit se teinte de miel doux.',
  single: 'Une ligne seule : pas de « Retirer » (touche « Ajouter une ligne »)',
  families: 'Chaque famille, vide : son exemple dans le champ',
  error: 'En erreur : « Publier » touché sans rien écrire',
  full: 'À cinq lignes : plus d’« Ajouter une ligne » ; une ligne près de la limite, une au-delà',
  sending: 'Pendant l’envoi : rien ne change',
  onSheet: 'Sur la crème de la feuille',
  required: 'Écris au moins un changement avant de publier.',
  texts: [
    'Un compte à rebours avant chaque question',
    'Le score ne repart plus à zéro au niveau 3',
    'Des étoiles qui scintillent',
    // Près de la limite (109 caractères), puis au-delà (125).
    'Un mode nuit, qui suit le réglage du téléphone et garde le ciel bien sombre quand la fusée décolle de sa base',
    'La fusée ne traverse plus la lune quand on change de niveau en plein vol, même très vite, au troisième niveau du jeu, la nuit',
  ],
}

const en: typeof fr = {
  section: 'Updates: what changed',
  intro:
    'The list of changes in the “New update” sheet: 1 to 5 lines in one grouped card. The badge opens the families menu; the line being written turns soft honey.',
  single: 'A single line: no “Remove” (tap “Add a line”)',
  families: 'Each family, empty: its example in the field',
  error: 'In error: “Publish” tapped with nothing written',
  full: 'At five lines: no more “Add a line”; one line near the limit, one beyond',
  sending: 'While sending: nothing changes',
  onSheet: 'On the cream of the sheet',
  required: 'Write at least one change before publishing.',
  texts: [
    'A countdown before each question',
    'The score no longer resets at level 3',
    'Twinkling stars',
    'A night mode that follows the phone setting and keeps the sky nice and dark while the rocket lifts off its pad',
    'The rocket no longer flies through the moon when you change level in mid-flight, even very fast, at the third level of the game',
  ],
}

type Labels = typeof fr

/**
 * Une liste vivante, tenue ici comme la feuille la tiendra (`updates/form.ts`) : chaque ligne a son
 * `id`, fabriqué une fois ; ajouter, retirer, changer la famille ou le texte rendent une nouvelle
 * liste.
 */
function LinesSample({
  name,
  start,
  error = null,
  editable = true,
}: {
  /** Le préfixe des `id` de l'exemple : deux exemples n'ont jamais le même. */
  name: string
  start: { family: UpdateFamily; text: string }[]
  error?: string | null
  editable?: boolean
}) {
  const next = useRef(start.length)
  const [lines, setLines] = useState<UpdateLineValue[]>(() =>
    start.map((line, index) => ({ id: `${name}-${index}`, ...line })),
  )
  const change = (id: string, patch: Partial<UpdateLineValue>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  return (
    <UpdateLinesField
      lines={lines}
      error={error}
      editable={editable}
      onAdd={() => {
        const id = `${name}-${next.current}`
        next.current += 1
        setLines((current) => [...current, { id, family: 'new', text: '' }])
      }}
      onRemove={(id) => setLines((current) => current.filter((line) => line.id !== id))}
      onFamilyChange={(id, family) => change(id, { family })}
      onTextChange={(id, text) => change(id, { text })}
    />
  )
}

/** Un exemple sous sa légende. */
function Sample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}

export function UpdateLinesCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const [a, b, c, d, e] = l.texts as [string, string, string, string, string]

  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.section}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Sample caption={l.single}>
        <LinesSample name="single" start={[{ family: 'new', text: '' }]} />
      </Sample>

      <Sample caption={l.families}>
        <LinesSample
          name="families"
          start={[
            { family: 'new', text: '' },
            { family: 'fixed', text: '' },
            { family: 'polish', text: '' },
          ]}
        />
      </Sample>

      <Sample caption={l.error}>
        <LinesSample
          name="error"
          start={[
            { family: 'new', text: '' },
            { family: 'fixed', text: '' },
          ]}
          error={l.required}
        />
      </Sample>

      <Sample caption={l.full}>
        <LinesSample
          name="full"
          start={[
            { family: 'new', text: a },
            { family: 'fixed', text: b },
            { family: 'polish', text: c },
            { family: 'new', text: d },
            { family: 'fixed', text: e },
          ]}
        />
      </Sample>

      <Sample caption={l.sending}>
        <LinesSample
          name="sending"
          start={[
            { family: 'new', text: a },
            { family: 'fixed', text: b },
          ]}
          editable={false}
        />
      </Sample>

      <Sample caption={l.onSheet}>
        <Surface variant="sheet" radius="group" padding="lg">
          <LinesSample
            name="sheet"
            start={[
              { family: 'new', text: a },
              { family: 'polish', text: '' },
            ]}
          />
        </Surface>
      </Sample>
    </Stack>
  )
}
