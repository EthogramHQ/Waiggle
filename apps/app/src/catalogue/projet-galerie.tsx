// La section « Galerie de photos » du catalogue (R5a, U4) : la galerie de la page projet
// (PhotoGallery) à une, deux et trois photos, et sans photo (la lumière miel), de jour et de nuit.
// Sur téléphone, les photos glissent sous le doigt ; sur ordinateur, ses coins sont arrondis et des
// flèches de verre s'ajoutent (la largeur de la fenêtre décide, comme sur la page). Un exemple porte
// un `overlay` comme la page : les boutons de verre en haut (CoverControls) et, sur ordinateur, la
// capsule à cheval sur le bas (CoverStraddle). Un dernier exemple montre la galerie bord à bord et la
// feuille qui la chevauche (CoverSheet), comme sur téléphone.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes du composant viennent de l'appli.
import { type ColorName, palettes } from '@ruche/brand'
import { REACTION_KINDS } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../ui/IconButton'
import type { ImageSource } from '../ui/image'
import { type GalleryPhoto, PhotoGallery } from '../ui/PhotoGallery'
import { CoverControls, CoverSheet, CoverStraddle } from '../ui/ProjectCover'
import { ReactionCapsule } from '../ui/ReactionCapsule'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Galerie de photos',
  intro:
    'La galerie de la page projet : les photos glissent l’une après l’autre et s’arrêtent toujours sur une photo entière. Des points et « 1 sur 3 » disent où l’on en est ; rien pour une seule photo. Sur ordinateur, des flèches de verre et les flèches du clavier (le focus dans la galerie) ; le lecteur d’écran entend « Photo 2 sur 3 » et passe d’une photo à l’autre sans glisser.',
  three: 'Trois photos : les boutons de verre sur téléphone, la capsule à cheval sur ordinateur',
  two: 'Deux photos',
  one: 'Une seule photo : ni points, ni « 1 sur 1 », ni flèches',
  none: 'Sans photo : la lumière miel et le titre',
  shown: 'Photo montrée (onIndexChange) : {{index}}',
  bleed: 'Bord à bord sur téléphone, la feuille de la page chevauche le bas de la photo',
  sheet: 'La feuille de la page : le statut, le titre, l’auteur…',
  sampleTitle: 'Décollage !',
  back: 'Retour',
  share: 'Partager',
  more: 'Plus d’actions',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Photo gallery',
  intro:
    'The gallery of the project page: photos glide one after the other and always stop on a whole photo. Dots and “1 of 3” tell where you are; nothing for a single photo. On computers, glass arrows and the arrow keys (with the focus in the gallery); screen readers hear “Photo 2 of 3” and move from photo to photo without swiping.',
  three: 'Three photos: the glass buttons on phones, the straddling capsule on computers',
  two: 'Two photos',
  one: 'A single photo: no dots, no “1 of 1”, no arrows',
  none: 'No photo: the honey light and the title',
  shown: 'Photo shown (onIndexChange): {{index}}',
  bleed: 'Edge to edge on phones, the page sheet overlapping the bottom of the photo',
  sheet: 'The page sheet: status, title, author…',
  sampleTitle: 'Lift-off!',
  back: 'Back',
  share: 'Share',
  more: 'More actions',
  day: 'day',
  night: 'night',
}

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque, et un disque d'une troisième, comme dans feuilles.tsx. Les couleurs viennent de
 * @ruche/brand (palette de jour : une photo ne change pas avec le thème).
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="110" r="70" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}

// Des résumés flous (ThumbHash) de visuels de projet, ceux de CatalogueScreen. Ils ressemblent à des
// clés secrètes pour l'outil qui cherche les secrets oubliés (gitleaks) : « gitleaks:allow » lui
// indique que ce n'en sont pas.
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

/** Trois photos de couleurs bien distinctes. */
const PHOTOS: GalleryPhoto[] = [
  { key: 'visual-1', source: sample('text', 'controlChecked', 'honey'), thumbhash: papillon },
  { key: 'visual-2', source: sample('honey', 'amber', 'honeySoft'), thumbhash: cafe },
  { key: 'visual-3', source: sample('success', 'text', 'honeyLight'), thumbhash: null },
]

const noop = () => {}

/** Les réactions d'un projet, telles que la page les donne à la capsule. */
const counts = { amazing: 9, inspiring: 14, useful: 4, funny: 6, bravo: 21 } as const
const reactions = REACTION_KINDS.map((kind) => ({
  kind,
  count: counts[kind],
  mine: kind === 'bravo',
}))

export function GalleryCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
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
            <WithOverlay l={l} caption={`${l.three} — ${l[scheme]}`} />
            <Example caption={`${l.two} — ${l[scheme]}`}>
              <PhotoGallery photos={PHOTOS.slice(0, 2)} />
            </Example>
            <Example caption={`${l.one} — ${l[scheme]}`}>
              <PhotoGallery photos={PHOTOS.slice(0, 1)} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Example caption={l.none}>
        <PhotoGallery photos={[]} title={l.sampleTitle} />
      </Example>

      <Text variant="caption" tone="muted">
        {l.bleed}
      </Text>
      <PhotoGallery photos={PHOTOS} bleed overlay={<Controls l={l} />} />
      <CoverSheet>
        <Text variant="title1">{l.sampleTitle}</Text>
        <Text tone="secondary">{l.sheet}</Text>
      </CoverSheet>
    </Stack>
  )
}

/** Les boutons de verre de la page : Retour à gauche, Partager et « … » à droite. */
function Controls({ l }: { l: typeof fr }) {
  return (
    <CoverControls
      start={<IconButton icon="arrow-left" label={l.back} onPress={noop} />}
      end={
        <>
          <IconButton icon="share-network" label={l.share} onPress={noop} />
          <IconButton icon="dots-three" label={l.more} onPress={noop} hasMenu />
        </>
      }
    />
  )
}

/**
 * La galerie comme sur la page : les boutons de verre et, sur ordinateur, la capsule à cheval sur
 * le bas (sur téléphone, la page la pose en bas de l'écran). La photo montrée est écrite dessous.
 */
function WithOverlay({ l, caption }: { l: typeof fr; caption: string }) {
  const { sizeClass } = useLayout()
  const [shown, setShown] = useState(0)
  return (
    <Example caption={caption}>
      <PhotoGallery
        photos={PHOTOS}
        onIndexChange={setShown}
        overlay={
          <>
            {/* Comme la page : sur ordinateur, Retour, Partager et « … » sont au-dessus de la
                galerie, hors de la photo (planche R5a-Projet-Desktop). */}
            {sizeClass === 'compact' ? (
              <Controls l={l} />
            ) : (
              <CoverStraddle>
                <ReactionCapsule reactions={reactions} onToggle={noop} onOpenFan={noop} />
              </CoverStraddle>
            )}
          </>
        }
      />
      <Text variant="caption" tone="muted">
        {l.shown.replace('{{index}}', String(shown + 1))}
      </Text>
    </Example>
  )
}

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
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
