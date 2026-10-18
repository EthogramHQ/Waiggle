# 0002 — Une interface faite de jetons et de composants, sans bibliothèque de style

- Statut : accepté
- Date : 2026-10-12

## Contexte

Louis a choisi la direction visuelle « Miel ». Il demande que l'appli et le site restent faciles à
modifier, surtout l'interface. Jusqu'ici, chaque écran écrivait ses propres tailles, rayons et
couleurs (une soixantaine de valeurs réparties dans seize fichiers), et le nom « Ruche » était écrit
en dur à une quinzaine d'endroits. Changer l'apparence voulait dire retoucher chaque écran.

Nous avons aussi renoncé à Figma. Il aurait fallu tenir à jour un second modèle de l'interface, qui
aurait fini par ne plus ressembler à l'appli.

## Décision

1. **Un paquet `@ruche/brand`**, sans dépendance. Il contient le nom affiché et les jetons de
   design : couleurs jour et nuit, lettres, formes, ombres et mouvement. L'appli, les e-mails de
   l'API et un futur site le partagent.
2. **Des composants maison** dans `apps/app/src/ui`, écrits avec le `StyleSheet` standard de React
   Native. Ce sont les seuls à lire les jetons.
3. **Des écrans qui ne font qu'assembler** ces composants. Un lint (Biome) leur interdit les
   briques de dessin de React Native, et un test interdit toute couleur écrite à la main.
4. **La référence visuelle, c'est l'appli**, montrée par un catalogue des composants et par des
   captures automatiques jointes à chaque pull request.
5. **Les bibliothèques** :
   - Reanimated pour le mouvement ;
   - expo-blur pour le verre ;
   - react-native-svg pour les icônes (Phosphor, générées par un script) et les dégradés ;
   - expo-image pour la lumière d'ambiance ;
   - les polices Funnel livrées avec l'appli.

## Raisons

- **Pas de bibliothèque de style** (Tamagui, NativeWind, Unistyles) :
  - le code reste du React Native ordinaire, que Louis lit en apprenant ;
  - il y a moins de dépendances à surveiller et à mettre à jour avec le SDK Expo ;
  - nos besoins (deux thèmes, une échelle de jetons) tiennent en quelques fichiers.
- **Des noms de rôle plutôt que des valeurs** (`textMuted`, `title2`) : une même décision peut
  changer de valeur (le jour, la nuit, une nouvelle teinte) sans toucher aux composants.
- **Des garde-fous automatiques** : une règle qui n'est pas vérifiée finit par être oubliée. Ici,
  la CI la rappelle.
- **Des tests sur le comportement, pas sur l'apparence** (rôle, nom, état) : on peut refaire
  l'interface sans réécrire les tests.

## Conséquences

- **Ajouter un élément d'interface** demande de créer un composant (et de l'ajouter au catalogue)
  plutôt que de styler directement dans l'écran. C'est un peu plus de travail la première fois, et
  bien moins ensuite.
- **Sur le web**, les pages sont pré-rendues sans connaître le visiteur. Elles s'affichent d'abord
  en jour, en largeur de téléphone et en français, puis passent au thème, à la largeur et à la
  langue réels dès que l'écran est prêt (`ui/theme/hydration.ts`).
- **Sur Android**, le verre n'est pas encore flouté (il faut désigner la zone à flouter, écran par
  écran) : il est un peu plus opaque à la place.
- **La lumière d'ambiance des projets** demandera au serveur de calculer un ThumbHash de chaque
  visuel (tranche 3b). Venant de l'API, il sera vérifié par le contrat (base64, longueur bornée)
  avant d'être affiché.
