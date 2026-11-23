// L'hôte global de la pastille de gain (R19) : les gestes qui n'ont pas de place à eux pour la
// pastille (suivre, créer une ruche, accepter une invitation, publier un projet, une mise à jour,
// le profil) rapportent leur pollen à l'ancrage `global` (gamification/pollen.ts). Cet hôte, posé
// une fois à la racine de l'appli à côté du toast (app/_layout.tsx), le montre à la place du toast,
// en bas de l'écran : « +3 pollen ».
//
// Les règles :
// - un seul à la fois : un nouveau gain remplace celui qui se joue ;
// - si un toast est affiché (« Projet publié. »), la pastille attend sa fin : elle se poserait sur
//   lui. Elle attend aussi un instant au départ, le temps qu'un toast du même geste paraisse (le
//   gain arrive à la réponse de l'API, le toast juste après, quand l'écran la lit) ;
// - un toast qui arrive pendant qu'elle se joue la remplace : elle a déjà été annoncée, et deux
//   choses au même endroit se cacheraient l'une l'autre ;
// - une fois jouée, elle part (elle ne reste pas montée, transparente, jusqu'au gain suivant).
//
// Ce fichier n'écrit aucun style : la place vient de `ToastPlace` (ui/theme/toast.tsx), la
// pastille de `PollenGain` (ui/PollenGain.tsx).
import { durations } from '@ruche/brand'
import { useEffect, useRef, useState } from 'react'
import { PollenGain as PollenGainBadge } from '../ui/PollenGain'
import { ToastPlace, useToastShown } from '../ui/theme/toast'
import { POLLEN_GAIN_MS, type PollenGain, usePollenGain } from './pollen'

/** L'instant laissé à un toast du même geste pour paraître avant la pastille. */
const SETTLE_MS = durations.quick

export function PollenGainHost() {
  const gain = usePollenGain('global')
  const toastShown = useToastShown()
  // Le gain en attente (arrivé, pas encore montré), et celui qui se joue.
  const [waiting, setWaiting] = useState<PollenGain | null>(null)
  const [playing, setPlaying] = useState<PollenGain | null>(null)
  // Le dernier gain reçu : `usePollenGain` rend le même objet tant qu'il ne change pas, puis `null`
  // après 2,5 s ; seule une clé neuve est un gain neuf.
  const seen = useRef<number | null>(null)

  // useEffect : un gain neuf part en attente (il remplace celui qui attendait, et celui qui se
  // joue : un seul à la fois).
  useEffect(() => {
    if (!gain || seen.current === gain.key) return
    seen.current = gain.key
    setPlaying(null)
    setWaiting(gain)
  }, [gain])

  // L'attente : sans toast, après un instant, la pastille se joue.
  useEffect(() => {
    if (!waiting || toastShown) return
    const start = setTimeout(() => {
      setPlaying(waiting)
      setWaiting(null)
    }, SETTLE_MS)
    return () => clearTimeout(start)
  }, [waiting, toastShown])

  // Un toast arrive pendant qu'elle se joue : il prend la place.
  useEffect(() => {
    if (toastShown) setPlaying(null)
  }, [toastShown])

  // Jouée, elle part : le temps de son mouvement (montée, tenue, départ), avec de la marge.
  useEffect(() => {
    if (!playing) return
    const end = setTimeout(() => setPlaying(null), POLLEN_GAIN_MS)
    return () => clearTimeout(end)
  }, [playing])

  if (!playing) return null
  return (
    <ToastPlace>
      <PollenGainBadge amount={playing.amount} trigger={playing.key} placement="above" />
    </ToastPlace>
  )
}
