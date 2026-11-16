// La page publique d'un membre vue par un visiteur sans compte (tranche R12, scénario « Une page
// publique », planches R12-Visiteur-Profil et R12-Profil-Public). Son adresse : /fr/members/<id>
// (ou /en/…). Un membre connecté, à la même adresse, garde la page de toujours (`MemberScreen`,
// choisie par la route, navigation/MemberOrVisitor).
//
// Ce que la page montre : le nom et la photo, toujours ; puis seulement ce que le membre a coché
// dans ses réglages (sa bio, ses outils favoris, ses projets publics, son nombre d'abonnés). L'API
// donne une case décochée comme un champ **absent** (contrat `PublicMember`) : l'écran montre ce qui
// est là, rien d'autre. Une case décochée ne dit donc jamais « rien » : ses projets décochés, pas de
// « Pas encore de projet public. » (cette phrase ne vient que pour des projets cochés mais vides).
//
// Jamais son pseudo (Q8), « Suivre », ses ruches, qui il suit, ses commentaires ni ses réactions :
// l'API ne les donne pas, et l'écran n'a rien pour les dessiner. Ses outils sont des pastilles
// sans lien : la page d'un outil est réservée aux membres. Un projet mène à sa page publique, dans
// la langue de la page (`publicPath`). « Signaler ce profil », en bas, ouvre la feuille « Signaler »,
// qui passe en mode visiteur sans session.
//
// Une page fermée, un membre inconnu ou parti : le même 404, et la page dit « Réservé aux membres »
// avec « Se connecter » (plan R12, choix 3), sans rien montrer du membre.
//
// L'aperçu (`preview`) : le même écran sert à « Voir ma page comme un visiteur », dans les réglages
// de la page publique (plan R12, décision 15). Le membre y voit exactement ce qu'un inconnu verrait
// (la lecture part sans session, public/api.ts), sans ce qui ferait quitter l'aperçu : ni la barre
// d'un visiteur (« Se connecter » n'a pas de sens pour lui), ni lien vers un projet, ni « Signaler
// ce profil ». « Retour » le ramène aux réglages.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import { PROJECT_LIST_MAX, type PublicMember } from '@ruche/contracts'
import { type Href, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useGoBack } from '../navigation/useGoBack'
import { usePageLanguage, usePublicMember } from '../public/api'
import { publicPath } from '../publicPath'
import { CountedTitle } from '../ui/CountedTitle'
import { FollowerCount } from '../ui/FollowerCount'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { IconButton } from '../ui/IconButton'
import { LegalLinks } from '../ui/LegalLinks'
import { MemberHeader } from '../ui/MemberHeader'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { ShareSheet } from '../ui/ShareSheet'
import { Row } from '../ui/Stack'
import { TextLink } from '../ui/TextLink'
import { ProjectTile } from '../ui/Tile'
import { TileMosaic } from '../ui/TileMosaic'
import { useTapGuard } from '../ui/tapGuard'
import { useLayout } from '../ui/theme/layout'
import { VisitorBar } from '../ui/VisitorBar'
import { LoadErrorScreen, LoadingScreen, SignedOutScreen } from './states'

type Props = {
  /** L'identifiant du membre, lu dans l'adresse de la page. */
  id: string
  /**
   * L'aperçu « comme un visiteur », dans les réglages de la page publique (plan R12, décision 15) :
   * la même page, sans la barre d'un visiteur, sans lien vers les projets ni « Signaler ce profil »,
   * et « Retour » vers les réglages. Faux par défaut : la page d'un vrai visiteur.
   */
  preview?: boolean
  /**
   * Avec `preview` : ce que fait « Retour » quand l'aperçu est posé dans l'écran des réglages (il
   * ne change pas d'adresse : revenir, c'est le refermer). Sans lui, « Retour » revient à la page
   * d'avant, ou aux réglages.
   */
  onClose?: () => void
}

/** Où mène « Retour » sans page d'avant, dans l'aperçu : les réglages de la page publique. */
const PREVIEW_FALLBACK: Href = '/settings/public-page'

export function PublicMemberScreen({ id, preview = false, onClose }: Props) {
  const lang = usePageLanguage()
  // L'aperçu lit sa propre copie, toujours neuve (public/api.ts) : jamais la page d'avant un réglage.
  const member = usePublicMember(id, true, preview)
  // Sans page d'avant, « Revenir » mène à l'accueil dans la langue de la page : le Fil d'un membre
  // serait « Réservé aux membres » pour un visiteur.
  const fallback = preview ? PREVIEW_FALLBACK : publicPath('home', lang)

  if (member.error) {
    // Page fermée, membre inconnu ou parti : le même 404. Rien du membre, seulement « Se connecter ».
    if (errorKey(member.error) === 'notFound') return <SignedOutScreen width="page" />
    return (
      <LoadErrorScreen
        error={member.error}
        onRetry={() => void member.refetch()}
        fallback={fallback}
        width="page"
      />
    )
  }
  if (!member.data) return <LoadingScreen width="page" fallback={fallback} />
  return (
    <PublicMemberView
      member={member.data}
      preview={preview}
      fallback={fallback}
      onClose={preview ? onClose : undefined}
    />
  )
}

function PublicMemberView({
  member,
  preview,
  fallback,
  onClose,
}: {
  member: PublicMember
  preview: boolean
  fallback: Href
  onClose: (() => void) | undefined
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const lang = usePageLanguage()
  const goBack = useGoBack(fallback)
  const back = onClose ?? goBack
  // Deux colonnes de tuiles sur téléphone, quatre ailleurs, comme la page d'un membre.
  const phone = useLayout().sizeClass === 'compact'
  // Une tuile n'a pas de garde à elle : la seconde tape d'une double tape n'ouvre pas deux pages.
  const guard = useTapGuard()

  // L'aperçu s'ouvre à la place de l'écran des réglages : le bouton touché disparaît, et le focus
  // tombait sur la page entière (le lecteur d'écran ne disait rien, Tab repartait du haut). À
  // l'arrivée de l'aperçu, il va au nom, le titre de la page (relecture de design R12, point 2) ;
  // au retour, l'écran des réglages le rend à son bouton. Une vraie page de visiteur, ouverte par
  // une adresse, ne prend pas le focus.
  const nameRef = useRef<Focusable>(null)
  useEffect(() => {
    if (!preview) return
    focusWithoutScroll(nameRef.current)
    moveReaderTo(nameRef.current)
  }, [preview])

  // « Partager » (scénario R12 « Partager » : « une page publique se partage de même », planche
  // R12-Visiteur-Profil) : la feuille dit « Tout le monde pourra l'ouvrir. », et le lien est
  // l'adresse publique dans la langue de la page. Sur téléphone, dans la barre d'un visiteur ;
  // ailleurs, en haut à droite, dans la rangée du « Retour » (`topAction`), comme sur la page d'un
  // membre. Pas dans l'aperçu : le membre y regarde sa page, il la partage depuis sa vraie page.
  const [sharing, setSharing] = useState(false)
  const shareButton = preview ? null : (
    <IconButton
      icon="share-network"
      label={t(($) => $.share.action)}
      onPress={() => setSharing(true)}
    />
  )

  // La barre d'un visiteur : le logo ramène à l'accueil de sa langue, « Se connecter » revient ici.
  const header = preview ? null : (
    <VisitorBar
      homeHref={publicPath('home', lang)}
      next={publicPath('member', lang, member.id)}
      action={phone ? shareButton : undefined}
    />
  )

  // Les projets : absents si la case est décochée (rien du tout), vides si elle est cochée sans
  // projet public (la phrase). L'API n'en donne que PROJECT_LIST_MAX : au plafond, « 50+ ».
  const projects = member.projects
  const projectCount = projects?.length ?? 0
  const capped = projectCount >= PROJECT_LIST_MAX
  const spokenCount = capped
    ? t(($) => $.member.projectCountMore, { max: PROJECT_LIST_MAX })
    : t(($) => $.member.projectCount, { count: projectCount })

  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'member', id: member.id } })

  return (
    <Screen
      width="page"
      header={header}
      onBack={back}
      pageTitle={member.name}
      topAction={phone ? undefined : shareButton}
    >
      <MemberHeader
        name={member.name}
        avatar={toSource(member.avatarUrl)}
        bio={member.bio ?? ''}
        nameRef={preview ? nameRef : undefined}
        // R12b : le compte d'exemples de l'équipe, comme sur la page d'un membre : « Exemple » à
        // côté du nom, et dessous la phrase qui dit ses projets fictifs.
        exampleNote={member.example ? t(($) => $.member.exampleNote) : undefined}
        toolsTitle={t(($) => $.member.favoriteTools)}
        // Des pastilles sans `onPress` : la page d'un outil est réservée aux membres. Un « autre
        // outil », hors du catalogue, reste marqué comme tel (`inCatalogue`).
        tools={(member.favoriteTools ?? []).map((tool) => ({
          label: tool.label,
          inCatalogue: tool.inCatalogue,
        }))}
        // Le nombre seul, jamais qui ; absent si la case est décochée.
        action={
          member.followerCount === undefined ? null : (
            <FollowerCount text={t(($) => $.follow.followers, { count: member.followerCount })} />
          )
        }
      />
      {projects ? (
        <>
          <CountedTitle
            title={t(($) => $.member.projects)}
            count={projectCount}
            more={capped}
            spokenCount={spokenCount}
          />
          {projects.length === 0 ? (
            // Cochés, mais aucun projet public : la phrase de la grille, sans mosaïque.
            <ProjectGrid empty={t(($) => $.visitor.noProjects)}>{null}</ProjectGrid>
          ) : (
            <TileMosaic columns={phone ? 2 : 4}>
              {projects.map((project) => (
                <ProjectTile
                  key={project.id}
                  title={project.title}
                  author={member.name}
                  image={
                    project.cover
                      ? {
                          source: toSource(project.cover.url),
                          thumbhash: project.cover.thumbhash,
                          label: project.title,
                        }
                      : null
                  }
                  // Le statut, comme sur la planche (« Testable », « Idée ») : lu après le titre.
                  badge={t(($) => $.project.status[project.status])}
                  // Dans l'aperçu, la tuile est seulement dessinée : rien ne fait quitter l'aperçu.
                  {...(preview
                    ? null
                    : {
                        onPress: guard(() => router.push(publicPath('project', lang, project.id))),
                      })}
                />
              ))}
            </TileMosaic>
          )}
        </>
      ) : null}
      {preview ? null : (
        <>
          {/* « Signaler ce profil », en bas, discret, comme sous un projet public. */}
          <Row>
            <TextLink label={t(($) => $.report.member)} tone="muted" onPress={report} />
          </Row>
          {/* Le pied des pages publiques (plan R12, décision 16) : les quatre pages dans la langue
              de l'adresse, le code source et la même page dans l'autre langue. Sans « Signaler un
              contenu » : « Signaler ce profil », juste au-dessus, signale déjà ce que la page
              montre. Pas dans l'aperçu, où rien ne fait quitter la page. */}
          <LegalLinks variant="footer" otherLanguage />
          <ShareSheet
            open={sharing}
            onClose={() => setSharing(false)}
            title={member.name}
            target={{ kind: 'member', id: member.id }}
            visibility="web"
            image={toSource(member.avatarUrl)}
          />
        </>
      )}
    </Screen>
  )
}
