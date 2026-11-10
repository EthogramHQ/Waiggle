// La ligne de dates d'un projet (R7a, relecture du plan, interface A4) : « Publié le 12 sept. · Mis à
// jour il y a 2 jours · v1.2 », sous le titre de la page du projet et en tête de la frise des mises à
// jour. Deux copies auraient fini par diverger : la ligne vit ici, et `ProjectHeader` comme la page
// de la frise la posent.
// - « Publié … » pour un projet public, « Créé … » pour un projet privé (publié pour personne) ;
// - « Mis à jour … » suit la dernière mise à jour publiée (jamais une simple modification du projet) ;
//   sans mise à jour, ni « Mis à jour » ni version ;
// - la version de cette mise à jour, discrète, en Geist Mono (le rôle `mono` sert aux versions).
// On voit la date courte ; le lecteur d'écran entend la date complète (`RelativeTime` et sa phrase).
import type { ProjectVisibility } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { MetaLine } from './MetaLine'
import { RelativeTime } from './RelativeTime'
import { VersionText } from './VersionText'

type Props = {
  /** La date de création du projet, au format ISO du contrat. */
  createdAt: string
  /** Public : « Publié … » ; privé : « Créé … ». */
  visibility: ProjectVisibility
  /** La date de la dernière mise à jour publiée ; null sans mise à jour (ni date, ni version). */
  latestUpdateAt: string | null
  /** La version de la dernière mise à jour (« v1.2 ») ; null si elle n'en a pas. */
  version: string | null
  /** L'heure qu'il est, pour figer les dates relatives (tests, catalogue). */
  now?: Date
}

export function ProjectDatesLine({ createdAt, visibility, latestUpdateAt, version, now }: Props) {
  const { t } = useTranslation()
  const priv = visibility === 'private'
  // La date complète, lue par le lecteur d'écran : « le 12 octobre à 08:00 ».
  const onFull = (full: string) => t(($) => $.dates.onDate, { date: full })
  return (
    // MetaLine pose le point entre deux morceaux et laisse la ligne passer à la ligne quand elle ne
    // tient pas (320 points, texte agrandi), sans couper un morceau en deux.
    <MetaLine>
      <RelativeTime
        date={createdAt}
        now={now}
        phrase={({ afterVerb, full }) => ({
          label: priv
            ? t(($) => $.project.page.createdOn, { when: afterVerb })
            : t(($) => $.project.page.publishedOn, { when: afterVerb }),
          spoken: priv
            ? t(($) => $.project.page.createdOn, { when: onFull(full) })
            : t(($) => $.project.page.publishedOn, { when: onFull(full) }),
        })}
      />
      {latestUpdateAt ? (
        <RelativeTime
          date={latestUpdateAt}
          now={now}
          phrase={({ afterVerb, full }) => ({
            label: t(($) => $.project.page.updatedWhen, { when: afterVerb }),
            spoken: t(($) => $.project.page.updatedWhen, { when: onFull(full) }),
          })}
        />
      ) : null}
      {/* La version, un texte à elle : elle seule prend la police à chasse fixe, à la taille des
          dates et dans leur gris (discrète). Jamais sans la mise à jour qui la porte. */}
      {latestUpdateAt && version ? <VersionText version={version} tone="muted" /> : null}
    </MetaLine>
  )
}
