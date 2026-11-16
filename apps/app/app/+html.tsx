// Le squelette HTML des pages web, fabriqué une fois à la construction (pas d'API du navigateur ici).
import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'
import { documentCss } from '../src/ui/theme/document'

/*
 * R12 (plan, choix 5 ; relecture de sécurité du plan, B1) : en ligne, Caddy lit les pages publiques
 * (/fr/…, /en/…) comme des gabarits (infra/Caddyfile, « templates ») : ce qui est écrit entre
 * « [[waiggle » et « ]] » est une instruction, remplacée par son résultat avant l'envoi. Partout
 * ailleurs (les autres pages, le développement, le parcours local, les captures), personne ne les
 * exécute : elles doivent rester sans effet, et la page en français.
 *
 * Aucune de ces instructions n'écrit dans la page une valeur venue de la demande : l'adresse de la
 * page ne sert qu'à choisir entre deux textes fixes (« if hasPrefix ») ou part, encodée
 * (« urlquery »), dans l'adresse demandée à l'API. Sinon, une adresse piégée (« /fr/[[waiggle… »)
 * pourrait écrire du HTML dans la page.
 */

/**
 * La langue de `<html lang>`. Le français est écrit tel quel (`lang="fr"`), pour une page lue sans
 * Caddy. Juste avant lui, un attribut `data-waiggle-lang` porte l'instruction : sur une page
 * anglaise (/en/…), Caddy y écrit `" lang="en` (34 est le code du guillemet `"`, que React
 * échapperait s'il était écrit ici). La balise devient
 * `<html data-waiggle-lang="" lang="en" lang="fr">` : quand un attribut est répété, le navigateur
 * garde le premier (règle du HTML), la page est en anglais. Sinon, l'attribut reste vide, ou garde
 * l'instruction comme simple texte, sans effet.
 */
export const LANG_TEMPLATE =
  '[[waiggle if hasPrefix `/en/` .OriginalReq.URL.Path]][[waiggle printf `%c lang=%cen` 34 34]][[waiggle end]]'

/**
 * Le marqueur de la tête : un commentaire HTML (`<!-- … -->`), que le navigateur ignore, dans un
 * élément `<template>`, dont le contenu n'est jamais affiché (React ne sait pas écrire un
 * commentaire seul). Avec Caddy :
 * - la première instruction écrit `--></template>` : le commentaire et l'élément se ferment ;
 * - `$lang` vaut `en` sur une page anglaise, `fr` sinon ;
 * - `httpInclude` demande la tête à l'API (`GET /v1/public/head`, par Caddy lui-même) et l'écrit
 *   là : le titre, la description, l'adresse canonique et les deux langues (`hreflang`), l'aperçu
 *   des liens (Open Graph), et `noindex` pour une page qui n'est pas publique ;
 * - la dernière écrit `<template><!--` : un nouvel élément et un nouveau commentaire, fermés par la
 *   fin du marqueur (`-->`).
 * Les morceaux `"--" ">"` et `"<!" "--"` sont collés par `print` : écrits d'un seul tenant, ils
 * fermeraient (ou ouvriraient) le commentaire avant Caddy, et le reste s'afficherait en haut de la
 * page.
 */
export const HEAD_MARKER = [
  '<!--',
  '[[waiggle print "--" "></template>"]]',
  '[[waiggle $lang := "fr"]][[waiggle if hasPrefix "/en/" .OriginalReq.URL.Path]][[waiggle $lang = "en"]][[waiggle end]]',
  '[[waiggle httpInclude (print "/v1/public/head?lang=" $lang "&path=" (urlquery .OriginalReq.URL.Path))]]',
  '[[waiggle print "<template><!" "--"]]',
  '-->',
].join('')

export default function Root({ children }: PropsWithChildren) {
  return (
    <html data-waiggle-lang={LANG_TEMPLATE} lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, interactive-widget=resizes-content"
        />
        {/* La tête des pages publiques, écrite par Caddy (HEAD_MARKER, ci-dessus). Hors de tout
            <script> et <noscript>, dont le contenu se lit autrement. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: texte fixe de ce fichier, sans contenu de membre */}
        <template dangerouslySetInnerHTML={{ __html: HEAD_MARKER }} />
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
