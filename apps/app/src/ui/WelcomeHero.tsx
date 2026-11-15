// La scène d'accueil des grands écrans (accueil d'un visiteur, connexion, inscription), posée sur le
// « miel vif » (ui/BrandAmbiance.tsx) : la constellation de tuiles autour du logo, puis la phrase
// d'accroche en affiche (la variante `poster` de Text, le plus grand texte de l'appli).
//
// Miel 2 (R1) : le logo remplace l'ancienne bulle de verre qui portait le nom et l'accroche. Sur le
// miel, la lisibilité vient du verre : la phrase d'accroche est posée sur un verre (`panel`), dont
// les couples texte / fond sont mesurés sur le miel et sur le noir (`contrastPairs`, @ruche/brand).
// Le miel de nuit va d'un cœur de miel clair à un bord presque noir : aucune couleur de texte ne s'y
// lirait partout sans verre.
//
// R11 (planche R11-Pied, « Moins de mots ») : la pastille « … est un logiciel libre · Voir le code »
// a quitté la scène. Le lien vers le code est dans le pied de la feuille (ui/LegalLinks.tsx), avec
// les quatre pages publiques, sur téléphone comme sur ordinateur : la scène ne le répète pas.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Constellation } from './Constellation'
import { Logo } from './Logo'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** La phrase d'accroche, en affiche. */
  tagline: string
}

/** La hauteur de la constellation : le logo au centre, les tuiles autour. */
const SCENE_HEIGHT = 400
/** La hauteur du logo, en points : assez grand pour signer la page, sans écraser l'affiche. */
const LOGO_SIZE = 120

export function WelcomeHero({ tagline }: Props) {
  return (
    <View style={{ gap: space.xl }}>
      <Constellation height={SCENE_HEIGHT} layout="scene">
        {/* Le logo est une image nommée (« Logo de Waiggle ») : la scène dit d'abord chez qui on est. */}
        <Logo variant="full" size={LOGO_SIZE} />
      </Constellation>
      {/* L'affiche : la phrase d'accroche en très grand, sur un verre qui la garde lisible de jour
          comme de nuit. */}
      <Surface variant="panel" radius="ambiance" padding="xxl">
        <Text variant="poster">{tagline}</Text>
      </Surface>
    </View>
  )
}
