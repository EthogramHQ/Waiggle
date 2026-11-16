// Catalogue des composants de la page « Réglages » (tranche R2, S1) : la carte du membre
// (MemberCard) dans ses trois états, la liste des rubriques (SettingsNav sur téléphone, sans
// sous-titre, puis avec) et la mise en page d'ordinateur (SettingsColumns). Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne. Les textes d'exemple sont écrits ici en clair :
// le catalogue est un outil de développement, absent de l'appli publiée.
import { ListGroup, ListRow } from '../ui/ListGroup'
import { MemberCard } from '../ui/MemberCard'
import { SettingsColumns } from '../ui/SettingsColumns'
import { SettingsNav } from '../ui/SettingsNav'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'

const edit = { label: 'Modifier', onPress: () => {} }
const card = { loadingLabel: 'Chargement…', avatar: null, avatarLabel: 'Photo de profil', edit }

// Depuis R11, `SettingsScreen` n'écrit plus de sous-titre sous les rubriques (« Moins de mots ») :
// la navigation se montre d'abord sans `hint`, comme dans l'appli.
const sections = [
  { key: 'profile', label: 'Mon profil' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'language', label: 'Langue' },
  { key: 'security', label: 'Sécurité' },
] as const
const items = sections.map((item) => ({
  ...item,
  href: `/settings/${item.key}`,
  icon: item.key === 'profile' ? ('user' as const) : ('bell' as const),
}))
// La variante légendée : la prop `hint` existe toujours, aucun écran ne l'emploie.
const hints = {
  profile: 'Photo, nom, pseudo et présentation',
  notifications: 'Les e-mails que tu reçois',
  language: 'Celle de l’appli et de tes e-mails',
  security: 'Mot de passe, membres bloqués',
} as const
const itemsWithHints = items.map((item) => ({ ...item, hint: hints[item.key] }))

export function SettingsCatalogue() {
  const { sizeClass } = useLayout()
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        Réglages (R2)
      </Text>
      <Text tone="secondary">
        La carte du membre : complète, pendant la lecture du profil, profil en panne (sans lien).
      </Text>
      <MemberCard
        {...card}
        name="Léa Moreau"
        viewPage={{ label: 'Voir ma page', href: '/members/lea', onPress: () => {} }}
      />
      <MemberCard {...card} name={null} />
      <MemberCard {...card} name="Léa Moreau" />
      <Text tone="secondary">La liste des rubriques sur téléphone, sans sous-titre.</Text>
      <SettingsNav label="Rubriques (téléphone)" items={items} />
      <Text tone="secondary">
        Avec hint : aucun écran ne l’emploie depuis R11 (une rubrique se suffit).
      </Text>
      <SettingsNav label="Rubriques (téléphone, avec hint)" items={itemsWithHints} />
      <Text tone="secondary">
        La mise en page d’ordinateur : la colonne à gauche, la rubrique ouverte à droite.
      </Text>
      {/* Les deux colonnes ne tiennent pas sur un téléphone : à 320 points, la rubrique n'avait plus
          que 8 points de large (relevé de mise en page, R12). */}
      {sizeClass === 'wide' ? (
        <SettingsColumns
          nav={<SettingsNav label="Rubriques (ordinateur)" items={items} current="language" />}
          title="Langue"
        >
          <ListGroup footer="Tes e-mails te sont aussi envoyés dans cette langue." radio>
            <ListRow label="Français" selected onPress={() => {}} />
            <ListRow label="English" selected={false} onPress={() => {}} />
          </ListGroup>
        </SettingsColumns>
      ) : (
        <Text variant="caption" tone="muted">
          Se montre dans une fenêtre d’ordinateur.
        </Text>
      )}
    </Stack>
  )
}
