// La carte d'un projet à ranger (tranche R6b, page « Catégories » de la Modération, onglet « À
// ranger ») : un projet classé « Autre », que l'administrateur range dans une vraie catégorie. Son
// titre (un lien vers sa page, pour le lire avant de décider), son auteur, son accroche, puis le
// bouton « Ranger dans une catégorie », qui ouvre le choix de l'écran.
//
// Une fois rangé, la carte garde sa place (règle de la tranche 7a) : le bouton laisse la place à
// « Rangé dans Animaux. », au moins aussi haut (DecidedZone). Le titre reste un lien : on peut
// vérifier le projet rangé. Tout ce que le membre a écrit (titre, accroche) s'affiche en texte brut.
import { borders, radii, space } from '@ruche/brand'
import type { UncategorizedProject } from '@ruche/contracts'
import { type Ref, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { ActionDescription } from './CommentAction'
import { DecidedZone } from './DecidedZone'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTapGuard } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le projet tel que l'API le donne. */
  project: UncategorizedProject
  /** Le nom de la catégorie où il vient d'être rangé (« Animaux ») ; null tant qu'il ne l'est pas. */
  filedInto: string | null
  /** « Ranger dans une catégorie » : l'écran ouvre le choix, puis écrit. */
  onFile: () => void
  /** Ouvre la page du projet ; l'écran connaît les routes. */
  onOpenProject: () => void
  /**
   * Facultatif : la vue du résultat, pour que l'écran y pose le focus à la fermeture de la feuille
   * du choix (le bouton qui l'a ouverte n'existe plus).
   */
  resultRef?: Ref<View | null> | undefined
}

export function UncategorizedCard({ project, filedInto, onFile, onOpenProject, resultRef }: Props) {
  const { colors, shadows } = useTheme()
  const { t } = useTranslation()
  // Une garde par contrôle (charte, R5b) : la seconde tape n'ouvre ni deux pages ni deux feuilles.
  const openGuard = useTapGuard()
  const fileGuard = useTapGuard()
  // Chaque carte porte le même bouton : le titre du projet, relié au bouton, dit lequel il range.
  const descriptionId = useId()
  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: borders.hairline,
        borderColor: colors.groupBorder,
        boxShadow: shadows.soft,
      }}
    >
      <View style={{ gap: space.xxs }}>
        {/* Le titre, un lien vers la page du projet : rangé à gauche, jamais plus large que la
            carte (un titre long passe à la ligne dans son lien). */}
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
          <TextLink label={project.title} onPress={openGuard(onOpenProject)} />
        </View>
        <Text variant="caption" tone="muted">
          {project.author.name}
        </Text>
      </View>
      <Text variant="callout" tone="secondary" selectable>
        {project.pitch}
      </Text>
      <DecidedZone
        result={
          filedInto === null
            ? null
            : t(($) => $.moderation.categories.sorted, { category: filedInto })
        }
        resultRef={resultRef}
        actions={
          // Rangé à gauche : le bouton garde sa largeur, au lieu de s'étirer sur toute la carte.
          <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
            <Button
              label={t(($) => $.moderation.categories.sort)}
              onPress={fileGuard(onFile)}
              variant="secondary"
              size="compact"
              describedById={descriptionId}
              hint={project.title}
            />
          </View>
        }
      />
      <ActionDescription id={descriptionId} text={project.title} />
    </View>
  )
}
