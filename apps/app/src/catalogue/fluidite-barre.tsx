// La section « La barre fixe » du catalogue (tranche RF, « La barre du haut reste en place ») : la
// place fixe du haut (ScreenTopBar) posée sur une page qui défile, dans un cadre : fixe avec son
// voile, fixe avec ce qui se pose sous elle (`belowBar`), et dans le flux (téléphone, miel, ou barre
// plus haute qu'un quart de la fenêtre), où elle remonte avec la page. Puis la goutte des liens de
// la barre (NavLinks), qui glisse d'un lien à l'autre. Chaque exemple de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (la session l'y ajoute) :
// plusieurs personnes y travaillent en même temps. Ses libellés (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais ; les textes des composants
// viennent de l'appli.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'
import { Button } from '../ui/Button'
import { NavLinks } from '../ui/NavLinks'
import { ScreenTopBar } from '../ui/ScreenTopBar'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { ScreenScrollContext, useScreenScrollChannel } from '../ui/scrollLight'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La barre fixe',
  intro:
    'Sur tablette et ordinateur, la barre du haut reste en place pendant que la page défile : faites défiler chaque cadre. Le contenu passe dessous, effacé par un voile de la couleur du fond. Si la barre prend plus d’un quart de la hauteur de la fenêtre (texte agrandi, téléphone couché), elle remonte avec la page.',
  pinned: 'Fixe, avec son voile',
  below: 'Fixe, avec ce qui se pose dessous (le bouton des nouveautés du Fil)',
  flow: 'Dans le flux : elle remonte avec la page',
  suspended:
    'Fixe, avec le bandeau de suspension replié sous la capsule (tout l’en-tête reste en place)',
  suspendedOpen: 'Fixe, avec le bandeau de suspension déplié (« Détails »)',
  suspensionText: 'Trois messages d’arnaque en deux jours, après deux retraits.',
  drop: 'La goutte glisse d’un lien à l’autre (touchez les liens ou les boutons) ; avec « Réduire les animations », elle se pose directement',
  card: 'Une carte du fil',
  news: '3 nouveautés',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The pinned bar',
  intro:
    'On a tablet or a computer, the top bar stays in place while the page scrolls: scroll each frame. The content passes below it, faded by a veil of the background colour. If the bar takes more than a quarter of the window height (large text, phone on its side), it scrolls away with the page.',
  pinned: 'Pinned, with its veil',
  below: 'Pinned, with what sits below it (the new items button of the Feed)',
  flow: 'In the flow: it scrolls away with the page',
  suspended: 'Pinned, with the suspension banner folded under the capsule (the whole header stays)',
  suspendedOpen: 'Pinned, with the suspension banner unfolded (“Details”)',
  suspensionText: 'Three scam messages in two days, after two removals.',
  drop: 'The drop slides from one link to the next (touch the links or the buttons); with “Reduce motion”, it lands at once',
  card: 'A card of the feed',
  news: '3 new items',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
type Key = 'feed' | 'explore' | 'hives'
const noop = () => {}

export function FluidTopBarCatalogue() {
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
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.pinned} — ${l[scheme]}`}>
              <PageFrame labels={l} />
            </Example>
            <Example caption={`${l.below} — ${l[scheme]}`}>
              <PageFrame
                labels={l}
                belowBar={<Button label={l.news} variant="glass" size="compact" onPress={noop} />}
              />
            </Example>
            <Example caption={`${l.flow} — ${l[scheme]}`}>
              <PageFrame labels={l} flow />
            </Example>
            <Example caption={`${l.suspended} — ${l[scheme]}`}>
              <PageFrame labels={l} suspension="folded" />
            </Example>
            <Example caption={`${l.suspendedOpen} — ${l[scheme]}`}>
              <PageFrame labels={l} suspension="open" />
            </Example>
            <Example caption={`${l.drop} — ${l[scheme]}`}>
              <DropExample />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple : sa légende, puis lui. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    // Sur une feuille du thème de l'exemple : la légende reste lisible quel que soit celui du
    // catalogue (de nuit, une légende de jour posée sur le fond de nuit ne se lisait pas).
    <Surface variant="panel" padding="md" gap="sm">
      <Text variant="caption" tone="secondary">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}

/**
 * Une petite page dans un cadre : la place du haut avec une barre de verre, et des cartes qui
 * défilent dessous. Le canal du défilement est celui de Screen (ui/scrollLight.ts), que la place
 * écoute quand elle suit la page. `flow` : la barre dans le flux (`brand`, qui l'interdit de fixer).
 */
function PageFrame({
  labels,
  belowBar,
  flow = false,
  suspension,
}: {
  labels: Labels
  belowBar?: ReactNode
  flow?: boolean
  /** Le bandeau de suspension sous la capsule, replié ou déplié : il fait partie de l'en-tête fixe. */
  suspension?: 'folded' | 'open'
}) {
  const { t } = useTranslation()
  const scroll = useScreenScrollChannel()
  const [reserve, setReserve] = useState(0)
  const cards = [1, 2, 3, 4, 5, 6]
  return (
    <Surface variant="grouped" padding="none">
      <ScreenScrollContext.Provider value={scroll.channel}>
        {/* Le bandeau déplié est haut : son cadre l'est aussi, pour qu'il ne soit pas rogné. */}
        <View style={{ height: suspension === 'open' ? 520 : 320, overflow: 'hidden' }}>
          <ScreenTopBar belowBar={belowBar} brand={flow} onHeight={setReserve}>
            <Stack gap="sm">
              <Surface variant="glass" radius="sheet" padding="sm">
                <Row gap="md" paddingX="sm" wrap>
                  <NavLinks
                    label={t(($) => $.nav.label)}
                    links={[
                      { key: 'feed', label: t(($) => $.nav.feed), href: '/' },
                      { key: 'explore', label: t(($) => $.nav.explore), href: '/explore' },
                    ]}
                    active="feed"
                    onPress={noop}
                  />
                </Row>
              </Surface>
              {suspension ? (
                <SuspensionBanner
                  suspension={{
                    since: '2026-10-26T23:30:00.000Z',
                    endsAt: '2026-11-02T23:30:00.000Z',
                    ground: 'rules',
                    explanation: labels.suspensionText,
                    afterReport: true,
                  }}
                  initiallyOpen={suspension === 'open'}
                />
              ) : null}
            </Stack>
          </ScreenTopBar>
          <ScrollView
            onScroll={scroll.handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingTop: reserve + 20, paddingHorizontal: 16, gap: 12 }}
          >
            {cards.map((card) => (
              <Surface key={card} variant="panel" padding="lg">
                <Text>{`${labels.card} ${card}`}</Text>
              </Surface>
            ))}
          </ScrollView>
        </View>
      </ScreenScrollContext.Provider>
    </Surface>
  )
}

/** La goutte qui glisse : des boutons changent le lien actif, comme une page qui en remplace une autre. */
function DropExample() {
  const { t } = useTranslation()
  const [active, setActive] = useState<Key>('feed')
  const links = [
    { key: 'feed' as const, label: t(($) => $.nav.feed), href: '/' },
    { key: 'explore' as const, label: t(($) => $.nav.explore), href: '/explore' },
    { key: 'hives' as const, label: t(($) => $.nav.hives), href: '/hives' },
  ]
  return (
    <Stack gap="md">
      <Surface variant="glass" radius="sheet" padding="sm">
        <NavLinks label={t(($) => $.nav.label)} links={links} active={active} onPress={setActive} />
      </Surface>
      <Row gap="sm" wrap>
        {links.map((link) => (
          <Button
            key={link.key}
            label={link.label}
            variant="glass"
            size="compact"
            onPress={() => setActive(link.key)}
          />
        ))}
      </Row>
    </Stack>
  )
}
