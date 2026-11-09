// « Changements récents », en bas des pages « Outils » et « Catégories » de la Modération (tranche
// R6b) : le journal du catalogue, du plus récent au plus ancien (qui a changé quoi, et quand). Une
// seule copie pour les deux pages (charte du design : un composant dès la deuxième copie) ; la page
// « Outils » garde pour l'instant la sienne, en attendant d'y passer (voir le rapport de U9).
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import type { useCatalogueChanges } from '../moderation/catalogue-api'
import { CatalogueChangeRow } from '../ui/CatalogueChangeRow'
import { FeedEnd } from '../ui/FeedEnd'
import { Notice } from '../ui/Notice'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'

/** L'état du bas d'une liste par pages : chargement de la suite, panne, suite à demander, ou fin. */
export const listState = (list: {
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  hasNextPage: boolean
}) =>
  list.isFetchingNextPage
    ? ('loading' as const)
    : list.isFetchNextPageError
      ? ('error' as const)
      : list.hasNextPage
        ? ('more' as const)
        : ('end' as const)

/** Le journal, tel que la page l'a lu (`useCatalogueChanges()`). */
export function CatalogueRecentChanges({
  changes,
}: {
  changes: ReturnType<typeof useCatalogueChanges>
}) {
  const { t } = useTranslation()
  const items = changes.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {t(($) => $.moderation.catalogue.changes)}
      </Text>
      {changes.isError && !changes.data ? (
        // Une panne du journal ne prend pas toute la page : les cartes au-dessus restent.
        <Notice
          message={t(($) => $.errors[errorKey(changes.error)])}
          action={{
            label: t(($) => $.common.retry),
            role: 'button',
            onPress: () => void changes.refetch({ cancelRefetch: false }),
          }}
        />
      ) : !changes.data ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : items.length === 0 ? (
        <Text variant="callout" tone="secondary">
          {t(($) => $.moderation.catalogue.changesEmpty)}
        </Text>
      ) : (
        <Stack gap="md">
          <Stack gap="md" accessibilityRole="list">
            {items.map((change) => (
              <CatalogueChangeRow key={change.id} change={change} />
            ))}
          </Stack>
          {changes.hasNextPage || changes.isFetchNextPageError ? (
            <FeedEnd
              state={listState(changes)}
              moreLabel={t(($) => $.moderation.more)}
              errorLabel={t(($) => $.moderation.moreError)}
              retryLabel={t(($) => $.common.retry)}
              // Une seule demande à la fois, même après un double clic.
              onMore={() => {
                if (!changes.isFetchingNextPage) void changes.fetchNextPage()
              }}
            />
          ) : null}
        </Stack>
      )}
    </Stack>
  )
}
