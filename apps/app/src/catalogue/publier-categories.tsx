// La section « Publier : catégories, mois et cartes » du catalogue (R6a, U2) : le choix des
// catégories (CategoryPicker : aucune, une, deux), le champ « Commencé en » (MonthField : vide,
// choisi, à la borne du mois en cours avec les mois suivants inactifs, avec une erreur), et la
// catégorie sur la carte d'un projet (ProjectCard `category` : avec photo, sans photo, avec la
// pastille « Suivre » dessous). Jour et nuit. Les deux premiers exemples se manipulent.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ProjectCategory } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoryOption, categoryOptions } from '../projects/categories'
import { CategoryPicker } from '../ui/CategoryPicker'
import { FollowButton } from '../ui/FollowButton'
import { MonthField } from '../ui/MonthField'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Publier : catégories, mois et cartes',
  intro:
    'CategoryPicker : seize cases à cocher ; la première touchée devient la principale (« 1 », miel), la suivante la seconde (« 2 », miel pâle). Retoucher une catégorie la retire, la seconde remonte ; une troisième remplace la seconde. MonthField : l’année se règle (curseur, flèches ou chevrons), les mois forment un groupe de douze choix, inactifs après le mois en cours (ici novembre 2026, une date fixe). ProjectCard category : l’étiquette de verre en haut à gauche de la photo, hors du lien ; sans photo, au-dessus du titre.',
  liveCategories: 'À manipuler : choisir, retirer, remplacer',
  liveMonth: 'À manipuler : régler l’année, choisir un mois, « Effacer »',
  none: 'Aucune catégorie',
  one: 'Une catégorie (la principale)',
  two: 'Deux catégories',
  monthEmpty: 'Vide : l’année du mois en cours, aucun mois coché',
  monthChosen: 'Mars 2025',
  monthBound: 'À la borne : novembre 2026, décembre inactif',
  monthError: 'Avec une erreur',
  error: 'Ce mois n’est pas encore arrivé.',
  withPhoto: 'Avec photo : l’étiquette en haut à gauche',
  withoutPhoto: 'Sans photo : au-dessus du titre',
  withFollow: 'Avec la pastille « Suivre », dessous',
  before: 'Projet d’avant R6a : aucune étiquette',
  follow: 'Suivre Nora',
  now: 'il y a 3 h',
  photo: 'Photo du projet',
  testable: 'Testable',
  building: 'En construction',
  sky: {
    title: 'Le ciel de ce soir',
    pitch: 'Ce qu’on verra dans le ciel ce soir, s’il fait beau.',
  },
  soup: { title: 'Soupe du dimanche', pitch: 'Une soupe avec ce qu’il reste dans le frigo.' },
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Publish: categories, month and cards',
  intro:
    'CategoryPicker: sixteen checkboxes; the first one touched becomes the main one (“1”, honey), the next one the second (“2”, pale honey). Touching a category again removes it, the second moves up; a third one replaces the second. MonthField: the year is adjustable (slider, arrows or chevrons), the months are a group of twelve choices, inactive after the current month (here November 2026, a fixed date). ProjectCard category: the glass label at the top left of the photo, outside the link; without a photo, above the title.',
  liveCategories: 'Try it: choose, remove, replace',
  liveMonth: 'Try it: adjust the year, choose a month, “Clear”',
  none: 'No category',
  one: 'One category (the main one)',
  two: 'Two categories',
  monthEmpty: 'Empty: the current month’s year, no month checked',
  monthChosen: 'March 2025',
  monthBound: 'At the bound: November 2026, December inactive',
  monthError: 'With an error',
  error: 'This month hasn’t come yet.',
  withPhoto: 'With a photo: the label at the top left',
  withoutPhoto: 'Without a photo: above the title',
  withFollow: 'With the “Follow” chip, underneath',
  before: 'Project from before R6a: no label',
  follow: 'Follow Nora',
  now: '3 h ago',
  photo: 'Project photo',
  testable: 'Testable',
  building: 'In progress',
  sky: { title: 'Tonight’s sky', pitch: 'What we’ll see in the sky tonight, if it’s clear.' },
  soup: { title: 'Sunday soup', pitch: 'A soup with what’s left in the fridge.' },
  day: 'day',
  night: 'night',
}

// Un résumé flou (ThumbHash) de visuel de projet, le même que celui de cartes.tsx.
// « gitleaks:allow » : l'outil qui cherche les secrets oubliés le prendrait pour une clé.
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

// Des bornes fixes : le « mois en cours » du catalogue ne change pas d'un jour à l'autre (les
// captures restent comparables), et le pré-rendu du web ne lit pas l'horloge (une date lue au rendu
// donnerait un écart entre le serveur et le navigateur).
const MIN = '2000-01'
const MAX = '2026-11'

const noop = () => {}

type Choice = { primary: ProjectCategory | null; secondary: ProjectCategory | null }

/** Les textes de l'appli dont les exemples ont besoin, et les noms des mois tirés d'`Intl`. */
const useSampleTexts = () => {
  const { i18n, t } = useTranslation()
  // Les douze mois dans la langue de l'appli (« mars », « March ») : `Intl` les connaît, en UTC
  // pour qu'aucun fuseau ne fasse glisser le 1er du mois vers le mois d'avant.
  const format = new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' })
  const monthNames = Array.from({ length: 12 }, (_, index) =>
    format.format(new Date(Date.UTC(2000, index, 1))),
  )
  return {
    options: categoryOptions(t),
    picker: {
      label: t(($) => $.project.form.category),
      hint: t(($) => $.project.form.categoryRule),
      rankLabels: {
        primary: (category: string) => t(($) => $.project.form.categoryRank1, { category }),
        secondary: (category: string) => t(($) => $.project.form.categoryRank2, { category }),
      },
    },
    month: {
      label: t(($) => $.project.form.startedOn),
      monthLabel: t(($) => $.project.form.month),
      yearLabel: t(($) => $.project.form.year),
      clearLabel: t(($) => $.project.form.clear),
      monthNames,
      min: MIN,
      max: MAX,
    },
  }
}

export function PublishCategoriesCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const texts = useSampleTexts()
  const science = categoryOption(t, 'science')
  const cooking = categoryOption(t, 'cooking')
  const schemes = ['day', 'night'] as const
  const pick = (primary: Choice['primary'], secondary: Choice['secondary']) => (
    <CategoryPicker
      {...texts.picker}
      options={texts.options}
      primary={primary}
      secondary={secondary}
      onChange={noop}
    />
  )
  const card = {
    author: { name: 'Nora Benali', avatar: null },
    when: l.now,
    onPress: noop,
  }
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.liveCategories}>
        <LiveCategories />
      </Example>
      <Example caption={l.liveMonth}>
        <LiveMonth />
      </Example>

      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.none} — ${l[scheme]}`}>{pick(null, null)}</Example>
            <Example caption={`${l.one} — ${l[scheme]}`}>{pick('science', null)}</Example>
            <Example caption={`${l.two} — ${l[scheme]}`}>{pick('science', 'learning')}</Example>
            <Example caption={`${l.monthEmpty} — ${l[scheme]}`}>
              <MonthField {...texts.month} value={null} onChange={noop} />
            </Example>
            <Example caption={`${l.monthChosen} — ${l[scheme]}`}>
              <MonthField {...texts.month} value="2025-03" onChange={noop} />
            </Example>
            <Example caption={`${l.monthBound} — ${l[scheme]}`}>
              <MonthField {...texts.month} value={MAX} onChange={noop} />
            </Example>
            <Example caption={`${l.monthError} — ${l[scheme]}`}>
              <MonthField {...texts.month} value={null} onChange={noop} error={l.error} />
            </Example>
            <Example caption={l[scheme]}>
              <ProjectGrid empty="">
                <Captioned caption={l.withPhoto}>
                  <ProjectCard
                    {...card}
                    {...l.sky}
                    status={{ label: l.testable, strong: true }}
                    image={{ source: null, thumbhash: papillon, label: l.photo }}
                    category={science}
                  />
                </Captioned>
                <Captioned caption={l.withoutPhoto}>
                  <ProjectCard
                    {...card}
                    {...l.soup}
                    status={{ label: l.building, strong: false }}
                    image={null}
                    category={cooking}
                  />
                </Captioned>
                <Captioned caption={l.withFollow}>
                  <ProjectCard
                    {...card}
                    {...l.sky}
                    status={{ label: l.testable, strong: true }}
                    image={{ source: null, thumbhash: papillon, label: l.photo }}
                    category={science}
                    overlay={
                      <FollowButton
                        variant="chip"
                        followed={false}
                        onPress={noop}
                        label={l.follow}
                        text={l.follow}
                        avatar={{ name: 'Nora Benali', source: null }}
                      />
                    }
                  />
                </Captioned>
                <Captioned caption={l.before}>
                  <ProjectCard
                    {...card}
                    {...l.soup}
                    status={{ label: l.building, strong: false }}
                    image={{ source: null, thumbhash: papillon, label: l.photo }}
                  />
                </Captioned>
              </ProjectGrid>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Le choix des catégories qui se manipule, gardé ici comme il le serait dans la feuille. */
function LiveCategories() {
  const texts = useSampleTexts()
  const [choice, setChoice] = useState<Choice>({ primary: null, secondary: null })
  return (
    <CategoryPicker
      {...texts.picker}
      options={texts.options}
      primary={choice.primary}
      secondary={choice.secondary}
      onChange={setChoice}
    />
  )
}

/** Le champ « Commencé en » qui se manipule. */
function LiveMonth() {
  const texts = useSampleTexts()
  const [value, setValue] = useState<string | null>(null)
  return <MonthField {...texts.month} value={value} onChange={setValue} />
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

/** Une carte et ce qu'elle montre, dans une cellule de la grille. */
function Captioned({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}
