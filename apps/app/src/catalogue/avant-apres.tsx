// La section « Avant / après » du catalogue (R7a, U2) : la comparaison de deux photos d'une mise à
// jour (BeforeAfter), le trait au milieu, tout à gauche et tout à droite, de jour et de nuit ; puis
// une comparaison à photos non décrites, et celle qu'on vient atteindre au clavier pour voir son
// anneau de focus (Tab jusqu'au curseur, puis les flèches).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (la session pose l'import à la
// fusion) : plusieurs personnes y travaillent en même temps. Ses libellés (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais ; les textes
// du composant viennent de l'appli.
import { type ColorName, palettes } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BeforeAfter } from '../ui/BeforeAfter'
import type { ImageSource } from '../ui/image'
import type { GalleryPhoto } from '../ui/PhotoGallery'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Avant / après',
  intro:
    'La comparaison d’une mise à jour : la photo d’avant à gauche du trait, celle d’après à droite. On fait glisser la poignée, ou on touche la photo, pour placer le trait ; un glissé vers le haut ou le bas fait défiler la page. Le lecteur d’écran entend un curseur « Comparer avant et après » et sa valeur en pour cent ; au clavier, les flèches le déplacent de 10 %, Début et Fin vont aux bords. Rien ne bouge seul.',
  middle: 'Au départ : le trait au milieu (50 %)',
  start: 'Le trait tout à gauche (0 %) : seule la photo d’après se voit',
  end: 'Le trait tout à droite (100 %) : seule la photo d’avant se voit',
  undescribed: 'Photos sans description : elles sont lues « Avant » et « Après »',
  focused: 'Focalisé : Tab jusqu’au curseur, l’anneau se dessine à l’intérieur du cadre',
  heard: 'Lu : {{spoken}}',
  beforeDescription: 'La fusée de jour, sur son pas de tir',
  afterDescription: 'La fusée de nuit, le décompte affiché',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Before / after',
  intro:
    'The comparison of an update: the before photo on the left of the line, the after photo on the right. Drag the handle, or tap the photo, to place the line; swiping up or down scrolls the page. Screen readers hear a slider “Compare before and after” and its value in percent; with the keyboard, the arrows move it by 10%, Home and End go to the edges. Nothing moves on its own.',
  middle: 'At first: the line in the middle (50%)',
  start: 'The line all the way left (0%): only the after photo shows',
  end: 'The line all the way right (100%): only the before photo shows',
  undescribed: 'Photos without a description: they are read “Before” and “After”',
  focused: 'Focused: Tab to the slider, the ring is drawn inside the frame',
  heard: 'Heard: {{spoken}}',
  beforeDescription: 'The rocket by day, on its launch pad',
  afterDescription: 'The rocket by night, the countdown shown',
  day: 'day',
  night: 'night',
}

/**
 * Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque, et un disque d'une troisième, comme dans projet-galerie.tsx. Les couleurs viennent de
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

/** L'avant (de jour, clair) et l'après (de nuit, sombre) : deux photos bien distinctes. */
const photos = (l: typeof fr): [GalleryPhoto, GalleryPhoto] => [
  {
    key: 'before',
    source: sample('honeySoft', 'honey', 'amber'),
    description: l.beforeDescription,
  },
  {
    key: 'after',
    source: sample('text', 'controlChecked', 'honeyLight'),
    description: l.afterDescription,
  },
]

export function BeforeAfterCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [before, after] = photos(l)
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
            <Example caption={`${l.middle} — ${l[scheme]}`}>
              <BeforeAfter before={before} after={after} />
              <Text variant="caption" tone="muted">
                {l.heard.replace(
                  '{{spoken}}',
                  [
                    t(($) => $.project.updates.beforeDescribed, {
                      description: before.description,
                    }),
                    t(($) => $.project.updates.afterDescribed, { description: after.description }),
                    `${t(($) => $.project.updates.compare)}, ${t(($) => $.project.updates.compareValue, { value: 50 })}`,
                  ].join(' · '),
                )}
              </Text>
            </Example>
            <Example caption={`${l.start} — ${l[scheme]}`}>
              <BeforeAfter before={before} after={after} initialValue={0} />
            </Example>
            <Example caption={`${l.end} — ${l[scheme]}`}>
              <BeforeAfter before={before} after={after} initialValue={100} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Example caption={l.undescribed}>
        <BeforeAfter
          before={{ ...before, description: null }}
          after={{ ...after, description: '' }}
          initialValue={30}
        />
      </Example>
      <Example caption={l.focused}>
        <BeforeAfter before={before} after={after} initialValue={70} height="band" />
      </Example>
    </Stack>
  )
}

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
