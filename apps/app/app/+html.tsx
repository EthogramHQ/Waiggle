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
