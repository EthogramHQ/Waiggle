// Page d'avertissement « Tu quittes Waiggle pour… » : tout lien vers un autre site (démo d'un
// projet, lien dans une description) passe par ici avant de s'ouvrir.
// Pourquoi ? Un lien peut mentir sur sa destination : le texte « le site officiel » peut mener
// ailleurs. Ici, le membre voit l'adresse réelle, et le nom du site en clair, avant de décider.
//
// R5a (planches `R5a-Portail`) : le portail sur le miel, la feuille claire avec le nom du site en
// gras, l'adresse en petit, l'encadré de prudence, « Ouvrir le site ↗ » et « Rester sur Waiggle ».
// Quand le lien vient de la démo d'un projet (`?project=`), la page relit ce projet auprès de l'API
// et dit « La démo de …, ajoutée par … », mais seulement si sa démo est exactement l'adresse de la
// page (sec-B4) : sinon un lien fabriqué (`/out?url=piège&project=<vrai projet>`) ferait parler un
// vrai projet à côté d'un site piégé.
import { ProjectId, publicHttpsUrl } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'
import { useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { useGoBack } from '../navigation/useGoBack'
import { useProject } from '../projects/hooks'
import { Button } from '../ui/Button'
import { PortalRings } from '../ui/Illustrations'
import { type LeavingOrigin, LeavingSheet, type LeavingTesters } from '../ui/LeavingSheet'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { useTapGuard } from '../ui/tapGuard'
import { useHydrated } from '../ui/theme/hydration'

/**
 * L'adresse si c'est un lien https vers un site public, sinon null. Même règle que pour le lien de
 * démo (voir publicHttpsUrl dans @ruche/contracts) : pas de javascript:, pas d'adresse IP ni de
 * machine du réseau local, pas d'identifiant caché avant « @ », pas de nom écrit dans un autre
 * alphabet qui pourrait imiter un site connu.
 */
const safeTarget = (value: string | undefined): { host: string; href: string } | null => {
  if (!value) return null
  // Aucun « mailto: », même vers notre adresse : ces textes parlent d'un site tiers. « Nous
  // écrire » (Mon compte) ouvre la messagerie directement, sans passer par ici.
  return publicHttpsUrl(value)
}

/**
 * L'identifiant du projet d'où vient le lien, s'il en a la forme exacte (un UUID), sinon null :
 * « abc », « ../members/u1 » ou « <id>?x=1 » ne vont jamais jusqu'à l'API. Le paramètre vient de
 * l'adresse, que n'importe qui peut écrire.
 */
const projectIdOf = (value: string | undefined): string | null =>
  value !== undefined && ProjectId.safeParse(value).success ? value : null

type Props = {
  /** L'adresse à ouvrir (`?url=`), telle qu'elle est arrivée : la page la vérifie. */
  url: string | undefined
  /** Le projet d'où vient le lien (`?project=`), brut : la page le vérifie aussi. */
  project?: string | undefined
}

export function LeavingScreen({ url, project }: Props) {
  const { t } = useTranslation()
  // Sans page précédente (lien ouvert dans un nouvel onglet), « Rester » et « Retour » mènent au fil.
  const back = useGoBack('/')
  const target = safeTarget(url)
  // Sur le web, la page est préparée sans connaître l'adresse (elle est dans l'URL du visiteur) :
  // on n'affiche la destination, et on ne lit le projet, qu'une fois dans le navigateur (ui-9 ; voir
  // ui/theme/hydration.ts).
  const hydrated = useHydrated()

  // Miel 2 (R1) : le portail est un moment de marque, sur le « miel vif » (ui/BrandAmbiance.tsx).
  // Sur téléphone, le décor (`scene`) se pose sur le miel, au-dessus de la feuille ; sur ordinateur,
  // il passe à gauche de la carte (`hero`) : posé en tête de la carte blanche, ses anneaux clairs
  // s'y perdraient. Les trois états de la page ont le même décor : la bande de miel ne change pas
  // de hauteur quand la page passe de « préparée sans l'adresse » à « adresse lue ».
  const scene = <PortalRings />
  const frame = { ambiance: 'brand' as const, scene, hero: scene, onBack: back }

  if (!hydrated) {
    // Avant de lire l'adresse : le décor et le retour seulement, et l'onglet au seul nom de l'appli
    // (un titre affirmerait déjà où mène le lien).
    return (
      <Screen {...frame} pageTitle={null}>
        {null}
      </Screen>
    )
  }
  if (!target) {
    return (
      <Screen {...frame} title={t(($) => $.leaving.title)}>
        <Notice message={t(($) => $.leaving.invalid)} />
        <Button label={t(($) => $.leaving.stay)} variant="secondary" onPress={back} />
      </Screen>
    )
  }

  return (
    <Screen {...frame} pageTitle={t(($) => $.leaving.title)}>
      <OpenableTarget target={target} projectId={projectIdOf(project)} onStay={back} />
    </Screen>
  )
}

/**
 * La feuille d'une adresse qu'on peut ouvrir, et la lecture du projet d'où elle vient. À part de
 * l'écran : la session et le projet ne se lisent que pour une adresse valable (une adresse refusée
 * ne demande rien à personne).
 */
function OpenableTarget({
  target,
  projectId,
  onStay,
}: {
  target: { host: string; href: string }
  projectId: string | null
  onStay: () => void
}) {
  const { t } = useTranslation()
  const { data: session } = useSession()
  // Le projet n'est lu que s'il y a de quoi : un identifiant de projet et une session (l'API ne
  // montre un projet qu'à un membre connecté). La clé du cache est celle de la page du projet : en
  // venant d'elle, la ligne est là tout de suite, sans requête.
  const asks = projectId !== null
  const read = useProject(projectId ?? '', asks && Boolean(session))
  // Ce qui peut encore arriver se décide à l'arrivée, une fois pour la visite (un état n'est
  // initialisé qu'au premier dessin). En venant de la page du projet, sa lecture est déjà là : on
  // sait tout de suite si les lignes viendront, et aucune place n'est gardée pour rien (sur
  // ordinateur, une place gardée sous la carte faisait défiler la page dans une fenêtre basse).
  // Par un lien direct, la réponse viendra plus tard : la place est gardée jusqu'à elle.
  const [readAtArrival] = useState(() => read.data !== undefined)
  const mediaSource = useMediaSources(asks)
  // Une seule ouverture sur double tape : la seconde tape arrive avant que la page change.
  const guard = useTapGuard()
  const router = useRouter()
  // Le profil dit si le compte est suspendu (lu partout, sans requête de plus).
  const { suspended } = useSuspension()

  // La ligne « La démo de … » : seulement si la démo du projet lu est exactement l'adresse de la
  // page, comparées après la même mise en forme (publicHttpsUrl : « RECETTES.example.com/ » et
  // « recettes.example.com » sont le même site). Une autre page du même site, un nom qui commence
  // pareil, un « ?x=1 » ajouté : pas de ligne. Un refus de l'API (404, 401) : pas de ligne non plus,
  // et rien d'autre ne change à l'écran (rien ne dit si le projet existe).
  const shown = read.data
  const sameDemo = shown ? publicHttpsUrl(shown.demoUrl ?? '')?.href === target.href : false
  const origin: LeavingOrigin | null =
    shown && sameDemo
      ? {
          // Titre et nom en texte brut : Text n'interprète rien (ni Markdown, ni balise).
          text: t(($) => $.leaving.from, { title: shown.title, name: shown.author.name }),
          author: { name: shown.author.name, source: mediaSource(shown.author.avatarUrl) },
        }
      : null

  // La ligne des testeurs : seulement pour la démo d'un projet « Testable » (même règle que le
  // bouton « Rejoindre les testeurs » de sa page), d'un autre membre, dont on n'est pas déjà
  // testeur. Un compte suspendu n'a pas de quoi rejoindre : la page se tait. Rien ne s'inscrit
  // d'ici : le lien mène à la page du projet, où se trouve le bouton.
  const testers: LeavingTesters | null =
    shown &&
    sameDemo &&
    shown.status === 'testable' &&
    !shown.isMine &&
    !shown.isTester &&
    !suspended
      ? {
          name: shown.author.name,
          onOpenProject: guard(() =>
            router.push({ pathname: '/projects/[id]', params: { id: shown.id } }),
          ),
        }
      : null

  return (
    <LeavingSheet
      host={target.host}
      href={target.href}
      origin={origin}
      testers={testers}
      // La place de la ligne est gardée dès qu'elle peut venir (ui-17) : « Ouvrir le site » ne
      // bouge pas quand elle arrive. Lue avant l'arrivée, elle est déjà là, ou ne viendra pas.
      holdOrigin={asks && !readAtArrival}
      onOpen={guard(() => void Linking.openURL(target.href))}
      onStay={onStay}
    />
  )
}
