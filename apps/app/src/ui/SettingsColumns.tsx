// La mise en page des réglages sur ordinateur (tranche R2) : la colonne des rubriques (SettingsNav)
// à gauche, étroite et fixe, et la rubrique ouverte à droite, qui prend le reste. Le titre de la
// rubrique est un titre de section (h2) : celui de la page (« Réglages », h1) est au-dessus.
// Sur téléphone et tablette, l'écran n'en a pas besoin : la liste et la rubrique y sont deux pages.
//
// Le focus du clavier (relecture de l'interface R2, C8) : chaque rubrique est une page à elle. Sans
// aide, après Entrée sur « Sécurité », le focus retombait tout en haut de la nouvelle page, et il
// fallait retraverser la barre du haut et la carte du membre. La colonne note donc la rubrique
// choisie (`noteSectionChosen`), et la page qui l'ouvre pose le focus sur son titre, sans faire
// défiler. Arrivé autrement (un lien, une page rechargée), le focus reste où le navigateur le met.
import { layout, space } from '@ruche/brand'
import { type ReactNode, useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { focusWithoutScroll } from './focus'
import { Surface } from './Surface'
import { Text } from './Text'

// La rubrique que la colonne vient d'ouvrir, en attendant que sa page s'affiche : une simple
// variable du module, lue une seule fois. Une clé, pas un « oui » : une rubrique qui a sa propre
// page (Mon profil) ne laisse pas le focus en suspens pour la prochaine page des réglages.
let chosen: string | null = null

/** La colonne l'appelle quand on y choisit une rubrique : sa page prendra le focus à l'arrivée. */
export const noteSectionChosen = (key: string) => {
  chosen = key
}

type Props = {
  /** La colonne des rubriques. */
  nav: ReactNode
  /** Le titre de la rubrique ouverte (« Langue »). */
  title: string
  /** La clé de la rubrique ouverte, pour savoir si on vient de la choisir dans la colonne. */
  current?: string
  /** Le contenu de la rubrique. */
  children: ReactNode
}

export function SettingsColumns({ nav, title, current, children }: Props) {
  const titleRef = useRef<View>(null)
  // useEffect sans dépendance qui change : une seule fois, à l'affichage de la page.
  useEffect(() => {
    if (chosen === null || chosen !== current) return
    chosen = null
    focusWithoutScroll(titleRef.current)
  }, [current])

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xxl }}>
      {/* La colonne : une carte blanche, de la largeur d'une colonne latérale. */}
      <View style={{ width: layout.settingsNavWidth, flexShrink: 0 }}>
        <Surface variant="grouped" padding="sm">
          {nav}
        </Surface>
      </View>
      {/* minWidth 0 : sur le web, sans lui, un long texte élargirait la colonne hors de la page. */}
      <View style={{ flex: 1, minWidth: 0, gap: space.lg }}>
        {/* Le titre peut recevoir le focus (tabIndex -1, web) sans devenir une étape de Tab. */}
        <View ref={titleRef} {...(Platform.OS === 'web' ? { tabIndex: -1 as const } : null)}>
          <Text variant="heading" heading={2}>
            {title}
          </Text>
        </View>
        {children}
      </View>
    </View>
  )
}
