// La garde des règles (tranche R11, « La conformité ») : tant que le membre connecté n'a pas accepté
// la version des règles en vigueur (`me.rulesAccepted` faux), l'écran « Accepter »
// (`screens/AcceptRulesScreen`) passe au-dessus de tout, barre d'onglets comprise. Montée une fois
// dans le cadre de l'appli (`app/_layout.tsx`), comme la feuille du pseudo provisoire.
//
// Ce que la garde ne fait pas : déplacer le membre. La page demandée (un lien reçu par e-mail, la
// barre d'adresse) reste montée dessous ; une fois les règles acceptées, la couche s'efface et
// cette page est là, sans nouvelle navigation.
//
// Quelques adresses restent ouvertes sans accord (relecture du plan, U-B1 et décision D1) : les
// quatre pages légales (on lit ce qu'on accepte), la désinscription d'un e-mail, les réglages des
// e-mails, la suppression du compte, la page d'avertissement d'un lien externe, et « Mes
// commentaires » et « Mes retours envoyés » (on peut retirer ce qu'on a écrit sans accepter).
// « Mes données » (`/settings/data`) elle-même reste gardée : « Télécharger mes données » se fait
// sur l'écran « Accepter ».
import { LEGAL_PAGES } from '@ruche/contracts'
import { supportedLanguages } from '@ruche/i18n'
import { usePathname } from 'expo-router'
import { useEffect, useId, useRef, useState } from 'react'
import { Modal, Platform } from 'react-native'
import { useSession } from '../accounts/api'
import { publicPath } from '../navigation/publicPath'
import { useMe } from '../profile/hooks'
import { AcceptRulesScreen } from '../screens/AcceptRulesScreen'
import { openModalLayer, sameLayer } from '../ui/modalLayers'
import { focusPageLanding } from '../ui/Sheet'
import { TabBarSpaceContext } from '../ui/tabBarSpace'
import { useHydrated } from '../ui/theme/hydration'

/**
 * Les adresses ouvertes sans accord, comparées exactement : `/rulesx` ou `/settings/data/commentsx`
 * ne passent pas pour `/rules` ou `/settings/data/comments` (un préfixe ouvrirait tout ce qui
 * commence pareil).
 */
const OPEN_PATHS: ReadonlySet<string> = new Set([
  // Les pages légales, à leur adresse d'avant R12 et dans chaque langue (`/fr/rules`, R12) :
  // `publicPath` les écrit, comme les liens du pied de page.
  ...LEGAL_PAGES.flatMap((page) => [
    `/${page}`,
    ...supportedLanguages.map((lang) => publicPath(page, lang)),
  ]),
  '/unsubscribe',
  '/settings/notifications',
  '/settings/account/delete',
  '/out',
  '/settings/data/comments',
  '/settings/data/feedback',
])

/**
 * L'adresse est-elle ouverte sans accord ? On compare son seul chemin : sans ce qui suit `?` ou
 * `#` (`/rules?from=sign-up`), et sans barre finale (`/rules/`), deux écritures de la même page.
 */
const isOpenPath = (pathname: string): boolean => {
  const path = pathname.split(/[?#]/)[0] ?? ''
  const bare = path.length > 1 ? path.replace(/\/+$/, '') : path
  return OPEN_PATHS.has(bare)
}

/** Le document du navigateur, ce que la garde en lit pour rendre le focus. */
type WebDocument = { activeElement?: { isConnected?: boolean } | null; body?: unknown }

/**
 * Le focus est-il perdu, sur le web : sur la page entière (`body`), ou sur un élément de la couche
 * qui vient de disparaître ? Un focus posé ailleurs (la page d'arrivée l'a déjà placé) est gardé.
 */
const focusLost = (): boolean => {
  const page = (globalThis as { document?: WebDocument }).document
  const active = page?.activeElement
  return active == null || active === page?.body || active.isConnected === false
}

export function RulesGate() {
  const { data: session } = useSession()
  // Pour un visiteur (pas de session), useMe ne fait aucune requête.
  const { data: me } = useMe(Boolean(session))
  const pathname = usePathname()
  // Sur le web, la page est pré-rendue sans connaître le visiteur : rien avant l'hydratation, sinon
  // le premier affichage ne serait pas celui du HTML préparé (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()
  const gated =
    hydrated && Boolean(session) && me != null && !me.rulesAccepted && !isOpenPath(pathname)

  // La couche reste montée après sa fermeture, le temps de son fondu de sortie (`visible` à faux) ;
  // elle se retire ensuite (`onDismiss`). Un état mis à jour pendant le rendu, et seulement quand
  // il change : React redessine aussitôt, sans afficher l'état intermédiaire.
  const [mounted, setMounted] = useState(false)
  if (gated && !mounted) setMounted(true)

  // Sur le web, ouverte, la couche entre dans la pile des couches modales (`ui/modalLayers`) : une
  // feuille ouverte dessous (une feuille à adresse) ne lui reprend pas le focus, ne se ferme pas sur
  // Échap à sa place, et la feuille du pseudo provisoire attend qu'elle soit partie.
  const layerId = useId()
  const layerRef = useRef<Modal>(null)
  useEffect(() => {
    if (!gated || Platform.OS !== 'web') return
    return openModalLayer(layerId, (node) => sameLayer(layerRef.current, node))
  }, [gated, layerId])

  // Après l'accord, le profil reste dans le cache (`rulesAccepted: true`) : l'écran se dessine
  // encore pendant le fondu. Sans session ni profil (déconnexion), la couche part tout de suite.
  if (!mounted || !session || !me) return null

  // La couche partie (fin du fondu de sortie, web et iOS) : après l'accord, le focus va au titre de
  // la page restée dessous, comme à la fermeture d'une feuille ouverte par son adresse, au lieu de
  // retomber sur toute la page. Sur téléphone, le lecteur d'écran revient de lui-même à la page.
  const onDismiss = () => {
    if (gated) return
    setMounted(false)
    if (Platform.OS === 'web' && focusLost()) focusPageLanding()
  }

  return (
    // Modal : une couche au-dessus de tout l'écran, barre d'onglets comprise ; sur le web, son piège
    // à focus garde Tab dans l'écran « Accepter », et la page dessous n'est plus atteinte.
    // `onRequestClose` (Échap relâchée sur le web, Retour d'Android) ne ferme rien : on n'en sort
    // qu'en acceptant, ou par les sorties de l'écran (supprimer le compte, se déconnecter). Le fond
    // est celui de l'écran (`Screen`), qui pose aussi sa lumière.
    <Modal
      ref={layerRef}
      visible={gated}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
      onDismiss={onDismiss}
    >
      {/* La barre d'onglets est cachée sous la couche : l'écran n'a pas à lui réserver de place
          en bas (`null` : « aucun cadre de barre », comme une page sans onglets). */}
      <TabBarSpaceContext.Provider value={null}>
        <AcceptRulesScreen me={me} />
      </TabBarSpaceContext.Provider>
    </Modal>
  )
}
