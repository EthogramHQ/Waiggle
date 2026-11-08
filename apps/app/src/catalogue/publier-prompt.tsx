// La section « Publier : le prompt » du catalogue (R6a, U3b) : le champ d'un prompt (PromptField)
// dans tous ses états : vide, avec son compteur, des caractères invisibles retirés, une clé d'API,
// deux clés, une clé déjà enregistrée (modification), trop long ; de jour et de nuit. Chaque
// exemple se manipule : taper, coller, retirer une clé.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes du composant viennent de l'appli.
import { PROJECT_PROMPT_MAX_LENGTH } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PromptField, type PromptFieldLabels } from '../ui/PromptField'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Publier : le prompt',
  intro:
    'Le champ d’un prompt de la feuille de publication : compteur toujours visible, aide sous le champ. Un texte collé perd ses caractères invisibles (une ligne le dit) ; une clé d’API collée est montrée masquée dans un encadré, avec « Retirer la clé ». L’encadré prévient, il ne bloque pas.',
  empty: 'Vide',
  counter: 'Un prompt et son compteur',
  invisible: 'Collé avec deux caractères invisibles : retirés, et dit',
  oneKey: 'Une clé d’API collée',
  twoKeys: 'Deux clés : chaque bouton nomme la sienne',
  saved: 'Modification : la clé est déjà enregistrée, il faut la désactiver',
  tooLong: 'Trop long : le compteur passe au rouge, l’erreur de l’écran sous le champ',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Publish: the prompt',
  intro:
    'The field of a prompt in the publish sheet: a counter always shown, a hint under the field. A pasted text loses its invisible characters (a line says so); a pasted API key is shown masked in a box, with “Remove the key”. The box warns, it never blocks.',
  empty: 'Empty',
  counter: 'A prompt and its counter',
  invisible: 'Pasted with two invisible characters: removed, and said',
  oneKey: 'A pasted API key',
  twoKeys: 'Two keys: each button names its own',
  saved: 'Editing: the key is already saved, it must be revoked',
  tooLong: 'Too long: the counter turns red, the screen’s error under the field',
  day: 'day',
  night: 'night',
}

// Les caractères invisibles s'écrivent par leur numéro : écrits tels quels, on ne les verrait pas.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)

// De fausses clés, de la forme des vraies. Écrites en morceaux : un outil qui cherche les secrets
// dans le dépôt public ne doit pas les prendre pour de vraies clés.
const OPENAI_KEY = ['sk-proj', '-4fQ8xT2mN4vR7wK1pL9sD3fG6hJ0', 'a91f'].join('')
const GITHUB_KEY = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6', 'wxyz'].join('')

/** Un prompt comme celui de la planche. */
const SKY =
  'Tu es un guide du ciel pour débutants. Chaque soir, dis-moi ce que je peux voir à l’œil nu depuis mon balcon, et à quelle heure lever les yeux.'

/** Les textes du champ, lus dans la langue de l'appli comme le ferait l'écran. */
function usePromptLabels(): PromptFieldLabels {
  const { t } = useTranslation()
  return {
    counter: (count, max) => ({
      shown: t(($) => $.project.form.promptCounter, { count, max }),
      spoken: t(($) => $.project.form.promptCounterSpoken, { count, max }),
    }),
    invisibleRemoved: (count) => t(($) => $.project.form.invisibleRemoved, { count }),
    keyFound: (masked) => t(($) => $.project.form.keyFound, { masked }),
    keyWarning: t(($) => $.project.form.keyWarning),
    keyRevoke: t(($) => $.project.form.keyRevoke),
    removeKey: t(($) => $.project.form.removeKey),
    removeKeyNamed: (masked) => t(($) => $.project.form.removeKeyNamed, { masked }),
  }
}

/** Un champ qui se manipule : sa valeur est gardée ici, comme dans le formulaire. */
function Field({
  initial,
  savedValue,
  error,
}: {
  initial: string
  savedValue?: string
  error?: string
}) {
  const { t } = useTranslation()
  const labels = usePromptLabels()
  const [value, setValue] = useState(initial)
  return (
    <PromptField
      label={t(($) => $.project.prompts.starting)}
      value={value}
      onChange={setValue}
      max={PROJECT_PROMPT_MAX_LENGTH}
      hint={t(($) => $.project.form.promptHint)}
      labels={labels}
      removedPlaceholder={t(($) => $.project.form.keyRemoved)}
      error={error}
      {...(savedValue !== undefined ? { savedValue } : null)}
    />
  )
}

export function PublishPromptCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  const withKey = `${SKY.slice(0, 100)} Clé : ${OPENAI_KEY}`
  const tooLong = `${SKY} `.repeat(28)
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.empty} — ${l[scheme]}`}>
              <Field initial="" />
            </Example>
            <Example caption={`${l.counter} — ${l[scheme]}`}>
              <Field initial={SKY} />
            </Example>
            <Example caption={`${l.invisible} — ${l[scheme]}`}>
              <Field
                initial={`Résume${ZERO_WIDTH_SPACE} ce texte${RIGHT_TO_LEFT_OVERRIDE} en trois points.`}
              />
            </Example>
            <Example caption={`${l.oneKey} — ${l[scheme]}`}>
              <Field initial={withKey} />
            </Example>
            <Example caption={`${l.twoKeys} — ${l[scheme]}`}>
              <Field initial={`Clés : ${OPENAI_KEY} et ${GITHUB_KEY}.`} />
            </Example>
            <Example caption={`${l.saved} — ${l[scheme]}`}>
              <Field initial={withKey} savedValue={withKey} />
            </Example>
            <Example caption={`${l.tooLong} — ${l[scheme]}`}>
              <Field
                initial={tooLong}
                error={t(($) => $.project.errors.promptTooLong, {
                  max: PROJECT_PROMPT_MAX_LENGTH,
                })}
              />
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
