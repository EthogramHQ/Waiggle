// La page d'un projet, sa mise en page et sa recette, partagées par la page d'un membre
// (screens/ProjectScreen.tsx) et celle d'un visiteur sans compte (R12, plan, relecture de
// l'interface, décision 12 : « la mise en page et la recette du projet sorties de `ProjectView`, pas
// recopiées »). Chaque page fabrique ses morceaux (en-tête, actions, conversation…) ; ce fichier
// décide seul où ils vont, selon la largeur :
// - téléphone : la galerie bord à bord, puis une feuille qui remonte sur le bas de la photo et porte
//   toute la page ; ce qui flotte (la capsule des réactions) en bas de l'écran, hors du défilement ;
// - tablette (de 768 points à la largeur des colonnes) : une seule colonne, dans l'ordre du
//   téléphone, la barre du haut et « Retour » en haut de la page ;
// - ordinateur : deux rangées de colonnes, dans l'ordre de lecture (galerie | en-tête, actions,
//   recette ; puis description, prompt, journal | conversation), puis « Signaler » en bas à gauche.
//   Le clavier et le lecteur d'écran passent ainsi par les actions avant la description.
// Les deux pages gardent donc toujours la même forme : une décision de mise en page vit ici, une
// seule fois.
//
// Trois exports :
// - `ProjectPageLayout`, la mise en page (des emplacements nommés, tous facultatifs sauf la galerie,
//   l'en-tête et les actions) ;
// - `ProjectRecipe`, « La recette » : le mois de début, la difficulté et les outils ;
// - `ProjectDescription`, « Description » et son texte en Markdown.
// Ce fichier n'écrit aucun style (règle Biome de `src/projects/**`) : il assemble des composants.
import { layout } from '@ruche/brand'
import type { Project } from '@ruche/contracts'
import { type ReactNode, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpenOutside } from '../navigation/links'
import { Columns } from '../ui/Columns'
import { DIFFICULTY_DOTS } from '../ui/difficultyDots'
import { ListRowSkeleton, TextLineShape } from '../ui/ListGroup'
import { Markdown } from '../ui/Markdown'
import { CoverSheet } from '../ui/ProjectCover'
import { RecipeFact } from '../ui/RecipeFact'
import { Reveal } from '../ui/Reveal'
import { Screen } from '../ui/Screen'
import { Loading, LoadingShownContext, Shape } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { startedMonth } from './month'

/**
 * Les morceaux de la page, déjà fabriqués par l'écran ; `null` ou absent : rien à cette place, pas
 * même un écart. Chaque nom dit **où** le morceau se pose, pas ce qu'il est : un membre et un
 * visiteur n'y mettent pas toujours la même chose (voir chaque champ).
 */
export type ProjectPageSlots = {
  /** En tête de la page, au-dessus de tout : le bandeau d'un projet retiré (son auteur). */
  banner?: ReactNode
  /** La galerie (`PhotoGallery` dans `CoverArrival`), avec ce que l'écran pose dessus. */
  gallery: ReactNode
  /** Juste sous la galerie : les photos retirées par la modération (l'auteur). */
  galleryNotes?: ReactNode
  /** Statut, titre, dates, auteur et pitch (`ProjectHeader` ou `ProjectHeaderView`). */
  header: ReactNode
  /** « Tester la démo » et ce qui l'accompagne (`ProjectActions` d'un membre). */
  actions: ReactNode
  /**
   * Juste sous les actions, dans la même colonne : le lien de démo retiré (l'auteur) ; pour un
   * visiteur, « N réactions de membres · Réagir » (`ui/ReactionSummary`, planche
   * R12-Visiteur-Projet-Desktop : sous « Tester la démo », colonne de droite).
   */
  actionNotes?: ReactNode
  /**
   * Les nombres des réactions vus par l'auteur ou un compte suspendu (`OwnReactions`) : sous la
   * galerie sur ordinateur, après les actions ailleurs.
   */
  reactions?: ReactNode
  /** « La recette » (`ProjectRecipe`). */
  recipe?: ReactNode
  /** Sous la recette : les outils retirés par la modération (l'auteur). */
  recipeNotes?: ReactNode
  /** « Description » (`ProjectDescription`). */
  description?: ReactNode
  /** Le prompt de départ (`PromptBlock`), ou son encadré s'il a été retiré. */
  prompt?: ReactNode
  /** « Les mises à jour » (`ProjectUpdatesSection` d'un membre ; sa version visiteur). */
  journal?: ReactNode
  /**
   * La conversation : les commentaires d'un membre (`Comments`) ; pour un visiteur, la phrase
   * « Les commentaires sont réservés aux membres. » et « Créer un compte » (`ui/MembersOnlyNotice`).
   * Colonne de droite de la seconde rangée sur ordinateur, après le journal ailleurs.
   */
  conversation?: ReactNode
  /** « Signaler ce projet », qui ferme la page (en bas à gauche sur ordinateur). */
  report?: ReactNode
}

type LayoutProps = ProjectPageSlots & {
  /**
   * La barre du haut : `TopNav` d'un membre, la barre d'un visiteur. Sur tablette et ordinateur,
   * l'en-tête de `Screen` ; sur téléphone, posée avant la galerie (la barre d'un membre n'y dessine
   * que le bandeau d'un compte suspendu).
   */
  topBar: ReactNode
  /** Tablette et ordinateur : les actions de la page, dans la rangée du « Retour » (Partager, « … »). */
  topAction?: ReactNode
  /** Tablette et ordinateur : « Retour », écrit en toutes lettres (sur téléphone, il est sur la photo). */
  onBack: () => void
  /** Le titre de l'onglet : celui du projet. */
  pageTitle: string
  /** La photo montrée : la lumière d'ambiance prend sa couleur ; null : la lumière miel. */
  thumbhash: string | null
  /** Le fondu des pages ; faux pendant l'arrivée depuis une carte (elle a son propre passage). */
  fade: boolean
  /** Téléphone : ce qui flotte en bas de l'écran, hors du défilement (la capsule des réactions). */
  floating?: ReactNode
  /**
   * Téléphone : la galerie est bord à bord, et la page se pose sur une feuille qui remonte sur le bas
   * de la photo. Faux sous le bandeau d'un compte suspendu, que la photo couvrirait.
   */
  bleed: boolean
  /** Les fenêtres et feuilles de la page, montées dès l'arrivée (fermées), après le contenu. */
  layers?: ReactNode
  /**
   * Enveloppe chaque morceau sauf la galerie (le fondu de l'arrivée depuis une carte, `CoverFade`).
   * Absent : les morceaux tels quels. Reçoit `null` pour une place vide et doit alors rendre `null`.
   */
  wrap?: (node: ReactNode) => ReactNode
  /**
   * R16 (plan, choix 9 et 10) : la page d'un membre dit ici si elle attend encore le projet complet
   * (vrai pendant l'aperçu tiré d'une carte, R14). Tout ce qui suit l'en-tête a alors la forme de la
   * page (`ProjectPageSkeleton`, sous un seul « Chargement… »), puis arrive en fondu, dans le même
   * arbre (`Reveal`) : la galerie et l'en-tête, déjà montrés, ne bougent pas. Absent (la page d'un
   * visiteur, qui n'a pas d'aperçu) : les morceaux tels quels, comme avant.
   */
  pending?: boolean
  /**
   * La partie vide posée à chaque endroit pendant l'attente : `ProjectPageSkeleton` par défaut.
   * L'écran peut la donner lui-même (la page d'un membre passe la pièce exportée : c'est elle que ses
   * tests comptent).
   */
  skeleton?: (part: ProjectPageSkeletonPart) => ReactNode
}

const asIs = (node: ReactNode) => node ?? null

export function ProjectPageLayout({
  banner,
  gallery,
  galleryNotes,
  header,
  actions,
  actionNotes,
  reactions,
  recipe,
  recipeNotes,
  description,
  prompt,
  journal,
  conversation,
  report,
  topBar,
  topAction,
  onBack,
  pageTitle,
  thumbhash,
  fade,
  floating,
  bleed,
  layers,
  wrap = asIs,
  pending,
  skeleton: emptyPart = (part) => <ProjectPageSkeleton part={part} />,
}: LayoutProps) {
  const { t } = useTranslation()
  const { sizeClass, columns } = useLayout()
  // large : tablette et ordinateur (barre du haut, Retour hors de la photo) ; columns : les deux
  // colonnes tiennent côte à côte. Entre les deux (tablette), une seule colonne.
  const large = sizeClass !== 'compact'
  const w = (node: ReactNode) => wrap(node ?? null)
  // La recette à côté de la photo seulement si les réactions comblent la place sous celle-ci.
  const recipeFirst = reactions != null

  /**
   * R16 : une zone que la page attend, ou ses morceaux tels quels (la page d'un visiteur). `loading` :
   * la zone porte le seul « Chargement… » de la page. Sur ordinateur, la page attend trois zones
   * (à côté de la galerie, puis les deux colonnes de la seconde rangée), séparées par la galerie et
   * les colonnes : un seul `Loading` ne peut pas les envelopper toutes, et un lecteur d'écran
   * n'entend « Chargement… » qu'une fois. Les deux autres n'ont donc que leurs formes, sans rôle ni
   * nom, qui ne se lisent pas.
   *
   * Montré tout de suite (`shown`, plan R16, choix 8) : la page est déjà là (la photo, le titre,
   * l'auteur, venus de la carte), et sa partie vide en est la forme ; elle ne surgit pas 160 ms plus
   * tard sous un en-tête déjà posé. Toutes les parties paraissent donc ensemble, et chacune fond vers
   * son contenu (`MarkShown` le dit à sa zone).
   */
  const awaited = (
    part: ProjectPageSkeletonPart,
    gap: 'xl' | 'xxl',
    nodes: ReactNode,
    loading = false,
  ) => {
    if (pending === undefined) return nodes
    const skeleton = loading ? (
      <Loading shown>{emptyPart(part)}</Loading>
    ) : (
      <>
        <MarkShown />
        {emptyPart(part)}
      </>
    )
    return (
      <Awaited pending={pending} skeleton={skeleton} gap={gap}>
        {nodes}
      </Awaited>
    )
  }
  // Une seule colonne (téléphone, tablette) : tout ce qui suit l'en-tête, dans l'ordre de lecture. La
  // conversation vient après le projet ; « Signaler » ferme la page.
  const afterHeader = (
    <>
      {w(actions)}
      {w(actionNotes)}
      {w(reactions)}
      {w(recipe)}
      {w(recipeNotes)}
      {w(description)}
      {w(prompt)}
      {w(journal)}
      {w(conversation)}
      {w(report)}
    </>
  )

  if (large) {
    return (
      <Screen
        width="page"
        header={topBar}
        fade={fade}
        onBack={onBack}
        // « Retour » écrit en toutes lettres, d'où qu'on arrive (ui-11).
        backLabel={t(($) => $.project.page.back)}
        topAction={
          <Row gap="sm" align="center">
            {topAction}
          </Row>
        }
        thumbhash={thumbhash}
        pageTitle={pageTitle}
      >
        {w(banner)}
        {columns ? (
          // Deux rangées, dans l'ordre de lecture : la galerie et les réactions | l'en-tête, les
          // actions, la recette ; un trait ; puis ce qui se lit longtemps | la conversation. Sans
          // réactions sous la photo (la page d'un visiteur), la recette passe dans la seconde rangée,
          // au-dessus de la conversation, comme sur la planche R12-Visiteur-Projet-Desktop (relecture
          // de design R12) : dans la première, elle allongeait la colonne de droite d'environ 130
          // points sous la photo, et poussait la description sous le pli. Enfin « Signaler ce projet »,
          // en bas à gauche : dans une rangée à lui, il vient après la conversation, au clavier
          // comme sur téléphone (décision de Louis du 2/11/2026).
          // `sideWidth="wide"` : la colonne de droite grandit jusqu'à environ 450 points (planche
          // R5a-Projet-Desktop ; à 320, un titre long prenait six lignes). Décision du 2/11/2026.
          <Columns
            divided
            sideWidth="wide"
            rows={[
              {
                main: (
                  <>
                    {gallery}
                    {w(galleryNotes)}
                    {w(reactions)}
                  </>
                ),
                // R16 : sous l'en-tête, la zone qui porte le seul « Chargement… » de la page (lu
                // juste après l'en-tête, comme sur téléphone) ; les deux zones de la seconde rangée
                // paraissent avec elle.
                side: (
                  <>
                    {w(header)}
                    {awaited(
                      'actions',
                      'xxl',
                      <>
                        {w(actions)}
                        {w(actionNotes)}
                        {recipeFirst ? w(recipe) : null}
                        {recipeFirst ? w(recipeNotes) : null}
                      </>,
                      true,
                    )}
                  </>
                ),
              },
              {
                main: awaited(
                  'reading',
                  'xxl',
                  <>
                    {w(description)}
                    {w(prompt)}
                    {w(journal)}
                  </>,
                ),
                side: awaited(
                  'conversation',
                  'xxl',
                  <>
                    {recipeFirst ? null : w(recipe)}
                    {recipeFirst ? null : w(recipeNotes)}
                    {w(conversation)}
                  </>,
                ),
              },
              ...(report ? [{ main: w(report), side: null, continues: true }] : []),
            ]}
          />
        ) : (
          // Tablette : une seule colonne, dans l'ordre du téléphone.
          <>
            {gallery}
            {w(galleryNotes)}
            {w(header)}
            {awaited('all', 'xl', afterHeader, true)}
          </>
        )}
        {layers}
      </Screen>
    )
  }

  const page = (
    <>
      {w(banner)}
      {/* R9 : la photo retirée est juste au-dessus, dans la galerie : son encadré ouvre la page. */}
      {w(galleryNotes)}
      {w(header)}
      {awaited('all', 'xl', afterHeader, true)}
    </>
  )
  return (
    <Screen
      thumbhash={thumbhash}
      pageTitle={pageTitle}
      fade={fade}
      // Ce qui flotte en bas de l'écran, hors du défilement : lu après tout le contenu (décision de
      // Louis du 2/11/2026). Screen réserve sa hauteur sous la page.
      floating={floating}
    >
      {topBar}
      {gallery}
      {/* La feuille qui remonte sur le bas de la photo bord à bord ; sous le bandeau d'un compte
          suspendu, la galerie garde ses marges et la page suit simplement. */}
      {bleed ? <CoverSheet>{page}</CoverSheet> : page}
      {layers}
    </Screen>
  )
}

type RecipeProps = {
  /** « Commencé en », « AAAA-MM » ; null : non renseigné. */
  startedOn: Project['startedOn']
  /** « Facile à refaire ? » ; null : non renseigné. */
  difficulty: Project['difficulty']
  /** Les outils, dans l'ordre de l'auteur. */
  tools: Project['tools']
  /**
   * Toucher un outil : sa page (`/tags/<slug>`, réservée aux membres). Absent (un visiteur) : les
   * outils sont de simples pastilles, sans lien.
   */
  onOpenTool?: ((slug: string) => void) | undefined
}

/**
 * Vrai si la recette a quelque chose à montrer. L'écran le demande **avant** de poser
 * `ProjectRecipe` : une place vide enveloppée par `wrap` ajouterait un écart à la colonne. Un mois mal
 * écrit ne compte pas (`startedMonth` le refuse, quelle que soit la langue).
 */
export const hasRecipe = ({
  startedOn,
  difficulty,
  tools,
}: Pick<RecipeProps, 'startedOn' | 'difficulty' | 'tools'>): boolean =>
  Boolean((startedOn && startedMonth(startedOn, 'fr')) || difficulty || tools.length > 0)

/**
 * La recette (R6a) : quand l'auteur les a donnés, le mois où il a commencé (« Commencé en septembre
 * 2026 », écrit par Intl dans la langue de l'appli) et la difficulté (« Facile à refaire : À la
 * portée de tous », avec le rond de couleur de la feuille de publication) ; puis les outils. Elle se
 * montre dès qu'une de ces trois choses est là, même sans outils ; sinon rien (`null`). Les prompts
 * ont leur propre bloc.
 */
export function ProjectRecipe({ startedOn, difficulty, tools, onOpenTool }: RecipeProps) {
  const { t, i18n } = useTranslation()
  const started = startedOn ? startedMonth(startedOn, i18n.language) : null
  if (!started && !difficulty && tools.length === 0) return null
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" heading={2}>
        {t(($) => $.project.page.recipe)}
      </Text>
      {started || difficulty ? (
        <Stack gap="sm">
          {started ? (
            <RecipeFact
              icon="calendar-blank"
              label={t(($) => $.project.page.startedOn, { month: started })}
            />
          ) : null}
          {difficulty ? (
            <RecipeFact
              dot={DIFFICULTY_DOTS[difficulty]}
              label={t(($) => $.project.page.difficulty, {
                level: t(($) => $.project.difficulty[difficulty]),
              })}
            />
          ) : null}
        </Stack>
      ) : null}
      {tools.length > 0 ? (
        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted">
            {t(($) => $.project.page.tools)}
          </Text>
          <Stack direction="row" gap="sm" wrap>
            {tools.map((tool) => (
              <Tag
                key={tool.slug}
                label={tool.label}
                // R6b : un « Autre » n'a pas de page ; `Tag` l'affiche en texte simple, sans lien.
                inCatalogue={tool.inCatalogue}
                {...(onOpenTool ? { onPress: () => onOpenTool(tool.slug) } : null)}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Surface>
  )
}

/**
 * « Description » et son texte en Markdown ; ses liens passent par la page de sortie (`/out`).
 * `removed` : l'encadré d'une description retirée par la modération (l'auteur seul), qui garde la
 * section. Ni texte ni encadré : rien (`null`) ; l'écran ne la pose alors pas du tout (même raison
 * que `hasRecipe`).
 */
export function ProjectDescription({ text, removed }: { text: string; removed?: ReactNode }) {
  const { t } = useTranslation()
  const openOutside = useOpenOutside()
  if (!text && !removed) return null
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {t(($) => $.project.page.description)}
      </Text>
      {text ? <Markdown text={text} onLinkPress={openOutside} /> : null}
      {removed}
    </Stack>
  )
}

// ---------------------------------------------------------------------------------------------
// R16 (« Les squelettes », planches R16-Projet-1440 et 390) : ce que la page attend encore
// ---------------------------------------------------------------------------------------------

/**
 * La partie vide que la page pose à un endroit :
 * - `all` (téléphone, tablette : une seule colonne) : tout ce qui suit l'en-tête, dans l'ordre de la
 *   page (les actions, la recette, la description et le prompt, les commentaires) ;
 * - `actions` (ordinateur, à côté de la galerie) : « Tester la démo », l'adresse de la démo, puis
 *   « Suivre ce projet » et « Rejoindre les testeurs » ;
 * - `reading` (ordinateur, seconde rangée à gauche) : la description et le bloc du prompt ;
 * - `conversation` (ordinateur, seconde rangée à droite) : la recette et les commentaires.
 */
export type ProjectPageSkeletonPart = 'all' | 'actions' | 'reading' | 'conversation'

/**
 * Le bas vide de la page d'un projet (plan R16, choix 10 et 11) : ce que l'aperçu tiré d'une carte
 * ne sait pas (les actions, la recette, la description, le prompt, les commentaires), à la forme de
 * ce qui arrive. Le bloc du prompt est posé vide même si le projet n'en a pas : on ne le sait pas
 * encore. Sans rôle ni nom à elle : c'est le `Loading` de la page qui dit « Chargement… », une seule
 * fois. Faite des pièces vides de `src/ui` (lignes à la hauteur d'un texte écrit, lignes vides d'une
 * liste) dans les vraies surfaces de la recette et des commentaires : ce fichier n'écrit aucun style.
 */
export function ProjectPageSkeleton({ part = 'all' }: { part?: ProjectPageSkeletonPart }) {
  // Sur ordinateur, « Tester la démo » ne prend pas toute la colonne (planche R16-Projet-1440).
  const { columns } = useLayout()
  const actions = <ActionsShapes wide={columns} />
  const reading = (
    <>
      <DescriptionShapes />
      <PromptShapes />
    </>
  )
  const conversation = (
    <>
      <RecipeShapes />
      <CommentsShapes />
    </>
  )
  if (part === 'actions') return actions
  // Les écarts sont ceux des morceaux qu'elles imitent : `xxl` entre deux morceaux d'une colonne de
  // `Columns`, `xl` entre deux morceaux de la colonne unique de `Screen`.
  if (part === 'reading') return <Stack gap="xxl">{reading}</Stack>
  if (part === 'conversation') return <Stack gap="xxl">{conversation}</Stack>
  return (
    <Stack gap="xl">
      {actions}
      <RecipeShapes />
      {reading}
      <CommentsShapes />
    </Stack>
  )
}

/** « Tester la démo » (le grand bouton), l'adresse de la démo, puis les deux actions plus discrètes. */
function ActionsShapes({ wide }: { wide: boolean }) {
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Shape height={layout.controlHeight.regular} width={wide ? '80%' : '100%'} round />
        <TextLineShape variant="caption" width="55%" />
      </Stack>
      <Stack gap="sm">
        <Shape height={layout.controlHeight.small} width={wide ? '40%' : '60%'} round />
        <Shape height={layout.controlHeight.small} width={wide ? '45%' : '65%'} round />
      </Stack>
    </Stack>
  )
}

/** « Description » (son titre) et trois lignes de texte, comme `ProjectDescription`. */
function DescriptionShapes() {
  return (
    <Stack gap="md">
      <TextLineShape variant="heading" width="35%" />
      <Stack gap="none">
        <TextLineShape variant="body" width="95%" />
        <TextLineShape variant="body" width="90%" />
        <TextLineShape variant="body" width="60%" />
      </Stack>
    </Stack>
  )
}

/** Le bloc du prompt de départ : son titre, puis quelques lignes dans un bloc. */
function PromptShapes() {
  return (
    <Surface variant="grouped" padding="lg" gap="sm">
      <TextLineShape variant="callout" width="40%" />
      <Stack gap="none">
        <TextLineShape variant="code" width="90%" />
        <TextLineShape variant="code" width="85%" />
        <TextLineShape variant="code" width="50%" />
      </Stack>
    </Surface>
  )
}

/** « La recette », dans sa surface : son titre et trois lignes (outils, difficulté, début). */
function RecipeShapes() {
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <TextLineShape variant="heading" width="45%" />
      <Stack gap="sm">
        <TextLineShape variant="callout" width="75%" />
        <TextLineShape variant="callout" width="85%" />
        <TextLineShape variant="callout" width="60%" />
      </Stack>
    </Surface>
  )
}

/** Les commentaires, dans leur surface : le titre de la section et trois lignes vides. */
function CommentsShapes() {
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <TextLineShape variant="heading" width="50%" />
      <CommentRowsSkeleton />
    </Surface>
  )
}

/** Les lignes vides des commentaires (la photo, le nom, le texte), le nombre de l'aperçu. */
const COMMENT_ROWS = 3

/**
 * Les lignes vides d'une liste de commentaires qui charge, sans `Loading` autour : la page les pose
 * dans son squelette, et la section des commentaires (screens/ProjectComments.tsx) dans le sien.
 */
export function CommentRowsSkeleton() {
  return (
    <Stack gap="xs">
      {Array.from({ length: COMMENT_ROWS }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
        <ListRowSkeleton key={index} />
      ))}
    </Stack>
  )
}

/**
 * Une zone que la page attend (R16, choix 9) : son squelette, puis son contenu en fondu, toujours
 * dans le même arbre (`Reveal`). Les morceaux du contenu gardent leur écart (`gap`) : celui de la
 * colonne où la zone est posée.
 */
function Awaited({
  pending,
  skeleton,
  gap,
  children,
}: {
  pending: boolean
  skeleton: ReactNode
  gap: 'xl' | 'xxl'
  children: ReactNode
}) {
  return (
    <Reveal loading={pending} skeleton={skeleton}>
      <Stack gap={gap}>{children}</Stack>
    </Reveal>
  )
}

/**
 * Dit à la zone qui l'entoure (`Reveal`) que son squelette s'est montré, comme `Loading` le dit pour
 * la sienne : elle fondra vers le contenu. Pour une partie vide sans `Loading` à elle (voir
 * `awaited`, dans `ProjectPageLayout`).
 */
function MarkShown(): null {
  const shown = useContext(LoadingShownContext)
  useEffect(() => {
    shown?.()
  }, [shown])
  return null
}
