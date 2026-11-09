// « Qui peut le voir ? » de la feuille de publication (R6a), et la phrase qui dit qui verra le
// projet, sortis de `ProjectFormFields` après les relectures (ui-C6). Sur téléphone, les champs les
// posent à la fin ; sur ordinateur, l'écran met le choix dans la colonne de l'aperçu
// (`ProjectFormPreview`) et la phrase au pied de la feuille.
import { useTranslation } from 'react-i18next'
import type { ProjectAudience } from '../projects/form'
import { ListGroup, ListRow } from '../ui/ListGroup'
import type { ChangeField } from './ProjectFormFields'

// La fonction `t` de react-i18next, pour les textes calculés hors du rendu.
type T = ReturnType<typeof useTranslation>['t']

/**
 * La phrase qui dit qui verra le projet, sous « Qui peut le voir ? » (ou au pied de la feuille sur
 * ordinateur). `saved` est l'audience enregistrée du projet modifié, `null` pour un nouveau projet.
 * Ce qui n'est pas encore enregistré parle au futur (un nouveau projet, ou un choix différent de
 * l'enregistré) ; ce qui l'est déjà, au présent. Un projet privé passé sur « Membres » ne dit donc
 * pas « voient » avant d'être enregistré (jur-C3, décision de Louis du 9/11/2026).
 */
export const audienceSentence = (
  t: T,
  audience: ProjectAudience,
  saved: ProjectAudience | null,
): string => {
  const already = saved === audience
  if (audience === 'private') {
    return already
      ? t(($) => $.project.form.audiencePrivate)
      : t(($) => $.project.form.audiencePrivateNew)
  }
  return already
    ? t(($) => $.project.form.audienceMembersEdit)
    : t(($) => $.project.form.audienceMembers)
}

/** « Qui peut le voir ? » : les membres, ou personne d'autre (un brouillon). */
export function ProjectAudienceChoice({
  audience,
  change,
}: {
  audience: ProjectAudience
  change: ChangeField
}) {
  const { t } = useTranslation()
  const choose = change('audience')
  const membersHint = t(($) => $.project.form.membersHint)
  const privateHint = t(($) => $.project.form.privateHint)
  // Le nom lu d'un choix est son libellé ; l'aide affichée dessous lui est liée (`hint`).
  return (
    <ListGroup title={t(($) => $.project.form.audience)} radio>
      <ListRow
        label={t(($) => $.project.form.members)}
        detail={membersHint}
        hint={membersHint}
        selected={audience === 'members'}
        onPress={() => choose('members')}
      />
      <ListRow
        label={t(($) => $.project.form.private)}
        detail={privateHint}
        hint={privateHint}
        selected={audience === 'private'}
        onPress={() => choose('private')}
      />
    </ListGroup>
  )
}
