// La section « Menu « … » » du catalogue (tranche 7b) : le bouton qui ouvre les actions secondaires
// d'une page, sur une surface et sur une image, puis la liste ouverte dans ses états (le profil
// d'un autre membre, un membre bloqué, un projet, un libellé long). Un fichier à part, avec ses
// propres textes, pour que deux personnes n'écrivent pas dans le même fichier.
// Outil de développement : les exemples sont écrits ici, pas dans les traductions des membres.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ActionMenu, type ActionMenuItem, ActionMenuList } from '../ui/ActionMenu'
import { Button } from '../ui/Button'
import { ProjectCover } from '../ui/ProjectCover'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  section: 'Menu « … »',
  intro:
    'Les actions secondaires d’une page derrière un seul bouton. Touche-le : la liste s’ouvre sous lui ; Échap, une tape à côté ou un choix la referme.',
  closed: 'Fermé, sur une surface et sur une image',
  member: 'Ouvert : le profil d’un autre membre',
  blocked: 'Ouvert : un membre bloqué',
  project: 'Ouvert : un projet (une seule action)',
  long: 'Ouvert : un libellé long, qui passe à la ligne',
  report: 'Signaler ce profil',
  block: 'Bloquer',
  unblock: 'Débloquer',
  reportProject: 'Signaler ce projet',
  longLabel: 'Signaler ce profil à la modération de Waiggle, avec un motif',
  label: 'Plus d’actions',
  chosen: 'Choisi : {{label}}',
  none: 'Rien de choisi pour l’instant.',
  end: 'Au bout d’une rangée (align « end ») : il s’ouvre vers la gauche, au-dessus de sa colonne',
  follow: 'Suivre ce projet',
  // Un autre nom que les deux boutons fermés du haut : les tests du catalogue les comptent.
  rowLabel: 'Actions du projet',
}

const en: typeof fr = {
  section: '“…” menu',
  intro:
    'The secondary actions of a page behind a single button. Tap it: the list opens below it; Escape, a tap elsewhere or a choice closes it.',
  closed: 'Closed, on a surface and on an image',
  member: 'Open: another member’s profile',
  blocked: 'Open: a blocked member',
  project: 'Open: a project (a single action)',
  long: 'Open: a long label, which wraps',
  report: 'Report this profile',
  block: 'Block',
  unblock: 'Unblock',
  reportProject: 'Report this project',
  longLabel: 'Report this profile to the Waiggle moderation, with a reason',
  label: 'More actions',
  chosen: 'Chosen: {{label}}',
  none: 'Nothing chosen yet.',
  end: 'At the end of a row (align “end”): it opens to the left, over its own column',
  follow: 'Follow this project',
  rowLabel: 'Project actions',
}

/** La largeur d'une liste ouverte, comme dans la page (ActionMenu la pose à 260 points au plus). */
const LIST_WIDTH = 260

export function ActionMenuSamples() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // Le dernier choix fait dans un menu du catalogue : on voit que l'action part, une fois.
  const [chosen, setChosen] = useState<string | null>(null)
  const choose = (label: string) => () => setChosen(label)

  const memberItems = [
    { label: l.report, icon: 'flag' as const, onPress: choose(l.report) },
    {
      label: l.block,
      icon: 'prohibit' as const,
      tone: 'danger' as const,
      onPress: choose(l.block),
    },
  ]
  const blockedItems = [
    { label: l.unblock, icon: 'check-circle' as const, onPress: choose(l.unblock) },
    { label: l.report, icon: 'flag' as const, onPress: choose(l.report) },
  ]
  const projectItems = [
    { label: l.reportProject, icon: 'flag' as const, onPress: choose(l.reportProject) },
  ]
  const longItems = [
    { label: l.longLabel, icon: 'flag' as const, onPress: choose(l.longLabel) },
    { label: l.block, tone: 'danger' as const, onPress: choose(l.block) },
  ]

  /** Une liste ouverte, montrée à plat (sans la couche qui couvre la page). */
  const open = (title: string, items: ActionMenuItem[]) => (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {title}
      </Text>
      <View style={{ width: '100%', maxWidth: LIST_WIDTH }}>
        <ActionMenuList label={l.label} items={items} onChoose={(item) => item.onPress()} />
      </View>
    </Stack>
  )

  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.section}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.closed}
        </Text>
        <Row gap="lg" align="center" wrap>
          <ActionMenu items={memberItems} />
          <View style={{ width: 160 }}>
            <ProjectCover height="band" radius="tile" image={null}>
              <Row padding="lg" justify="end">
                <ActionMenu items={projectItems} variant="glass" />
              </Row>
            </ProjectCover>
          </View>
        </Row>
        <Text variant="caption" tone="secondary">
          {chosen ? l.chosen.replace('{{label}}', chosen) : l.none}
        </Text>
      </Stack>
      {/* Corrections de 7b : « … » au bout de la rangée de « Suivre » (la colonne latérale d'un
          projet), aligné sur son bord droit quelle que soit sa place dans l'écran. */}
      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.end}
        </Text>
        <View style={{ width: '100%', maxWidth: 360 }}>
          <Row gap="md" justify="between">
            <Button
              label={l.follow}
              icon="plus"
              variant="secondary"
              size="compact"
              onPress={choose(l.follow)}
            />
            <ActionMenu items={projectItems} align="end" label={l.rowLabel} />
          </Row>
        </View>
      </Stack>
      {open(l.member, memberItems)}
      {open(l.blocked, blockedItems)}
      {open(l.project, projectItems)}
      {open(l.long, longItems)}
    </Stack>
  )
}
