// Une page publique à adresse par langue (`/fr/projects/<id>`, `/en/members/<id>`, tranche R12) se
// montre de deux façons : un membre connecté y garde ce qu'il voit aujourd'hui (commentaires,
// « Suivre »…), à n'importe laquelle des deux adresses ; un visiteur y voit l'écran visiteur, qui ne
// lit que les routes publiques (scénario « Les adresses par langue », choix 3 et 7 du plan).
//
// Tant que la session n'est pas lue (pré-rendu du site, première lecture), ou si sa lecture échoue,
// c'est l'écran visiteur : c'est celui du HTML préparé à l'avance, et il ne montre que ce que tout le
// monde peut voir.
import type { ReactNode } from 'react'
import { useMemberSession } from '../accounts/session'

export function MemberOrVisitor({ member, visitor }: { member: ReactNode; visitor: ReactNode }) {
  const { state } = useMemberSession()
  return <>{state === 'signedIn' ? member : visitor}</>
}
