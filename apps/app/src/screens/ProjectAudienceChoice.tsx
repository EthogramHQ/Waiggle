// « Qui peut le voir ? » de la feuille de publication (R6a), et la phrase qui dit qui verra le
// projet, sortis de `ProjectFormFields` après les relectures (ui-C6). Sur téléphone, les champs les
// posent à la fin ; sur ordinateur, l'écran met le choix dans la colonne de l'aperçu
// (`ProjectFormPreview`) et la phrase au pied de la feuille.
//
// R10 (« Un projet réservé à une ruche », F-Pub6) : « Membres » devient « Membres de Waiggle », et
// un membre d'au moins une ruche voit un troisième choix, « Une ruche », puis choisit laquelle
// parmi les siennes (« Quelle ruche ? »). Ses ruches viennent de GET /v1/hives (`useMyHives`), la
// même lecture que l'onglet Ruches : souvent déjà en cache quand la feuille s'ouvre.
import type { HiveSummary } from '@ruche/contracts'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useMyHives } from '../hives/api'
import type { ProjectAudience, ProjectForm } from '../projects/form'
import { Choices } from '../ui/Choices'
import type { Focusable } from '../ui/focus'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Stack } from '../ui/Stack'
import type { ChangeField } from './ProjectFormFields'

// La fonction `t` de react-i18next, pour les textes calculés hors du rendu.
type T = ReturnType<typeof useTranslation>['t']

/** Qui verra le projet : l'audience, et la ruche quand c'est « Une ruche ». */
export type AudienceChoice = Pick<ProjectForm, 'audience' | 'hiveId'>

/** Une ruche telle que le choix la connaît : son identifiant et son nom (null : retiré). */
type HiveOption = Pick<HiveSummary, 'id' | 'name'>

/** Le nom d'une ruche dans une phrase ou un choix ; « Ruche sans nom » si la modération l'a retiré. */
const hiveLabel = (t: T, hive: HiveOption): string => hive.name ?? t(($) => $.hives.unnamed)

/**
 * La phrase qui dit qui verra le projet, sous « Qui peut le voir ? » (ou au pied de la feuille sur
 * ordinateur). `saved` est le choix enregistré du projet modifié, `null` pour un nouveau projet.
 * Ce qui n'est pas encore enregistré parle au futur (un nouveau projet, ou un choix différent de
 * l'enregistré) ; ce qui l'est déjà, au présent. Un projet privé passé sur « Membres » ne dit donc
 * pas « voient » avant d'être enregistré (jur-C3, décision de Louis du 9/11/2026). R10 : la ruche
 * compte aussi (plan, « Ce qui change au plan » 17) : un projet de Famille déplacé vers une autre
 * ruche dit « verront » jusqu'à l'enregistrement. `hives` : les ruches du membre, pour le nom.
 */
export const audienceSentence = (
  t: T,
  choice: AudienceChoice,
  saved: AudienceChoice | null,
  hives: readonly HiveOption[],
): string => {
  const already =
    saved !== null &&
    saved.audience === choice.audience &&
    (choice.audience !== 'hive' || saved.hiveId === choice.hiveId)
  if (choice.audience === 'private') {
    return already
      ? t(($) => $.project.form.audiencePrivate)
      : t(($) => $.project.form.audiencePrivateNew)
  }
  if (choice.audience === 'hive') {
    const hive = hives.find((one) => one.id === choice.hiveId)
    // Aucune ruche choisie encore (ou ses ruches pas encore lues) : la règle, sans nom.
    if (!hive) return t(($) => $.project.form.hiveHint)
    const name = hiveLabel(t, hive)
    return already
      ? t(($) => $.project.form.audienceHiveEdit, { hive: name })
      : t(($) => $.project.form.audienceHive, { hive: name })
  }
  return already
    ? t(($) => $.project.form.audienceMembersEdit)
    : t(($) => $.project.form.audienceMembers)
}

/** Les ruches du membre, une liste vide tant qu'elles ne sont pas lues (ou en panne). */
const useHiveOptions = (): readonly HiveOption[] => useMyHives().data?.hives ?? []

/** Hook : la phrase de `audienceSentence`, avec les ruches du membre. */
export const useAudienceSentence = (choice: AudienceChoice, saved: AudienceChoice | null) => {
  const { t } = useTranslation()
  return audienceSentence(t, choice, saved, useHiveOptions())
}

type Props = {
  audience: ProjectAudience
  /** R10 : la ruche choisie, quand l'audience est « Une ruche ». */
  hiveId: string | null
  change: ChangeField
  /** R10 : « Une ruche » envoyé sans ruche : la phrase s'écrit sous « Quelle ruche ? ». */
  hiveError?: string | undefined
  /** R10 : l'entrée de « Quelle ruche ? », où l'écran pose le focus après un envoi refusé. */
  hiveRef?: RefObject<Focusable | null> | undefined
}

/**
 * « Qui peut le voir ? » : les membres, une de ses ruches (R10, seulement à un membre d'au moins
 * une ruche), ou personne d'autre (un brouillon). « Une ruche » choisi, « Quelle ruche ? » suit.
 */
export function ProjectAudienceChoice({ audience, hiveId, change, hiveError, hiveRef }: Props) {
  const { t } = useTranslation()
  const hives = useHiveOptions()
  const choose = change('audience')
  const chooseHive = change('hiveId')
  const membersHint = t(($) => $.project.form.membersHint)
  const hiveHint = t(($) => $.project.form.hiveHint)
  const privateHint = t(($) => $.project.form.privateHint)
  // « Une ruche » seulement à un membre d'au moins une ruche ; un projet déjà réservé le garde,
  // même avant que ses ruches soient lues (sinon aucun choix ne serait coché).
  const offersHive = hives.length > 0 || audience === 'hive'
  // Le nom lu d'un choix est son libellé ; l'aide affichée dessous lui est liée (`hint`).
  return (
    <Stack gap="md">
      <ListGroup title={t(($) => $.project.form.audience)} radio>
        <ListRow
          label={t(($) => $.project.form.members)}
          detail={membersHint}
          hint={membersHint}
          selected={audience === 'members'}
          onPress={() => choose('members')}
        />
        {offersHive ? (
          <ListRow
            label={t(($) => $.project.form.hive)}
            detail={hiveHint}
            hint={hiveHint}
            selected={audience === 'hive'}
            onPress={() => choose('hive')}
          />
        ) : null}
        <ListRow
          label={t(($) => $.project.form.private)}
          detail={privateHint}
          hint={privateHint}
          selected={audience === 'private'}
          onPress={() => choose('private')}
        />
      </ListGroup>
      {audience === 'hive' && hives.length > 0 ? (
        <Choices
          label={t(($) => $.project.form.hiveChoice)}
          options={hives.map((hive) => ({ value: hive.id, label: hiveLabel(t, hive) }))}
          value={hiveId}
          onChange={chooseHive}
          error={hiveError}
          {...(hiveRef ? { entryRef: hiveRef } : null)}
        />
      ) : null}
    </Stack>
  )
}
