// Catalogue des composants de la page « Réglages » (tranche R2, ui-dev S1) : la carte du membre
// (MemberCard) dans ses trois états, la liste des rubriques avec leur aide (SettingsNav sur
// téléphone) et la mise en page d'ordinateur (SettingsColumns). Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne. Les textes d'exemple sont écrits ici en clair :
// le catalogue est un outil de développement, absent de l'appli publiée.
import { ListGroup, ListRow } from '../ui/ListGroup'
import { MemberCard } from '../ui/MemberCard'
import { SettingsColumns } from '../ui/SettingsColumns'
import { SettingsNav } from '../ui/SettingsNav'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const edit = { label: 'Modifier', onPress: () => {} }
const card = { loadingLabel: 'Chargement…', avatar: null, avatarLabel: 'Photo de profil', edit }

const sections = [
  { key: 'profile', label: 'Mon profil', hint: 'Photo, nom, pseudo et présentation' },
  { key: 'notifications', label: 'Notifications', hint: 'Les e-mails que tu reçois' },
  { key: 'language', label: 'Langue', hint: 'Celle de l’appli et de tes e-mails' },
  { key: 'security', label: 'Sécurité', hint: 'Mot de passe, membres bloqués' },
] as const
const items = sections.map((item) => ({
  ...item,
  href: `/settings/${item.key}`,
  icon: item.key === 'profile' ? ('user' as const) : ('bell' as const),
}))

export function SettingsCatalogue() {
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
      <Text tone="secondary">La liste des rubriques sur téléphone, chacune avec son aide.</Text>
      <SettingsNav label="Rubriques (téléphone)" items={items} />
      <Text tone="secondary">
        La mise en page d’ordinateur : la colonne à gauche, la rubrique ouverte à droite.
      </Text>
      <SettingsColumns
        nav={<SettingsNav label="Rubriques (ordinateur)" items={items} current="language" />}
        title="Langue"
      >
        <ListGroup footer="Tes e-mails te sont aussi envoyés dans cette langue." radio>
          <ListRow label="Français" selected onPress={() => {}} />
          <ListRow label="English" selected={false} onPress={() => {}} />
        </ListGroup>
      </SettingsColumns>
    </Stack>
  )
}
