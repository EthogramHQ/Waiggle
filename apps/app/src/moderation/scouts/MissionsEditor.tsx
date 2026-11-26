// La fenêtre « Missions de la semaine » de la page de tri (R20, planche R20-Missions-Admin) :
// l'administrateur écrit jusqu'à 3 missions pour la semaine en cours, chacune en français et, s'il
// le veut, en anglais (sans anglais, le français s'affiche), les retire, en ajoute, puis « Publier
// les missions » les envoie toutes, dans l'ordre (PUT /v1/moderation/scouts/missions).
//
// Une mission gardée garde son `id` (ses réponses restent) ; une mission neuve part sans `id` ; une
// mission retirée n'est plus dans la liste, et l'API l'efface. Le schéma du contrat
// (`ScoutMissionsInput`) vérifie tout avant l'envoi. Modifiée, la fenêtre demande avant de se
// fermer (« Abandonner les modifications ? », `DiscardDialog`) ; pendant l'envoi, rien ne la ferme.
import {
  SCOUT_MISSION_TEXT_MAX,
  SCOUT_MISSIONS_MAX,
  type ScoutMissionAdmin,
  ScoutMissionsInput,
} from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ApiErrorKey, errorKey } from '../../api/errors'
import { Button } from '../../ui/Button'
import { DiscardDialog } from '../../ui/DiscardDialog'
import { Sheet } from '../../ui/Sheet'
import { Stack } from '../../ui/Stack'
import { Text } from '../../ui/Text'
import { TextField } from '../../ui/TextField'
import { useSaveScoutMissions } from './api'

/** Une mission en cours d'écriture : `key` la suit à l'écran (React), `id` la relie au serveur. */
type Draft = { key: string; id: string | null; textFr: string; textEn: string }

const draftsOf = (missions: readonly ScoutMissionAdmin[]): Draft[] =>
  missions.map((mission) => ({
    key: mission.id,
    id: mission.id,
    textFr: mission.textFr,
    textEn: mission.textEn ?? '',
  }))

type Props = {
  open: boolean
  /** Les missions publiées de la semaine, d'où part la fenêtre à chaque ouverture. */
  missions: readonly ScoutMissionAdmin[]
  /** « Du lundi 23 au dimanche 29 nov. », sous le titre. */
  week: string
  onClose: () => void
}

export function MissionsEditor({ open, missions, week, onClose }: Props) {
  const { t } = useTranslation()
  const save = useSaveScoutMissions()
  const [drafts, setDrafts] = useState<Draft[]>(() => draftsOf(missions))
  // Les missions du dernier rendu, lues au moment de l'envoi : le pied de la feuille, dessiné à
  // part, peut garder une fonction d'un rendu précédent (un texte tapé juste avant « Publier »).
  const latest = useRef(drafts)
  latest.current = drafts
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<ApiErrorKey | null>(null)
  // La garde de la double tape : un `ref`, lu avant que React ait redessiné le bouton.
  const saving = useRef(false)
  // Un numéro pour la clé React des missions neuves, unique pendant la vie de la fenêtre.
  const counter = useRef(0)

  // Chaque ouverture repart des missions publiées, sans l'erreur d'un envoi précédent ; changer un
  // état pendant le rendu, quand une prop change, est la façon que React recommande.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDrafts(draftsOf(missions))
      setProblem(null)
      setAsking(false)
    }
  }

  const published = JSON.stringify(draftsOf(missions).map(({ key: _key, ...rest }) => rest))
  const dirty = JSON.stringify(drafts.map(({ key: _key, ...rest }) => rest)) !== published

  const change = (key: string, field: 'textFr' | 'textEn', text: string) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, [field]: text } : draft)),
    )

  /** Toute demande de fermeture : refusée pendant l'envoi, posée en question si modifiée. */
  const requestClose = () => {
    if (saving.current) return
    if (dirty) setAsking(true)
    else onClose()
  }

  const publish = () => {
    if (saving.current) return
    const parsed = ScoutMissionsInput.safeParse({
      missions: latest.current.map((draft) => ({
        ...(draft.id ? { id: draft.id } : null),
        textFr: draft.textFr.trim(),
        // Sans anglais, la clé est absente : le français s'affiche aux anglophones.
        ...(draft.textEn.trim() ? { textEn: draft.textEn.trim() } : null),
      })),
    })
    if (!parsed.success) {
      setProblem('validation')
      return
    }
    saving.current = true
    setProblem(null)
    save.mutate(parsed.data, {
      onSuccess: () => onClose(),
      onError: (error) => setProblem(errorKey(error)),
      onSettled: () => {
        saving.current = false
      },
    })
  }

  return (
    <>
      <Sheet
        open={open}
        title={t(($) => $.scout.triage.editor.title)}
        subtitle={week}
        onClose={onClose}
        closeGuard={dirty ? requestClose : undefined}
        busy={save.isPending}
        notice={problem ? { message: t(($) => $.errors[problem]), tone: 'error' } : null}
        footer={
          <Stack gap="sm">
            <Button
              label={t(($) => $.scout.triage.editor.publish)}
              onPress={publish}
              loading={save.isPending}
            />
            <Button
              label={t(($) => $.common.cancel)}
              variant="secondary"
              onPress={requestClose}
              disabled={save.isPending}
            />
          </Stack>
        }
      >
        <Stack gap="xl">
          {drafts.map((draft, index) => {
            const number = index + 1
            const name = t(($) => $.scout.triage.editor.mission, { number })
            return (
              <Stack key={draft.key} gap="sm">
                <Stack direction="row" align="center" justify="between" gap="md">
                  <Text variant="headline" heading={3}>
                    {name}
                  </Text>
                  <Button
                    label={t(($) => $.scout.triage.editor.remove)}
                    // Plusieurs « Retirer » : le nom lu dit laquelle.
                    spokenLabel={`${t(($) => $.scout.triage.editor.remove)} : ${name}`}
                    icon="trash"
                    variant="secondary"
                    size="compact"
                    onPress={() =>
                      setDrafts((current) => current.filter((one) => one.key !== draft.key))
                    }
                  />
                </Stack>
                <TextField
                  label={`${t(($) => $.scout.triage.editor.fr)}, ${name}`}
                  value={draft.textFr}
                  onChangeText={(text) => change(draft.key, 'textFr', text)}
                  limit={SCOUT_MISSION_TEXT_MAX}
                  showCount
                  invalid={problem === 'validation' && draft.textFr.trim() === ''}
                />
                <TextField
                  label={`${t(($) => $.scout.triage.editor.en)}, ${name}`}
                  value={draft.textEn}
                  onChangeText={(text) => change(draft.key, 'textEn', text)}
                  placeholder={t(($) => $.scout.triage.editor.enPlaceholder)}
                  limit={SCOUT_MISSION_TEXT_MAX}
                />
              </Stack>
            )
          })}
          {drafts.length < SCOUT_MISSIONS_MAX ? (
            <Button
              label={t(($) => $.scout.triage.editor.add)}
              icon="plus"
              variant="secondary"
              onPress={() => {
                counter.current += 1
                setDrafts((current) => [
                  ...current,
                  { key: `new-${counter.current}`, id: null, textFr: '', textEn: '' },
                ])
              }}
            />
          ) : null}
          <Text variant="caption" tone="muted">
            {t(($) => $.scout.triage.editor.hint)}
          </Text>
        </Stack>
      </Sheet>
      <DiscardDialog
        visible={asking}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false)
          onClose()
        }}
      />
    </>
  )
}
