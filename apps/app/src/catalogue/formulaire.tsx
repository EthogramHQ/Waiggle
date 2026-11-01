// La section « Case, radio, toast et avatars » du catalogue (refonte, tranche R1) : la case à
// cocher, le bouton radio rond et son groupe, le toast et les avatars à deux initiales, chacun
// dans ses états. Un fichier à part, avec ses propres textes, pour que deux personnes n'écrivent
// pas dans le même fichier.
// Le toast vit vraiment ici : un bouton « Montrer » l'appelle par useToast(), sous un fournisseur
// propre à la section (l'appli a le sien, autour de toutes les pages).
// Outil de développement : les exemples sont écrits ici, pas dans les traductions des membres.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { RadioGroup, RadioMark } from '../ui/Radio'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { Toast } from '../ui/Toast'
import { ToastProvider, useToast } from '../ui/theme/toast'

const fr = {
  section: 'Case, radio, toast et avatars',
  checkboxes: 'Cases à cocher',
  accept: 'J’accepte les règles de la ruche',
  news: 'M’écrire quand un projet suivi change',
  disabledOff: 'Inactive, non cochée',
  disabledOn: 'Inactive, cochée',
  required: 'J’ai lu la charte de modération',
  requiredError: 'Coche cette case pour continuer.',
  longLabel:
    'Montrer mes projets publics aux membres des ruches dont je fais partie, y compris celles où je n’ai encore rien publié',
  radios: 'Boutons radio',
  marks: 'Le rond seul (RadioMark) : choisi, libre, inactif',
  sizeLabel: 'Taille de la ruche',
  sizeNone: 'Rien de choisi (Tab arrive sur le premier)',
  small: 'Petite ruche',
  medium: 'Ruche moyenne',
  large: 'Grande ruche (bientôt)',
  visibilityLabel: 'Qui voit ce projet',
  everyone: 'Tous les membres',
  hive: 'Ma ruche Famille',
  me: 'Moi seul, le temps de le finir avant de le montrer à qui que ce soit',
  toasts: 'Toasts',
  toastIntro:
    'Une phrase en verre, en bas de l’écran, qui s’efface toute seule : 2,4 s, plus 60 ms par caractère au-delà de 20. La souris posée dessus la retient. Jamais de bouton dedans.',
  showShort: 'Montrer un toast court',
  showLong: 'Montrer un toast long',
  published: 'Projet publié',
  copied: 'Lien copié',
  long: 'Ton projet est publié et toute ta ruche pourra le découvrir dès ce soir',
  avatars: 'Avatars sans photo : deux initiales',
}

const en: typeof fr = {
  section: 'Checkbox, radio, toast and avatars',
  checkboxes: 'Checkboxes',
  accept: 'I accept the rules of the hive',
  news: 'Email me when a followed project changes',
  disabledOff: 'Disabled, unchecked',
  disabledOn: 'Disabled, checked',
  required: 'I have read the moderation charter',
  requiredError: 'Check this box to continue.',
  longLabel:
    'Show my public projects to the members of the hives I belong to, including those where I have not published anything yet',
  radios: 'Radio buttons',
  marks: 'The mark alone (RadioMark): chosen, free, disabled',
  sizeLabel: 'Hive size',
  sizeNone: 'Nothing chosen (Tab lands on the first)',
  small: 'Small hive',
  medium: 'Medium hive',
  large: 'Large hive (soon)',
  visibilityLabel: 'Who sees this project',
  everyone: 'All members',
  hive: 'My Family hive',
  me: 'Only me, while I finish it before showing it to anyone',
  toasts: 'Toasts',
  toastIntro:
    'A glass sentence at the bottom of the screen that fades by itself: 2.4 s, plus 60 ms per character beyond 20. The mouse over it holds it. Never a button inside.',
  showShort: 'Show a short toast',
  showLong: 'Show a long toast',
  published: 'Project published',
  copied: 'Link copied',
  long: 'Your project is published and your whole hive can discover it tonight',
  avatars: 'Avatars without a photo: two initials',
}

type Labels = typeof fr
type Size = 'small' | 'medium' | 'large'
type Visibility = 'everyone' | 'hive' | 'me'

export function FormSamples() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="xl">
      <Text variant="heading" heading={2}>
        {l.section}
      </Text>
      <Checkboxes l={l} />
      <Radios l={l} />
      {/* Un fournisseur propre à la section : le bouton « Montrer » y trouve son toast. */}
      <ToastProvider>
        <Toasts l={l} />
      </ToastProvider>
      <Part title={l.avatars}>
        <Row gap="lg" wrap>
          <Avatar name="Léa Martin" source={null} label="Léa Martin" size={96} />
          <Avatar name="Papi" source={null} label="Papi" size={64} />
          <Avatar name="émile zola" source={null} label="Émile Zola" size={44} />
          <Avatar name="Inès" source={null} label="Inès" size={28} />
        </Row>
      </Part>
    </Stack>
  )
}

/** Un sous-titre de la section et ses exemples. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function Checkboxes({ l }: { l: Labels }) {
  const [accept, setAccept] = useState(false)
  const [news, setNews] = useState(true)
  const [required, setRequired] = useState(false)
  const [long, setLong] = useState(false)
  return (
    <Part title={l.checkboxes}>
      <Checkbox label={l.accept} value={accept} onValueChange={setAccept} />
      <Checkbox label={l.news} value={news} onValueChange={setNews} />
      <Checkbox label={l.disabledOff} value={false} onValueChange={() => {}} disabled />
      <Checkbox label={l.disabledOn} value onValueChange={() => {}} disabled />
      {/* L'erreur reste tant que la case n'est pas cochée, comme après un envoi refusé. */}
      <Checkbox
        label={l.required}
        value={required}
        onValueChange={setRequired}
        error={required ? undefined : l.requiredError}
      />
      <Checkbox label={l.longLabel} value={long} onValueChange={setLong} />
    </Part>
  )
}

function Radios({ l }: { l: Labels }) {
  const [size, setSize] = useState<Size | null>(null)
  const [visibility, setVisibility] = useState<Visibility | null>('hive')
  return (
    <Part title={l.radios}>
      <Row gap="lg">
        <RadioMark selected />
        <RadioMark selected={false} />
        <RadioMark selected disabled />
        <RadioMark selected={false} disabled />
      </Row>
      <Text variant="caption" tone="muted">
        {l.marks}
      </Text>
      <Text variant="caption" tone="muted">
        {l.sizeNone}
      </Text>
      <RadioGroup
        label={l.sizeLabel}
        options={[
          { value: 'small', label: l.small },
          { value: 'medium', label: l.medium },
          { value: 'large', label: l.large, disabled: true },
        ]}
        value={size}
        onChange={setSize}
      />
      <RadioGroup
        label={l.visibilityLabel}
        options={[
          { value: 'everyone', label: l.everyone },
          { value: 'hive', label: l.hive },
          { value: 'me', label: l.me },
        ]}
        value={visibility}
        onChange={setVisibility}
      />
    </Part>
  )
}

function Toasts({ l }: { l: Labels }) {
  const toast = useToast()
  return (
    <Part title={l.toasts}>
      <Text tone="secondary">{l.toastIntro}</Text>
      {/* Les toasts dessinés à plat, pour les voir sans attendre : court, avec une icône, long. */}
      <Stack gap="md" align="center">
        <Toast text={l.copied} leaving={false} calm={false} />
        <Toast text={l.published} icon="check" leaving={false} calm={false} />
        <Toast text={l.long} leaving={false} calm={false} />
      </Stack>
      <Row gap="md" wrap>
        <Button
          label={l.showShort}
          variant="secondary"
          onPress={() => toast.show(l.published, { icon: 'check' })}
        />
        <Button label={l.showLong} variant="secondary" onPress={() => toast.show(l.long)} />
      </Row>
    </Part>
  )
}
