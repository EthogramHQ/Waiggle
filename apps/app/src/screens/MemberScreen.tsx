// Page d'un membre : son avatar, son nom, sa bio, ses outils favoris (chacun mène à sa page
// d'étiquette), puis ses projets, du plus récent au plus ancien, sous « Projets · 3 ». Sur sa
// propre page (« Moi », refonte R3), un membre voit aussi ses projets privés, marqués « Privé »,
// sous « Mes projets · 3 », la roue des réglages en haut à droite, et « Modifier mon profil », qui
// mène à la rubrique « Mon profil » des réglages. Sur la page
// d'un autre membre, le nombre d'abonnés (jamais leurs noms), puis le bouton « Suivre » et le menu
// « … » (tranche 7b) côte à côte : « Signaler ce profil » et « Bloquer ».
//
// Un membre que j'ai bloqué (tranche 7b) : sa page n'est plus que son en-tête (nom, pseudo, photo),
// avec « Tu as bloqué @x. », un bouton « Débloquer » à la place de « Suivre », et « Signaler ce
// profil » dans le menu. Un membre qui m'a bloqué n'a pas de page pour moi : l'API répond
// « introuvable », comme pour un inconnu.
//
// Tranche 7c : un administrateur trouve dans le menu « Suspendre le compte » (ou « Lever la
// suspension ») et « Historique de modération », et lit jusqu'à quand le compte est suspendu. Un
// visiteur suspendu n'a plus « Suivre », sauf pour ne plus suivre un membre qu'il suit déjà.
//
// Tranche R5a (F-Mb1) : « Partager » en haut à droite ouvre la feuille de partage (`ShareSheet`),
// avec l'adresse de la page ; sur sa propre page, à côté de la roue.
//
// Tranche R10 (F-Et5) : les projets en mosaïque de tuiles (`TileMosaic`, `ProjectTile`), comme la
// page d'un outil, avec la pastille « Privé » ou « Réservé à Famille ».
//
// Tranche R14 (décision 16, « ok, mosaïque ») : les tuiles laissent la place à une mosaïque de
// cartes comme celles du Fil (`ProjectMosaic`) : le plus récent en grande carte, les suivants en
// cartes compactes. Aucune carte ne répète le nom du membre (on est sur sa page) ; sa photo est la
// première de la galerie, à toute largeur ; la pastille de visibilité reste. Toucher une carte fait
// grandir sa photo jusqu'à la page du projet (`SummaryCard`, par `ui/coverTransition`).
//
// Tranche R15 (« L'ordinateur en grand », planche R15-Membre-1920) : la page prend le gabarit large
// (`Screen width="wide"`). Dès 1 100 points, son profil devient une colonne de 360 points à gauche,
// lue d'abord, qui reste en place pendant qu'on descend dans ses projets (`Columns sideFirst
// sticky`) ; la mosaïque prend tout le reste, et y compte ses colonnes. Plus étroit, la page de R14 :
// l'en-tête centré, puis les projets dessous.
//
// Tranche R19 (la gamification) : sous l'en-tête, le rayon du membre (MemberHarvest.tsx) : le sien
// sur « Moi », celui d'un proche sur sa page.
import {
  type Member,
  PROJECT_LIST_MAX,
  type ProjectSummary,
  type RemovedPart as RemovedPartOut,
} from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SessionGate } from '../accounts/SessionGate'
import type { SessionData } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useBlock, useUnblock } from '../blocks/api'
import { type BlockAsking, BlockDialog } from '../blocks/BlockDialog'
import { useFollow } from '../follows/api'
import { useLiveTopic } from '../live/topics'
import { useMember } from '../members/api'
import { useSuspension } from '../moderation/suspension'
import { loadSettingsChunk } from '../navigation/chunkLoaders'
import { lazyModule } from '../navigation/lazyModule'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { ProvisionalNameBanner } from '../profile/ProvisionalNameBanner'
// L'aperçu d'un membre est lu à sa source (projects/hooks.ts), pas par members/api.ts qui le
// réexporte : les tests de cette page remplacent members/api par de faux modules.
import { useMemberPreview } from '../projects/hooks'
import { SummaryCard } from '../projects/SummaryCard'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { CountedTitle } from '../ui/CountedTitle'
import { contestSubjectOf } from '../ui/contestSubject'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { IconButton } from '../ui/IconButton'
import { MemberHeader, MemberHeaderSkeleton } from '../ui/MemberHeader'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { ProjectMosaic } from '../ui/ProjectMosaic'
import { parisDateTime } from '../ui/parisTime'
import { RemovedPart } from '../ui/RemovedPart'
import { Reveal } from '../ui/Reveal'
import { Screen } from '../ui/Screen'
import { ShareSheet } from '../ui/ShareSheet'
import { Loading, SkeletonPage } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { LoadErrorScreen, LoadingScreen, NotFoundState } from './states'

// R19 : le rayon (MemberHarvest : niveau, sceaux, alvéoles) vit dans le morceau des réglages, avec
// « Ma récolte » dont il partage presque tout. La page d'un membre le demande dès qu'elle s'ouvre, en
// même temps que le membre lui-même ; hors du script de départ de l'accueil (garde de poids, R18).
const useHarvestParts = lazyModule(loadSettingsChunk)
type HarvestParts = NonNullable<ReturnType<typeof useHarvestParts>>

/** Les parties d'un profil que la modération peut retirer (les autres sont celles d'un projet). */
const PROFILE_FIELDS = ['name', 'handle', 'bio', 'favoriteTools', 'avatar'] as const
type ProfileField = (typeof PROFILE_FIELDS)[number]
type RemovedProfilePart = RemovedPartOut & { field: ProfileField }

const isProfilePart = (part: RemovedPartOut): part is RemovedProfilePart =>
  (PROFILE_FIELDS as readonly string[]).includes(part.field)

/**
 * R9 (planche R9-Partie-Retiree, décision L2 de Louis) : les parties de son profil retirées par la
 * modération, que leur auteur seul voit sur « Moi ». Chacune dans son encadré (`RemovedPart`) : ce
 * qui a été retiré, le fondement, l'explication, la date, « Contester » (l'objet de l'e-mail nomme
 * « …de mon profil » et la date), la justice. Un pseudo ou un nom retiré dit aussi celui qu'il porte
 * en attendant, avec de quoi en choisir un autre dans les réglages du profil.
 */
function RemovedProfileParts({ member }: { member: Member }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const parts = member.removedParts.filter(isProfilePart)
  if (parts.length === 0) return null
  // La rubrique « Mon profil » des réglages, où se changent le nom, le pseudo, la bio et la photo
  // (comme « Modifier mon profil »).
  const toProfile = () => router.push('/settings/profile')

  return (
    <Stack gap="lg">
      {parts.map((part) => {
        // Le champ, recopié dans une constante avant les sélecteurs de texte (clés fabriquées).
        const field = part.field
        const { value } = part
        // « Contestation : retrait de la bio de mon profil du 12 novembre » (J12).
        const subject = contestSubjectOf(
          t,
          i18n.language,
          t(($) => $.removal.contestDecision.profilePart, {
            part: t(($) => $.moderation.parts[field]),
          }),
          part.removal.at,
        )
        // Ce qui a été retiré, relu par son auteur seul : de quoi savoir quoi remplacer.
        const removedValue =
          field === 'avatar' ? null : Array.isArray(value) ? value.join(', ') : value
        // Une bio, des outils, une photo : « Remplacer » mène aux réglages. Le nom et le pseudo
        // ont leur propre geste, sous la valeur provisoire.
        const replaceable = field === 'bio' || field === 'favoriteTools' || field === 'avatar'
        return (
          <RemovedPart
            key={`${field}-${part.mediaId ?? ''}`}
            title={t(($) => $.removal.part.titles[field])}
            removal={part.removal}
            contestSubject={subject}
            onReplace={replaceable ? toProfile : null}
            onDelete={null}
          >
            {field === 'avatar' && part.imageUrl ? (
              <Avatar name={member.name} source={toSource(part.imageUrl)} label={member.name} />
            ) : null}
            {removedValue ? (
              <Text tone="secondary" breakAnywhere>
                {field === 'handle'
                  ? t(($) => $.member.handle, { handle: removedValue })
                  : removedValue}
              </Text>
            ) : null}
            {field === 'handle' ? (
              <>
                <Text>{t(($) => $.removal.part.provisionalHandle, { handle: member.handle })}</Text>
                <Button
                  label={t(($) => $.removal.part.chooseHandle)}
                  variant="secondary"
                  icon="pencil-simple"
                  onPress={toProfile}
                />
              </>
            ) : field === 'name' ? (
              <>
                <Text>{t(($) => $.removal.part.provisionalName, { name: member.name })}</Text>
                <Button
                  label={t(($) => $.removal.part.chooseName)}
                  variant="secondary"
                  icon="pencil-simple"
                  onPress={toProfile}
                />
              </>
            ) : null}
          </RemovedPart>
        )
      })}
    </Stack>
  )
}

/**
 * R16 : la garde de session commune (accounts/SessionGate.tsx). En attente, la page vide d'un membre
 * (son en-tête vide, puis la mosaïque de 4 petites cartes) ; en erreur, « Réessayer » ; sans
 * session, « Réservé aux membres ». Aucune requête avant la session (la page d'un membre est
 * réservée aux membres). La fonction enfant ne fait que rendre `MemberContent`, qui porte les hooks.
 */
export function MemberScreen({ id }: { id: string }) {
  // R21 (plan, choix 3) : la page écoute son membre (`member:<pseudo ou id>`) dès qu'elle est
  // montée, sans attendre la lecture : ses abonnés et ses projets publics changent sous les yeux.
  // Le serveur ignore en silence un membre qu'il ne montrerait pas (bloqué, inconnu).
  useLiveTopic(`member:${id}`)
  return (
    <SessionGate width="page" loading={<LoadingScreen shape="member" />}>
      {(session) => <MemberContent id={id} session={session} />}
    </SessionGate>
  )
}

function MemberContent({ id, session }: { id: string; session: SessionData }) {
  const { t } = useTranslation()
  const member = useMember(id)
  // R16 (plan, choix 10) : ce qu'une liste déjà lue sait du membre (son nom, sa photo : l'auteur
  // d'une carte touchée), montré tant que l'API n'a pas répondu ; null si aucune ne le connaît.
  const preview = useMemberPreview(id)
  const harvest = useHarvestParts()

  if (member.error) {
    // Introuvable : un membre inconnu, ou qui m'a bloqué. La même page, le même texte : rien ne
    // trahit le blocage.
    if (errorKey(member.error) === 'notFound') {
      return (
        <NotFoundState
          width="page"
          title={t(($) => $.member.notFoundTitle)}
          message={t(($) => $.member.notFound)}
        />
      )
    }
    return (
      <LoadErrorScreen error={member.error} onRetry={() => void member.refetch()} width="page" />
    )
  }
  // R16 : la page complète, sinon son aperçu, sinon la page vide (un lien direct). Le complet et
  // l'aperçu passent par le **même** `MemberPage`, à la même place : quand la réponse arrive, React
  // garde la page (sa barre, son « Retour », le défilement) et l'aperçu fond vers le contenu. Un 404,
  // plus haut, remplace l'aperçu par « Introuvable ».
  // Le rayon d'un membre qui en a un est attendu avec sa réponse : la page complète n'apparaît pas
  // sans lui (le rayon arrivant après, tout ce qui est dessous descendrait sous les yeux). Pendant ce
  // court temps, l'aperçu ou la page d'attente, comme avant la réponse de l'API.
  if (member.data && (harvest || !member.data.game))
    return (
      <MemberPage
        member={member.data}
        preview={preview}
        viewerId={session.user.id}
        harvest={harvest}
      />
    )
  if (preview)
    return (
      <MemberPage member={null} preview={preview} viewerId={session.user.id} harvest={harvest} />
    )
  return <LoadingScreen shape="member" />
}

/** Ce qu'une liste sait d'un membre : l'auteur d'un projet (id, nom, photo). */
type MemberPreview = ProjectSummary['author']

/**
 * La page d'un membre, avec ou sans sa réponse : la barre, « Retour », « Partager », puis la zone qui
 * attend (`Reveal`). Sans la réponse (`member` vaut `null`), l'aperçu : le nom et la photo pour de
 * vrai, le reste vide, à la place de ce qui arrive ; puis le fondu vers le contenu (plan R16, choix 9).
 */
function MemberPage({
  member,
  preview,
  viewerId,
  harvest,
}: {
  member: Member | null
  preview: MemberPreview | null
  viewerId: string
  harvest: HarvestParts | null
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  // Arrivé par un lien direct, il n'y a pas de page précédente : le retour mène au Fil (`/feed`).
  const back = useGoBack('/feed')
  // « Moi » (/me, R3) est la première page d'un onglet, comme le Fil ou Explorer : pas de
  // « Retour » (on change de page par la barre d'onglets). Sa page ouverte par /members/<id> en a un.
  const pathname = usePathname()
  const onBack = pathname === '/me' ? undefined : back
  // R15 : sur ordinateur (1 100 points et plus, une fois la fenêtre connue : avant l'hydratation,
  // la page du téléphone), le profil en colonne à gauche et les projets à droite.
  const column = useLayout().sizeClass === 'wide'

  // La feuille « Partager » ouverte ou non, et son bouton (un bouton à icône seule : son nom
  // « Partager » est lu). Pendant l'aperçu, ni l'un ni l'autre : la feuille a besoin de savoir si
  // la page est publique, que seule la réponse dit.
  const [sharing, setSharing] = useState(false)
  const shareButton = (
    <IconButton
      icon="share-network"
      label={t(($) => $.share.action)}
      onPress={() => setSharing(true)}
    />
  )

  return (
    <Screen
      width="wide"
      header={<TopNav />}
      onBack={onBack}
      pageTitle={member?.name ?? preview?.name}
      // Sur sa propre page, la roue des réglages, en haut à droite (R3, F-Nav8) : on entre dans
      // les réglages par « Moi ». Sur la rangée du « Retour » quand il y en a un (sa page ouverte
      // par /members/<id>), pas sur une rangée à elle en dessous. Un bouton à icône seule : son
      // nom (« Réglages ») est lu.
      //
      // R5a (F-Mb1) : « Partager », sur la page d'un autre membre comme sur la sienne (à côté de la
      // roue). Un membre qui m'a bloqué n'a pas de page pour moi (« introuvable », plus haut) : rien
      // à partager.
      topAction={
        member === null ? undefined : member.isMe ? (
          <Row gap="sm" align="center">
            {shareButton}
            <IconButton
              icon="gear-six"
              label={t(($) => $.nav.settings)}
              onPress={() => router.push('/settings')}
            />
          </Row>
        ) : (
          shareButton
        )
      }
    >
      <Reveal
        loading={member === null}
        skeleton={
          preview ? (
            <MemberPreviewShapes preview={preview} mine={preview.id === viewerId} column={column} />
          ) : null
        }
      >
        {member ? <MemberView member={member} column={column} harvest={harvest} /> : null}
      </Reveal>
      {/* La feuille « Partager » (R5a) : l'adresse de la page, par l'identifiant du membre, sans
          rien d'autre ; à la fermeture, le focus revient au bouton Partager. */}
      {member ? (
        <ShareSheet
          open={sharing}
          onClose={() => setSharing(false)}
          title={member.name}
          target={{ kind: 'member', id: member.id }}
          // R12 (plan, décision 11) : une page publique s'ouvre pour tout le monde, à son adresse
          // dans la langue de qui partage ; sinon, seuls les membres pourront l'ouvrir.
          visibility={member.publicPage ? 'web' : 'public'}
          image={toSource(member.avatarUrl)}
        />
      ) : null}
    </Screen>
  )
}

/**
 * R16 (planches R16-Membre-1440 et 390) : la page d'un membre ouverte depuis une carte, avant la
 * réponse. Son nom et sa photo, venus de la carte, s'affichent pour de vrai, hors du « Chargement… »
 * (ils n'attendent rien) ; le reste de l'en-tête est vide, à ses places (`MemberHeaderSkeleton`).
 * Puis le titre des projets (« Projets », ou « Mes projets » sur sa propre page : on le sait déjà),
 * et la mosaïque vide, 4 petites cartes, sous le seul « Chargement… » de la page, qui se montre
 * après 160 ms (plan, choix 8). Même mise en page que la page qui arrive : en colonne sur
 * ordinateur, l'un sous l'autre ailleurs.
 */
function MemberPreviewShapes({
  preview,
  mine,
  column,
}: {
  preview: MemberPreview
  mine: boolean
  column: boolean
}) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const header = (
    <MemberHeaderSkeleton
      layout={column ? 'column' : undefined}
      name={preview.name}
      avatar={toSource(preview.avatarUrl)}
    />
  )
  const title = mine ? t(($) => $.me.myProjects) : t(($) => $.member.projects)
  const projects = (
    <>
      {/* Le titre seul (sans nombre : 0 l'omet) ; le nombre le rejoint à l'arrivée. */}
      <CountedTitle title={title} count={0} spokenCount={title} />
      <Loading>
        <SkeletonPage shape="compact" />
      </Loading>
    </>
  )
  return column ? (
    <Columns sideFirst sideWidth="profile" side={header} main={projects} />
  ) : (
    <Stack gap="xl">
      {header}
      {projects}
    </Stack>
  )
}

/** Le contenu de la page, une fois la réponse arrivée : le profil, ses actions et ses projets. */
function MemberView({
  member,
  column,
  harvest,
}: {
  member: Member
  column: boolean
  harvest: HarvestParts | null
}) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const follow = useFollow({ kind: 'member', id: member.id })
  const { block } = useBlock()
  const { unblock } = useUnblock()
  const signInAgain = useSignInAgain()
  const followers = t(($) => $.follow.followers, { count: member.followerCount })
  const handle = member.handle
  // Tranche 7c : un compte suspendu ne suit plus personne de nouveau, mais peut retirer ce qu'il a
  // déjà donné (décision de Louis, 26/10/2026). S'il suit ce membre, « Tu suis Léa » reste, pour ne plus
  // le suivre ; s'il ne le suit pas, « Suivre » est absent.
  const { suspended } = useSuspension()
  // Vu « Tu suis Léa » pendant la suspension : le bouton reste toute la visite, inactif une fois le suivi
  // retiré. Sans cela, il disparaîtrait sous le doigt (et le focus avec lui) dès le geste fait.
  const [keepFollow, setKeepFollow] = useState(false)
  if (suspended && member.isFollowed && !keepFollow) setKeepFollow(true)
  const showFollow = !suspended || keepFollow

  // La fenêtre de confirmation ouverte (aucune, bloquer ou débloquer).
  const [asking, setAsking] = useState<BlockAsking | null>(null)
  // L'état annoncé par le dernier geste réussi, tant que la page relue ne le dit pas encore : la
  // page passe à son nouvel état tout de suite, au lieu de montrer l'ancien puis de sauter.
  const [expected, setExpected] = useState<boolean | null>(null)
  // Changer l'état pendant le dessin est permis par React pour suivre une prop : la page relue dit
  // la même chose, on la croit de nouveau.
  if (expected !== null && member.isBlocked === expected) setExpected(null)
  const blocked = expected ?? member.isBlocked
  // « Tu as débloqué @x. » : il reste jusqu'au geste suivant, au lieu de disparaître sous le doigt.
  const [unblocked, setUnblocked] = useState(false)
  // Après un déblocage, « Débloquer » disparaît : le focus du clavier va au message qui le
  // confirme, une fois la fenêtre refermée (avant, elle le garde pour elle).
  const unblockedRef = useRef<Focusable>(null)
  const focusAfterClose = useRef(false)

  // R9 : la fenêtre nomme le membre (« Bloquer Léa Martin (@lea) ? ») et montre sa photo.
  const ask = (gesture: BlockAsking['gesture']) =>
    setAsking({
      gesture,
      member: { id: member.id, name: member.name, handle, avatar: toSource(member.avatarUrl) },
    })

  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'member', id: member.id } })

  // R9 : « Signaler aussi son profil » cochée dans la fenêtre. Le signalement s'ouvre une fois le
  // blocage enregistré, jamais avant. Sur le web, après le fondu de la fenêtre (`onClosed`) : une
  // feuille ouverte par-dessus une fenêtre qui se ferme se disputerait le focus avec elle. Android
  // ne prévient pas de la fin du fondu (pas d'`onDismiss`) : on l'ouvre tout de suite.
  const reportAfterClose = useRef(false)

  const done = ({ gesture }: BlockAsking, alsoReport: boolean) => {
    setExpected(gesture === 'block')
    setUnblocked(gesture === 'unblock')
    focusAfterClose.current = gesture === 'unblock'
    setAsking(null)
    if (!alsoReport) return
    if (Platform.OS === 'web') reportAfterClose.current = true
    else report()
  }

  // Le menu « … » : rien sur sa propre page (ni se signaler, ni se bloquer soi-même). Bloqué, il
  // garde « Signaler ce profil » ; « Débloquer » est un bouton de la page (le scénario le promet).
  const reportItem: ActionMenuItem = {
    label: t(($) => $.report.member),
    icon: 'flag',
    onPress: report,
  }
  const memberItems: ActionMenuItem[] = blocked
    ? [reportItem]
    : [
        reportItem,
        {
          label: t(($) => $.block.action),
          icon: 'prohibit',
          tone: 'danger',
          onPress: () => ask('block'),
        },
      ]
  // Tranche 7c : ce que seul un administrateur voit (l'API n'envoie `moderation` qu'à lui).
  // Suspendre, ou lever une suspension en cours (la même page, /suspend), puis l'historique des
  // décisions qui visent ce membre. Jamais de suspension d'un autre administrateur (`canSuspend`).
  const { moderation } = member
  const adminItems: ActionMenuItem[] = moderation
    ? [
        ...(moderation.suspension
          ? [
              {
                label: t(($) => $.moderation.memberMenu.lift),
                icon: 'lock-simple-open' as const,
                onPress: () => router.push({ pathname: '/suspend', params: { member: member.id } }),
              },
            ]
          : moderation.canSuspend
            ? [
                {
                  label: t(($) => $.moderation.memberMenu.suspend),
                  icon: 'lock-simple' as const,
                  onPress: () =>
                    router.push({ pathname: '/suspend', params: { member: member.id } }),
                },
              ]
            : []),
        {
          label: t(($) => $.moderation.memberMenu.history),
          icon: 'clock',
          onPress: () =>
            router.push({
              pathname: '/moderation',
              params: { tab: 'history', member: member.id },
            }),
        },
      ]
    : []
  const menuItems = [...memberItems, ...adminItems]
  // La fin de sa suspension, pour l'administrateur seul : le jour et l'heure de Paris (J4).
  const suspension = moderation?.suspension ?? null
  const suspensionEnd = suspension?.endsAt ? parisDateTime(suspension.endsAt, i18n.language) : null
  const suspensionLine = suspension
    ? suspensionEnd
      ? t(($) => $.moderation.memberSuspended, {
          date: suspensionEnd.date,
          time: suspensionEnd.time,
        })
      : t(($) => $.moderation.memberSuspendedIndefinite)
    : null

  // Le nom lu du bouton « Suivre » : « Suivre Léa », puis « Tu suis Léa » (aussi le texte affiché).
  const followName = member.isFollowed
    ? t(($) => $.follow.memberFollowing, { name: member.name })
    : t(($) => $.follow.member, { name: member.name })
  // Le titre de la liste des projets : « Mes projets » sur sa page, « Projets » sur celle d'un
  // autre, suivi du nombre (« Mes projets · 3 », dessiné par CountedTitle). L'API n'envoie que les
  // PROJECT_LIST_MAX (50) premiers projets : une liste pleine en cache peut-être d'autres, et le
  // titre dit alors « 50+ », lu « 50 projets ou plus ».
  const listTitle = member.isMe ? t(($) => $.me.myProjects) : t(($) => $.member.projects)
  const projectCount = member.projects.length
  const capped = projectCount >= PROJECT_LIST_MAX
  const spokenCount = capped
    ? t(($) => $.member.projectCountMore, { max: PROJECT_LIST_MAX })
    : t(($) => $.member.projectCount, { count: projectCount })

  // La pastille de visibilité d'une carte : « Privé » (sur « Moi » : l'API ne montre ses projets
  // privés qu'à leur auteur), « Réservé à Famille » pour un projet réservé à une ruche, que l'API ne
  // montre qu'aux membres de la ruche ; « Ruche sans nom » si son nom a été retiré, comme la ligne
  // d'actualité d'une ruche (`HiveActivityRow`).
  const visibilityBadge = (project: ProjectSummary): string | undefined => {
    if (project.visibility === 'private') return t(($) => $.member.private)
    if (project.visibility === 'hive' && project.hive)
      return t(($) => $.hives.page.reserved, {
        hive: project.hive.name ?? t(($) => $.hives.unnamed),
      })
    return undefined
  }

  const followError = follow.expired
    ? t(($) => $.states.expired)
    : follow.error
      ? t(($) => $.follow.error)
      : undefined

  // Le profil : l'en-tête, avec ce qu'on peut y faire. Centré au-dessus des projets, ou rangé à
  // gauche dans sa colonne (`layout="column"`, R15).
  const profile = (
    <>
      <MemberHeader
        name={member.name}
        handle={t(($) => $.member.handle, { handle })}
        avatar={toSource(member.avatarUrl)}
        bio={member.bio}
        layout={column ? 'column' : undefined}
        // R12b : le compte d'exemples de l'équipe (`example`, absent pour tout autre membre) :
        // « Exemple » à côté du nom, et dessous la phrase qui dit ses projets fictifs.
        exampleNote={member.example ? t(($) => $.member.exampleNote) : undefined}
        toolsTitle={t(($) => $.member.favoriteTools)}
        tools={member.favoriteTools.map((tool) => ({
          label: tool.label,
          onPress: () => router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } }),
          // R6b : un « autre outil », absent du catalogue, est une pastille marquée, sans lien
          // (`Tag inCatalogue={false}` ignore alors `onPress`).
          inCatalogue: tool.inCatalogue,
        }))}
        // Les actions suivent la forme de l'en-tête : centrées sous lui, ou à gauche dans la
        // colonne. Là, les textes s'étirent sur la largeur (rangés à gauche, ils se réduiraient à
        // leur plus long mot) et les boutons restent à leur taille, sur une rangée.
        action={
          member.isMe ? (
            <Stack gap="sm" align={column ? 'stretch' : 'center'}>
              {/* R9 : le pseudo ou le nom provisoire, au-dessus de « Modifier mon profil ». */}
              <ProvisionalNameBanner />
              <FollowerCount text={followers} />
              {/* R3 (F-Nav8) : la rubrique « Mon profil » des réglages. */}
              <Row justify={column ? 'start' : 'center'}>
                <Button
                  label={t(($) => $.me.editProfile)}
                  variant="secondary"
                  icon="pencil-simple"
                  onPress={() => router.push('/settings/profile')}
                />
              </Row>
            </Stack>
          ) : (
            <Stack gap="md" align={column ? 'stretch' : 'center'}>
              {/* Pour l'administrateur seul : jusqu'à quand le compte est suspendu. Lue à son tour
                  (role « status ») : elle est là dès l'ouverture de la page. */}
              {suspensionLine ? <Notice tone="info" message={suspensionLine} polite /> : null}
              {/* Lus sans interrompre (role « status ») : le même texte avant et après la relecture
                  de la page, pour une seule annonce. */}
              {blocked ? (
                <Notice tone="info" message={t(($) => $.block.notice, { handle })} polite />
              ) : unblocked ? (
                <Notice
                  ref={unblockedRef}
                  tone="success"
                  message={t(($) => $.block.unblocked, { handle })}
                  polite
                />
              ) : null}
              {/* Le nombre d'abonnés au-dessus : il ne bouge pas quand « Suivre » devient « Tu suis Léa ». */}
              {blocked ? null : <FollowerCount text={followers} />}
              {/* « Suivre » (ou « Débloquer ») et le menu « … » sur une rangée (centrée, ou à
                  gauche dans la colonne). Le menu garde sa place dans l'arbre, bloqué ou non :
                  après « Bloquer », le focus revient à son bouton au lieu de se perdre. La rangée
                  passe à la ligne (`wrap`) : à texte très agrandi sur un téléphone étroit, « Plus
                  d'actions » descend sous « Suivre » au lieu de sortir de l'écran. */}
              <Row gap="sm" align="center" justify={column ? 'start' : 'center'} wrap>
                {blocked ? (
                  <Button
                    label={t(($) => $.block.unblock)}
                    // Le nom lu contient le texte affiché, et dit qui (comme dans la liste).
                    spokenLabel={t(($) => $.block.list.unblockLabel, { handle })}
                    variant="secondary"
                    size="compact"
                    onPress={() => ask('unblock')}
                  />
                ) : showFollow ? (
                  <FollowButton
                    followed={member.isFollowed}
                    onPress={follow.toggle}
                    // Suspendu, le suivi retiré : plus de nouveau suivi (l'API le refuserait).
                    disabled={suspended && !member.isFollowed}
                    // Le nom lu contient toujours le texte affiché : « Suivre », puis « Tu suis
                    // Léa » une fois suivie (R3, planches ; la coche est dessinée par le bouton,
                    // hors du nom lu). Dire « touche Tu suis Léa » à la commande vocale trouve
                    // bien ce bouton.
                    label={followName}
                    text={member.isFollowed ? followName : t(($) => $.follow.follow)}
                  />
                ) : null}
                <ActionMenu items={menuItems} />
              </Row>
              {/* Sous la rangée, pas dans le bouton : « … » reste à sa place près de « Suivre ».
                  Lu dès qu'il apparaît (role « alert »), comme les autres erreurs. */}
              {!blocked && followError ? (
                <Notice message={followError} action={follow.expired ? signInAgain() : undefined} />
              ) : null}
            </Stack>
          )
        }
      />
      {/* R19 : le rayon sous l'en-tête. Le sien, avec « Ma récolte » (lue pour soi seulement) ;
          celui d'un proche, réduit à ce que sa page dit (`member.game`). Le compte d'exemples et un
          membre bloqué n'en ont pas (`game` vaut null). */}
      {member.game && harvest && !blocked ? (
        member.isMe ? (
          <harvest.MyHarvest game={member.game} column={column} />
        ) : (
          <harvest.TheirHarvest game={member.game} column={column} />
        )
      ) : null}
      {/* R9 : sur « Moi », les parties de son profil retirées par la modération (l'API ne les
          donne qu'à leur auteur). */}
      {member.isMe ? <RemovedProfileParts member={member} /> : null}
    </>
  )

  // Les projets, sous « Projets · 3 ». Bloqué : ni projets, ni « Pas encore de projet public »
  // (l'API n'en donne aucun).
  const projects = blocked ? null : (
    <>
      <CountedTitle
        title={listTitle}
        count={projectCount}
        more={capped}
        spokenCount={spokenCount}
      />
      {member.projects.length === 0 ? (
        // Aucun projet : la phrase de la grille, sans mosaïque.
        <ProjectGrid empty={member.isMe ? t(($) => $.member.emptyMine) : t(($) => $.member.empty)}>
          {null}
        </ProjectGrid>
      ) : (
        // R14 : ses projets en mosaïque de cartes. La mosaïque choisit la taille de chaque carte
        // (la grande pour le plus récent) et sa place selon la largeur que lui donne sa colonne
        // (R15) ; la carte, sans l'auteur (`owner`), garde le reste de celle du Fil : la photo (la
        // première de la galerie, `galleryCover`), le titre, l'accroche, le statut, « Tester » sur
        // la grande, les réactions et la pastille de visibilité. Elle a sa garde contre la double
        // tape.
        <ProjectMosaic
          items={member.projects}
          render={(project, size) => (
            <SummaryCard
              project={project}
              owner
              size={size}
              galleryCover
              badge={visibilityBadge(project)}
            />
          )}
        />
      )}
    </>
  )

  return (
    <>
      {/* R15 : sur ordinateur, le profil en colonne à gauche, lu d'abord (`sideFirst`), de 360
          points (`profile`), qui reste en place quand on descend dans les projets (`sticky` ; plus
          haut que la fenêtre, une fois son pied atteint) ; les projets prennent le reste. Plus
          étroit, l'un sous l'autre. R16 : la page est posée dans la zone qui attend (`Reveal`),
          pas directement dans `Screen` : la pile reprend l'écart que `Screen` met entre ses
          enfants (`xl`). */}
      {column ? (
        <Columns sideFirst sideWidth="profile" sticky side={profile} main={projects} />
      ) : (
        <Stack gap="xl">
          {profile}
          {projects}
        </Stack>
      )}
      {/* Bloquer et débloquer passent par la même fenêtre, qui dit ce qui change (J9, J10). */}
      {/* R9 : la case « Signaler aussi son profil » (`offerReport`), jamais cochée d'avance. */}
      <BlockDialog
        asking={asking}
        offerReport
        send={({ gesture, member: target }) =>
          gesture === 'block' ? block(target.id) : unblock(target.id)
        }
        onDone={done}
        onCancel={() => setAsking(null)}
        onClosed={() => {
          if (reportAfterClose.current) {
            reportAfterClose.current = false
            report()
          }
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          requestAnimationFrame(() => focusWithoutScroll(unblockedRef.current))
        }}
      />
    </>
  )
}
