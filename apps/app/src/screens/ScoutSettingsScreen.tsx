// Les réglages « Les Éclaireuses » (« /settings/scouts », tranche R20, planche R20-Reglages),
// ouverts depuis la liste des réglages :
//
// - un membre qui n'est pas Éclaireuse lit ce que sont les Éclaireuses, puis « J'ai un code », qui
//   déplie le champ du code, ce que l'entrée change (relecture juridique J1) et « Rejoindre les
//   Éclaireuses ». Un code faux est refusé sous le champ, comme un code d'invitation faux ; « Les 30
//   places sont prises. » et « Le mois des Éclaireuses est fini. » ne sont pas des fautes : une
//   notice neutre, sans rouge ;
// - une Éclaireuse lit son sceau et « Depuis le … » ; pendant le mois, « Afficher la Goutte » et
//   la rangée des missions de la semaine ; puis « Mes retours », chacun avec son menu « ⋯ »
//   (« Supprimer ce retour », après confirmation) ;
// - une Éclaireuse retirée lit « Retirée le … » et « Mes retours » (ce sont ses données, J1) ;
//   après le mois, « Mes retours » reste aussi.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import type { MeScout, ScoutReport } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import {
  useDeleteScoutReport,
  useJoinScouts,
  useMyScoutReports,
  useScoutSettings,
} from '../scout/api'
import { kindLook, myStatusLook, severityLook } from '../scout/look'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Disclosure } from '../ui/Disclosure'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ListGroup, ListRow, ListRowSkeleton, type PressEvent } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { shortDate } from '../ui/relativeDate'
import { ScoutReportRow } from '../ui/ScoutReportRow'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Switch } from '../ui/Switch'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { WaxSeal } from '../ui/WaxSeal'
import { LoadErrorScreen, LoadingScreen } from './states'

const MISSIONS_HREF = '/scout/missions'

/** L'attente : la forme d'une liste, à la largeur d'un formulaire, comme les autres réglages. */
const waiting = <LoadingScreen shape="list" width="form" />

export function ScoutSettingsScreen() {
  // La garde commune (attente, erreur, visiteur) : le profil ne se lit qu'avec une session.
  return <SessionGate loading={waiting}>{() => <ScoutSettings />}</SessionGate>
}

function ScoutSettings() {
  const { t } = useTranslation()
  const me = useMe()
  const back = useGoBack('/settings')
  const titleRef = useRef<Focusable>(null)

  if (me.error && !me.data)
    return (
      <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} fallback="/settings" />
    )
  if (!me.data) return waiting
  const scout = me.data.scout

  return (
    <Screen
      header={<TopNav inSettings />}
      onBack={back}
      backLabel={t(($) => $.settings.title)}
      title={t(($) => $.scout.name)}
      titleRef={titleRef}
    >
      {scout === null ? (
        <JoinScouts
          // Entrée : le champ et son bouton disparaissent ; le focus passe au titre de la page,
          // qui reste, et le lecteur d'écran reprend de là (le sceau, puis les réglages).
          onJoined={() => {
            if (!focusWithoutScroll(titleRef.current)) moveReaderTo(titleRef.current)
          }}
        />
      ) : (
        <Stack gap="lg">
          <ScoutHead scout={scout} />
          {scout.active ? <ScoutOptions scout={scout} /> : null}
          <MyReports titleRef={titleRef} />
        </Stack>
      )}
    </Screen>
  )
}

// --- Un membre qui n'est pas Éclaireuse ---

/** « J'ai un code », qui déplie le champ du code, ce que l'entrée change et « Rejoindre ». */
function JoinScouts({ onJoined }: { onJoined: () => void }) {
  const { t } = useTranslation()
  const join = useJoinScouts()
  const [code, setCode] = useState('')
  // Le code tapé, aussi gardé hors de l'état React : « Rejoindre » touché juste après la dernière
  // lettre lit ce qui est tapé, même si l'écran n'a pas encore été redessiné avec.
  const typedRef = useRef('')
  // Le refus du dernier essai : sous le champ pour un code faux, en notice pour le reste.
  const [refusal, setRefusal] = useState<string | null>(null)

  // Deux appuis dans le même instant arrivent avant que `isPending` ne repasse par l'écran : ce
  // drapeau, posé au premier, fait ignorer le second ; il se rend à la réponse.
  const sending = useRef(false)

  const submit = () => {
    if (join.isPending || sending.current) return
    const typed = typedRef.current.trim()
    if (typed === '') {
      setRefusal('scoutCodeInvalid')
      return
    }
    sending.current = true
    setRefusal(null)
    join.mutate(
      { code: typed },
      {
        onSuccess: onJoined,
        onError: (error) => setRefusal(errorKey(error)),
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  // Un code faux se dit sous le champ ; des places prises ou un mois fini ne sont pas une faute
  // (planche R20-Reglages) : une notice neutre ; le reste (réseau, trop d'essais) en erreur.
  const fieldError =
    refusal === 'scoutCodeInvalid' ? t(($) => $.errors.scoutCodeInvalid) : undefined
  const calm = refusal === 'scoutFull' || refusal === 'scoutClosed'
  const notice =
    refusal && refusal !== 'scoutCodeInvalid'
      ? t(($) => $.errors[refusal as ReturnType<typeof errorKey>])
      : null

  return (
    <Stack gap="lg">
      <Text tone="secondary">{t(($) => $.scout.intro)}</Text>
      <Disclosure title={t(($) => $.scout.haveCode)} icon="key">
        <Stack gap="md">
          <TextField
            label={t(($) => $.scout.codeLabel)}
            value={code}
            onChangeText={(text) => {
              typedRef.current = text
              setCode(text)
              if (refusal === 'scoutCodeInvalid') setRefusal(null)
            }}
            error={fieldError}
            code
          />
          {notice ? <Notice message={notice} tone={calm ? 'neutral' : 'error'} /> : null}
          <Text variant="caption" tone="secondary">
            {t(($) => $.scout.joinInfo)}
          </Text>
          <Button label={t(($) => $.scout.join)} onPress={submit} loading={join.isPending} />
        </Stack>
      </Disclosure>
    </Stack>
  )
}

// --- Une Éclaireuse ---

/** Le sceau « Éclaireuse fondatrice », et depuis quand (ou « Retirée le … »). */
function ScoutHead({ scout }: { scout: MeScout }) {
  const { t, i18n } = useTranslation()
  const since = scout.removedAt
    ? t(($) => $.scout.removedOn, { date: shortDate(scout.removedAt, i18n.language) })
    : t(($) => $.scout.since, { date: shortDate(scout.joinedAt, i18n.language) })
  return (
    <ListGroup>
      <ListRow
        // Le sceau est décoratif : son nom est écrit à côté.
        leading={<WaxSeal icon="drop" matter="honey" size="small" label="" />}
        label={t(($) => $.game.seals.scout_founder)}
        detail={since}
      />
    </ListGroup>
  )
}

/** Pendant le mois : « Afficher la Goutte » et la rangée des missions de la semaine. */
function ScoutOptions({ scout }: { scout: MeScout }) {
  const { t } = useTranslation()
  const router = useRouter()
  const settings = useScoutSettings()
  // L'interrupteur suit le doigt tout de suite ; le profil rendu par l'API le confirme ensuite.
  // Un refus le remet où il était et le dit.
  const [wanted, setWanted] = useState<boolean | null>(null)
  const shown = wanted ?? scout.showDrop
  useEffect(() => {
    if (wanted !== null && wanted === scout.showDrop && !settings.isPending) setWanted(null)
  }, [wanted, scout.showDrop, settings.isPending])

  return (
    <Stack gap="sm">
      {settings.isError && wanted === null ? (
        <Notice message={t(($) => $.errors[errorKey(settings.error)])} />
      ) : null}
      <ListGroup>
        <Switch
          inGroup
          label={t(($) => $.scout.showDrop)}
          value={shown}
          onValueChange={(value) => {
            setWanted(value)
            settings.mutate({ showDrop: value }, { onError: () => setWanted(null) })
          }}
        />
        <ListRow
          icon="flag"
          label={t(($) => $.scout.missions.title)}
          {...(scout.missionsLeft > 0
            ? { detail: t(($) => $.scout.missions.left, { count: scout.missionsLeft }) }
            : null)}
          href={MISSIONS_HREF}
          onPress={(event?: PressEvent) => {
            event?.preventDefault?.()
            router.push(MISSIONS_HREF)
          }}
          trailing="chevron"
        />
      </ListGroup>
    </Stack>
  )
}

/**
 * « Mes retours » : chacun avec sa sorte, sa date, son texte, son statut et la note d'un retour
 * corrigé ; « Supprimer ce retour » par son menu, après confirmation. Pendant la fenêtre, la liste
 * reste celle qu'on a vue (rien ne bouge sous le doigt) ; une fois la fenêtre partie, le retour
 * supprimé s'en va et le focus passe au menu du retour voisin, ou au titre de la page.
 */
function MyReports({ titleRef }: { titleRef: RefObject<Focusable | null> }) {
  const { t } = useTranslation()
  const reports = useMyScoutReports()
  const remove = useDeleteScoutReport()
  const [deleting, setDeleting] = useState<ScoutReport | null>(null)
  const [frozen, setFrozen] = useState<ScoutReport[] | null>(null)
  const [focusTo, setFocusTo] = useState<string[] | null>(null)
  const afterClose = useRef<string[] | null>(null)
  const menus = useRef(new Map<string, Focusable>())

  const live = reports.data?.reports ?? []
  const items = frozen ?? live

  useEffect(() => {
    if (!focusTo || frozen) return
    setFocusTo(null)
    const node = focusTo.map((id) => menus.current.get(id)).find(Boolean) ?? titleRef.current
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [focusTo, frozen, titleRef])

  /** La fenêtre est partie (fin du fondu sur le web) : la liste reprend le cache, le focus suit. */
  const release = () => {
    setFrozen(null)
    const targets = afterClose.current
    afterClose.current = null
    if (targets) setFocusTo(targets)
  }
  const close = () => {
    setDeleting(null)
    // Sur téléphone, Android ne prévient pas de la fin du départ de la fenêtre.
    if (Platform.OS !== 'web') release()
  }
  const askToDelete = (report: ScoutReport) => {
    remove.reset()
    setFrozen(live)
    setDeleting(report)
  }
  const confirmDelete = () => {
    if (!deleting || remove.isPending) return
    const order = items.map((report) => report.id)
    const at = order.indexOf(deleting.id)
    const neighbors = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0)).reverse()]
    remove.mutate(deleting.id, {
      onSuccess: () => {
        afterClose.current = neighbors
        close()
      },
    })
  }

  const footer = t(($) => $.scout.retention)
  let content: ReactNode
  if (!reports.data && reports.isError) {
    content = (
      <Notice
        message={t(($) => $.errors[errorKey(reports.error)])}
        action={{ label: t(($) => $.common.retry), onPress: () => void reports.refetch() }}
      />
    )
  } else if (!reports.data) {
    content = (
      <ListGroup title={t(($) => $.scout.myReports)}>
        <ListRowSkeleton />
        <ListRowSkeleton />
      </ListGroup>
    )
  } else if (items.length === 0) {
    content = (
      <ListGroup title={t(($) => $.scout.myReports)} footer={footer}>
        <ListRow label={t(($) => $.scout.reportsEmpty)} />
      </ListGroup>
    )
  } else {
    content = (
      <ListGroup title={t(($) => $.scout.myReports)} footer={footer} list>
        {items.map((report) => (
          <ScoutReportRow
            key={report.id}
            kind={kindLook(t, report.kind)}
            severity={severityLook(t, report.severity)}
            text={report.text}
            date={report.createdAt}
            mission={
              report.mission
                ? t(($) => $.scout.sheet.mission, { mission: report.mission.text })
                : undefined
            }
            status={myStatusLook(t, report.status)}
            note={
              report.status === 'fixed' && report.fixedNote
                ? t(($) => $.scout.fixedNote, { note: report.fixedNote })
                : undefined
            }
            menu={{
              label: t(($) => $.scout.reportMenu),
              items: [
                {
                  label: t(($) => $.scout.deleteReport),
                  icon: 'trash',
                  tone: 'danger',
                  onPress: () => askToDelete(report),
                },
              ],
            }}
            menuRef={(node: Focusable | null) => {
              if (node) menus.current.set(report.id, node)
              else menus.current.delete(report.id)
            }}
          />
        ))}
      </ListGroup>
    )
  }

  return (
    <>
      {content}
      <Dialog
        visible={deleting !== null}
        guardTaps
        title={t(($) => $.scout.deleteTitle)}
        message={t(($) => $.scout.deleteBody)}
        busy={remove.isPending}
        error={remove.isError ? t(($) => $.errors[errorKey(remove.error)]) : undefined}
        onDismiss={() => {
          if (!remove.isPending) close()
        }}
        onClosed={release}
      >
        <Button
          label={t(($) => $.scout.delete)}
          variant="confirm"
          onPress={confirmDelete}
          loading={remove.isPending}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={close}
          disabled={remove.isPending}
        />
      </Dialog>
    </>
  )
}
