// La lumière d'ambiance, signature de la direction Miel : derrière l'écran, une grande lueur douce
// qui prend la couleur de sa source (un projet, un avatar, trois couleurs). Sans source, c'est la
// « lumière miel ». La source vient de l'écran (theme/ambient.tsx, useAmbient().setSource), ou de
// la prop `thumbhash` pour une lumière posée dans une carte.
//
// Vie privée : la position de la souris et le capteur d'inclinaison ne servent qu'au dessin ; rien
// n'est gardé ni envoyé ; l'image dessinée n'est jamais relue.
//
// Ce fichier sert au téléphone (iOS, Android) : c'est la version allégée (AmbientLightSoft.tsx),
// qui respire, s'avive d'une impulsion, se met en pause en arrière-plan et suit l'inclinaison.
// Sur le web, Metro prend à sa place AmbientLight.web.tsx (un « fichier de plateforme » : même nom,
// suffixe .web), qui dessine sur ordinateur la lumière vivante du prototype.
import { SoftLight } from './AmbientLightSoft'
import { type AmbientLightProps, useLightSource } from './theme/ambient'

export function AmbientLight(props: AmbientLightProps) {
  return <SoftLight source={useLightSource(props)} />
}
