// La rubrique « Notifications » des réglages (R8, planche `R8-Reglages`), qui remplace la section
// « E-mails » de 6c (deux interrupteurs). En tête, un exemple de notification sans nom et ce qui
// arrive dans l'appli ; « Sur ce téléphone », grisé, « Bientôt » ; puis « Par e-mail », une ligne
// par type avec son choix actuel (« Tout de suite », « Dans le récap », « Jamais »), l'interrupteur
// du récap, et la phrase des e-mails de sécurité. Un toucher ouvre les choix d'un type sur place,
// un seul type ouvert à la fois ; chaque choix s'enregistre aussitôt (un PATCH d'un seul champ), et
// un échec rend l'ancien choix. Scénario : docs/scenarios/refonte.md, « R8 ». L'ancien lien
// /profile?section=emails mène ici (app/profile.tsx).
import {
  type EmailChoice,
  type EmailPreferences,
  type EmailPreferencesPatch,
  type EmailType,
  INSTANT_EMAIL_TYPES,
} from '@ruche/contracts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../../api/errors'
import { useEmailPreferences, useUpdateEmailPreferences } from '../../email/api'
import { useSignInAgain } from '../../navigation/signInAgain'
import { Button } from '../../ui/Button'
import { ChoiceRow, type ChoiceRowChoice } from '../../ui/ChoiceRow'
import { type Focusable, focusWithoutScroll } from '../../ui/focus'
import { ListGroup, ListRow } from '../../ui/ListGroup'
import { Notice } from '../../ui/Notice'
import { NotificationExample } from '../../ui/NotificationExample'
import { Stack } from '../../ui/Stack'
import { StatusPill } from '../../ui/StatusPill'
import { Switch } from '../../ui/Switch'
import { Text } from '../../ui/Text'

/** Les six types, dans l'ordre de la planche (celui du contrat). */
const TYPES: readonly EmailType[] = [
  'reactions',
  'comments',
  'replies',
  'follows',
  'updates',
  'testers',
]

/** Les types où « Tout de suite » se propose ; les autres n'ont que le récap ou rien. */
const offersNow = (type: EmailType) => (INSTANT_EMAIL_TYPES as readonly EmailType[]).includes(type)

export function EmailSettings() {
  const { t } = useTranslation()
  const preferences = useEmailPreferences()
  const save = useUpdateEmailPreferences()
  const signInAgain = useSignInAgain()
  const data = preferences.data

  // Le type dont les choix sont ouverts : un seul à la fois (null : aucun). Le choisir garde la
  // ligne ouverte, pour voir ce qu'on vient de cocher.
  const [open, setOpen] = useState<EmailType | null>(null)

  // « Réessayer » a marché : la ligne qui portait le bouton disparaît, et le focus du clavier, qui
  // était dessus, irait tout en haut de la page. On le pose sur la première ligne de choix, dès
  // qu'elle est dessinée (useEffect, après chaque dessin). focusFirst : une ref, pour ne pas
  // redessiner.
  const firstRow = useRef<Focusable>(null)
  const focusFirst = useRef(false)
  useEffect(() => {
    if (!focusFirst.current || !firstRow.current) return
    focusFirst.current = false
    focusWithoutScroll(firstRow.current)
  })
  // Une nouvelle lecture en cours, demandée par « Réessayer ». React Query remet alors la requête
  // « en attente » et oublie l'erreur : sans cet état, la ligne d'erreur ferait place à
  // « Chargement… », et le bouton qui avait le focus disparaîtrait.
  const [retrying, setRetrying] = useState(false)
  // Combien de « Réessayer » ont échoué : pose à neuf l'alerte qui dit pourquoi (`detailAlert`).
  // Une alerte neuve est lue par le lecteur d'écran ; la même alerte restée en place ne serait pas
  // relue (relecture de 6c).
  const [failedRetries, setFailedRetries] = useState(0)
  const retry = () => {
    focusFirst.current = true
    setRetrying(true)
    void preferences
      .refetch()
      .then((result) => {
        // Encore un échec : le focus reste sur « Réessayer », rien à déplacer.
        if (result.isError) {
          focusFirst.current = false
          setFailedRetries((count) => count + 1)
        }
      })
      .finally(() => setRetrying(false))
  }

  // La lecture a échoué, et il n'y a rien à montrer : pourquoi (la clé du message d'erreur), gardé
  // pendant la nouvelle lecture (`failedRead`).
  const readFailure = !data && preferences.isError ? errorKey(preferences.error) : null
  const [failedRead, setFailedRead] = useState(readFailure)
  if (readFailure !== null && readFailure !== failedRead) setFailedRead(readFailure)
  const loadFailure = data ? null : (readFailure ?? (retrying ? failedRead : null))

  // Le dernier échec d'un changement. Pendant l'envoi du suivant, le hook ne dit plus rien : on
  // garde le message d'avant jusqu'à sa réponse (`shown`), sinon il disparaîtrait le temps de
  // l'envoi et les lignes, posées sous lui, sauteraient deux fois sous le doigt. Une réussite
  // l'efface. (Changer un état pendant le dessin est permis à un composant pour lui-même : React le
  // redessine aussitôt.)
  const outcome = save.failure ?? (save.saved ? 'saved' : null)
  const [shown, setShown] = useState(outcome)
  if (outcome !== null && outcome !== shown) setShown(outcome)
  const saveFailure = (outcome ?? shown) === 'saved' ? null : (outcome ?? shown)

  // Le message au-dessus du groupe « Par e-mail ». Une session expirée (à la lecture ou au
  // changement) : le lien mène à la connexion. Une autre panne de lecture : rien ici, la ligne du
  // groupe dit tout (ce qui manque, pourquoi, « Réessayer »). Un changement refusé : la phrase dit
  // que ce choix n'est pas enregistré, et l'ancien est revenu.
  const expired = loadFailure === 'unauthorized' || saveFailure === 'unauthorized'
  const notice = expired ? (
    <Notice message={t(($) => $.states.expired)} action={signInAgain()} />
  ) : !loadFailure && saveFailure ? (
    <Notice message={t(($) => $.notificationSettings.saveError)} />
  ) : null

  const choicesOf = (type: EmailType): ChoiceRowChoice<EmailChoice>[] => [
    ...(offersNow(type)
      ? [{ value: 'now' as const, label: t(($) => $.notificationSettings.choices.now) }]
      : []),
    { value: 'digest', label: t(($) => $.notificationSettings.choices.digest) },
    { value: 'never', label: t(($) => $.notificationSettings.choices.never) },
  ]

  const rows = data
    ? emailRows(data)
    : loadFailure
      ? [
          // La ligne dit ce qui manque, et dessous pourquoi : une alerte, posée à neuf à chaque
          // échec (`detailAlert`). Une session expirée a sa propre notice, au-dessus du groupe.
          <ListRow
            key="loadError"
            label={t(($) => $.notificationSettings.loadError)}
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

  // Les lignes des réglages lus : une par type, puis l'interrupteur du récap.
  function emailRows(current: EmailPreferences) {
    // Le récap coupé : les types « Dans le récap » le disent, sans changer leur choix.
    const recapOff = t(($) => $.notificationSettings.recapOff)
    return [
      ...TYPES.map((type, index) => (
        <ChoiceRow<EmailChoice>
          key={type}
          ref={index === 0 ? firstRow : undefined}
          label={t(($) => $.notificationSettings.types[type])}
          value={current[type]}
          choices={choicesOf(type)}
          open={open === type}
          onToggle={() => setOpen(open === type ? null : type)}
          onChange={(choice) => choose(type, choice)}
          note={!current.weeklyRecap && current[type] === 'digest' ? recapOff : null}
        />
      )),
      <Switch
        key="weeklyRecap"
        inGroup
        label={t(($) => $.notificationSettings.recap)}
        hint={t(($) => $.notificationSettings.recapHint)}
        value={current.weeklyRecap}
        onValueChange={(weeklyRecap) => save.update({ weeklyRecap })}
      />,
    ]
  }

  // Un choix touché : il part seul (un champ), et rien ne part s'il ne change rien. Les types sans
  // « Tout de suite » ne le proposent pas : `now` ne peut leur arriver que d'un bug, écarté ici
  // plutôt que refusé par l'API (400). Après ce garde, `{ [type]: choice }` est bien l'un des
  // corps permis ; TypeScript ne sait pas relier une clé calculée à son type, d'où la conversion.
  const choose = (type: EmailType, choice: EmailChoice) => {
    if (!data || data[type] === choice) return
    if (choice === 'now' && !offersNow(type)) return
    save.update({ [type]: choice } as EmailPreferencesPatch)
  }

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <NotificationExample />
        <Text variant="caption" tone="muted">
          {t(($) => $.notificationSettings.inApp)}
        </Text>
      </Stack>
      {/* Les notifications du téléphone n'existent pas encore : la ligne se montre, grisée, sans
          rien à toucher. */}
      <ListGroup>
        <ListRow
          label={t(($) => $.notificationSettings.phone)}
          icon="device-mobile"
          disabled
          accessory={<StatusPill label={t(($) => $.notificationSettings.soon)} />}
        />
      </ListGroup>
      {notice}
      <ListGroup
        title={t(($) => $.notificationSettings.byEmail)}
        footer={t(($) => $.notificationSettings.security)}
      >
        {rows}
      </ListGroup>
    </Stack>
  )
}
