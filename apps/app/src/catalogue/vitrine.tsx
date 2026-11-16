// La section « Vitrine de l'accueil » du catalogue (tranche R12, planches R12-Visiteur-Accueil,
// R12-Visiteur-Desktop et R12-A-La-Une) : la carte d'un projet de la vitrine (`ShowcaseCard`), de
// jour et de nuit, dans ses états :
// - avec une photo (le résumé flou, comme les autres exemples du catalogue, qui n'a pas de serveur)
//   et le statut « Testable » en miel ;
// - sans photo (la lumière miel) et un autre statut ;
// - un titre long, coupé à deux lignes, et un nom d'auteur long ;
// - la taille `fill` : quatre cartes à parts égales, comme l'accueil sur ordinateur.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : le catalogue est partagé par
// toute l'interface. Ses légendes (un outil de développement, absent de l'appli publiée) sont
// écrites ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ShowcaseCard } from '../ui/ShowcaseCard'
import { ShowcaseFreeSlot, ShowcaseSlot } from '../ui/ShowcaseSlot'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Vitrine de l’accueil',
  band: 'Dans une bande qui défile (téléphone, « À la une ») : avec photo, sans photo, titre long',
  fill: 'Côte à côte, à parts égales (accueil sur ordinateur)',
  photo: 'Photo du projet',
  testable: 'Testable',
  done: 'Terminé',
  building: 'En construction',
  day: 'jour',
  night: 'nuit',
  slots:
    'Dans la Modération (ShowcaseSlot, ShowcaseFreeSlot) : sans note, modifié depuis la mise en avant, titre long, place libre',
  remove: 'Retirer',
  removeNamed: 'Retirer de l’accueil',
  changed: 'Modifié depuis la mise en avant',
  free: 'Une place libre',
}

const en: typeof fr = {
  title: 'Home showcase',
  band: 'In a sideways band (phone, “Featured”): with a photo, without, long title',
  fill: 'Side by side, in equal parts (home on a computer)',
  photo: 'Project photo',
  testable: 'Testable',
  done: 'Done',
  building: 'In progress',
  day: 'day',
  night: 'night',
  slots:
    'In Moderation (ShowcaseSlot, ShowcaseFreeSlot): no note, edited since featured, long title, free spot',
  remove: 'Remove',
  removeNamed: 'Remove from the home page',
  changed: 'Edited since it was featured',
  free: 'A free spot',
}

// Des résumés flous de photos (ThumbHash), ceux des autres cartes du catalogue.
const rocket = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const butterfly = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

/** Le catalogue n'ouvre pas de projet : toucher une carte ne fait rien. */
const noop = () => {}

const schemes = ['day', 'night'] as const

export function ShowcaseCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const photo = (thumbhash: string) => ({ source: null, thumbhash, label: l.photo })
  const testable = { label: l.testable, strong: true }
  // Les quatre cartes d'exemple, dans les deux tailles.
  const cards = (size: 'carousel' | 'fill') => [
    <ShowcaseCard
      key="rocket"
      title="Décollage !"
      author={{ name: 'Papi Jean', avatar: null }}
      image={photo(rocket)}
      status={testable}
      onPress={noop}
      size={size}
    />,
    <ShowcaseCard
      key="plain"
      title="Le ciel de ce soir"
      author={{ name: 'Inès Haddad', avatar: null }}
      image={null}
      status={{ label: l.done, strong: false }}
      onPress={noop}
      size={size}
    />,
    <ShowcaseCard
      key="long"
      title="Un assistant qui range les recettes de mamie par saison et par envie"
      author={{ name: 'Marie-Bénédicte de La Fontaine', avatar: null }}
      image={photo(butterfly)}
      status={{ label: l.building, strong: false }}
      onPress={noop}
      size={size}
    />,
    <ShowcaseCard
      key="cafes"
      title="Carnet de cafés"
      author={{ name: 'Léa Moreau', avatar: null }}
      image={photo(rocket)}
      status={testable}
      onPress={noop}
      size={size}
    />,
  ]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.band} — ${l[scheme]}`}>
              <Row gap="md" align="start" wrap>
                {cards('carousel').slice(0, 3)}
              </Row>
            </Example>
            <Example caption={`${l.fill} — ${l[scheme]}`}>
              {/* La largeur d'un ordinateur moyen, sans déborder d'un catalogue plus étroit. */}
              <View style={{ width: '100%', maxWidth: 1100 }}>
                <Row gap="lg" align="stretch">
                  {cards('fill')}
                </Row>
              </View>
            </Example>
            <Example caption={`${l.slots} — ${l[scheme]}`}>
              {/* R12 : l'onglet « Vitrine de l'accueil » de la Modération, ses trois états de place. */}
              <Row gap="md" align="start" wrap>
                {cards('carousel')
                  .slice(0, 3)
                  .map((card, index) => (
                    <ShowcaseSlot
                      key={card.key}
                      card={card}
                      note={index === 1 ? l.changed : undefined}
                      remove={{
                        label: l.remove,
                        spokenLabel: `${l.removeNamed} (${index + 1})`,
                        onPress: noop,
                      }}
                    />
                  ))}
                <ShowcaseFreeSlot label={l.free} />
              </Row>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple sur le fond de son thème. */
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
