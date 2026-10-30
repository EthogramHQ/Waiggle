// La section « E-mails » des réglages (tranche 6c), déplacée de « Mon profil » en R2 : elle sert à
// la rubrique « Notifications » des réglages, et seulement à elle (l'ancien lien
// /profile?section=emails y mène, app/profile.tsx). Deux interrupteurs, enregistrés chacun dès
// qu'on le touche.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ApiErrorKey, errorKey } from '../../api/errors'
import { useEmailPreferences, useUpdateEmailPreferences } from '../../email/api'
import { useSignInAgain } from '../../navigation/signInAgain'
import { Button } from '../../ui/Button'
import { type Focusable, focusWithoutScroll } from '../../ui/focus'
import { ListGroup, ListRow } from '../../ui/ListGroup'
import { Notice } from '../../ui/Notice'
import { Stack } from '../../ui/Stack'
import { Switch } from '../../ui/Switch'
import { Text } from '../../ui/Text'

/**
 * La section « E-mails » : le récap de la semaine (activé par défaut) et l'e-mail de mentions et de
 * réponses (désactivé par défaut). Chaque interrupteur s'enregistre au toucher, ce que dit la phrase
 * sous le groupe : la section n'est pas une partie du formulaire à « Enregistrer », d'où aussi son
 * propre titre, plus grand que celui d'un groupe. Entre ce titre et le groupe, la confirmation
 * (« Réglage enregistré. ») ou ce qui n'a pas marché : sur téléphone, la section est au bas de la
 * page, et un message posé sous le groupe sortait de l'écran (relecture de design, 6c).
 */
export function EmailSettings({ titled = true }: { titled?: boolean }) {
  const { t } = useTranslation()
  const preferences = useEmailPreferences()
  const save = useUpdateEmailPreferences()
  const signInAgain = useSignInAgain()
  const data = preferences.data

  // « Réessayer » a marché : la ligne qui portait le bouton disparaît, et le focus du clavier, qui
  // était dessus, irait tout en haut de la page. On le pose sur le premier interrupteur, dès qu'il
  // est dessiné (useEffect, après chaque dessin). focusFirst : une ref, pour ne pas redessiner.
  const firstSwitch = useRef<Focusable>(null)
  const focusFirst = useRef(false)
  useEffect(() => {
    if (!focusFirst.current || !firstSwitch.current) return
    focusFirst.current = false
    focusWithoutScroll(firstSwitch.current)
  })
  // Une nouvelle lecture en cours, demandée par « Réessayer ». React Query remet alors la requête
  // « en attente » et oublie l'erreur : sans cet état, la ligne d'erreur ferait place à
  // « Chargement… », et le bouton qui avait le focus disparaîtrait.
  const [retrying, setRetrying] = useState(false)
  // Combien de « Réessayer » ont échoué : pose à neuf l'alerte qui dit pourquoi (`detailAlert`).
  // Une alerte neuve est lue par le lecteur d'écran ; la même alerte restée en place ne serait pas
  // relue, et le membre n'entendrait que la fin de l'attente (relecture de 6c).
  const [failedRetries, setFailedRetries] = useState(0)
  const retry = () => {
    focusFirst.current = true
    setRetrying(true)
    void preferences
      .refetch()
      .then((result) => {
        // Encore un échec : le focus reste sur « Réessayer », rien à déplacer ; l'alerte est
        // posée à neuf.
        if (result.isError) {
          focusFirst.current = false
          setFailedRetries((count) => count + 1)
        }
      })
      .finally(() => setRetrying(false))
  }

  // La lecture a échoué, et il n'y a rien à montrer : pourquoi (la clé du message d'erreur),
  // gardé pendant la nouvelle lecture (`failedRead`).
  const readFailure = !data && preferences.isError ? errorKey(preferences.error) : null
  const [failedRead, setFailedRead] = useState(readFailure)
  if (readFailure !== null && readFailure !== failedRead) setFailedRead(readFailure)
  const loadFailure = data ? null : (readFailure ?? (retrying ? failedRead : null))

  // Ce qu'a donné le dernier changement : enregistré, ou la raison de l'échec. Pendant l'envoi du
  // suivant, le hook ne dit plus rien (ni « enregistré » ni échec) : on garde le message d'avant
  // (`shown`), sinon il disparaîtrait le temps de l'envoi et les interrupteurs, posés sous lui,
  // sauteraient deux fois sous le doigt. (Changer un état pendant le dessin est permis à un
  // composant pour lui-même : React le redessine aussitôt.)
  const outcome: ApiErrorKey | 'saved' | null = save.failure ?? (save.saved ? 'saved' : null)
  const [shown, setShown] = useState(outcome)
  if (outcome !== null && outcome !== shown) setShown(outcome)
  const last = outcome ?? shown

  // Les réglages ne sont pas encore là : une ligne d'attente, plutôt que des interrupteurs dont la
  // position serait fausse. Ils n'ont pas pu se charger : la ligne le dit, puis « Réessayer »
  // (occupé pendant la nouvelle lecture). Une session expirée : réessayer ne servirait à rien, le
  // lien de l'alerte mène à la connexion ; pas de bouton.
  const rows = data
    ? [
        <Switch
          key="weeklyRecap"
          ref={firstSwitch}
          inGroup
          label={t(($) => $.profile.emails.weeklyRecap)}
          hint={t(($) => $.profile.emails.weeklyRecapHint)}
          value={data.weeklyRecap}
          onValueChange={(weeklyRecap) => save.update({ weeklyRecap })}
        />,
        <Switch
          key="mentionEmails"
          inGroup
          label={t(($) => $.profile.emails.mentionEmails)}
          hint={t(($) => $.profile.emails.mentionEmailsHint)}
          value={data.mentionEmails}
          onValueChange={(mentionEmails) => save.update({ mentionEmails })}
        />,
      ]
    : loadFailure
      ? [
          // La ligne dit ce qui manque, et dessous pourquoi : une alerte, posée à neuf à chaque
          // échec (`detailAlert`), pour être relue même si le focus reste sur « Réessayer ». Une
          // session expirée a sa propre notice, au-dessus du groupe, avec son lien.
          <ListRow
            key="loadError"
            label={t(($) => $.profile.emails.loadError)}
            {...(loadFailure === 'unauthorized'
              ? null
              : { detail: t(($) => $.errors[loadFailure]), detailAlert: failedRetries })}
            accessory={
              loadFailure === 'unauthorized' ? null : (
                <Button
                  label={t(($) => $.common.retry)}
                  variant="secondary"
                  size="compact"
                  loading={retrying}
                  onPress={retry}
                />
              )
            }
          />,
        ]
      : [<ListRow key="loading" label={t(($) => $.common.loading)} busy />]

  // Le message entre le titre et le groupe. Une session expirée (à la lecture ou au changement) :
  // le lien mène à la connexion. Une autre panne de lecture : rien ici, la ligne du groupe dit
  // tout (ce qui manque, pourquoi, « Réessayer ») ; une alerte au-dessus redisait la même chose
  // (relecture de design globale du 22/10/2026).
  const failure = loadFailure ?? (last === 'saved' ? null : last)
  const notice =
    failure === 'unauthorized' ? (
      <Notice message={t(($) => $.states.expired)} action={signInAgain()} />
    ) : loadFailure ? null : failure ? (
      <Notice message={t(($) => $.errors[failure])} />
    ) : last === 'saved' ? (
      // Une confirmation, lue sans couper ce que disait le lecteur d'écran (role « status »).
      <Notice tone="success" message={t(($) => $.profile.emails.saved)} polite />
    ) : null

  // paddingY : un peu plus d'air au-dessus du titre, pour que la section se détache du formulaire.
  // Sans titre (`titled` faux) : la rubrique « Notifications » des réglages porte déjà le sien.
  return (
    <Stack gap="md" {...(titled ? { paddingY: 'lg' as const } : null)}>
      {titled ? (
        <Text variant="heading" heading={2}>
          {t(($) => $.profile.emails.title)}
        </Text>
      ) : null}
      {notice}
      <ListGroup
        footer={[t(($) => $.profile.emails.instant), t(($) => $.profile.emails.accountEmails)]}
      >
        {rows}
      </ListGroup>
    </Stack>
  )
}
