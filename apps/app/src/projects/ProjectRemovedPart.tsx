// Une partie d'un projet retirée seule par la modération, telle que son auteur la lit sur la page du
// projet (R9, scénario « Retirer une partie », décision L2 de Louis du 13/11/2026 ; planche
// `R9-Partie-Retiree`). L'encadré lui-même (fondement, explication, date, « Contester », la justice,
// les boutons) est `ui/RemovedPart` ; ici, ce qui dépend du projet :
// - le titre (« La photo 2 a été retirée par la modération ») : le rang d'une photo est sa place
//   dans la galerie de l'auteur, où elle est encore ;
// - l'objet de l'e-mail de « Contester », qui nomme la décision et sa date (J12) : « Contestation :
//   retrait de la photo 2 de « Mon agent de recettes » du 12 novembre » ;
// - la partie elle-même, sous les yeux de l'auteur : la vignette de la photo, ou le texte retiré
//   (sorti de sa colonne, l'API le lui rend dans `value`). Un texte retiré s'écrit en texte simple,
//   jamais en Markdown ni en lien : il a été retiré, ses liens ne s'ouvrent plus d'ici.
//
// Et `useDeleteRemovedPhoto`, le « Supprimer » d'une photo retirée : la photo part pour de bon
// (`deleteVisual`), une seule fois même sur une double tape.
import type { Project, RemovedPart as RemovedPartData, ReportPartField } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { Notice } from '../ui/Notice'
import { ProjectThumb } from '../ui/ProjectThumb'
import { parisDateTime } from '../ui/parisTime'
import { partText } from '../ui/partText'
import { RemovedPart } from '../ui/RemovedPart'
import { Row, Stack } from '../ui/Stack'
import { Tag } from '../ui/Tag'
import { Text } from '../ui/Text'
import { deleteVisual } from './api'
import { projectQueryKey, useSetProject } from './hooks'

/** Les parties d'un projet que la modération retire seules, et qui ont un titre à elles. */
const PROJECT_PART_FIELDS = [
  'description',
  'tools',
  'demoUrl',
  'cover',
  'photo',
  'photoDescription',
  'prompt',
] as const satisfies readonly ReportPartField[]
export type ProjectPartField = (typeof PROJECT_PART_FIELDS)[number]

/** Les parties qui désignent une photo de la galerie (elles portent son identifiant). */
const PHOTO_FIELDS: readonly ProjectPartField[] = ['cover', 'photo', 'photoDescription']

/** Une partie retirée d'un projet, son champ rétréci aux parties qu'un projet peut perdre seules. */
export type ProjectRemovedPartData = RemovedPartData & { field: ProjectPartField }

/** Vrai si la partie est une partie de projet que cette page sait montrer. */
export const isProjectPart = (part: RemovedPartData): part is ProjectRemovedPartData =>
  (PROJECT_PART_FIELDS as readonly ReportPartField[]).includes(part.field)

/** Vrai si la partie désigne une photo (elle reste dans la galerie de l'auteur, marquée). */
export const isPhotoPart = (part: ProjectRemovedPartData): boolean =>
  PHOTO_FIELDS.includes(part.field) && part.mediaId !== null

type Props = {
  project: Project
  part: ProjectRemovedPartData
  /** « Remplacer » : le formulaire du projet ; null, le bouton n'est pas là (suspendu, retiré). */
  onReplace: (() => void) | null
  /** « Supprimer » : null, le bouton n'est pas là (un texte retiré ne se supprime pas d'ici). */
  onDelete: (() => void) | null
  /** Le refus de la dernière suppression de cette partie, lu sous l'encadré ; null, rien. */
  error?: string | null
}

export function ProjectRemovedPart({ project, part, onReplace, onDelete, error = null }: Props) {
  const { t, i18n } = useTranslation()
  const toSource = useMediaSources()
  // Le rang d'une photo dans la galerie de l'auteur, à partir de 1 ; null si elle n'y est plus.
  const visualIndex = part.mediaId
    ? project.visuals.findIndex((visual) => visual.id === part.mediaId)
    : -1
  const visual = visualIndex >= 0 ? project.visuals[visualIndex] : undefined
  const position = visualIndex >= 0 ? visualIndex + 1 : null

  // Le champ, recopié dans une constante avant le sélecteur (typage des textes).
  const field: ProjectPartField = part.field
  const title = t(($) => $.removal.part.titles[field], { n: position ?? undefined })
  // « la photo 2 », « la description » : le nom de la partie dans les phrases de la modération.
  const partName = partText({ field, mediaId: part.mediaId, position }, t, 'project')
  const subject = t(($) => $.removal.contestSubject, {
    decision: t(($) => $.removal.contestDecision.part, { part: partName, title: project.title }),
    date: parisDateTime(part.removal.at, i18n.language).date,
  })

  // La partie elle-même. Une valeur en liste (outils, prompts) : un élément par ligne ou par
  // étiquette ; une photo : sa vignette, pour savoir laquelle sans revenir à la galerie.
  const values = part.value === null ? [] : Array.isArray(part.value) ? part.value : [part.value]
  const content = visual ? (
    <Stack gap="sm">
      <Row>
        <ProjectThumb
          size="row"
          image={{
            source: toSource(visual.url),
            thumbhash: visual.thumbhash,
            label: visual.description ?? '',
          }}
        />
      </Row>
      {field === 'photoDescription' && values.length > 0 ? <RemovedText values={values} /> : null}
    </Stack>
  ) : field === 'tools' && values.length > 0 ? (
    <Stack direction="row" gap="sm" wrap>
      {values.map((label, rank) => (
        // Une étiquette sans page : texte simple, rien à toucher (`inCatalogue` faux). La liste
        // retirée ne change jamais d'ordre, et deux valeurs peuvent être égales : le rang en clé.
        // biome-ignore lint/suspicious/noArrayIndexKey: liste figée, valeurs pas forcément uniques
        <Tag key={`${rank}-${label}`} label={label} inCatalogue={false} />
      ))}
    </Stack>
  ) : values.length > 0 ? (
    <RemovedText values={values} />
  ) : null

  return (
    <Stack gap="md">
      <RemovedPart
        title={title}
        removal={part.removal}
        contestSubject={subject}
        onReplace={onReplace}
        onDelete={onDelete}
      >
        {content}
      </RemovedPart>
      {/* Sous l'encadré, près des boutons : le refus reste où le membre regarde. */}
      {error ? <Notice message={error} /> : null}
    </Stack>
  )
}

/** Un texte retiré, ligne par ligne : jamais du Markdown, et coupé plutôt que de déborder. */
function RemovedText({ values }: { values: readonly string[] }) {
  return (
    <Stack gap="sm">
      {values.map((value, rank) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: liste figée, deux prompts peuvent être égaux
        <Text key={`${rank}-${value}`} variant="body" tone="secondary" breakAnywhere>
          {value}
        </Text>
      ))}
    </Stack>
  )
}

/**
 * Hook : « Supprimer » une photo retirée. Une seule suppression à la fois (une ref : deux tapes
 * dans la même image) ; réussie, le projet renvoyé par l'API remplace celui du cache (la photo et sa
 * marque partent ensemble) et `onDeleted` est appelé ; refusée, `failed` dit quelle photo et
 * pourquoi, jusqu'au prochain essai. Un 404 : la photo n'est déjà plus là, ce que le membre voulait ;
 * la page se relit.
 */
export const useDeleteRemovedPhoto = (projectId: string, onDeleted: () => void) => {
  const setProject = useSetProject()
  const queryClient = useQueryClient()
  const sending = useRef(false)
  const [failed, setFailed] = useState<{ mediaId: string; error: ApiErrorKey } | null>(null)

  const remove = async (mediaId: string) => {
    if (sending.current) return
    sending.current = true
    setFailed(null)
    const result = await deleteVisual(projectId, mediaId)
    sending.current = false
    if (result.ok) {
      setProject(result.data)
    } else if (result.error === 'notFound') {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId), exact: true })
    } else {
      setFailed({ mediaId, error: result.error })
      return
    }
    onDeleted()
  }

  return { remove, failed }
}
