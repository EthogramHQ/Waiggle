// La section « Mises à jour : familles » du catalogue (R7a, U1a) : la pastille de chaque famille
// d'une ligne de « Ce qui a changé » (« Nouveau », « Réparé », « Plus joli »), dans ses deux tailles,
// sur la page, sur une carte et sur la crème d'une feuille ; puis le menu de choix qui la change
// (une pastille qui ouvre « … » à trois choix, le choisi coché), fermé et ouvert à plat.
// Outil de développement : les exemples sont écrits ici ; seuls les noms des familles et de la
// pastille-bouton viennent des traductions, comme dans l'appli.
import type { UpdateFamily } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { ActionMenu, type ActionMenuItem, ActionMenuList } from '../ui/ActionMenu'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { UpdateFamilyBadge } from '../ui/UpdateFamilyBadge'

const fr = {
  section: 'Mises à jour : familles',
  intro:
    'Chaque ligne de « Ce qui a changé » porte sa famille : une pastille ronde, décorative, et son nom écrit à côté par la ligne. Le menu de choix la change.',
  sizes: 'Les trois familles, taille normale puis petite (carte du fil)',
  onCard: 'Sur une carte (surface)',
  onSheet: 'Sur la crème d’une feuille',
  menuClosed: 'Le menu de choix, ouvert par la pastille (touche-la)',
  menuOpen: 'Ouvert à plat : « Réparé » choisi',
  menuLabel: 'Familles',
  chosen: 'Famille choisie : {{family}}',
  line: 'Un compte à rebours avant chaque question',
}

const en: typeof fr = {
  section: 'Updates: families',
  intro:
    'Each line of “What changed” carries its family: a round, decorative badge, and its name written next to it by the line. The choice menu changes it.',
  sizes: 'The three families, regular then small (feed card)',
  onCard: 'On a card (surface)',
  onSheet: 'On the cream of a sheet',
  menuClosed: 'The choice menu, opened by the badge (tap it)',
  menuOpen: 'Open, laid flat: “Fixed” chosen',
  menuLabel: 'Families',
  chosen: 'Chosen family: {{family}}',
  line: 'A countdown before each question',
}

const families: UpdateFamily[] = ['new', 'fixed', 'polish']
/** La largeur d'une liste ouverte, comme dans la page (ActionMenu la pose à 260 points au plus). */
const LIST_WIDTH = 260

export function UpdateFamiliesCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const name = (family: UpdateFamily) => t(($) => $.update.family[family])
  // La famille de la ligne d'exemple : le menu la change vraiment, on voit la coche suivre.
  const [family, setFamily] = useState<UpdateFamily>('new')

  const items = (current: UpdateFamily): ActionMenuItem[] =>
    families.map((one) => ({
      label: name(one),
      checked: one === current,
      onPress: () => setFamily(one),
    }))

  /** Une rangée des trois pastilles, chacune suivie du nom de sa famille. */
  const badges = (size: 'small' | 'regular') => (
    <Row gap="lg" align="center" wrap>
      {families.map((one) => (
        <Row key={one} gap="sm" align="center">
          <UpdateFamilyBadge family={one} size={size} />
          <Text variant="caption">{name(one)}</Text>
        </Row>
      ))}
    </Row>
  )

  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.section}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.sizes}
        </Text>
        {badges('regular')}
        {badges('small')}
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.onCard}
        </Text>
        <Surface variant="plain" radius="group" padding="lg" shadow="card">
          {badges('regular')}
        </Surface>
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.onSheet}
        </Text>
        <Surface variant="sheet" radius="group" padding="lg">
          {badges('regular')}
        </Surface>
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.menuClosed}
        </Text>
        <Row gap="sm" align="center">
          <ActionMenu
            items={items(family)}
            label={l.menuLabel}
            renderTrigger={({ onPress, expanded, ref }) => (
              // Un exemple de déclencheur à soi : la pastille dans une zone de 44 points, nommée
              // « Famille : Nouveau ». Dans l'appli, c'est UpdateLineField qui la dessine.
              <Pressable
                ref={ref}
                accessibilityRole="button"
                accessibilityLabel={t(($) => $.project.updates.familyButton, {
                  family: name(family),
                })}
                accessibilityState={{ expanded }}
                aria-expanded={expanded}
                aria-haspopup="menu"
                onPress={onPress}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <UpdateFamilyBadge family={family} />
              </Pressable>
            )}
          />
          <Text variant="caption" tone="secondary">
            {l.chosen.replace('{{family}}', name(family))}
          </Text>
        </Row>
        <Text>{l.line}</Text>
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.menuOpen}
        </Text>
        <View style={{ width: '100%', maxWidth: LIST_WIDTH }}>
          <ActionMenuList label={l.menuLabel} items={items('fixed')} onChoose={() => {}} />
        </View>
      </Stack>
    </Stack>
  )
}
