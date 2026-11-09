// La carte d'un « Autre » à vérifier (tranche R6b, page « Outils » de la Modération, onglet « À
// vérifier ») : le nom tapé par les membres (« Make.com »), combien de projets le citent (« Cité par
// 3 projets »), jusqu'à cinq de ces projets (titre et auteur, chacun ouvre sa page), puis les trois
// décisions : « Ajouter au catalogue », « Rattacher à un outil », « Laisser hors du catalogue ».
//
// La carte écrit elle-même ses textes à partir de ce que l'API donne (`PendingTool`) ; l'écran lui
// dit seulement ce qui s'est passé (`outcome`) et ce que fait chaque geste. Les écritures restent à
// l'écran : « Ajouter » et « Rattacher » ouvrent une feuille, « Laisser hors » écrit tout de suite.
//
// Une fois décidée, la carte garde sa place (règle de la tranche 7a) : ses boutons laissent la place
// au résultat (« Ajouté au catalogue. »), sur une zone au moins aussi haute qu'eux. Retirer la carte
// ferait remonter la suivante sous le doigt, et la seconde tape d'une double tape tomberait sur une
// décision qu'on n'a pas choisie.
//
// Chaque carte porte les mêmes trois boutons : le lecteur d'écran dit de quelle carte il s'agit
// grâce au nom de l'outil, relié à chaque bouton (aria-describedby sur le web, indice sur
// téléphone), comme les cartes de signalement (`ReportCard`).
import { borders, radii, space } from '@ruche/brand'
import type { PendingTool } from '@ruche/contracts'
import { type Ref, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useNameOf } from '../useNameOf'
import { Button } from './Button'
import { ActionDescription } from './CommentAction'
import { DecidedZone } from './DecidedZone'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTapGuard } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

/** Ce qui est arrivé à la carte : rien encore (null), ou la décision prise par l'administrateur. */
export type PendingToolOutcome =
  | { kind: 'admitted' }
  /** `target` : le nom de l'outil du catalogue auquel l'« Autre » est rattaché (« Make »). */
  | { kind: 'merged'; target: string }
  | { kind: 'dismissed' }
  | null

type Props = {
  /** L'« Autre » tel que l'API le donne : son nom, son nombre de projets, cinq d'entre eux au plus. */
  tool: PendingTool
  outcome: PendingToolOutcome
  onAdmit: () => void
  onMerge: () => void
  onDismiss: () => void
  /** Ouvre la page d'un projet de la carte ; l'écran connaît les routes. */
  onOpenProject: (id: PendingTool['projects'][number]['id']) => void
  /**
   * Facultatif : la vue du résultat, pour que l'écran y pose le focus quand la décision se prend
   * dans une feuille (« Ajouter », « Rattacher ») : le bouton qui l'a ouverte n'existe plus à sa
   * fermeture. Sans feuille (« Laisser hors »), la carte le fait seule (DecidedZone).
   */
  resultRef?: Ref<View | null> | undefined
}

export function PendingToolCard({
  tool,
  outcome,
  onAdmit,
  onMerge,
  onDismiss,
  onOpenProject,
  resultRef,
}: Props) {
  const { colors, shadows } = useTheme()
  const { t } = useTranslation()
  const nameOf = useNameOf()
  // Une garde par bouton (charte, R5b) : la seconde tape d'une double tape sur « Laisser hors »
  // n'écrit pas deux fois, celle sur « Ajouter » n'ouvre pas deux feuilles. Une garde commune aux
  // liens des projets : la seconde tape n'ouvre pas, à côté, la page d'un autre projet.
  const admitGuard = useTapGuard()
  const mergeGuard = useTapGuard()
  const dismissGuard = useTapGuard()
  const linkGuard = useTapGuard()
  // Les textes cachés qui décrivent la carte (son nom) et « Laisser hors » (son aide), stables entre
  // le pré-rendu web et le navigateur (useId).
  const descriptionId = useId()
  const hintId = useId()
  const describes = { describedById: descriptionId, hint: tool.name }
  const dismissHint = t(($) => $.moderation.catalogue.dismissHint)
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
      {/* Le nom tel que les membres l'ont tapé, puis leur nombre : de quoi juger d'un coup d'œil
          si c'est un vrai outil. Le nom se coupe n'importe où plutôt que de déborder (un nom sans
          espace, « MonSuperOutilQuiFaitTout »). */}
      <View style={{ gap: space.xxs }}>
        <Text variant="headline" breakAnywhere>
          {tool.name}
        </Text>
        <Text variant="callout" tone="secondary">
          {t(($) => $.moderation.catalogue.pendingProjects, { count: tool.projectCount })}
        </Text>
      </View>

      {/* Les projets qui le citent (cinq au plus) : une liste de liens, chacun vers sa page. Le nom
          lu est la ligne affichée (« Le tri des factures, de Hugo Lefèvre »). Rangés à gauche,
          jamais plus larges que la carte : un titre long passe à la ligne dans son lien. */}
      <View role="list" style={{ gap: space.xxs }}>
        {tool.projects.map((project) => (
          <View
            key={project.id}
            role="listitem"
            style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
          >
            <TextLink
              label={t(($) => $.moderation.catalogue.projectBy, {
                title: project.title,
                authorOf: nameOf(project.author.name),
              })}
              onPress={linkGuard(() => onOpenProject(project.id))}
            />
          </View>
        ))}
      </View>

      {/* Les décisions, ou leur résultat à la même place, au moins aussi haut (DecidedZone). */}
      <DecidedZone
        result={outcome ? resultOf(outcome, t) : null}
        resultRef={resultRef}
        actions={
          <View style={{ gap: space.sm }}>
            {/* Les boutons passent à la ligne quand la place manque (téléphone, texte agrandi) ;
                l'écart garde chacun à distance de son voisin. Aucun en miel : la page en répète un
                par carte, et la seule action miel d'un écran est ailleurs. */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: space.md,
              }}
            >
              <Button
                label={t(($) => $.moderation.catalogue.admit)}
                onPress={admitGuard(onAdmit)}
                variant="secondary"
                size="compact"
                {...describes}
              />
              <Button
                label={t(($) => $.moderation.catalogue.merge)}
                onPress={mergeGuard(onMerge)}
                variant="secondary"
                size="compact"
                {...describes}
              />
              <Button
                label={t(($) => $.moderation.catalogue.dismiss)}
                onPress={dismissGuard(onDismiss)}
                variant="secondary"
                size="compact"
                // L'aide de ce bouton s'ajoute au nom de la carte : « Make.com. Pour un nom qui
                // n'est pas un outil… ».
                describedById={`${descriptionId} ${hintId}`}
                hint={`${tool.name}. ${dismissHint}`}
              />
            </View>
            {/* Ce que veut dire « Laisser hors » : le geste écrit sans fenêtre de confirmation, la
                phrase se lit donc avant de toucher. */}
            <Text variant="caption" tone="muted" nativeID={hintId}>
              {dismissHint}
            </Text>
          </View>
        }
      />
      <ActionDescription id={descriptionId} text={tool.name} />
    </View>
  )
}

/** La phrase du résultat d'une décision (« Rattaché à Make. »). */
const resultOf = (
  outcome: NonNullable<PendingToolOutcome>,
  t: ReturnType<typeof useTranslation>['t'],
): string => {
  switch (outcome.kind) {
    case 'admitted':
      return t(($) => $.moderation.catalogue.admitted)
    case 'merged':
      return t(($) => $.moderation.catalogue.merged, { target: outcome.target })
    case 'dismissed':
      return t(($) => $.moderation.catalogue.dismissed)
  }
}
