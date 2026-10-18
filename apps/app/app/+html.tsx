// Le squelette HTML des pages web, fabriqué une fois à la construction (pas d'API du navigateur ici).
import { borders, palettes } from '@ruche/brand'
import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

// Le fond de la page avant que l'appli ne démarre : celui du jour, ou celui de la nuit si l'appareil
// est réglé en sombre (prefers-color-scheme). Sans cela, la page pré-rendue s'affiche toujours de
// jour, puis bascule : un éclair blanc la nuit. Les couleurs viennent des jetons de @ruche/brand.
// (Une feuille de style en ligne est permise par la politique de sécurité : style-src 'unsafe-inline'.)
//
// L'anneau de focus : le contour miel de l'élément choisi au clavier, le même pour tous les éléments
// touchables (boutons, liens, étiquettes, choix…). « :focus-visible » ne l'allume qu'au clavier,
// pas après un clic de souris. Sa couleur (--focus-ring) suit le thème : ui/theme/ThemeProvider.tsx.
// Les champs de saisie montrent déjà leur focus par leur bordure : pas d'anneau en plus.
const background = `
html, body { background-color: ${palettes.day.background}; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: ${palettes.night.background}; }
}
:focus-visible {
  outline: ${borders.focus}px solid var(--focus-ring, ${palettes.day.focusRing});
  outline-offset: ${borders.focus}px;
}
:focus:not(:focus-visible), input:focus-visible, textarea:focus-visible { outline: none; }
`

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: texte fixe fabriqué ici, sans contenu de membre */}
        <style dangerouslySetInnerHTML={{ __html: background }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
