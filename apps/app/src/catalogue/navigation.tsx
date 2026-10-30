// Catalogue de la navigation (tranche R3) : la barre d'onglets du téléphone (TabBar) dans ses
// états : Fil actif (on peut toucher les onglets, la goutte glisse), Moi actif avec une photo, Moi
// actif sans photo (les initiales), le « + » masqué (membre suspendu), et le mode « Réduire les
// animations » (la goutte apparaît en fondu). Fichier à part de CatalogueScreen.tsx, qui l'importe
// en une ligne. Les textes d'exemple sont écrits ici en clair : le catalogue est un outil de
// développement, absent de l'appli publiée.
import { useState } from 'react'
import { View } from 'react-native'
import { Stack } from '../ui/Stack'
import { TabBar, type TabBarProps, type TabKey } from '../ui/TabBar'
import { Text } from '../ui/Text'

const tabs: TabBarProps['tabs'] = [
  { key: 'feed', label: 'Fil', href: '/' },
  { key: 'explore', label: 'Explorer', href: '/explore' },
  { key: 'hives', label: 'Ruches', href: '/hives' },
  { key: 'me', label: 'Moi', href: '/me' },
]
const publish = { href: '/publish', label: 'Publier' }
// Une photo de profil d'exemple : un petit dessin en SVG, sans réseau.
const photo =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" fill="#8A5A00"/><circle cx="28" cy="22" r="10" fill="#FFE58A"/><ellipse cx="28" cy="46" rx="16" ry="11" fill="#FFE58A"/></svg>',
  )
const withPhoto = { name: 'Léa Moreau', url: photo }
const withoutPhoto = { name: 'Léa Moreau', url: null }
const quiet = { onPress: () => {}, onReselect: () => {} }

/** La largeur d'un téléphone : la barre se regarde à cette largeur, même sur ordinateur. */
const phoneWidth = 390

/** Une barre qu'on peut toucher : l'onglet touché devient actif, la goutte glisse jusqu'à lui. */
function LiveTabBar({ calm = false }: { calm?: boolean }) {
  const [active, setActive] = useState<TabKey>('feed')
  return (
    <TabBar
      label={calm ? 'Navigation (mode réduit)' : 'Navigation (essai)'}
      tabs={tabs}
      active={active}
      avatar={withPhoto}
      publish={publish}
      onPress={setActive}
      onReselect={() => {}}
      calm={calm}
    />
  )
}

export function NavigationCatalogue() {
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        Navigation (R3)
      </Text>
      <Text tone="secondary">
        La barre d’onglets du téléphone. Fil actif : touche un autre onglet, la goutte glisse.
      </Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <LiveTabBar />
      </View>
      <Text tone="secondary">Moi actif, avec la photo du membre cerclée.</Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <TabBar
          label="Navigation (Moi, photo)"
          tabs={tabs}
          active="me"
          avatar={withPhoto}
          publish={publish}
          {...quiet}
        />
      </View>
      <Text tone="secondary">Moi actif, sans photo : les initiales.</Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <TabBar
          label="Navigation (Moi, initiales)"
          tabs={tabs}
          active="me"
          avatar={withoutPhoto}
          publish={publish}
          {...quiet}
        />
      </View>
      <Text tone="secondary">Membre suspendu : le « + » disparaît, sa place reste.</Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <TabBar
          label="Navigation (sans publier)"
          tabs={tabs}
          active="explore"
          avatar={withPhoto}
          publish={null}
          {...quiet}
        />
      </View>
      <Text tone="secondary">
        « Réduire les animations » : la goutte apparaît en fondu à sa nouvelle place.
      </Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <LiveTabBar calm />
      </View>
    </Stack>
  )
}
