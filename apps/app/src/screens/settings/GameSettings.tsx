// Les réglages de la récolte (R19, planche R19-Reglages, options a7, a8 et a9), posés dans trois
// rubriques des réglages :
// - Apparence : le groupe « Classements », avec « Apparaître dans les classements » ;
// - Notifications : « Ma récolte » en tête (les avis du jeu dans l'Activité et le récap) ;
// - Mon profil : « Mon titre » (« Selon mes gestes », ou un titre déjà obtenu), puis « Forme »
//   (« Butineuse | Butineur »), absente en anglais, qui n'a qu'une forme.
//
// Tous lisent la récolte (GET /v1/me/harvest, `settings`) et écrivent par PATCH /v1/me/game le
// seul champ changé (`useGameSettings`, qui change le cache au toucher et le remet si l'API
// refuse). Le compte d'exemple n'a pas de récolte (404) : rien ne se montre. Une lecture ratée
// dit ce qui manque, avec « Réessayer » ; un enregistrement refusé, sous le groupe.
//
// Ce fichier n'écrit aucun style : il assemble des composants de `src/ui`.
import { type GameSettingsUpdate, type TitleFamily, TitleForm } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../../api/errors'
import { useGameSettings, useHarvest } from '../../gamification/api'
import { titleLabel } from '../../gamification/titleLabel'
import { useMe } from '../../profile/hooks'
import { ListGroup, ListRow } from '../../ui/ListGroup'
import { Notice } from '../../ui/Notice'
import { Stack } from '../../ui/Stack'
import { Switch } from '../../ui/Switch'

/**
 * Hook : la récolte et son écriture, avec l'erreur du dernier enregistrement (montrée jusqu'au
 * suivant). `hidden` : pas de récolte pour ce compte (compte d'exemple, 404).
 */
const useGameSetting = () => {
  const harvest = useHarvest()
  const save = useGameSettings()
  const [failed, setFailed] = useState(false)
  const set = (patch: GameSettingsUpdate) => {
    setFailed(false)
    save.mutateAsync(patch).catch(() => setFailed(true))
  }
  const hidden = harvest.isError && !harvest.data && errorKey(harvest.error) === 'notFound'
  return { harvest, set, failed, hidden }
}

/**
 * Ce qui se montre sous un réglage : la lecture ratée (avec « Réessayer »), ou l'enregistrement
 * refusé. Rien sinon.
 */
function SettingNotice({ setting }: { setting: ReturnType<typeof useGameSetting> }) {
  const { t } = useTranslation()
  const { harvest, failed } = setting
  if (!harvest.data && harvest.isError)
    return (
      <Notice
        message={t(($) => $.game.harvest.loadError)}
        action={{ label: t(($) => $.common.retry), onPress: () => void harvest.refetch() }}
      />
    )
  return failed ? <Notice message={t(($) => $.game.settings.saveError)} /> : null
}

/** Apparence : le groupe « Classements » (option a8). */
export function RankingsSetting() {
  const { t } = useTranslation()
  const setting = useGameSetting()
  const { harvest, set, hidden } = setting
  if (hidden) return null
  return (
    <Stack gap="sm">
      <ListGroup title={t(($) => $.game.settings.rankings)}>
        <Switch
          inGroup
          label={t(($) => $.game.settings.inRankings)}
          hint={t(($) => $.game.settings.inRankingsHint)}
          // Pendant la lecture, l'interrupteur garde sa place, inactif, à sa valeur par défaut.
          value={harvest.data?.settings.inRankings ?? true}
          disabled={!harvest.data}
          onValueChange={(inRankings) => set({ inRankings })}
        />
      </ListGroup>
      <SettingNotice setting={setting} />
    </Stack>
  )
}

/** Notifications : « Ma récolte », en tête de la rubrique (option a9). */
export function HarvestNoticesSetting() {
  const { t } = useTranslation()
  const setting = useGameSetting()
  const { harvest, set, hidden } = setting
  if (hidden) return null
  return (
    <Stack gap="sm">
      <ListGroup>
        <Switch
          inGroup
          label={t(($) => $.game.settings.notices)}
          hint={t(($) => $.game.settings.noticesHint)}
          value={harvest.data?.settings.harvestNotices ?? true}
          disabled={!harvest.data}
          onValueChange={(harvestNotices) => set({ harvestNotices })}
        />
      </ListGroup>
      <SettingNotice setting={setting} />
    </Stack>
  )
}

/**
 * Mon profil : « Mon titre » et « Forme » (option a7). Le titre affiché vient des gestes des
 * 4 dernières semaines (« Selon mes gestes »), ou d'une famille déjà obtenue, épinglée. Rien avant
 * la récolte : ces deux groupes arrivent sous le formulaire, en bas de la feuille, sans rien
 * pousser.
 */
export function TitleSettings() {
  const { t, i18n } = useTranslation()
  const setting = useGameSetting()
  const { harvest, set, hidden } = setting
  // R20 : le profil dit si l'on est Éclaireuse active (le titre « Éclaireuse » est alors épinglable).
  const scoutActive = useMe().data?.scout?.active === true
  if (hidden) return null
  const data = harvest.data
  if (!data) return <SettingNotice setting={setting} />
  const { titleForm: form, pinnedFamily } = data.settings
  // L'aide cite le titre des 4 dernières semaines, connu seulement quand rien n'est épinglé.
  // R20 : « Éclaireuse » s'ajoute aux titres déjà obtenus tant qu'on l'est (active, non retirée).
  const families: TitleFamily[] = scoutActive
    ? [...data.obtainedFamilies, 'scout']
    : data.obtainedFamilies
  const hint =
    data.title && !data.title.pinned
      ? t(($) => $.game.settings.titleHint, { title: titleLabel(t, data.title.family, form) })
      : families.length === 0
        ? t(($) => $.game.settings.titleNone)
        : undefined
  // La forme se montre sur le titre qu'on porte (« Gardienne | Gardien »), ou la première famille.
  const shownFamily: TitleFamily = data.title?.family ?? families[0] ?? 'forager'
  // L'anglais n'a qu'une forme : pas de choix (la clé `_m` y porte le même mot que `_f`).
  const withForm = i18n.language.startsWith('fr')
  return (
    <Stack gap="lg">
      <ListGroup title={t(($) => $.game.settings.title)} footer={hint} radio>
        <ListRow
          key="auto"
          label={t(($) => $.game.settings.titleAuto)}
          selected={pinnedFamily === null}
          onPress={() => {
            if (pinnedFamily !== null) set({ pinnedFamily: null })
          }}
        />
        {families.map((family) => (
          <ListRow
            key={family}
            label={titleLabel(t, family, form)}
            selected={pinnedFamily === family}
            onPress={() => {
              if (pinnedFamily !== family) set({ pinnedFamily: family })
            }}
          />
        ))}
      </ListGroup>
      {withForm ? (
        <ListGroup title={t(($) => $.game.settings.form)} radio>
          {TitleForm.options.map((value) => (
            <ListRow
              key={value}
              label={titleLabel(t, shownFamily, value)}
              selected={form === value}
              onPress={() => {
                if (form !== value) set({ titleForm: value })
              }}
            />
          ))}
        </ListGroup>
      ) : null}
      <SettingNotice setting={setting} />
    </Stack>
  )
}
