// Le bouton « 1 nouveau commentaire » (refonte, tranche R21, « Le temps réel »). Quand des
// commentaires arrivent hors de vue pendant que le membre lit plus haut, la liste ne saute pas :
// ce bouton paraît, et le toucher l'amène aux nouveaux. C'est le membre qui choisit d'y aller ;
// rien ne bouge sous son doigt sans son geste.
//
// Cousin du bouton des nouveautés du Fil (`NewItemsBanner`), mais pas le même composant : celui-ci
// écrit son texte à partir des sortes arrivées (projets, mises à jour), montre les visages des
// auteurs, garde une place réservée en permanence et y affiche une phrase quand il n'y a rien de
// neuf. Ici, un nombre et un geste suffisent : généraliser `NewItemsBanner` lui aurait ajouté des
// props qui ne servent qu'à l'un des deux, et à 0 ce bouton-ci ne prend aucune place (l'écran le
// pose dans la place flottante de `Screen`, qui ne pousse pas la liste).
//
// L'arrivée est annoncée une seule fois, poliment, par une région `LiveStatus` cachée à l'œil (le
// bouton se voit déjà) : jamais par le focus, qui reste là où la personne lit. Un nouveau dessin
// avec le même nombre se tait ; un nombre qui change (« 2 nouveaux commentaires ») s'annonce.
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View, type ViewStyle } from 'react-native'
import { Button } from './Button'
import { LiveStatus } from './LiveStatus'

type Props = {
  /** Le nombre de commentaires arrivés hors de vue ; 0 : rien de neuf, le bouton n'est pas là. */
  count: number
  /** Ce que fait l'écran au toucher : amener le membre aux nouveaux commentaires. */
  onPress: () => void
  /**
   * Vrai (défaut) : le bouton annonce lui-même l'arrivée, par sa propre région. Faux : l'écran a
   * déjà une région au même endroit (la feuille des commentaires, la colonne de l'ordinateur) et y
   * annonce le même texte ; deux régions dans une même fenêtre se liraient en double (R21).
   */
  announce?: boolean
  /**
   * Sur quoi le bouton se pose. `page` (défaut) : en verre, dans la place flottante de `Screen`, sur
   * la lumière de la page. `sheet` : blanc et plein, par-dessus le texte de la liste d'une feuille :
   * le verre de nuit y laissait passer les lignes du commentaire dessous, et le libellé se lisait
   * mal (capture du catalogue, R21).
   */
  on?: 'page' | 'sheet'
}

/**
 * Sans bouton, la place ne prend aucune place : posée hors du flux (`position: absolute`), elle ne
 * compte pas non plus dans l'écart (`gap`) d'une pile qui la contiendrait. Elle reste montée pour
 * la région annoncée et pour recevoir le focus quand le bouton s'en va.
 */
const empty: ViewStyle = { position: 'absolute', width: 0, height: 0, overflow: 'hidden' }

/** Sur le web : le focus est-il retombé sur toute la page (`body`), parce que son élément a disparu ? */
const focusLost = () => {
  const page = (globalThis as { document?: { activeElement?: unknown; body?: unknown } }).document
  if (!page) return false
  return !page.activeElement || page.activeElement === page.body
}

export function NewCommentsButton({ count, onPress, announce = true, on = 'page' }: Props) {
  const { t } = useTranslation()
  // Au-delà de 0, le nombre lui-même : « 1 nouveau commentaire », « 3 nouveaux commentaires ».
  const label = count > 0 ? t(($) => $.project.comments.newComments, { count }) : ''

  // La place du bouton. Après un toucher, l'écran remet le nombre à 0 et le bouton disparaît : sur
  // le web, le focus du clavier retomberait alors tout en haut de la page. S'il n'a été posé nulle
  // part ailleurs (l'écran peut le donner au premier nouveau commentaire), il revient ici (tabIndex
  // -1 : on peut y poser le focus, mais la touche Tab ne s'y arrête pas), sans faire défiler la page
  // (`preventScroll`).
  const slot = useRef<View>(null)
  // Vrai entre un toucher et la disparition du bouton qui le suit : on ne rattrape que ce focus-là
  // (un nombre remis à 0 parce que le membre a défilé lui-même ne déplace rien).
  const pressed = useRef(false)
  useEffect(() => {
    if (count > 0 || !pressed.current) return
    pressed.current = false
    if (Platform.OS !== 'web' || !focusLost()) return
    const place = slot.current as unknown as { focus?: (options?: object) => void } | null
    place?.focus?.({ preventScroll: true })
  }, [count])

  return (
    <View
      ref={slot}
      {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
      style={count > 0 ? { alignSelf: 'center', maxWidth: '100%' } : empty}
    >
      {count > 0 ? (
        // En verre plutôt qu'en miel : l'action miel de la page (« Tester la démo ») reste la
        // seule. La flèche montre où sont les nouveaux : sur la page, plus bas que ce qu'on lit (la
        // section des commentaires) ; dans la feuille, rangée du plus récent au plus ancien, plus
        // haut. Hauteur `compact`, 44 points : la zone à toucher minimale.
        <Button
          label={label}
          onPress={() => {
            pressed.current = true
            onPress()
          }}
          icon={on === 'sheet' ? 'caret-up' : 'caret-down'}
          variant={on === 'sheet' ? 'secondary' : 'glass'}
          size="compact"
        />
      ) : null}
      {/* Toujours montée, vide à 0 : un lecteur d'écran n'annonce que ce qui change dans une région
          qu'il connaît déjà (voir LiveStatus). */}
      {announce ? <LiveStatus message={label} visible={false} /> : null}
    </View>
  )
}
