// Catalogue de la navigation (tranche R3) : la barre d'onglets du téléphone (TabBar) dans ses
// états : Fil actif (on peut toucher les onglets, la goutte glisse), Moi actif avec une photo, Moi
// actif sans photo (les initiales), le « + » masqué (membre suspendu), et le mode « Réduire les
// animations » (la goutte apparaît en fondu) ; puis, après la relecture de R3, le titre caché à l'œil
// (HiddenHeading) et deux états de StateMessage (« bientôt », erreur). Fichier à part de CatalogueScreen.tsx, qui l'importe
// en une ligne. Les textes d'exemple sont écrits ici en clair : le catalogue est un outil de
// développement, absent de l'appli publiée.
import { palettes } from '@ruche/brand'
import { useState } from 'react'
import { View } from 'react-native'
import { HiddenHeading } from '../ui/HiddenHeading'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { TabBar, type TabBarProps, type TabKey } from '../ui/TabBar'
import { Text } from '../ui/Text'

const tabs: TabBarProps['tabs'] = [
  { key: 'feed', label: 'Fil', href: '/' },
  { key: 'explore', label: 'Explorer', href: '/explore' },
  { key: 'hives', label: 'Ruches', href: '/hives' },
  { key: 'me', label: 'Moi', href: '/me' },
]
const publish = { href: '/publish', label: 'Publier' }
// Une photo de profil d'exemple : un petit dessin en SVG, sans réseau. Ses couleurs viennent de la
// palette de jour (une image ne change pas avec le thème), jamais écrites à la main.
const day = palettes.day
const photo = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="${day.amberText}"/><circle cx="28" cy="22" r="10" fill="${day.honeyLight}"/><ellipse cx="28" cy="46" rx="16" ry="11" fill="${day.honeyLight}"/></svg>`,
)}`
const withPhoto = { name: 'Léa Moreau', source: { uri: photo } }
const withoutPhoto = { name: 'Léa Moreau', source: null }
const quiet = { onPress: () => {}, onReselect: () => {} }

/** La largeur d'un téléphone : la barre se regarde à cette largeur, même sur ordinateur. */
const phoneWidth = 390

/** Une barre qu'on peut toucher : l'onglet touché devient actif, la goutte glisse jusqu'à lui. */
function LiveTabBar({ calm = false }: { calm?: boolean }) {
  const [active, setActive] = useState<TabKey>('feed')
  return (
    <TabBar
      tabs={tabs}
      active={active}
      avatar={withPhoto}
      publish={publish}
      onPress={(target) => {
        if (target !== 'publish') setActive(target)
      }}
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
        <TabBar tabs={tabs} active="me" avatar={withPhoto} publish={publish} {...quiet} />
      </View>
      <Text tone="secondary">Moi actif, sans photo : les initiales.</Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <TabBar tabs={tabs} active="me" avatar={withoutPhoto} publish={publish} {...quiet} />
      </View>
      <Text tone="secondary">Membre suspendu : le « + » disparaît, sa place reste.</Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <TabBar tabs={tabs} active="explore" avatar={withPhoto} publish={null} {...quiet} />
      </View>
      <Text tone="secondary">
        « Réduire les animations » : la goutte apparaît en fondu à sa nouvelle place.
      </Text>
      <View style={{ width: '100%', maxWidth: phoneWidth }}>
        <LiveTabBar calm />
      </View>
      <StatesOfR3 />
    </Stack>
  )
}

/**
 * Deux pièces venues de la relecture de R3 : le titre caché à l'œil (le Fil d'un téléphone, où le
 * logo tient lieu de titre) et l'état « bientôt » de StateMessage (l'onglet Ruches).
 */
function StatesOfR3() {
  return (
    <Stack gap="md">
      <Text tone="secondary">
        HiddenHeading : un titre lu par les lecteurs d’écran, invisible. Il est posé dans le cadre
        ci-dessous (« Fil », niveau 3 ici pour ne pas doubler le titre de la page), qui reste vide à
        l’œil.
      </Text>
      <View style={{ minHeight: 44 }}>
        <HiddenHeading text="Fil" level={3} />
      </View>
      <Text tone="secondary">
        StateMessage « bientôt » : l’abeille qui fait coucou, deux phrases.
      </Text>
      <StateMessage
        kind="soon"
        title="Les ruches arrivent bientôt"
        message={[
          'Une ruche, c’est un petit groupe de proches, comme « Ma ruche Famille ».',
          'Vous y partagerez vos projets entre vous.',
        ]}
      />
      <Text tone="secondary">
        StateMessage en erreur : la tuile commence au bord du texte, son halo déborde hors du flux.
      </Text>
      <StateMessage
        kind="error"
        title="Cette page n’a pas pu se charger"
        message="Vérifie ta connexion, puis réessaie."
        actions={[{ label: 'Réessayer', onPress: () => {} }]}
      />
    </Stack>
  )
}
