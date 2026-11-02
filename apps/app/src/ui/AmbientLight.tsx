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
import { type LightSwitch, SoftLight } from './AmbientLightSoft'
import { type AmbientLightProps, useLightSource } from './theme/ambient'

// `off` : la lumière s'efface en fondu (aucun écran affiché n'en veut). Il est surtout lu sur le
// web, où une seule lumière sert toutes les pages (ui/AmbientHost.tsx) ; ce fichier le reçoit
// aussi, puisque TypeScript lit ici le type des deux versions.
export function AmbientLight({ off = false, ...props }: AmbientLightProps & LightSwitch) {
  return <SoftLight source={useLightSource(props)} off={off} />
}
