// Un retour d'Éclaireuse ouvert dans la page de tri (R20, planches R20-Tri, R20-Tri-Telephone et
// R20-Corrige) : sa sorte, sa gravité, sa mission, son autrice et sa date, son texte entier (en
// texte brut, jamais en Markdown : choix 15 du plan), la capture (qu'on agrandit), ce qui est joint
// (en texte, jamais en lien : relecture de sécurité A3), le statut, et la note privée.
//
// - Ouvrir un retour ne le marque pas « Lu » : seul l'administrateur change un statut.
// - « Corrigé » demande une confirmation (l'annonce part aussitôt chez l'Éclaireuse et ne se
//   reprend pas), avec une note facultative pour elle. Un retour corrigé ne change plus de statut
//   (contrat : `scout_report_fixed`) : ses choix sont inactifs.
// - La note privée s'enregistre par son bouton ; l'aide dit que l'Éclaireuse la retrouve dans son
//   export (relecture juridique J2).
import {
  SCOUT_ADMIN_NOTE_MAX,
  SCOUT_FIXED_NOTE_MAX,
  type ScoutReportAdmin,
  type ScoutTriageStatus,
} from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../../api/errors'
import { useMediaSources } from '../../api/media'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Choices } from '../../ui/Choices'
import { Dialog } from '../../ui/Dialog'
import { type Fact, FactList } from '../../ui/FactList'
import { LiveStatus } from '../../ui/LiveStatus'
import { Notice } from '../../ui/Notice'
import { OpenableImage } from '../../ui/OpenableImage'
import { parisDateTime } from '../../ui/parisTime'
import { SeverityPill, StatusLabel } from '../../ui/ScoutTriageRow'
import { Stack } from '../../ui/Stack'
import { Tag } from '../../ui/Tag'
import { Text } from '../../ui/Text'
import { TextField } from '../../ui/TextField'
import { usePatchScoutReport } from './api'
import { kindIcon, statusLook } from './look'

const TRIAGE_STATUSES = [
  'read',
  'planned',
  'fixed',
  'parked',
] as const satisfies ScoutTriageStatus[]

const STATUS_ICONS = {
  read: 'eye',
  planned: 'calendar-blank',
  fixed: 'check-circle',
  parked: 'bookmark-simple',
} as const

export function ReportDetail({ report }: { report: ScoutReportAdmin }) {
  const { t, i18n } = useTranslation()
  const patch = usePatchScoutReport()
  const note = usePatchScoutReport()
  const sources = useMediaSources()
  const name = report.author.name
  // Le statut touché, montré tout de suite (avant la relecture de la liste) ; la page remonte ce
  // composant quand on ouvre un autre retour (`key`), qui repart du statut reçu.
  const [chosen, setChosen] = useState<ScoutTriageStatus | null>(null)
  const status = chosen ?? report.status
  const [fixOpen, setFixOpen] = useState(false)
  const [fixedNote, setFixedNote] = useState('')
  const [adminNote, setAdminNote] = useState(report.adminNote ?? '')
  const [saved, setSaved] = useState('')

  const change = (next: ScoutTriageStatus) => {
    if (patch.isPending || next === status) return
    if (next === 'fixed') {
      setFixedNote('')
      setFixOpen(true)
      return
    }
    setChosen(next)
    patch.mutate({ id: report.id, patch: { status: next } })
  }

  const confirmFixed = () => {
    if (patch.isPending) return
    const text = fixedNote.trim()
    patch.mutate(
      { id: report.id, patch: { status: 'fixed', ...(text ? { fixedNote: text } : null) } },
      {
        onSuccess: () => {
          setChosen('fixed')
          setFixOpen(false)
        },
      },
    )
  }

  const saveNote = () => {
    if (note.isPending) return
    setSaved('')
    note.mutate(
      { id: report.id, patch: { adminNote: adminNote.trim() || null } },
      { onSuccess: () => setSaved(t(($) => $.scout.triage.noteSaved)) },
    )
  }

  const context = report.context
  const facts: Fact[] = context
    ? [
        { label: t(($) => $.scout.sheet.fields.screen), value: context.screen, mono: true },
        {
          label: t(($) => $.scout.sheet.fields.device),
          value: t(($) => $.scout.sheet.deviceValue, {
            platform: t(($) => $.scout.sheet.platforms[context.platform]),
            width: context.width,
          }),
        },
        // Sans version (développement), la ligne ne s'affiche pas.
        ...(context.appVersion
          ? [
              {
                label: t(($) => $.scout.sheet.fields.version),
                value: context.appVersion,
                mono: true,
              },
            ]
          : []),
        {
          label: t(($) => $.scout.sheet.fields.language),
          value: t(($) => $.common.languages[context.language]),
        },
        {
          label: t(($) => $.scout.sheet.fields.theme),
          value: t(($) => $.scout.sheet.schemes[context.scheme]),
        },
      ]
    : []
  const capture = sources(report.mediaUrl)
  const look = statusLook(t, report.status)

  return (
    <Stack gap="lg">
      <Stack direction="row" wrap gap="sm" align="center">
        <Tag label={t(($) => $.scout.kinds[report.kind])} icon={kindIcon[report.kind]} />
        {report.severity ? (
          <SeverityPill
            label={t(($) => $.scout.severities[report.severity ?? 'minor'])}
            strong={report.severity === 'blocking'}
          />
        ) : null}
        {report.mission ? (
          <Tag
            label={t(($) => $.scout.triage.missionLabel, { mission: report.mission?.text ?? '' })}
            icon="flag"
          />
        ) : null}
        <StatusLabel {...look} />
      </Stack>
      <Stack direction="row" gap="sm" align="center">
        <Avatar name={name} source={sources(report.author.avatarUrl)} label="" size={36} />
        <Stack gap="none">
          <Text variant="headline">{name}</Text>
          <Text variant="caption" tone="muted">
            {parisDateTime(report.createdAt, i18n.language).dateTime}
          </Text>
        </Stack>
      </Stack>
      {/* Le texte d'un membre, tel qu'il l'a écrit : jamais interprété (ni Markdown, ni lien). */}
      <Text variant="lead" breakAnywhere selectable>
        {report.text}
      </Text>
      {report.fixedNote ? (
        <Notice
          tone="neutral"
          icon="check-circle"
          message={t(($) => $.scout.fixedNote, { note: report.fixedNote ?? '' })}
        />
      ) : null}
      <Stack direction="row" wrap gap="md" align="start">
        {capture ? (
          <OpenableImage
            source={capture}
            label={t(($) => $.scout.triage.openCapture)}
            maxHeight={200}
            maxWidth={140}
          />
        ) : null}
        <Stack grow>
          <FactList
            title={t(($) => $.scout.triage.attached)}
            facts={facts}
            empty={t(($) => $.scout.triage.nothingAttached)}
          />
        </Stack>
      </Stack>
      <Choices<ScoutTriageStatus>
        label={t(($) => $.scout.triage.status)}
        options={TRIAGE_STATUSES.map((value) => ({
          value,
          label: t(($) => $.scout.statuses[value]),
          icon: STATUS_ICONS[value],
        }))}
        value={status === 'sent' ? null : status}
        onChange={change}
        disabled={status === 'fixed'}
      />
      {patch.isError && !fixOpen ? (
        <Notice message={t(($) => $.errors[errorKey(patch.error)])} />
      ) : null}
      <Stack gap="sm">
        <TextField
          label={t(($) => $.scout.triage.privateNote)}
          value={adminNote}
          onChangeText={(text) => {
            setAdminNote(text)
            setSaved('')
          }}
          hint={t(($) => $.scout.triage.privateNoteHint, { name })}
          keepHint
          limit={SCOUT_ADMIN_NOTE_MAX}
          maxLines={6}
          error={note.isError ? t(($) => $.errors[errorKey(note.error)]) : undefined}
          success={saved || undefined}
        />
        <Stack direction="row">
          <Button
            label={t(($) => $.scout.triage.saveNote)}
            variant="secondary"
            onPress={saveNote}
            loading={note.isPending}
          />
        </Stack>
        <LiveStatus message={saved} visible={false} />
      </Stack>

      <Dialog
        visible={fixOpen}
        title={t(($) => $.scout.triage.fixTitle)}
        message={t(($) => $.scout.triage.fixBody, { name })}
        busy={patch.isPending}
        error={patch.isError ? t(($) => $.errors[errorKey(patch.error)]) : undefined}
        onDismiss={() => setFixOpen(false)}
        body={
          <TextField
            label={t(($) => $.scout.triage.fixNote, { name })}
            value={fixedNote}
            onChangeText={setFixedNote}
            hint={t(($) => $.scout.triage.fixNoteHint)}
            keepHint
            limit={SCOUT_FIXED_NOTE_MAX}
            showCount
          />
        }
      >
        <Button
          label={t(($) => $.scout.triage.fixConfirm)}
          icon="check-circle"
          onPress={confirmFixed}
          loading={patch.isPending}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => setFixOpen(false)}
          disabled={patch.isPending}
        />
      </Dialog>
    </Stack>
  )
}
