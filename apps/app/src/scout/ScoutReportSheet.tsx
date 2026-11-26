// La feuille « Ton retour » des Éclaireuses (tranche R20, docs/scenarios/refonte.md, « Le retour
// normé » et « Les missions de la semaine » ; planches R20-Retour, R20-Retour-Desktop, R20-Envoye).
// Une Éclaireuse dit ce qui coince, ce qui l'embrouille, une idée ou ce qu'elle aime :
// - les missions de la semaine en tête (« Faite » pour celles déjà faites, encore touchables) ;
//   en choisir une la met dans une bande « Mission : … », que sa croix retire ;
// - la sorte (Bug, Confus, Idée, J'adore : une seule, obligatoire), puis la gravité pour un Bug ou
//   un Confus seulement ;
// - le texte (2 000 caractères au plus), une capture facultative avec son aide (J3) ;
// - « Joint à ton retour », qui écrit en clair chaque valeur envoyée, et la case qui retire le tout
//   (J5) ;
// - la limite des 20 retours par jour, dite dès l'ouverture ; « Abandonner ce retour ? » avant de
//   perdre un texte ; « Merci, c'est noté » et le gain de pollen (R19) après l'envoi.
//
// La feuille a sa propre adresse (`/scout-report?from=<chemin>`, `&mission=<id>` depuis
// « Répondre ») : Échap, le Retour du navigateur ou d'Android la ferment. Sur ordinateur, c'est une
// fenêtre ancrée en bas à droite, à la place de la Goutte (`Sheet corner`).
import {
  needsSeverity,
  SCOUT_REPORT_DAILY,
  SCOUT_REPORT_TEXT_MAX,
  type ScoutReportInput,
  type ScoutReportKind,
  type ScoutSeverity,
} from '@ruche/contracts'
import type { Language } from '@ruche/i18n'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWindowDimensions } from 'react-native'
import { errorKey } from '../api/errors'
import type { PickedImage } from '../media/pick'
import { pickImage } from '../media/pick'
import { firstParam } from '../navigation/params'
import { type HeldAction, useLeaveGuard } from '../navigation/useLeaveGuard'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { ActionMenu } from '../ui/ActionMenu'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { DiscardDialog } from '../ui/DiscardDialog'
import { Disclosure } from '../ui/Disclosure'
import { type Focusable, focusAndReveal, moveReaderTo } from '../ui/focus'
import { Hint } from '../ui/Hint'
import type { IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from '../ui/PhotoTiles'
import { Segmented } from '../ui/Segmented'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { TextField, type TextFieldInput } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { useCalmMotion } from '../ui/theme/motion'
import { useTheme } from '../ui/theme/ThemeProvider'
import { useToast } from '../ui/theme/toast'
import { useMyScoutReports, useScoutMissions, useSendScoutReport } from './api'
import { scoutContext } from './context'
import { foldDrop } from './dropFold'

/** Les quatre sortes, dans l'ordre de la planche, et leur icône (décorative : le mot dit tout). */
const KINDS: { value: ScoutReportKind; icon: IconName }[] = [
  { value: 'bug', icon: 'bug' },
  { value: 'confusing', icon: 'question' },
  { value: 'idea', icon: 'lightbulb' },
  { value: 'love', icon: 'heart' },
]
const SEVERITIES: ScoutSeverity[] = ['minor', 'annoying', 'blocking']

/** Une journée, en millisecondes : la limite des 20 retours se compte sur 24 heures glissantes. */
const DAY_MS = 24 * 60 * 60_000

/** Ce qui manque à un envoi refusé avant de partir. */
type Missing = 'kind' | 'severity' | 'text' | 'tooLong' | null

export function ScoutReportSheet() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toast = useToast()
  const calm = useCalmMotion()
  const { scheme } = useTheme()
  const { width } = useWindowDimensions()
  const params = useLocalSearchParams<{ from?: string | string[]; mission?: string | string[] }>()
  const from = firstParam(params.from) ?? null
  // Fermer revient à la page d'avant ; arrivé par un lien direct, au Fil.
  const sheet = useRouteSheet('/feed')

  const missions = useScoutMissions()
  const reports = useMyScoutReports()
  const send = useSendScoutReport()

  // --- Ce que l'Éclaireuse remplit ---
  const [missionId, setMissionId] = useState<string | null>(
    () => firstParam(params.mission) ?? null,
  )
  const [kind, setKind] = useState<ScoutReportKind | null>(null)
  const [severity, setSeverity] = useState<ScoutSeverity | null>(null)
  const [text, setText] = useState('')
  const [capture, setCapture] = useState<PickedImage | null>(null)
  const [attach, setAttach] = useState(true)
  const [missing, setMissing] = useState<Missing>(null)
  // Un 429 à l'envoi : la limite du jour, dite au pied, sans rien perdre de ce qui est écrit.
  const [failure, setFailure] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  // Vrai dès la tape sur « Envoyer », avant même que React redessine : une seconde tape n'envoie
  // rien (l'état de la mutation, lui, n'est à jour qu'au dessin suivant).
  const inFlight = useRef(false)

  // Le contexte joint : figé à l'ouverture de la feuille (l'écran d'où l'on vient, la largeur de
  // la fenêtre…), pour que ce qui part soit exactement ce qui est écrit.
  const language: Language = i18n.language?.startsWith('en') ? 'en' : 'fr'
  const [context, setContext] = useState(() => scoutContext(from, { width }, scheme, language))
  // Sur le web, une feuille ouverte par son adresse (page rechargée) se dessine d'abord comme sur le
  // serveur : thème de jour, largeur inconnue. Le contexte est relevé une seconde fois, une seule,
  // dès la page hydratée ; sinon une Éclaireuse de nuit enverrait « Thème : Jour » (relecture de
  // l'interface, R20). Ouverte depuis la Goutte, la page l'est déjà : rien ne change.
  const hydrated = useHydrated()
  const settled = useRef(hydrated)
  useEffect(() => {
    if (!hydrated || settled.current) return
    settled.current = true
    setContext(scoutContext(from, { width }, scheme, language))
  }, [hydrated, from, width, scheme, language])

  // --- Le focus, sur ce qui manque à un envoi refusé ---
  const kindRef = useRef<Focusable>(null)
  const severityRef = useRef<Focusable>(null)
  const textRef = useRef<TextFieldInput>(null)
  const [focusNext, setFocusNext] = useState<{ current: unknown } | null>(null)
  useEffect(() => {
    if (!focusNext) return
    // Au milieu de la zone qui défile (au-dessus du pied collé) ; le lecteur d'écran y va aussi.
    focusAndReveal(focusNext.current, calm)
    moveReaderTo(focusNext.current)
    setFocusNext(null)
  }, [focusNext, calm])

  // --- Fermer ---
  const sending = send.isPending
  const dirty = text.trim() !== '' || capture !== null
  const held = useRef<HeldAction | null>(null)
  // Le Retour du navigateur (ou d'Android) avec un texte tapé : « Abandonner ce retour ? » d'abord.
  const guard = useLeaveGuard(dirty || sending, (action) => {
    // Pendant l'envoi : le retour est arrêté, sans question (ça part).
    if (inFlight.current) return
    held.current = action
    setDiscarding(true)
  })
  // Sur le web, la fermeture attend que l'étape de plus de l'historique soit retirée.
  const leave = () => void guard.release().then(sheet.close)
  const requestClose = () => {
    if (inFlight.current) return
    if (dirty) {
      held.current = null
      setDiscarding(true)
    } else leave()
  }
  const abandon = () => {
    setDiscarding(false)
    const action = held.current
    held.current = null
    if (action) guard.proceed(action)
    else leave()
  }

  // --- La limite du jour, dès l'ouverture ---
  // useMemo : compté une fois par réponse, pas à chaque lettre tapée.
  const limitedAtOpen = useMemo(() => {
    const list = reports.data?.reports ?? []
    const since = Date.now() - DAY_MS
    return (
      list.filter((report) => Date.parse(report.createdAt) >= since).length >= SCOUT_REPORT_DAILY
    )
  }, [reports.data])

  // --- La mission choisie (de la liste, ou de l'adresse) ---
  const weekMissions = missions.data?.missions ?? []
  const mission = weekMissions.find((one) => one.id === missionId) ?? null

  // --- Les gestes ---
  const chooseKind = (value: ScoutReportKind | '') => {
    if (value === '') return
    setKind(value)
    // La gravité ne vaut que pour un Bug ou un Confus : elle part avec un autre choix.
    if (!needsSeverity(value)) setSeverity(null)
    if (missing === 'kind' || missing === 'severity') setMissing(null)
  }
  const chooseSeverity = (value: ScoutSeverity | '') => {
    if (value === '') return
    setSeverity(value)
    if (missing === 'severity') setMissing(null)
  }
  const changeText = (value: string) => {
    setText(value)
    if (missing === 'text' || missing === 'tooLong') setMissing(null)
  }
  const onAddCapture = async () => {
    try {
      const image = await pickImage('free')
      if (image) setCapture(image)
    } catch {
      // La préparation de l'image a échoué : rien n'est posé, on peut recommencer.
      setFailure(t(($) => $.errors.internal))
    }
  }
  // Sur le web, une image déposée sur la tuile « Ajouter une capture ».
  const onDropFiles = (files: File[]) => {
    const file = files.find((one) => one.type.startsWith('image/'))
    if (file) setCapture({ uri: URL.createObjectURL(file), width: 0, height: 0 })
  }

  const submit = async () => {
    if (inFlight.current || sending) return
    setFailure(null)
    // Ce qui manque se dit sous le champ, qui reçoit le focus (« Envoyer » n'est jamais grisé).
    if (kind === null) {
      setMissing('kind')
      setFocusNext(kindRef)
      return
    }
    if (needsSeverity(kind) && severity === null) {
      setMissing('severity')
      setFocusNext(severityRef)
      return
    }
    if (text.trim() === '') {
      setMissing('text')
      setFocusNext(textRef)
      return
    }
    // Compté comme le serveur : en caractères (une abeille 🐝 compte 1).
    if ([...text].length > SCOUT_REPORT_TEXT_MAX) {
      setMissing('tooLong')
      setFocusNext(textRef)
      return
    }
    const report: ScoutReportInput = {
      kind,
      ...(severity !== null && needsSeverity(kind) ? { severity } : null),
      text,
      ...(mission ? { missionId: mission.id } : null),
      ...(attach && context ? { context } : null),
    }
    inFlight.current = true
    try {
      await send.mutateAsync({ report, capture })
    } catch (error) {
      inFlight.current = false
      // Refusé : le message au pied ; le texte, la sorte et la capture restent pour réessayer.
      const key = errorKey(error)
      setFailure(key === 'rateLimited' ? t(($) => $.scout.sheet.limit) : t(($) => $.errors[key]))
      return
    }
    inFlight.current = false
    // Parti : le toast, puis la feuille se ferme (le gain de pollen vient de `useSendScoutReport`).
    toast.show(
      t(($) => $.scout.sheet.sent),
      { icon: 'check-circle' },
    )
    void guard.release().then(sheet.close)
  }

  // --- Le menu « ⋯ » de la tête ---
  const menu = (
    <ActionMenu
      label={t(($) => $.scout.sheet.more)}
      variant="plain"
      align="end"
      items={[
        // La Goutte repliée en languette (l'état de la session de l'appli), la feuille reste.
        { label: t(($) => $.scout.drop.fold), icon: 'drop', onPress: foldDrop },
        {
          label: t(($) => $.scout.drop.settings),
          icon: 'gear-six',
          onPress: () => router.push('/settings/scouts'),
        },
      ]}
    />
  )

  // --- Ce qui s'affiche ---
  // Le texte compté en caractères, comme le contrat (`[...text]` découpe par point de code).
  const length = [...text].length
  const number = (value: number) => value.toLocaleString(language)
  const privacy = <Hint icon="lock-simple" text={t(($) => $.scout.sheet.privacy)} />
  const loading = reports.isPending || missions.isPending
  let content: ReactNode
  if (loading) {
    // Rien ne s'insère ensuite au-dessus de ce qu'on touche : la feuille attend ses deux lectures.
    content = <StateMessage kind="loading" level={2} />
  } else if (limitedAtOpen) {
    content = <Notice tone="neutral" icon="clock" message={t(($) => $.scout.sheet.limit)} />
  } else {
    content = (
      <Stack gap="lg">
        {mission ? (
          <ListGroup>
            <ListRow
              label={t(($) => $.scout.sheet.mission, { mission: mission.text })}
              icon="flag"
              accessory={
                <IconButton
                  icon="x"
                  label={t(($) => $.scout.sheet.removeMission)}
                  variant="plain"
                  onPress={() => setMissionId(null)}
                />
              }
            />
          </ListGroup>
        ) : weekMissions.length > 0 ? (
          <Stack gap="sm">
            <TextLink
              label={t(($) => $.scout.sheet.missions)}
              onPress={() => router.push('/scout/missions')}
            />
            <ListGroup label={t(($) => $.scout.sheet.missions)}>
              {/* Celles qui restent d'abord ; une mission faite reste touchable, sans pollen. */}
              {[...weekMissions]
                .sort((a, b) => Number(a.done) - Number(b.done))
                .map((one) => (
                  <ListRow
                    key={one.id}
                    label={one.text}
                    icon="flag"
                    onPress={() => setMissionId(one.id)}
                    accessory={
                      one.done ? <StatusPill label={t(($) => $.scout.missions.done)} /> : undefined
                    }
                  />
                ))}
            </ListGroup>
          </Stack>
        ) : null}
        <Stack gap="sm">
          <Segmented<ScoutReportKind | ''>
            label={t(($) => $.scout.sheet.kind)}
            options={KINDS.map(({ value, icon }) => ({
              value,
              icon,
              label: t(($) => $.scout.kinds[value]),
            }))}
            value={kind ?? ''}
            onChange={chooseKind}
          />
          {missing === 'kind' ? (
            <Notice ref={kindRef} message={t(($) => $.scout.sheet.missingKind)} />
          ) : null}
        </Stack>
        {kind !== null && needsSeverity(kind) ? (
          <Stack gap="xs">
            <Text variant="caption" weight={600} tone="secondary">
              {t(($) => $.scout.sheet.severity)}
            </Text>
            <Segmented<ScoutSeverity | ''>
              label={t(($) => $.scout.sheet.severity)}
              options={SEVERITIES.map((value) => ({
                value,
                label: t(($) => $.scout.severities[value]),
              }))}
              value={severity ?? ''}
              onChange={chooseSeverity}
            />
            {missing === 'severity' ? (
              <Notice ref={severityRef} message={t(($) => $.scout.sheet.missingSeverity)} />
            ) : null}
          </Stack>
        ) : null}
        <TextField
          label={t(($) => $.scout.sheet.text)}
          value={text}
          onChangeText={changeText}
          inputRef={textRef}
          placeholder={t(($) => $.scout.sheet.textPlaceholder)}
          multiline
          autoCapitalize="sentences"
          showCount
          // « 93 / 2 000 », compté en caractères comme le serveur (une abeille 🐝 compte 1), les
          // nombres écrits à la façon de la langue ; lu « 93 caractères sur 2 000 ».
          counterText={{
            // La même forme que le compteur de `TextField` (« 7 / 140 »), les nombres mis en forme.
            shown: `${number(length)} / ${number(SCOUT_REPORT_TEXT_MAX)}`,
            spoken: t(($) => $.project.comments.counterSpoken, {
              count: length,
              max: SCOUT_REPORT_TEXT_MAX,
            }),
          }}
          // Une limite seulement affichée : un texte collé trop long se voit (compteur rouge) et
          // se refuse à l'envoi, au lieu d'être coupé en silence.
          limit={SCOUT_REPORT_TEXT_MAX}
          editable={!sending}
          error={
            missing === 'text'
              ? t(($) => $.scout.sheet.missingText)
              : missing === 'tooLong'
                ? t(($) => $.project.comments.tooLong, {
                    count: length - SCOUT_REPORT_TEXT_MAX,
                  })
                : undefined
          }
        />
        <CaptureField
          capture={capture}
          busy={sending}
          onAdd={() => void onAddCapture()}
          onDropFiles={onDropFiles}
          onRemove={() => setCapture(null)}
        />
        {context ? (
          <Disclosure
            title={t(($) => $.scout.sheet.attached)}
            hint={t(($) => $.scout.sheet.attachedShort)}
            hintWhenClosed
            icon="paperclip"
          >
            <Stack gap="xs">
              {[
                {
                  key: 'screen',
                  label: t(($) => $.scout.sheet.fields.screen),
                  value: context.screen,
                },
                {
                  key: 'device',
                  label: t(($) => $.scout.sheet.fields.device),
                  value: t(($) => $.scout.sheet.deviceValue, {
                    platform: t(($) => $.scout.sheet.platforms[context.platform]),
                    width: context.width,
                  }),
                },
                // Sans version (développement), la ligne n'est pas montrée ; `null` part tel quel.
                ...(context.appVersion
                  ? [
                      {
                        key: 'version',
                        label: t(($) => $.scout.sheet.fields.version),
                        value: context.appVersion,
                      },
                    ]
                  : []),
                {
                  key: 'language',
                  label: t(($) => $.scout.sheet.fields.language),
                  value: t(($) => $.common.languages[context.language]),
                },
                {
                  key: 'theme',
                  label: t(($) => $.scout.sheet.fields.theme),
                  value: t(($) => $.scout.sheet.schemes[context.scheme]),
                },
              ].map((fact) => (
                <Row key={fact.key} gap="md" wrap>
                  <Text variant="caption" tone="secondary">
                    {fact.label}
                  </Text>
                  <Text selectable breakAnywhere>
                    {fact.value}
                  </Text>
                </Row>
              ))}
            </Stack>
            <Checkbox
              label={t(($) => $.scout.sheet.attach)}
              value={attach}
              onValueChange={setAttach}
              disabled={sending}
            />
          </Disclosure>
        ) : null}
      </Stack>
    )
  }

  const notice: SheetNotice | null = failure ? { message: failure, tone: 'error' } : null
  const filling = !loading && !limitedAtOpen

  return (
    <>
      <Sheet
        open={sheet.open}
        title={t(($) => $.scout.sheet.title)}
        onClose={requestClose}
        closeGuard={requestClose}
        // La feuille s'ouvre sous le doigt de la Goutte : la seconde tape d'une double tape ne
        // tombe ni sur « Annuler » ni sur « Envoyer ».
        guardTaps
        busy={sending}
        corner
        headerMenu={menu}
        notice={notice}
        {...(filling
          ? {
              cancelLabel: t(($) => $.common.cancel),
              action: {
                // Jamais grisé : un envoi incomplet dit ce qui manque.
                label: t(($) => $.scout.sheet.send),
                onPress: () => void submit(),
                busy: sending,
              },
              footerNote: privacy,
            }
          : limitedAtOpen
            ? {
                footer: <Button label={t(($) => $.scout.sheet.close)} onPress={requestClose} />,
                closeInFooter: true,
              }
            : null)}
      >
        {content}
      </Sheet>
      <DiscardDialog
        visible={discarding}
        title={t(($) => $.scout.sheet.discardTitle)}
        message={t(($) => $.scout.sheet.discardBody)}
        keepLabel={t(($) => $.scout.sheet.keep)}
        discardLabel={t(($) => $.scout.sheet.discard)}
        onKeep={() => setDiscarding(false)}
        onDiscard={abandon}
      />
    </>
  )
}

/** La capture facultative : une tuile « Ajouter une capture » (une seule), et l'aide J3 à côté. */
function CaptureField({
  capture,
  busy,
  onAdd,
  onDropFiles,
  onRemove,
}: {
  capture: PickedImage | null
  busy: boolean
  onAdd: () => void
  onDropFiles: (files: File[]) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  // Le nom lu de la capture posée : celui de la capture d'un testeur (« Capture d'écran jointe à
  // ton retour »), qui dit la même chose.
  const captureLabel = t(($) => $.project.testers.feedback.captureNameMine)
  const tiles: PhotoTile[] = capture
    ? [
        {
          key: capture.uri,
          state: 'ready',
          image: { source: { uri: capture.uri }, thumbhash: null, label: captureLabel },
        },
      ]
    : []
  const labels: PhotoTilesLabels = {
    list: t(($) => $.scout.sheet.capture),
    add: t(($) => $.scout.sheet.capture),
    addLabel: t(($) => $.scout.sheet.capture),
    dropZone: t(($) => $.project.form.dropZone),
    dropZoneChoose: t(($) => $.project.form.dropZoneChoose),
    cover: t(($) => $.project.form.cover),
    tile: () => captureLabel,
    uploading: (number) => t(($) => $.project.form.photoUploading, { number }),
    failed: (number, why) => t(($) => $.project.form.photoFailed, { number, reason: why }),
    move: (number) => t(($) => $.project.form.movePhoto, { number }),
    makeCover: t(($) => $.project.form.makeCover),
    earlier: t(($) => $.project.form.movePhotoEarlier),
    later: t(($) => $.project.form.movePhotoLater),
    moved: (place) => t(($) => $.project.form.photoMoved, { place }),
    remove: () => t(($) => $.scout.sheet.removeCapture),
  }
  return (
    <Stack gap="sm">
      <PhotoTiles
        tiles={tiles}
        max={1}
        labels={labels}
        selectedKey={null}
        // Une seule capture, sans description : la toucher ne mène nulle part.
        onSelect={() => {}}
        onAdd={onAdd}
        onDropFiles={onDropFiles}
        onMove={() => {}}
        onRemove={onRemove}
        busy={busy}
        cover={false}
      />
      {/* L'aide de la relecture juridique (J3), même sans capture : avant de choisir. */}
      <Hint icon="info" text={t(($) => $.scout.sheet.captureHint)} />
    </Stack>
  )
}
