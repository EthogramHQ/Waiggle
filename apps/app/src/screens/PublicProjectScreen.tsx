// La page d'un projet public vue par un visiteur sans compte (tranche R12, scénario « Ce que voit un
// visiteur sans compte », planches R12-Visiteur-Projet et R12-Visiteur-Projet-Desktop). Son adresse :
// /fr/projects/<id> (ou /en/…). Un membre connecté, à la même adresse, garde sa page à lui
// (`ProjectScreen`, choisie par la route).
//
// Tout ce que l'auteur a écrit : la galerie, le statut, la catégorie et « Public », le titre, les
// dates, son nom, le pitch, « Tester la démo », la recette, la description, le prompt de départ et la
// dernière mise à jour. À la place de ce qui est réservé aux membres :
// - les réactions : leur nombre seul, « 54 réactions de membres », jamais qui ; « Réagir » ouvre la
//   feuille « Compte requis » (ui/ReactionSummary.tsx, screens/AccountRequiredSheet.tsx) ;
// - les commentaires : « Les commentaires sont réservés aux membres. » et « Créer un compte », qui
//   ouvre la même feuille (ui/MembersOnlyNotice.tsx) ;
// - jamais « Suivre », le menu de l'auteur, les testeurs, les abonnés ni la ruche (l'API ne les donne
//   pas : `PublicProject`, packages/contracts).
//
// La mise en page est celle de la page d'un membre (projects/ProjectPage.tsx, plan R12, décision 12) :
// chaque morceau à la même place, sur téléphone comme sur ordinateur. La barre du haut est celle d'un
// visiteur (ui/VisitorBar.tsx) : le logo ramène à l'accueil dans la langue de la page, « Se
// connecter » revient ici ensuite. Sur téléphone, elle est posée sur la photo, comme les boutons de
// verre d'un membre.
//
// Tout se lit à la route publique, sans session (public/api.ts). Un projet qui n'est pas public,
// inconnu ou retiré répond le même 404 : la page dit alors « Réservé aux membres » et « Se
// connecter » (choix 3 du plan R12), sans rien montrer du projet. Les libellés sont dans la langue de
// l'adresse ; le texte de l'auteur reste tel qu'il l'a écrit (aucune traduction automatique).
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import type { ProjectUpdate, PublicCategory, PublicProject, PublicUpdate } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useOpenDemo } from '../navigation/links'
import { publicPath } from '../navigation/publicPath'
import { useGoBack } from '../navigation/useGoBack'
import type { CategoryOption } from '../projects/categories'
import { type HeaderProject, ProjectHeaderView } from '../projects/ProjectHeader'
import {
  hasRecipe,
  ProjectDescription,
  ProjectPageLayout,
  ProjectRecipe,
} from '../projects/ProjectPage'
import { usePageLanguage, usePublicProject } from '../public/api'
import { Button } from '../ui/Button'
import { Hint } from '../ui/Hint'
import type { IconName } from '../ui/Icon'
import { MembersOnlyNotice } from '../ui/MembersOnlyNotice'
import { PhotoGallery } from '../ui/PhotoGallery'
import { CoverControls } from '../ui/ProjectCover'
import { PromptBlock } from '../ui/PromptBlock'
import { ReactionSummary } from '../ui/ReactionSummary'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { UpdateEntry } from '../ui/UpdateEntry'
import { VisitorBar } from '../ui/VisitorBar'
import { useNameOf } from '../useNameOf'
import { AccountRequiredSheet } from './AccountRequiredSheet'
import { LoadErrorScreen, LoadingScreen, SignedOutScreen } from './states'

export function PublicProjectScreen({ id }: { id: string }) {
  const lang = usePageLanguage()
  const project = usePublicProject(id)
  // Sans page d'avant, « Revenir » mène à l'accueil dans la langue de la page : le Fil d'un membre
  // serait « Réservé aux membres ».
  const home = publicPath('home', lang)

  if (project.error) {
    // Pas public, inconnu ou retiré : le même 404. Rien du projet, seulement « Se connecter ».
    if (errorKey(project.error) === 'notFound') return <SignedOutScreen width="page" />
    return (
      <LoadErrorScreen
        error={project.error}
        onRetry={() => void project.refetch()}
        fallback={home}
        width="page"
      />
    )
  }
  if (!project.data) return <LoadingScreen width="page" fallback={home} />
  return <PublicProjectView project={project.data} />
}

/**
 * L'icône des catégories d'un projet public. L'API nomme la catégorie pour un visiteur (`name`, dans
 * la langue de la page) mais ne donne pas son icône, qui vit dans la liste réservée aux membres
 * (GET /v1/categories) : une icône commune à toutes, le nom disant laquelle.
 */
const CATEGORY_ICON: IconName = 'squares-four'

/** Une catégorie publique dans la forme que dessine l'en-tête ; absente : pas d'étiquette. */
const asOption = (category: PublicCategory | undefined): CategoryOption | undefined =>
  category ? { value: category.code, label: category.name, icon: CATEGORY_ICON } : undefined

/**
 * Une mise à jour publique dans la forme que dessinent l'en-tête et `UpdateEntry` : un visiteur ne
 * voit jamais une mise à jour retirée, ni une partie retirée (l'API ne les donne pas), d'où
 * `removal: null` et aucune partie (même règle que screens/PublicUpdatesScreen.tsx).
 */
const asProjectUpdate = (update: PublicUpdate): ProjectUpdate => ({
  ...update,
  removal: null,
  removedParts: [],
})

function PublicProjectView({ project }: { project: PublicProject }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const nameOf = useNameOf()
  const lang = usePageLanguage()
  const openDemo = useOpenDemo()
  const { sizeClass } = useLayout()
  // large : tablette et ordinateur (la barre en haut de la page, « Retour » en toutes lettres) ;
  // sinon téléphone (la barre posée sur la photo bord à bord).
  const large = sizeClass !== 'compact'
  const home = publicPath('home', lang)
  const back = useGoBack(home)
  // La photo montrée par la galerie : la lumière d'ambiance prend sa couleur.
  const [photoIndex, setPhotoIndex] = useState(0)
  // La feuille « Compte requis », ouverte par « Réagir » et par « Créer un compte » : rien n'est
  // fait à la place du visiteur, la feuille lui dit seulement comment entrer.
  const [accountOpen, setAccountOpen] = useState(false)
  const askAccount = () => setAccountOpen(true)

  // La barre d'un visiteur : « Se connecter » revient sur cette page (`next`), dans sa langue.
  const visitorBar = <VisitorBar homeHref={home} next={publicPath('project', lang, project.id)} />

  const latest = project.latestUpdate ? asProjectUpdate(project.latestUpdate) : null
  // L'en-tête d'un membre, nourri du projet public. « Publié le » : `publishedAt` (un projet public
  // a toujours été publié). « Mis à jour » suit la dernière mise à jour seulement, jamais une
  // simple modification du projet (B5) : l'en-tête lit `latestUpdate.createdAt`, que l'API donne
  // égal à `latestUpdateAt` ; sans mise à jour, pas de « Mis à jour ».
  const headerProject: HeaderProject = {
    id: project.id,
    author: {
      id: project.author.id,
      name: project.author.name,
      avatarUrl: project.author.avatarUrl,
    },
    title: project.title,
    pitch: project.pitch,
    status: project.status,
    visibility: 'web',
    isMine: false,
    createdAt: project.publishedAt,
    updatedAt: project.updatedAt,
    latestUpdate: latest,
    updateCount: project.updateCount,
    version: project.version,
    primaryCategory: project.categories[0]?.code ?? null,
    secondaryCategory: project.categories[1]?.code ?? null,
  }
  // Le nom de l'auteur mène à sa page publique, dans la langue de la page, seulement s'il l'a
  // ouverte ; sinon, son nom et sa photo en texte simple. Jamais son pseudo (Q8), ni « Suivre ».
  const author = project.author
  const header = (
    <ProjectHeaderView
      project={headerProject}
      categories={{
        primary: asOption(project.categories[0]),
        secondary: asOption(project.categories[1]),
      }}
      author={{
        name: author.name,
        handle: null,
        avatar: toSource(author.avatarUrl),
        openLabel: t(($) => $.member.open, { nameOf: nameOf(author.name) }),
        onOpen: author.publicPage
          ? () => router.push(publicPath('member', lang, author.id))
          : undefined,
        follow: null,
      }}
    />
  )

  const gallery = (
    <PhotoGallery
      photos={project.visuals.map((visual) => ({
        key: visual.id,
        source: toSource(visual.url),
        thumbhash: visual.thumbhash,
        description: visual.description,
      }))}
      bleed={!large}
      onIndexChange={setPhotoIndex}
      // Sur téléphone, la barre d'un visiteur sur la photo, à la place des boutons de verre d'un
      // membre (planche R12-Visiteur-Projet) ; ailleurs, elle est en haut de la page.
      overlay={large ? null : <CoverControls>{visitorBar}</CoverControls>}
    />
  )

  // « Tester la démo », la seule action miel de la page, par la page de sortie, qui apprend de quel
  // projet vient le lien (elle relit le projet public pour écrire « La démo de … »). Lien retiré par
  // la modération, ou pas de démo : « Pas encore de démo », comme pour un membre.
  const demo = project.demo
  const actions = demo ? (
    <Stack gap="sm">
      <Button
        label={t(($) => $.project.page.tryDemo)}
        icon="arrow-up-right"
        onPress={() => openDemo(demo.url, project.id)}
      />
      {/* On annonce toujours le site extérieur, avant même la page d'avertissement. */}
      <Hint icon="globe-simple" text={t(($) => $.project.page.external, { host: demo.domain })} />
    </Stack>
  ) : (
    <Text tone="muted">{t(($) => $.project.page.noDemo)}</Text>
  )

  // La recette : sans lien vers la page des outils, réservée aux membres (pas d'`onOpenTool`). Rien
  // s'il n'y a rien à dire (décidé ici, comme sur la page d'un membre).
  const recipe = hasRecipe(project) ? (
    <ProjectRecipe
      startedOn={project.startedOn}
      difficulty={project.difficulty}
      tools={project.tools}
    />
  ) : null

  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'project', id: project.id } })

  return (
    <ProjectPageLayout
      topBar={large ? visitorBar : null}
      onBack={back}
      pageTitle={project.title}
      thumbhash={project.visuals[photoIndex]?.thumbhash ?? null}
      fade
      bleed={!large}
      gallery={gallery}
      header={header}
      actions={actions}
      // Sous « Tester la démo » : le nombre des réactions, jamais qui, et « Réagir ».
      actionNotes={<ReactionSummary count={project.reactionCount} onReact={askAccount} />}
      recipe={recipe}
      description={project.description ? <ProjectDescription text={project.description} /> : null}
      prompt={project.prompts.length > 0 ? <PromptBlock prompts={project.prompts} /> : null}
      journal={latest ? <PublicLatestUpdate project={project} update={latest} lang={lang} /> : null}
      // À la place des commentaires : la phrase et « Créer un compte ».
      conversation={<MembersOnlyNotice onCreateAccount={askAccount} />}
      // « Signaler ce projet » ferme la page ; la page « Signaler » passe en mode visiteur sans
      // session (cibles publiques, adresse e-mail facultative).
      report={
        <Row>
          <TextLink label={t(($) => $.project.page.report)} tone="muted" onPress={report} />
        </Row>
      }
      layers={<AccountRequiredSheet open={accountOpen} onClose={() => setAccountOpen(false)} />}
    />
  )
}

/**
 * « Les mises à jour » d'un projet public : la dernière en entier, puis « Voir les 3 mises à jour »,
 * qui mène à la frise publique (`/fr/projects/<id>/updates`). La même section que celle d'un membre
 * (projects/ProjectUpdatesSection.tsx), sans ce qui lui est réservé ; chaque mise à jour se signale.
 */
function PublicLatestUpdate({
  project,
  update,
  lang,
}: {
  project: PublicProject
  update: ProjectUpdate
  lang: ReturnType<typeof usePageLanguage>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" heading={2}>
        {t(($) => $.project.updates.title)}
      </Text>
      <UpdateEntry
        update={update}
        toSource={toSource}
        headingLevel={3}
        photoHeight="band"
        onReport={() =>
          router.push({ pathname: '/report', params: { kind: 'update', id: update.id } })
        }
      />
      {project.updateCount > 0 ? (
        // Dans une rangée : le lien garde la largeur de son texte.
        <Row>
          <TextLink
            label={t(($) => $.project.updates.seeAll, { count: project.updateCount })}
            onPress={() => router.push(publicPath('updates', lang, project.id))}
          />
        </Row>
      ) : null}
    </Surface>
  )
}
