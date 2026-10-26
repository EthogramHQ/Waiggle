// Page « Membres bloqués » (tranche 7b, « /blocks »), ouverte depuis « Mon compte » : les membres
// que j'ai bloqués, du plus récent au plus ancien, 50 par 50 (« Afficher la suite »). Chaque ligne
// dit qui (nom, @pseudo) et depuis quand, avec « Débloquer ».
//
// Débloquer passe par une fenêtre de confirmation (règle 21 de la relecture du plan, J10 ;
// BlockDialog, la même que sur la page d'un membre) : on verra de nouveau les contenus l'un de
// l'autre, mais les abonnements retirés ne reviennent pas. Une fois débloqué, « Tu as débloqué
// @x. » le confirme en haut de la liste, et la liste se relit : la ligne s'en va.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { useBlockedMembers, useUnblock } from '../blocks/api'
import { type BlockAsking, BlockDialog } from '../blocks/BlockDialog'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { shortDate } from '../projects/format'
import { Button } from '../ui/Button'
import { FeedEnd } from '../ui/FeedEnd'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { LoadingScreen, SignedOutScreen } from './states'

export function BlockedMembersScreen() {
  const { data: session, isPending } = useSession()
  if (isPending) return <LoadingScreen />
  // Un visiteur : se connecter d'abord (et revenir ici ensuite).
  if (!session) return <SignedOutScreen />
  return <BlockedMembers />
}

function BlockedMembers() {
  const { t, i18n } = useTranslation()
  const back = useGoBack('/account')
  const list = useBlockedMembers()
  const { unblock } = useUnblock()

  // La fenêtre ouverte (qui débloquer), et le dernier déblocage fait.
  const [asking, setAsking] = useState<BlockAsking | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // « Réessayer » sur une liste en erreur : React Query efface l'erreur pendant la relecture ; on
  // garde l'écran d'erreur (et le focus sur son bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)

  // Le bouton touché disparaît avec sa ligne : le focus du clavier va au message qui confirme,
  // une fois la fenêtre refermée (avant, elle le garde pour elle).
  const doneRef = useRef<Focusable>(null)
  // Sur téléphone, il n'y a pas de focus du clavier à poser : le message est lu par son annonce
  // (polite). Sur le web, on le focalise après le fondu de la fenêtre (`onClosed`).
  const focusAfterClose = useRef(false)

  const onRetry = async () => {
    setRetrying(true)
    await list.refetch()
    setRetrying(false)
  }

  const items = list.data?.pages.flatMap((page) => page.items) ?? []
  // Une session expirée en arrivant : se reconnecter, pas réessayer.
  if (!list.data && list.isError && errorKey(list.error) === 'unauthorized')
    return <SignedOutScreen expired />
  const showsError = !list.data && (list.isError || retrying)

  return (
    <Screen header={<TopNav />} onBack={back} title={t(($) => $.block.list.title)}>
      {showsError ? (
        // Une erreur avant toute page : on dit pourquoi et on propose de réessayer. Une suite
        // ratée, elle, garde les lignes déjà lues (FeedEnd, plus bas).
        <StateMessage
          kind="error"
          title={t(($) => $.block.list.loadError)}
          message={t(($) => $.errors[errorKey(list.error)])}
          actions={[
            { label: t(($) => $.common.retry), onPress: () => void onRetry(), loading: retrying },
          ]}
        />
      ) : !list.data ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : (
        <Stack gap="lg">
          {/* Le dernier déblocage : lu sans interrompre (status), et le focus du clavier y va. Il
              reste jusqu'au déblocage suivant, au lieu de disparaître sous le doigt. */}
          {done ? <Notice ref={doneRef} tone="success" message={done} polite /> : null}
          {items.length === 0 ? (
            // Personne : un titre (lu d'abord en parcourant la page par ses titres), et comment
            // bloquer (depuis la page d'un membre). « Vous ne voyez plus… » serait faux ici.
            <StateMessage
              kind="empty"
              title={t(($) => $.block.list.empty)}
              message={t(($) => $.block.list.emptyHint)}
            />
          ) : (
            <>
              <ListGroup footer={t(($) => $.block.list.hint)}>
                {items.map(({ member, blockedAt }) => (
                  <ListRow
                    key={member.id}
                    label={member.name}
                    detail={t(($) => $.block.list.detail, {
                      handle: member.handle,
                      blockedOn: t(($) => $.block.list.blockedOn, {
                        date: shortDate(blockedAt, i18n.language),
                      }),
                    })}
                    accessory={
                      <Button
                        label={t(($) => $.block.unblock)}
                        // Toutes les lignes ont leur « Débloquer » : le nom lu dit lequel.
                        spokenLabel={t(($) => $.block.list.unblockLabel, { handle: member.handle })}
                        variant="secondary"
                        size="compact"
                        onPress={() =>
                          setAsking({
                            gesture: 'unblock',
                            member: { id: member.id, handle: member.handle },
                          })
                        }
                      />
                    }
                  />
                ))}
              </ListGroup>
              <FeedEnd
                state={
                  list.isFetchingNextPage
                    ? 'loading'
                    : list.isFetchNextPageError
                      ? 'error'
                      : list.hasNextPage
                        ? 'more'
                        : 'end'
                }
                moreLabel={t(($) => $.block.list.more)}
                endLabel={t(($) => $.block.list.end)}
                errorLabel={t(($) => $.block.list.moreError)}
                retryLabel={t(($) => $.common.retry)}
                // Une seule demande à la fois, même après un double clic.
                onMore={() => {
                  if (!list.isFetchingNextPage) void list.fetchNextPage()
                }}
              />
            </>
          )}
        </Stack>
      )}

      {/* Débloquer se confirme : les abonnements retirés au blocage ne reviennent pas. La fenêtre
          garde le pseudo pendant son fondu de fermeture (BlockDialog). */}
      <BlockDialog
        asking={asking}
        send={({ member }) => unblock(member.id)}
        onDone={({ member }) => {
          focusAfterClose.current = true
          setDone(t(($) => $.block.unblocked, { handle: member.handle }))
          setAsking(null)
        }}
        onCancel={() => setAsking(null)}
        onClosed={() => {
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          requestAnimationFrame(() => focusWithoutScroll(doneRef.current))
        }}
      />
    </Screen>
  )
}
