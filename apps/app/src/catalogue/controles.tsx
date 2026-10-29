// La section « Contrôles » du catalogue (refonte R1, Miel 2) : les boutons aux quatre tailles, le
// bouton rouge de confirmation, le bouton rond flottant, le contrôle segmenté et la liste de choix
// au clavier. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs
// personnes écrivent le catalogue en même temps. Ses exemples (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais. Le jour et la nuit se voient sur
// les captures du catalogue, prises dans les deux thèmes.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

// Les espaces de la typographie française : insécable (U+00A0) avant « : », fine (U+202F) avant
// « ? ».
const fr = {
  title: 'Contrôles',
  sizes: 'Quatre tailles : 56, 52, 44 et 36 points (le plus petit garde 44 points à toucher).',
  xl: 'Publier un projet',
  regular: 'Enregistrer',
  compact: 'Suivre',
  small: 'Voir',
  secondary: 'Les boutons blancs, aux mêmes tailles.',
  confirm: 'La confirmation d’une suppression : un reflet et un halo rouge.',
  deleteProject: 'Supprimer le projet',
  danger: 'Supprimer',
  states: 'Inactif, et en attente (le bouton garde sa largeur).',
  publish: 'Publier',
  save: 'Enregistrer',
  fab: 'Le bouton rond flottant (64 points), qui s’enfonce davantage sous le doigt.',
  fabLabel: 'Publier un projet',
  share: 'Partager',
  segmented: 'Le contrôle segmenté : un seul arrêt de Tab, les flèches changent le choix.',
  appearance: 'Apparence',
  auto: 'Automatique',
  day: 'Jour',
  night: 'Nuit',
  feed: 'Fil de l’accueil',
  following: 'Abonnements',
  discover: 'Découvrir',
  radioTitle: 'Pourquoi le signales-tu ?',
  radioFooter: 'Tab entre une fois dans la liste ; les flèches haut et bas changent le choix.',
  reasons: ['Arnaque ou spam', 'Harcèlement ou haine', 'Usurpation d’identité', 'Autre chose'],
  disabledTitle: 'Langue (pendant l’enregistrement)',
}

const en: typeof fr = {
  title: 'Controls',
  sizes: 'Four sizes: 56, 52, 44 and 36 points (the smallest keeps 44 points to touch).',
  xl: 'Publish a project',
  regular: 'Save',
  compact: 'Follow',
  small: 'View',
  secondary: 'White buttons, in the same sizes.',
  confirm: 'Confirming a deletion: a highlight and a red halo.',
  deleteProject: 'Delete the project',
  danger: 'Delete',
  states: 'Disabled, and waiting (the button keeps its width).',
  publish: 'Publish',
  save: 'Save',
  fab: 'The floating round button (64 points), which sinks deeper under the finger.',
  fabLabel: 'Publish a project',
  share: 'Share',
  segmented: 'The segmented control: a single Tab stop, the arrows change the choice.',
  appearance: 'Appearance',
  auto: 'Automatic',
  day: 'Day',
  night: 'Night',
  feed: 'Home feed',
  following: 'Following',
  discover: 'Discover',
  radioTitle: 'Why are you reporting it?',
  radioFooter: 'Tab enters the list once; the up and down arrows change the choice.',
  reasons: ['Scam or spam', 'Harassment or hate', 'Impersonation', 'Something else'],
  disabledTitle: 'Language (while saving)',
}

const noop = () => {}

export function ControlsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [appearance, setAppearance] = useState<'auto' | 'day' | 'night'>('night')
  const [feed, setFeed] = useState<'following' | 'discover'>('following')
  // Aucun motif coché au départ : Tab arrive sur le premier.
  const [reason, setReason] = useState<number | null>(null)
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      {/* Les quatre tailles, en miel puis en blanc. */}
      <Text variant="caption" tone="muted">
        {l.sizes}
      </Text>
      <Stack direction="row" gap="md" wrap align="center">
        <Button size="xl" label={l.xl} onPress={noop} />
        <Button label={l.regular} onPress={noop} />
        <Button size="compact" label={l.compact} icon="plus" onPress={noop} />
        <Button size="small" label={l.small} onPress={noop} />
      </Stack>
      <Text variant="caption" tone="muted">
        {l.secondary}
      </Text>
      <Stack direction="row" gap="md" wrap align="center">
        <Button size="xl" variant="secondary" label={l.xl} onPress={noop} />
        <Button variant="secondary" label={l.regular} onPress={noop} />
        <Button size="compact" variant="secondary" label={l.compact} onPress={noop} />
        <Button size="small" variant="secondary" label={l.small} icon="eye" onPress={noop} />
      </Stack>

      {/* Le geste qui ne se défait pas : rouge plein, reflet, halo ; à côté, le rouge pâle. */}
      <Text variant="caption" tone="muted">
        {l.confirm}
      </Text>
      <Stack direction="row" gap="md" wrap align="center">
        <Button variant="confirm" label={l.deleteProject} onPress={noop} />
        <Button variant="danger" label={l.danger} icon="trash" onPress={noop} />
        <Button variant="confirm" size="small" label={l.danger} onPress={noop} />
      </Stack>

      <Text variant="caption" tone="muted">
        {l.states}
      </Text>
      <Stack direction="row" gap="md" wrap align="center">
        <Button label={l.publish} disabled onPress={noop} />
        <Button label={l.save} loading onPress={noop} />
        <Button variant="confirm" label={l.deleteProject} disabled onPress={noop} />
        <Button size="small" variant="secondary" label={l.small} loading onPress={noop} />
      </Stack>

      {/* Le bouton rond flottant, à côté d'un bouton rond ordinaire. */}
      <Text variant="caption" tone="muted">
        {l.fab}
      </Text>
      <Stack direction="row" gap="lg" wrap align="center">
        <IconButton fab variant="honey" icon="plus" label={l.fabLabel} onPress={noop} />
        <IconButton variant="plain" icon="share-network" label={l.share} onPress={noop} />
      </Stack>

      {/* Le choix actif : blanc le jour, crème la nuit, toujours à l'encre. */}
      <Text variant="caption" tone="muted">
        {l.segmented}
      </Text>
      <Segmented
        label={l.appearance}
        options={[
          { value: 'auto', label: l.auto, icon: 'circle-half' },
          { value: 'day', label: l.day, icon: 'sun' },
          { value: 'night', label: l.night, icon: 'moon' },
        ]}
        value={appearance}
        onChange={setAppearance}
      />
      <Segmented
        label={l.feed}
        fill={false}
        options={[
          { value: 'following', label: l.following },
          { value: 'discover', label: l.discover },
        ]}
        value={feed}
        onChange={setFeed}
      />

      {/* Une liste de choix : aucun coché au départ, puis un seul ; et une liste inactive. */}
      <ListGroup title={l.radioTitle} footer={l.radioFooter} radio>
        {l.reasons.map((label, index) => (
          <ListRow
            key={label}
            label={label}
            selected={reason === index}
            onPress={() => setReason(index)}
          />
        ))}
      </ListGroup>
      <ListGroup title={l.disabledTitle} radio>
        <ListRow label="Français" selected disabled onPress={noop} />
        <ListRow label="English" selected={false} disabled onPress={noop} />
      </ListGroup>
    </Stack>
  )
}
