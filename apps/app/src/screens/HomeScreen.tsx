// L'écran d'accueil. En React, un écran est une fonction qui renvoie ce qu'il faut afficher (du JSX,
// cette syntaxe qui ressemble à du HTML). React Native traduit ensuite ses éléments en vrais
// éléments iOS, Android ou web.
//
// Deux visages : pour un visiteur, la constellation, le logo et l'invitation à créer un compte ;
// pour un membre connecté, ses raccourcis (publier, ses projets, son compte) puis le fil, en deux
// choix : « Abonnements » (les nouveaux projets des personnes suivies) et « Découvrir » (tous les
// projets publics, ou ceux qui cherchent des testeurs). Le fil se lit 20 par 20, jusqu'à « Tu es à
// jour », et un bandeau annonce les nouveautés sans jamais faire bouger ce qu'on lit.
import { sourceUrl } from '@ruche/brand'
import { FEED_PAGE_SIZE, type FeedItem } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { type FeedKind, useDiscoverFeed, useFeedNews, useFollowingFeed } from '../feed/api'
import { feedItemId } from '../feed/items'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { SummaryCard } from '../projects/SummaryCard'
import { Button } from '../ui/Button'
import { Constellation } from '../ui/Constellation'
import { FeedEnd } from '../ui/FeedEnd'
import { Hint } from '../ui/Hint'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { WelcomeHero } from '../ui/WelcomeHero'
import { Wordmark } from '../ui/Wordmark'

export function HomeScreen() {
  // useSession : le membre connecté, ou null. L'écran se redessine à la connexion / déconnexion.
  const { data: session } = useSession()
  return session ? <MemberHome id={session.user.id} name={session.user.name} /> : <VisitorHome />
}

function VisitorHome() {
  // Les « hooks » (fonctions qui commencent par use…) branchent l'écran sur une donnée qui change.
  // useTranslation : donne t() pour traduire, et redessine l'écran quand la langue change.
  const { t } = useTranslation()
  const router = useRouter()
  const openOutside = useOpenOutside()
  const { sizeClass } = useLayout()
  const wide = sizeClass === 'wide'

  return (
    <Screen
      hero={
        <WelcomeHero
          tagline={t('home.tagline')}
          source={{
            note: t('home.openSource'),
            link: t('home.seeCode'),
            onPress: () => openOutside(sourceUrl),
          }}
        />
      }
    >
      <Row justify="end">
        <LanguageSwitcher compact />
      </Row>
      {/* Sur ordinateur, la scène de gauche montre déjà la constellation et le logo. */}
      {wide ? (
        <Text variant="title3" accessibilityRole="header">
          {t('home.title')}
        </Text>
      ) : (
        <>
          <Constellation height={280} />
          <Stack gap="sm">
            <Wordmark size="huge" header={t('home.title')} />
            <Text variant="headline" tone="secondary" weight={400}>
              {t('home.tagline')}
            </Text>
          </Stack>
        </>
      )}
      <Stack gap="md">
        <Button label={t('home.signUp')} onPress={() => router.push('/sign-up')} />
        <Button
          label={t('home.haveAccount')}
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
      </Stack>
      <Hint icon="lock-simple" text={t('home.membersOnly')} />
      {/* Sur téléphone, pas de scène à gauche : le lien vers le code source se place ici. */}
      {wide ? null : (
        <Row gap="xs" justify="center" wrap>
          <Text variant="caption" tone="muted">
            {t('home.openSource')}
          </Text>
          <TextLink label={t('home.seeCode')} onPress={() => openOutside(sourceUrl)} />
        </Row>
      )}
    </Screen>
  )
}

function MemberHome({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  // Le fil choisi : « Abonnements » d'abord, puis « Découvrir » d'un toucher.
  const [feed, setFeed] = useState<FeedKind>('following')
  return (
    // pageTitle null : l'onglet porte le seul nom de l'appli, pas « Bonjour Léa ! ».
    <Screen
      width="page"
      header={<TopNav hideNewProject />}
      title={t('home.greeting', { name })}
      pageTitle={null}
    >
      <Row gap="sm" wrap>
        <Button
          label={t('home.publish')}
          icon="plus"
          size="compact"
          onPress={() => router.push('/projects/new')}
        />
        <Button
          label={t('home.myProjects')}
          variant="secondary"
          icon="squares-four"
          size="compact"
          onPress={() => router.push({ pathname: '/members/[id]', params: { id } })}
        />
        <Button
          label={t('home.account')}
          variant="secondary"
          icon="user"
          size="compact"
          onPress={() => router.push('/account')}
        />
      </Row>
      <Segmented
        label={t('feed.label')}
        options={[
          { value: 'following', label: t('feed.tabs.following'), icon: 'users' },
          { value: 'discover', label: t('feed.tabs.discover'), icon: 'compass' },
        ]}
        value={feed}
        onChange={setFeed}
      />
      {feed === 'following' ? (
        <FollowingFeed onDiscover={() => setFeed('discover')} />
      ) : (
        <DiscoverFeed />
      )}
    </Screen>
  )
}

/** Le fil « Abonnements » : les nouveaux projets des personnes suivies. */
function FollowingFeed({ onDiscover }: { onDiscover: () => void }) {
  const { t } = useTranslation()
  const feed = useFollowingFeed()
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const news = useFeedNews('following', items[0])

  if (feed.isError) return <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
  if (!feed.data) return <StateMessage kind="loading" message={t('common.loading')} />
  // Ne suivre personne n'est pas une erreur : on montre où trouver des personnes à suivre.
  if (items.length === 0 && !feed.data.pages[0]?.followsAnyone) {
    return (
      <StateMessage
        kind="empty"
        title={t('feed.nobodyTitle')}
        message={t('feed.nobodyBody')}
        actions={[{ label: t('feed.nobodyAction'), onPress: onDiscover }]}
      />
    )
  }
  return <FeedList feed={feed} items={items} news={news} empty={t('feed.quiet')} />
}

/** Le fil « Découvrir » : tous les projets publics, ou seulement ceux qui cherchent des testeurs. */
function DiscoverFeed() {
  const { t } = useTranslation()
  const [testers, setTesters] = useState(false)
  const feed = useDiscoverFeed({ testers })
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const news = useFeedNews('discover', items[0], testers)

  return (
    <Stack gap="lg">
      <Segmented
        label={t('feed.filter.label')}
        options={[
          { value: 'all', label: t('feed.filter.all') },
          { value: 'testers', label: t('feed.filter.testers') },
        ]}
        value={testers ? 'testers' : 'all'}
        onChange={(value) => setTesters(value === 'testers')}
        fill={false}
      />
      {feed.isError ? (
        <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
      ) : !feed.data ? (
        <StateMessage kind="loading" message={t('common.loading')} />
      ) : (
        <FeedList
          feed={feed}
          items={items}
          news={news}
          empty={testers ? t('feed.testersEmpty') : t('feed.discoverEmpty')}
        />
      )}
    </Stack>
  )
}

// Ce dont la liste a besoin d'un fil chargé (une partie du résultat de useInfiniteQuery).
type LoadedFeed = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
}

type FeedListProps = {
  feed: LoadedFeed
  items: FeedItem[]
  news: { count: number | null; more: boolean }
  /** Le message d'un fil vide. */
  empty: string
}

/** Les cartes d'un fil, le bandeau des nouveautés au-dessus, et la fin du fil en dessous. */
function FeedList({ feed, items, news, empty }: FeedListProps) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg">
      {news.count === null ? null : (
        <NewItemsBanner
          label={
            news.more
              ? t('feed.newsMany', { max: FEED_PAGE_SIZE })
              : t('feed.news', { count: news.count })
          }
          // Relire le fil depuis le début : les nouveautés arrivent en haut, à la place du bandeau.
          onPress={() => void feed.refetch()}
        />
      )}
      <ProjectGrid empty={empty}>
        {items.map((item) => (
          <SummaryCard key={feedItemId(item)} project={item.project} at={item.at} />
        ))}
      </ProjectGrid>
      {items.length > 0 ? (
        <FeedEnd
          state={feed.isFetchingNextPage ? 'loading' : feed.hasNextPage ? 'more' : 'end'}
          moreLabel={t('feed.more')}
          endLabel={t('feed.end')}
          onMore={() => void feed.fetchNextPage()}
        />
      ) : null}
    </Stack>
  )
}

/** Un fil qui n'a pas pu se charger : on dit pourquoi, et on propose de réessayer. */
function FeedError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <StateMessage
      kind="error"
      title={t('feed.errorTitle')}
      message={t(`errors.${errorKey(error)}`)}
      actions={[{ label: t('common.retry'), onPress: onRetry }]}
    />
  )
}
