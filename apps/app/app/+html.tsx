// Le squelette HTML des pages web, fabriqué une fois à la construction (pas d'API du navigateur ici).
import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'
import { documentCss } from '../src/ui/theme/document'

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* Le favicon (fabriqué par scripts/images.mts) : le SVG d'abord, qui suit le thème du
            navigateur, puis le PNG pour ceux qui ne lisent pas le SVG. Chemins relatifs à la racine
            du site, aucun domaine (règle de sécurité S6 du plan de R1). */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="64x64" />
        <ScrollViewStyleReset />
        {/* La feuille de style de la page (fond, anneau de focus) : voir src/ui/theme/document.ts.
            Une feuille en ligne est permise par la politique de sécurité (style-src 'unsafe-inline'). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: texte fixe tiré des jetons, sans contenu de membre */}
        <style dangerouslySetInnerHTML={{ __html: documentCss }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
