// L'accueil, avec sa vitrine (tranche R12, scénario « L'accueil : la vitrine, pour tout le monde »,
// planches R12-Visiteur-Accueil et R12-Visiteur-Desktop ; plan R12, choix 8 et 10). Ses adresses :
// `/fr/` et `/en/` pour un visiteur sur le web, `/` dans l'appli du téléphone, et `/` pour un membre
// qui touche le logo (le Fil a sa propre adresse, `/feed`).
//
// Trois visages :
// - un visiteur, avec une vitrine : l'accroche en grand, « Créer un compte » et « J'ai déjà un
//   compte », puis « Des projets à voir » (3 cartes sur téléphone, en bande qui défile ; 4 sur
//   ordinateur, côte à côte), « Ces projets sont publics : leurs auteurs l'ont choisi. »,
//   « Rien n'est public sans ton accord. » et le pied des pages publiques. La barre du haut est
//   celle d'un visiteur (ui/VisitorBar) ; une carte ouvre le projet à son adresse publique, dans la
//   langue de la page (`/fr/projects/<id>`) ;
// - un visiteur, sans vitrine (aucun projet mis en avant, ou la lecture a échoué) : l'accueil de
//   R11, avec sa constellation (`VisitorHome`, plus bas), que le Fil montre aussi à qui n'a pas de
//   session ;
// - un membre connecté : la même page, sans les boutons de compte, avec sa barre de membre ; une
//   carte ouvre la page du projet des membres (`/projects/<id>`). Sa vitrine passe par les règles de
//   blocage d'Explorer (GET /v1/showcase).
//
// Rien ne bouge sous le doigt : la vitrine arrive **sous** les boutons de compte, sur téléphone comme
// sur ordinateur. Tant qu'elle n'est pas lue, sa place reste vide ; elle ne repousse que ce qui la
// suit (la phrase du cadenas et le pied).
//
// Ce fichier assemble des composants de src/ui, sans écrire de style (règle des étages).
import { SHOWCASE_MAX, type ShowcaseItem } from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { useMediaSources } from '../api/media'
import { languageOfPath, publicPath } from '../navigation/publicPath'
import { TopNav } from '../navigation/TopNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { usePageLanguage } from '../public/api'
import { useMemberShowcase, usePublicShowcase } from '../showcase/api'
import { Button } from '../ui/Button'
import { Carousel } from '../ui/Carousel'
import { Constellation } from '../ui/Constellation'
import { Hint } from '../ui/Hint'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { LegalLinks } from '../ui/LegalLinks'
import { Logo } from '../ui/Logo'
import { Screen } from '../ui/Screen'
import { ShowcaseCard } from '../ui/ShowcaseCard'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { VisitorBar } from '../ui/VisitorBar'
import { WelcomeHero } from '../ui/WelcomeHero'
import { Wordmark } from '../ui/Wordmark'
import { SessionErrorScreen } from './states'

/** Sur téléphone, trois cartes : la troisième dépasse du bord et dit qu'on peut faire défiler (Q9). */
const PHONE_CARDS = 3

export function ShowcaseScreen() {
  // Le membre connecté, ou personne (accounts/session.ts). Pendant la lecture de la session, la page
  // d'un visiteur : c'est aussi la page pré-rendue du web.
  const { state, session, retry } = useMemberSession()
  // La lecture a échoué (trop de demandes, panne) : peut-être un membre, on ne lui propose pas de
  // créer un compte. Pas de « Retour » : il ramènerait ici.
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" withBack={false} />
  return session ? <MemberShowcase /> : <VisitorShowcase />
}

function VisitorShowcase() {
  const showcase = usePublicShowcase()
  const items = showcase.data?.items ?? []
  // Lue, et vide (aucun projet mis en avant), ou en échec sans rien de lu : l'accueil de R11
  // (scénario : « sans projet mis en avant, l'accueil reste celui de R11 »). Une erreur ne montre
  // rien de plus : la vitrine est un plus, l'accueil garde ses deux portes d'entrée.
  if (!showcase.isPending && items.length === 0) return <VisitorHome />
  return <ShowcaseHome items={items} member={false} />
}

function MemberShowcase() {
  const showcase = useMemberShowcase()
  return <ShowcaseHome items={showcase.data?.items ?? []} member />
}

type ShowcaseHomeProps = {
  /** Les projets de la vitrine, dans l'ordre de la modération ; vide pendant la lecture. */
  items: readonly ShowcaseItem[]
  /** Un membre connecté : sa barre, pas de boutons de compte, les adresses des membres. */
  member: boolean
}

function ShowcaseHome({ items, member }: ShowcaseHomeProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  // La langue de la page : celle de l'adresse sous `/fr/` et `/en/`, celle de l'appli sur `/`.
  const lang = usePageLanguage()
  // Téléphone avant l'hydratation (web) : la page pré-rendue est celle du téléphone (useLayout).
  const compact = useLayout().sizeClass === 'compact'
  const toSource = useMediaSources()

  // Un visiteur ouvre le projet à son adresse publique, dans la langue de la page ; un membre, à la
  // page des membres, qui lui montre aussi ce que l'auteur réserve aux membres (plan R12, choix 7).
  // L'identifiant est encodé : il reste un seul morceau du chemin, comme dans `publicPath`.
  const open = (id: string) =>
    router.push(member ? `/projects/${encodeURIComponent(id)}` : publicPath('project', lang, id))

  const cards = items.slice(0, compact ? PHONE_CARDS : SHOWCASE_MAX).map((item) => (
    <ShowcaseCard
      key={item.id}
      title={item.title}
      author={{ name: item.author.name, avatar: toSource(item.author.avatarUrl) }}
      image={
        item.cover
          ? { source: toSource(item.cover.url), thumbhash: item.cover.thumbhash, label: item.title }
          : null
      }
      status={{
        label: t(($) => $.project.status[item.status]),
        strong: item.status === 'testable',
      }}
      onPress={() => open(item.id)}
      size={compact ? 'carousel' : 'fill'}
    />
  ))

  const showcaseTitle = (
    <Text variant="heading" heading={2}>
      {t(($) => $.home.showcase)}
    </Text>
  )
  const note = (
    <Text variant="caption" tone="secondary">
      {t(($) => $.home.showcaseNote)}
    </Text>
  )
  // « Des projets à voir » : rien tant qu'aucun projet n'est là (pas de titre au-dessus du vide).
  // Sur téléphone, une bande qui défile de côté, la phrase dessous ; sur ordinateur, la phrase à
  // droite du titre et les quatre cartes à parts égales (planche R12-Visiteur-Desktop).
  const showcase =
    cards.length === 0 ? null : compact ? (
      <Stack gap="sm">
        <Carousel
          label={t(($) => $.home.showcase)}
          previousLabel={t(($) => $.explore.previous)}
          nextLabel={t(($) => $.explore.next)}
          header={showcaseTitle}
          bleed
        >
          {cards}
        </Carousel>
        {note}
      </Stack>
    ) : (
      <Stack gap="md">
        <Row justify="between" align="baseline" gap="md" wrap>
          {showcaseTitle}
          {note}
        </Row>
        <Row gap="lg" align="stretch">
          {cards}
        </Row>
      </Stack>
    )

  // Le choix de la langue n'a sa place que sur une adresse sans langue (`/` dans l'appli) : sous
  // `/fr/` et `/en/`, c'est l'adresse qui la dit, et le pied mène à l'autre (plan R12, décision 16).
  const languageChoice = languageOfPath(pathname) === null ? <LanguageSwitcher compact /> : null
  // La barre d'un membre, comme sur son Fil (HomeScreen) : sur téléphone, le logo, la cloche et le
  // bandeau d'une suspension ; sur ordinateur, la barre du haut entière. Celle d'un visiteur : le
  // logo, qui ramène à l'accueil de sa langue, et « Se connecter », qui revient ici ensuite.
  const header = member ? (
    compact ? (
      <Stack gap="md">
        <Row justify="between" align="center">
          <Logo />
          <NotificationBell />
        </Row>
        <TopNav />
      </Stack>
    ) : (
      <TopNav />
    )
  ) : (
    <VisitorBar homeHref={publicPath('home', lang)} next={pathname} action={languageChoice} />
  )

  return (
    <Screen width="page" header={header}>
      {/* L'accroche est le titre de la page, en affiche : plus grande sur ordinateur. */}
      <Text variant={compact ? 'title1' : 'poster'} heading={1}>
        {t(($) => $.home.tagline)}
      </Text>
      {member ? null : <AccountButtons row={!compact} />}
      {showcase}
      {member ? null : <Hint icon="lock-simple" text={t(($) => $.home.membersOnly)} />}
      {/* Le pied des pages publiques (R11) : les quatre pages et « Le code source ». Le lot suivant
          de R12 y ajoute « Signaler un contenu » (l'adresse de contact) et le lien vers l'autre
          langue (`LanguageLink`, décision 16 du plan) : leur place est ici, après `LegalLinks`. */}
      <LegalLinks variant="footer" />
    </Screen>
  )
}

/**
 * Les deux portes d'entrée d'un visiteur : « Créer un compte » (la seule action miel de la page),
 * puis « J'ai déjà un compte ». L'une sous l'autre sur téléphone, côte à côte sur ordinateur.
 */
function AccountButtons({ row }: { row: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const buttons = (
    <>
      <Button label={t(($) => $.home.signUp)} onPress={() => router.push('/sign-up')} />
      <Button
        label={t(($) => $.home.haveAccount)}
        variant="secondary"
        onPress={() => router.push('/sign-in')}
      />
    </>
  )
  return row ? (
    <Row gap="md" wrap>
      {buttons}
    </Row>
  ) : (
    <Stack gap="md">{buttons}</Stack>
  )
}

/**
 * L'accueil d'un visiteur sans vitrine, celui de R11 : la constellation, le logo et l'accroche, les
 * deux portes d'entrée, la phrase du cadenas et le pied. Le Fil le montre aussi à qui n'a pas (ou
 * pas encore) de session (HomeScreen).
 */
export function VisitorHome() {
  // Les « hooks » (fonctions qui commencent par use…) branchent l'écran sur une donnée qui change.
  // useTranslation : donne t() pour traduire, et redessine l'écran quand la langue change.
  const { t } = useTranslation()
  const pathname = usePathname()
  // La carte (scène à gauche) des écrans de marque, dès 1 000 points (R2).
  const wide = useLayout().card
  // Le choix de la langue, seulement sur une adresse sans langue (voir ShowcaseHome).
  const languageChoice = languageOfPath(pathname) === null

  return (
    // Le « miel vif » des moments de marque : sur téléphone, la constellation flotte sur le miel et
    // tout le reste (le nom, l'accroche, les deux portes d'entrée) est posé sur la feuille claire.
    // Sur ordinateur, la scène de gauche (`hero`) la montre déjà : l'ambiance ne la répète pas.
    <Screen
      ambiance="brand"
      scene={<Constellation height={280} />}
      // R2 (relecture de design de R1) : le choix de la langue sur le miel, pas en tête de la
      // feuille ; à 320 × 568, « Créer un compte » remonte ainsi au-dessus du pli.
      header={
        languageChoice ? (
          <Row justify="end">
            <LanguageSwitcher compact />
          </Row>
        ) : undefined
      }
      // R11 : la scène ne porte plus la pastille du logiciel libre ; « Le code source » est dans le
      // pied de la feuille, avec les quatre pages (planche R11-Pied).
      hero={<WelcomeHero tagline={t(($) => $.home.tagline)} />}
    >
      {/* Sur ordinateur, la scène de gauche montre déjà la constellation et le grand logo ; la
          feuille porte le nom, l'abeille devant le mot « waiggle » (R3, maquette
          R2-Desktop-Connexion). Annoncé comme sur téléphone : « Bienvenue sur Waiggle », titre 1. */}
      {wide ? (
        <Wordmark size="large" logo header={t(($) => $.home.title)} />
      ) : (
        // Sur téléphone, la constellation flotte sur le miel (`scene`) ; la feuille porte le nom.
        <Stack gap="sm">
          <Wordmark size="huge" header={t(($) => $.home.title)} />
          <Text variant="headline" tone="secondary" weight={400}>
            {t(($) => $.home.tagline)}
          </Text>
        </Stack>
      )}
      <AccountButtons row={false} />
      <Hint icon="lock-simple" text={t(($) => $.home.membersOnly)} />
      {/* R11 (planche R11-Pied) : le pied des pages publiques, sur téléphone comme sur ordinateur :
          Règles, Confidentialité, Mentions légales, Accessibilité et « Le code source » (la licence
          AGPL demande d'offrir le code à ceux qui utilisent l'appli). « Moins de mots » : la phrase
          « … est un logiciel libre » est partie, le lien suffit. Le lot suivant de R12 y ajoute
          « Signaler un contenu » et le lien vers l'autre langue, après `LegalLinks`. */}
      <LegalLinks variant="footer" />
    </Screen>
  )
}
