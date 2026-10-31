// La section « Barre du haut » du catalogue (refonte, tranche R3) : les pièces de la barre des
// ordinateurs. Les liens Fil · Explorer · Ruches (NavLinks), chacun actif à son tour dans sa goutte,
// aucun actif, et avec « Modération » d'un administrateur ; la photo « Moi » (NavPhotoLink), sur sa
// page ou non ; le champ de recherche (SearchField) vide, rempli, et son focus ; le lien qui a
// l'air d'un champ (SearchLink) et la loupe seule (SearchButton). Chaque exemple de jour et de nuit,
// sur le verre de la barre.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { NavLinks, NavPhotoLink } from '../ui/NavLinks'
import { SearchButton, SearchField } from '../ui/SearchField'
import { SearchLink } from '../ui/SearchLink'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Barre du haut',
  intro:
    'Les pièces de la barre des ordinateurs. Le lien de la page ouverte est posé dans sa goutte, qui ne glisse pas : sur ordinateur, la page change d’un coup. Toucher le lien de la page ouverte ne fait rien, et une double tape n’ouvre la page qu’une fois. Le champ de recherche se vide par sa croix ou par Échap ; Tab ou un clic montrent son bord de focus.',
  links: 'Liens, actif :',
  none: 'aucun (une page posée par-dessus)',
  admin: 'Liens d’un administrateur, « Modération » actif',
  photo: 'Photo « Moi » : ailleurs, puis sur sa page (cerclée)',
  empty: 'Champ vide (touchez-le pour voir le focus)',
  filled: 'Champ rempli, avec sa croix',
  link: 'Hors de la page de recherche : un lien qui a l’air d’un champ',
  button: 'Largeur moyenne : la loupe seule',
  action:
    'Page de recherche sur téléphone : le champ et « Annuler », qui passe dessous quand le texte est grand',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Top bar',
  intro:
    'The pieces of the computer bar. The link of the open page sits in its drop, which does not slide: on a computer, the page changes at once. Touching the link of the open page does nothing, and a double tap opens the page once. The search field empties with its cross or with Escape; Tab or a click show its focus border.',
  links: 'Links, active:',
  none: 'none (a page pushed on top)',
  admin: 'Links of an administrator, “Moderation” active',
  photo: '“Me” photo: elsewhere, then on one’s own page (circled)',
  empty: 'Empty field (touch it to see the focus)',
  filled: 'Filled field, with its cross',
  link: 'Away from the search page: a link that looks like a field',
  button: 'Medium width: the magnifier alone',
  action: 'Search page on a phone: the field and “Cancel”, which goes below it when text is large',
  day: 'day',
  night: 'night',
}

const noop = () => {}

type Key = 'feed' | 'explore' | 'hives' | 'moderation'

export function TopBarCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  const links = [
    { key: 'feed' as const, label: t(($) => $.nav.feed), href: '/' },
    { key: 'explore' as const, label: t(($) => $.nav.explore), href: '/explore' },
    { key: 'hives' as const, label: t(($) => $.nav.hives), href: '/hives' },
  ]
  const adminLinks = [
    ...links,
    { key: 'moderation' as const, label: t(($) => $.nav.moderation), href: '/moderation' },
  ]
  const actives: (Key | null)[] = ['feed', 'explore', 'hives', null]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {schemes.map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            {actives.map((active) => (
              <Example
                key={active ?? 'none'}
                caption={`${l.links} ${active ? links.find((link) => link.key === active)?.label : l.none} — ${l[scheme]}`}
              >
                <Bar>
                  <NavLinks
                    label={t(($) => $.nav.label)}
                    links={links}
                    active={active}
                    onPress={noop}
                  />
                </Bar>
              </Example>
            ))}

            <Example caption={`${l.admin} — ${l[scheme]}`}>
              <Bar>
                <NavLinks
                  label={t(($) => $.nav.label)}
                  links={adminLinks}
                  active="moderation"
                  onPress={noop}
                />
              </Bar>
            </Example>

            <Example caption={`${l.photo} — ${l[scheme]}`}>
              <Bar>
                <Row gap="md">
                  <NavPhotoLink
                    label={t(($) => $.nav.me)}
                    href="/me"
                    onPress={noop}
                    name="Léa Moreau"
                    source={null}
                  />
                  <NavPhotoLink
                    label={t(($) => $.nav.me)}
                    href="/me"
                    current
                    onPress={noop}
                    name="Léa Moreau"
                    source={null}
                  />
                </Row>
              </Bar>
            </Example>

            <Example caption={`${l.empty} — ${l[scheme]}`}>
              <Bar>
                <LiveSearch initial="" />
              </Bar>
            </Example>

            <Example caption={`${l.filled} — ${l[scheme]}`}>
              <Bar>
                <LiveSearch initial="carnet de c" />
              </Bar>
            </Example>

            <Example caption={`${l.link} — ${l[scheme]}`}>
              <Bar>
                <SearchLink
                  label={t(($) => $.search.label)}
                  placeholder={t(($) => $.search.placeholder)}
                  href="/search"
                  onPress={noop}
                  grow
                />
              </Bar>
            </Example>

            <Example caption={`${l.action} — ${l[scheme]}`}>
              <LiveSearch initial="" withCancel />
            </Example>

            <Example caption={`${l.button} — ${l[scheme]}`}>
              <Bar>
                <SearchButton label={t(($) => $.nav.search)} href="/search" onPress={noop} />
              </Bar>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un champ de recherche qu'on peut essayer : il garde ce qu'on tape, la croix et Échap le vident. */
function LiveSearch({ initial, withCancel = false }: { initial: string; withCancel?: boolean }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  return (
    <SearchField
      label={t(($) => $.search.label)}
      placeholder={t(($) => $.search.placeholder)}
      value={value}
      onChangeText={setValue}
      onSubmit={noop}
      // « Annuler » de la page de recherche : ici, il vide seulement le champ.
      action={
        withCancel ? (
          <Button
            label={t(($) => $.common.cancel)}
            variant="glass"
            size="compact"
            onPress={() => setValue('')}
          />
        ) : undefined
      }
    />
  )
}

/** Le verre de la barre, autour de l'exemple : la goutte et les champs se voient là où ils vivent. */
function Bar({ children }: { children: ReactNode }) {
  return (
    <Surface variant="glass" radius="pill" padding="sm">
      <Row gap="md" paddingX="sm">
        <Stack grow>{children}</Stack>
      </Row>
    </Surface>
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
