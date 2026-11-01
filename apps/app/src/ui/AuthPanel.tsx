// Le panneau d'entrée (tranche R2) : la connexion et l'inscription. Sur ordinateur (la carte des
// écrans de marque, dès 1 000 points), les deux formulaires sont deux onglets du même panneau
// (`Tabs`) : on passe de l'un à l'autre sans quitter la carte. Sur téléphone, un seul formulaire,
// celui de la page ; l'autre est à un lien (« Créer un compte », « J'ai déjà un compte »), que le
// formulaire porte lui-même.
//
// Le panneau ne connaît ni les champs ni l'adresse de la page : l'écran lui donne les deux
// formulaires, l'onglet choisi, et ce qu'il faut faire quand on en change (l'adresse suit l'onglet).
import { space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { type Tab, Tabs } from './Tabs'
import { useLayout } from './theme/layout'

type Props<K extends string> = {
  /** Le nom de la rangée d'onglets, lu par les lecteurs d'écran (« Connexion ou inscription »). */
  label: string
  /** Les formulaires, un par onglet, avec le libellé de leur onglet. */
  tabs: readonly Tab<K>[]
  selected: K
  onSelect: (key: K) => void
  /**
   * Le focus va à l'onglet choisi dès l'affichage (web) : l'écran le demande quand un changement
   * d'onglet vient de changer de page (voir Tabs).
   */
  focusOnMount?: boolean
  /**
   * La présentation, quelle que soit la largeur : le catalogue montre ainsi les deux. Sans elle,
   * des onglets sur la carte (ordinateur), un seul formulaire ailleurs.
   */
  presentation?: 'tabs' | 'single'
}

export function AuthPanel<K extends string>({
  label,
  tabs,
  selected,
  onSelect,
  focusOnMount = false,
  presentation,
}: Props<K>) {
  const { card } = useLayout()
  const withTabs = (presentation ?? (card ? 'tabs' : 'single')) === 'tabs'
  if (withTabs) {
    return (
      <Tabs
        label={label}
        tabs={tabs.map((tab) => ({ ...tab, content: <Form>{tab.content}</Form> }))}
        selected={selected}
        onSelect={onSelect}
        // Sur la carte claire : la capsule « grouped », le verre étant fait pour le miel.
        variant="grouped"
        focusOnMount={focusOnMount}
      />
    )
  }
  const current = tabs.find((tab) => tab.key === selected) ?? tabs[0]
  return current ? <Form>{current.content}</Form> : null
}

/** Les éléments d'un formulaire, espacés comme le reste de la feuille. */
function Form({ children }: { children: ReactNode }) {
  return <View style={{ gap: space.xl }}>{children}</View>
}
