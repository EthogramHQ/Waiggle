// Les morceaux d'un fil de projets, partagés par le Fil (l'accueil d'un membre) et Explorer : la
// liste des cartes avec son bandeau des nouveautés et sa fin, l'erreur d'un fil qui n'a pas pu se
// charger, et le fil « Découvrir » (tous les projets publics, ou ceux qui cherchent des testeurs).
// Ils ont quitté `HomeScreen.tsx` tels quels en R3, quand « Découvrir » est parti dans Explorer.
import { FEED_PAGE_SIZE, type FeedItem } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { FeedNoteCard } from '../notes/FeedNoteCard'
import { SummaryCard } from '../projects/SummaryCard'
import { FeedEnd } from '../ui/FeedEnd'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Segmented } from '../ui/Segmented'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { useDiscoverFeed, useFeedNews } from './api'
import { feedItemId } from './items'

/** Le fil « Découvrir » : tous les projets publics, ou seulement ceux qui cherchent des testeurs. */
export function DiscoverFeed() {
  const { t } = useTranslation()
  const [testers, setTesters] = useState(false)
  const feed = useDiscoverFeed({ testers })
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const news = useFeedNews('discover', items[0], testers)

  return (
    <Stack gap="lg">
      <Segmented
        label={t(($) => $.feed.filter.label)}
        options={[
          { value: 'all', label: t(($) => $.feed.filter.all) },
          { value: 'testers', label: t(($) => $.feed.filter.testers) },
        ]}
        value={testers ? 'testers' : 'all'}
        onChange={(value) => setTesters(value === 'testers')}
        fill={false}
      />
      {!feed.data ? (
        feed.isError ? (
          <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
        ) : (
          <SkeletonList count={3} />
        )
      ) : (
        <FeedList
          feed={feed}
          items={items}
          news={news}
          empty={testers ? t(($) => $.feed.testersEmpty) : t(($) => $.feed.discoverEmpty)}
          caption={testers ? t(($) => $.feed.testersCaption) : t(($) => $.feed.discoverCaption)}
        />
      )}
    </Stack>
  )
}

// Ce dont la liste a besoin d'un fil chargé (une partie du résultat de useInfiniteQuery).
type LoadedFeed = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** La dernière demande de suite a échoué (les pages déjà lues restent). */
  isFetchNextPageError?: boolean
  /** La dernière relecture du fil a échoué (après le bandeau des nouveautés). */
  isRefetchError?: boolean
  error?: unknown
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
}

type FeedListProps = {
  feed: LoadedFeed
  items: FeedItem[]
  news: { count: number | null; more: boolean }
  /** Le message d'un fil vide. */
  empty: string
  /** La phrase en haut du fil, qui dit ce qu'il montre (remplacée par le bandeau des nouveautés). */
  caption: string
}

/** Les cartes d'un fil, le bandeau des nouveautés au-dessus, et la fin du fil en dessous. */
export function FeedList({ feed, items, news, empty, caption }: FeedListProps) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg">
      {/* Toujours là, à la même hauteur : le bandeau y remplace la phrase, sans rien décaler. */}
      <NewItemsBanner
        label={
          news.count === null
            ? null
            : news.more
              ? t(($) => $.feed.newsMany, { max: FEED_PAGE_SIZE })
              : t(($) => $.feed.news, { count: news.count })
        }
        // Relire le fil depuis le début : les nouveautés arrivent en haut, à la place du bandeau.
        onPress={() => feed.refetch()}
        caption={caption}
      />
      {/* La relecture du fil a échoué : on le dit, les cartes déjà là restent. */}
      {feed.isRefetchError ? <Notice message={t(($) => $.errors[errorKey(feed.error)])} /> : null}
      <ProjectGrid empty={empty}>
        {/* Un nouveau projet : sa carte ; la note d'un projet suivi : une carte de note, plus
            discrète, qui mène elle aussi au projet. */}
        {items.map((item) =>
          item.kind === 'note' ? (
            <FeedNoteCard key={feedItemId(item)} note={item.note} project={item.project} />
          ) : (
            <SummaryCard key={feedItemId(item)} project={item.project} at={item.at} />
          ),
        )}
      </ProjectGrid>
      {items.length > 0 ? (
        <FeedEnd
          state={
            feed.isFetchingNextPage
              ? 'loading'
              : feed.isFetchNextPageError
                ? 'error'
                : feed.hasNextPage
                  ? 'more'
                  : 'end'
          }
          moreLabel={t(($) => $.feed.more)}
          endLabel={t(($) => $.feed.end)}
          // « Tu es à jour » : le bout du fil est un petit moment de marque, sur le miel vif.
          ambiance="brand"
          errorLabel={t(($) => $.feed.moreError)}
          retryLabel={t(($) => $.common.retry)}
          // Une seule demande à la fois, même après un double clic.
          onMore={() => {
            if (!feed.isFetchingNextPage) void feed.fetchNextPage()
          }}
        />
      ) : null}
    </Stack>
  )
}

/** Un fil qui n'a pas pu se charger : on dit pourquoi, et on propose de réessayer. */
export function FeedError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <StateMessage
      kind="error"
      title={t(($) => $.feed.errorTitle)}
      message={t(($) => $.errors[errorKey(error)])}
      // « Réessayer » en blanc : sur l'accueil, la seule action miel reste « Publier un projet »,
      // dans la barre du haut (une seule action miel par écran).
      actions={[{ label: t(($) => $.common.retry), onPress: onRetry, variant: 'secondary' }]}
    />
  )
}
