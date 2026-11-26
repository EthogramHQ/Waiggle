// L'onglet « Éclaireuses » de la page de tri (R20, planche R20-Missions-Admin, en bas) : chaque
// Éclaireuse, sa date d'entrée, son nombre de retours, et « Retirer » pour un abus. Une Éclaireuse
// retirée reste dans la liste, avec « Retirée le … » à la place du bouton.
//
// « Retirer » demande une confirmation avec un motif **obligatoire** (relecture juridique du plan,
// J1) : il part dans l'Activité de l'Éclaireuse et dans son export. Sans motif, rien n'est envoyé
// et le champ se dit invalide. Le retrait ne se reprend pas ; sa place se libère.
import { SCOUT_REMOVAL_REASON_MAX, type ScoutTriage } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../../api/errors'
import { useMediaSources } from '../../api/media'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { ListGroup, ListRow } from '../../ui/ListGroup'
import { shortDate } from '../../ui/relativeDate'
import { Stack } from '../../ui/Stack'
import { StateMessage } from '../../ui/StateMessage'
import { Text } from '../../ui/Text'
import { TextField } from '../../ui/TextField'
import { useRemoveScout } from './api'

type Scout = ScoutTriage['scouts'][number]

export function ScoutList({ scouts }: { scouts: ScoutTriage['scouts'] }) {
  const { t, i18n } = useTranslation()
  const sources = useMediaSources()
  const remove = useRemoveScout()
  // L'Éclaireuse visée, gardée pendant le fondu de fermeture (le titre ne change pas sous les yeux).
  const [target, setTarget] = useState<Scout | null>(null)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)

  const ask = (scout: Scout) => {
    if (remove.isPending) return
    remove.reset()
    setTarget(scout)
    setReason('')
    setMissing(false)
    setOpen(true)
  }

  const confirm = () => {
    if (!target || remove.isPending) return
    const text = reason.trim()
    if (text === '') {
      setMissing(true)
      return
    }
    remove.mutate({ memberId: target.member.id, reason: text }, { onSuccess: () => setOpen(false) })
  }

  if (scouts.length === 0) {
    return <StateMessage kind="empty" message={t(($) => $.scout.triage.scouts.empty)} />
  }

  const name = target?.member.name ?? ''
  return (
    <>
      <ListGroup>
        {scouts.map((scout) => {
          const removeLabel = t(($) => $.scout.triage.scouts.remove)
          return (
            <ListRow
              key={scout.member.id}
              label={scout.member.name}
              detail={`@${scout.member.handle} · ${t(($) => $.scout.triage.scouts.joined)} ${shortDate(scout.joinedAt, i18n.language)}`}
              leading={
                <Avatar
                  name={scout.member.name}
                  source={sources(scout.member.avatarUrl)}
                  label=""
                  size={36}
                />
              }
              trailing={
                <Stack direction="row" align="center" gap="md">
                  <Text
                    variant="callout"
                    tabular
                    accessibilityLabel={`${t(($) => $.scout.triage.scouts.reports)} : ${scout.reports}`}
                  >
                    {String(scout.reports)}
                  </Text>
                  {scout.removedAt ? (
                    <Text variant="caption" tone="muted">
                      {t(($) => $.scout.triage.scouts.removed, {
                        date: shortDate(scout.removedAt, i18n.language),
                      })}
                    </Text>
                  ) : (
                    <Button
                      label={removeLabel}
                      // Un « Retirer » par rangée : le nom lu dit qui.
                      spokenLabel={`${removeLabel} : ${scout.member.name}`}
                      variant="secondary"
                      size="compact"
                      onPress={() => ask(scout)}
                    />
                  )}
                </Stack>
              }
            />
          )
        })}
      </ListGroup>
      <Dialog
        visible={open}
        title={t(($) => $.scout.triage.scouts.removeTitle, { name })}
        message={t(($) => $.scout.triage.scouts.removeBody)}
        busy={remove.isPending}
        error={remove.isError ? t(($) => $.errors[errorKey(remove.error)]) : undefined}
        onDismiss={() => setOpen(false)}
        body={
          <TextField
            label={t(($) => $.scout.triage.scouts.reason)}
            value={reason}
            onChangeText={(text) => {
              setReason(text)
              setMissing(false)
            }}
            hint={t(($) => $.scout.triage.scouts.reasonHint)}
            keepHint
            invalid={missing}
            limit={SCOUT_REMOVAL_REASON_MAX}
            maxLines={4}
          />
        }
      >
        <Button
          label={t(($) => $.scout.triage.scouts.confirm)}
          variant="danger"
          onPress={confirm}
          loading={remove.isPending}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => setOpen(false)}
          disabled={remove.isPending}
        />
      </Dialog>
    </>
  )
}
