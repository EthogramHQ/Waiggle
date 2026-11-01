// « Proches à suivre » branché sur l'API (R4, F-Fil10) : la liste des membres suggérés, « Suivre »,
// « × », et les liens vers le membre et son dernier projet. Le dessin et les gardes (double tape,
// focus, « Annuler » pendant 5 secondes) sont ceux de ui/SuggestionList ; ce fichier-ci donne les
// données et les gestes. Il sert au premier lancement (feed/FirstRun, 5 lignes) et à la colonne de
// droite du Fil sur ordinateur (3 lignes).
import type { SuggestedMember } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { Notice } from '../ui/Notice'
import { type SuggestedMemberRow, SuggestionList } from '../ui/SuggestionList'
import { useToast } from '../ui/theme/toast'
import { useDismissSuggestion, useSuggestions } from './api'

type Props = {
  /** Le nombre de lignes : 5 au premier lancement, 3 dans la colonne de droite. */
  max: number
  /** Les lignes empilées : la colonne de droite est étroite (relecture design A1). */
  stacked?: boolean
}

/** Le « toggle » de useFollow : suit ou ne suit plus, selon l'état affiché qu'on lui passe. */
type Toggle = (shown?: unknown) => void

export function PeopleToFollow({ max, stacked = false }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const toast = useToast()
  const suggestions = useSuggestions()
  const { dismiss } = useDismissSuggestion()
  // Un compte suspendu (tranche 7c) ne suit plus personne de nouveau : « Suivre » reste à sa place,
  // inactif, comme dans Explorer (relecture de l'interface du plan R4).
  const { suspended } = useSuspension()
  // Les membres suivis (ou plus suivis) ici depuis l'ouverture. La liste n'est pas relue après
  // « Suivre » (la ligne garderait sa place mais perdrait son état) : c'est cet état local qui dit
  // « Tu suis ». Personne de la liste n'est suivi au départ : l'API n'y met que des inconnus.
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  // React Query v5 : relancer une lecture en échec, sans données, efface l'erreur pendant la
  // relecture. Sans cet état, le message et son « Réessayer » disparaîtraient sous le doigt, et le
  // focus du clavier avec eux.
  const [retrying, setRetrying] = useState(false)
  // Le « toggle » de chaque ligne, donné par son FollowKeeper (un hook par membre : voir plus bas).
  const toggles = useRef(new Map<string, Toggle>())
  const register = useCallback((id: string, toggle: Toggle | null) => {
    if (toggle) toggles.current.set(id, toggle)
    else toggles.current.delete(id)
  }, [])
  // L'API a refusé le dernier changement : la ligne revient à l'état d'avant, et un toast dit
  // pourquoi (la ligne n'a pas de place pour un message ; le toast n'a pas d'action).
  const failed = useCallback(
    (id: string, expired: boolean) => {
      setTouched((current) => ({ ...current, [id]: !current[id] }))
      toast.show(expired ? t(($) => $.errors.unauthorized) : t(($) => $.follow.error), {
        icon: 'warning',
      })
    },
    [toast, t],
  )

  if (suggestions.isError || retrying) {
    // Le titre « Proches à suivre » reste au-dessus du message (relecture design A8) : sans lui,
    // l'erreur flottait seule au-dessus de la section suivante.
    return (
      <SuggestionList
        members={[]}
        notice={
          <Notice
            message={t(($) => $.suggestions.loadError)}
            action={{
              label: t(($) => $.common.retry),
              onPress: () => {
                setRetrying(true)
                void suggestions.refetch().finally(() => setRetrying(false))
              },
            }}
          />
        }
        onFollow={() => {}}
        onOpenMember={() => {}}
        onOpenProject={() => {}}
        onDismiss={async () => ({ ok: true })}
      />
    )
  }
  const members = suggestions.data?.members ?? []
  // Rien à suggérer (ou pas encore lu) : ni titre ni cadre vide.
  if (members.length === 0) return null

  const rowOf = (member: SuggestedMember): SuggestedMemberRow => {
    const project = member.latestProject
    const cover = project.cover
    return {
      id: member.id,
      name: member.name,
      avatar: toSource(member.avatarUrl),
      project: {
        title: project.title,
        image: cover
          ? { source: toSource(cover.url), thumbhash: cover.thumbhash, label: project.title }
          : null,
      },
      followed: touched[member.id] ?? false,
    }
  }

  return (
    <>
      {members.map((member) => (
        <FollowKeeper key={member.id} id={member.id} register={register} onFailed={failed} />
      ))}
      <SuggestionList
        members={members.map(rowOf)}
        max={max}
        stacked={stacked}
        followDisabled={suspended}
        onFollow={(id) => {
          const followed = touched[id] ?? false
          setTouched((current) => ({ ...current, [id]: !followed }))
          // L'état affiché part avec le geste : sans page du membre en cache, c'est lui qui dit
          // s'il faut suivre ou arrêter de suivre.
          toggles.current.get(id)?.(followed)
        }}
        onOpenMember={(id) => router.push({ pathname: '/members/[id]', params: { id } })}
        onOpenProject={(id) => {
          const project = members.find((member) => member.id === id)?.latestProject
          if (project) router.push({ pathname: '/projects/[id]', params: { id: project.id } })
        }}
        onDismiss={dismiss}
      />
    </>
  )
}

type KeeperProps = {
  id: string
  register: (id: string, toggle: Toggle | null) => void
  onFailed: (id: string, expired: boolean) => void
}

/**
 * Un abonnement par ligne. Les hooks ne s'appellent pas dans une boucle (React les reconnaît à leur
 * ordre d'appel, qui doit rester le même à chaque rendu) : chaque membre a donc ce petit composant
 * invisible, qui appelle useFollow pour lui et confie son « toggle » à la liste.
 */
function FollowKeeper({ id, register, onFailed }: KeeperProps) {
  const follow = useFollow({ kind: 'member', id })
  const { toggle, error, expired } = follow
  useEffect(() => {
    register(id, toggle)
    return () => register(id, null)
  }, [id, toggle, register])
  // Un échec du dernier changement (l'erreur passe à vrai) : la liste revient en arrière.
  const latest = useRef(onFailed)
  latest.current = onFailed
  useEffect(() => {
    if (error) latest.current(id, expired)
  }, [error, expired, id])
  return null
}
