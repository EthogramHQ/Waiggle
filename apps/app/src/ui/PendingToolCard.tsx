// La carte d'un « Autre » à vérifier (tranche R6b, page « Outils » de la Modération, onglet « À
// vérifier ») : le nom tapé par les membres (« Make.com »), combien de projets et de profils le
// citent (« Cité par 3 projets et 2 profils »), jusqu'à cinq de ces projets (titre et auteur, chacun
// ouvre sa page), jusqu'à cinq des membres qui l'ont dans leurs outils favoris (« Profil d’Inès
// Moreau », depuis la décision de Louis du 9/11/2026 au soir, jur-J1), puis les trois décisions : « Ajouter au catalogue », « Rattacher à un outil », « Laisser hors du catalogue ».
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
import { Notice } from './Notice'
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
  /**
   * Facultatifs : les boutons « Ajouter au catalogue » et « Rattacher à un outil », pour que l'écran
   * leur rende le focus quand leur feuille se ferme sans décision (sur le web, la feuille ne le
   * retrouve pas toujours seule : personne n'avait le focus si l'on a touché le bouton du doigt).
   */
  admitRef?: Ref<View> | undefined
  mergeRef?: Ref<View> | undefined
  /**
   * Facultatif : « Laisser hors du catalogue » est en route vers le serveur (correction U1, des-B1).
   * Le bouton touché tourne (`loading`) : il ignore une seconde tape, garde le focus du clavier, et
   * le lecteur d'écran le dit occupé. Sans cela, rien ne bougeait sous le doigt pendant l'écriture.
   */
  dismissing?: boolean | undefined
  /**
   * Facultatif : le refus de la dernière décision prise sur cette carte, déjà traduit (une panne).
   * Il se lit dans la carte, au-dessus de ses boutons, qui restent pour réessayer, comme sur les
   * cartes de signalement (`ReportCard`). En tête de page, il tombait hors de l'écran du téléphone
   * (915 px au-dessus du bouton touché). Une carte décidée ne le montre plus : son résultat suffit.
   */
  error?: string | null | undefined
}

export function PendingToolCard({
  tool,
  outcome,
  onAdmit,
  onMerge,
  onDismiss,
  onOpenProject,
  resultRef,
  admitRef,
  mergeRef,
  dismissing = false,
  error,
}: Props) {
  const { colors, shadows } = useTheme()
  const { t } = useTranslation()
  // « Profil d’Inès », « Profil de Léa », « Inès’s profile » : le lien du nom suit la langue.
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
        gap: space.xxs,
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
          espace, « MonSuperOutilQuiFaitTout »). Tous deux posés à même la carte, sans vue autour :
          le nom, son nombre, ses projets et ses boutons sont dans le même bloc, celui qu'un lecteur
          (ou un test, `cardOf`) retrouve en remontant depuis le nom. */}
      <Text variant="headline" breakAnywhere>
        {tool.name}
      </Text>
      <Text variant="callout" tone="secondary">
        {countOf(tool, t)}
      </Text>

      {/* Le reste de la carte, à l'écart habituel sous le nombre (l'écart de la carte, plus fin,
          ne sert qu'entre le nom et son nombre). */}
      <View style={{ gap: space.md, marginTop: space.md - space.xxs }}>
        {/* Les projets qui le citent (cinq au plus) : une liste de liens, chacun vers sa page. Le nom
          lu est la ligne affichée (« Le tri des factures, par Hugo Lefèvre » : « par » ne s’élide jamais). Rangés à gauche,
          jamais plus larges que la carte : un titre long passe à la ligne dans son lien. Aucun
          projet (un « Autre » des seuls profils) : pas de liste vide, qu'un lecteur dirait « liste,
          0 élément ». */}
        {tool.projects.length > 0 ? (
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
                    author: project.author.name,
                  })}
                  onPress={linkGuard(() => onOpenProject(project.id))}
                />
              </View>
            ))}
          </View>
        ) : null}

        {/* Les membres qui l'ont mis dans leurs outils favoris (cinq au plus, décision de Louis du
          9/11/2026 au soir, jur-J1) : « Profil d’Inès Moreau ». En texte simple : l'appli n'ouvre
          la page d'un membre que par son identifiant, que la carte ne reçoit pas (`NamedMember` :
          un nom et un pseudo). Une liste à part, sous celle des projets, du même écart. */}
        {tool.profiles.length > 0 ? (
          <View role="list" style={{ gap: space.xxs }}>
            {profilesOf(tool).map(({ member, key }) => (
              <View key={key} role="listitem" style={{ alignSelf: 'stretch', maxWidth: '100%' }}>
                <Text variant="callout">
                  {t(($) => $.moderation.catalogue.profileOf, { nameOf: nameOf(member.name) })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Les décisions, ou leur résultat à la même place, au moins aussi haut (DecidedZone). */}
        <DecidedZone
          result={outcome ? resultOf(outcome, t) : null}
          resultRef={resultRef}
          actions={
            <View style={{ gap: space.sm }}>
              {/* Une panne : le message reste au-dessus des boutons jusqu'à la réponse de l'essai
                  suivant (l'écran le garde jusque-là), pour que les boutons ne sautent pas deux
                  fois. Une alerte, lue dès qu'elle paraît ; le focus reste sur le bouton touché. */}
              {error ? <Notice message={error} /> : null}
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
                  ref={admitRef}
                  label={t(($) => $.moderation.catalogue.admit)}
                  onPress={admitGuard(onAdmit)}
                  variant="secondary"
                  size="compact"
                  {...describes}
                />
                <Button
                  ref={mergeRef}
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
                  loading={dismissing}
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
      </View>
      <ActionDescription id={descriptionId} text={tool.name} />
    </View>
  )
}

/**
 * Les membres de la carte, chacun avec sa clé React. Un pseudo est unique ; sans pseudo, deux
 * membres peuvent porter le même nom : le rang complète alors la clé (la liste vient de l'API et
 * ne change pas d'ordre).
 */
const profilesOf = (tool: PendingTool) =>
  tool.profiles.map((member, rank) => ({
    member,
    key: member.handle === null ? `${rank}:${member.name}` : `@${member.handle}`,
  }))

/**
 * Le nombre sous le nom : « Cité par 3 projets », « Cité par 2 profils », ou les deux, « Cité par
 * 3 projets et 2 profils ». Le contrat garantit que l'un des deux au moins est positif.
 */
const countOf = (tool: PendingTool, t: ReturnType<typeof useTranslation>['t']): string => {
  const { projectCount, profileCount } = tool
  if (profileCount === 0) {
    return t(($) => $.moderation.catalogue.pendingProjects, { count: projectCount })
  }
  if (projectCount === 0) {
    return t(($) => $.moderation.catalogue.pendingProfiles, { count: profileCount })
  }
  return t(($) => $.moderation.catalogue.pendingBoth, {
    projects: t(($) => $.moderation.catalogue.mergeProjects, { count: projectCount }),
    profiles: t(($) => $.moderation.catalogue.mergeProfiles, { count: profileCount }),
  })
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
