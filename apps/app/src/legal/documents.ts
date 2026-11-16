// Le contenu des quatre pages publiques (tranche R11, « La conformité ») : les Règles, la
// Confidentialité, les Mentions légales et l'Accessibilité. Pour chaque page, ce fichier dit quels
// textes de `packages/i18n` la composent (le titre, les puces de l'« En bref » et leur icône, les
// parties du texte complet, dans l'ordre), sa date de version, et remplit les paramètres des textes
// (`{{host}}`, `{{siren}}`…) depuis `packages/brand/src/legal.ts`, seul endroit où ils sont écrits.
//
// Fichier sans composant ni hook : l'écran des pages (screens/LegalPageScreen.tsx) et l'écran
// « Accepter » des règles le lisent tous deux, et ses tests l'appellent avec la fonction `t` d'une
// langue choisie (français, anglais). Une seule source pour les deux écrans : les puces que le
// membre accepte sont exactement celles de /rules (relecture du plan, U2).
import { legal, sourceUrl } from '@ruche/brand'
import { type LegalPage, RULES_VERSION } from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import type { useTranslation } from 'react-i18next'
import type { IconName } from '../ui/Icon'
import type { LegalSection } from '../ui/LegalDocument'

/** La fonction de traduction, telle que `useTranslation()` la donne (ou `i18n.t` dans un test). */
type T = ReturnType<typeof useTranslation>['t']

/** Une puce de l'« En bref » : son icône (décorative) et sa phrase. */
export type LegalPoint = { icon: IconName; text: string }

/** Une page prête à afficher : tous ses textes traduits, paramètres remplis. */
export type LegalDocumentContent = {
  title: string
  /** La date de la version, `AAAA-MM-JJ` ; `ui/LegalDocument` l'écrit « Version du 16 nov. 2026 ». */
  version: string
  summary: LegalPoint[]
  sections: LegalSection[]
}

/**
 * La date de version de chaque page, une seule par page (relecture du plan, S-C3). Celle des Règles
 * est `RULES_VERSION` (contrat) : la changer fait revenir l'écran « Accepter » chez chaque membre.
 * Les trois autres pages ne s'acceptent pas : leur date dit seulement quand leur texte a changé pour
 * la dernière fois, et se change à la main avec lui. Elles sont nées avec les Règles, en R11.
 * `Record<LegalPage, string>` oblige à donner une date à chaque page : une cinquième page ajoutée
 * au contrat ferait échouer le typage ici.
 */
export const LEGAL_VERSIONS: Record<LegalPage, string> = {
  rules: RULES_VERSION,
  privacy: '2026-11-16',
  legal: '2026-11-16',
  accessibility: '2026-11-16',
}

/**
 * Les paramètres des textes des pages, en plus de `{{appName}}` et `{{contactEmail}}` que
 * l'appli remplit partout d'elle-même (packages/i18n, `textVariables`). Les coordonnées de
 * l'éditeur et de l'hébergeur viennent de brand/legal ; tant que Louis ne les a pas tapées, elles
 * valent « […] ». Donnés à chaque texte, même à ceux qui n'en lisent aucun : i18next ignore un
 * paramètre que le texte ne cite pas.
 */
const params = {
  publisher: legal.publisher.name,
  publisherAddress: legal.publisher.address,
  publisherPhone: legal.publisher.phone,
  siren: legal.publisher.siren,
  publisherEmail: legal.publisher.email,
  publicationDirector: legal.publicationDirector,
  host: legal.host.name,
  hostAddress: legal.host.address,
  hostPhone: legal.host.phone,
  sourceUrl,
}

// Les clés de chaque page, telles que Translation les déclare. `keyof` : le nom d'une clé, vérifié
// par le typage (une faute de frappe, ou une clé effacée des textes, fait échouer `tsc`). Écrits
// page par page : un type générique (`Pages[P]['summary']`) ne se laisse pas indexer par le typage.
type Pages = Translation['legal']['pages']
type SummaryKeys = {
  rules: keyof Pages['rules']['summary']
  privacy: keyof Pages['privacy']['summary']
  legal: keyof Pages['legal']['summary']
  accessibility: keyof Pages['accessibility']['summary']
}
type SectionKeys = {
  rules: keyof Pages['rules']['sections']
  privacy: keyof Pages['privacy']['sections']
  legal: keyof Pages['legal']['sections']
  accessibility: keyof Pages['accessibility']['sections']
}
type SummaryKey<P extends LegalPage> = SummaryKeys[P]
type SectionKey<P extends LegalPage> = SectionKeys[P]

/*
 * L'icône de chaque puce de l'« En bref », page par page (les textes laissent ce choix à l'appli).
 * `Record<clé, icône>` oblige à donner une icône à chaque puce écrite dans les textes, et l'ordre
 * de l'objet est l'ordre d'affichage (celui du fichier de textes).
 */
const rulesPoints: Record<SummaryKey<'rules'>, IconName> = {
  respect: 'heart',
  account: 'user',
  consent: 'eye-slash',
  links: 'link',
  report: 'flag',
  inactive: 'clock',
  yours: 'download-simple',
}
const privacyPoints: Record<SummaryKey<'privacy'>, IconName> = {
  noAds: 'prohibit',
  email: 'envelope-simple',
  where: 'globe-simple',
  control: 'download-simple',
}
const legalPoints: Record<SummaryKey<'legal'>, IconName> = {
  publisher: 'briefcase',
  host: 'globe-simple',
  code: 'code',
}
const accessibilityPoints: Record<SummaryKey<'accessibility'>, IconName> = {
  status: 'shield-check',
  done: 'check-circle',
  contact: 'envelope-simple',
}

/*
 * Les parties du texte complet, dans l'ordre du fichier de textes. Leur clé sert aussi
 * d'identifiant (`id`) : stable d'une langue à l'autre. `legal/documents.test.ts` vérifie que
 * chaque liste reprend toutes les parties écrites, dans le même ordre.
 */
export const rulesParts: readonly SectionKey<'rules'>[] = [
  'purpose',
  'account',
  'content',
  'forbidden',
  'hives',
  'testers',
  'feed',
  'moderation',
  'authors',
  'leaving',
  'changes',
  'liability',
]
export const privacyParts: readonly SectionKey<'privacy'>[] = [
  'controller',
  'data',
  'retention',
  'device',
  'servers',
  'recipients',
  'assistant',
  'rights',
]
export const legalParts: readonly SectionKey<'legal'>[] = ['publisher', 'host', 'code', 'brand']
export const accessibilityParts: readonly SectionKey<'accessibility'>[] = [
  'commitment',
  'status',
  'done',
  'limits',
  'contact',
  'recourse',
]

/**
 * `Object.keys` rend des `string` : le typage ne sait pas que l'objet n'a que ses clés déclarées.
 * On le lui dit ici, une fois, pour les objets de ce fichier (écrits en entier juste au-dessus).
 */
const keysOf = <K extends string>(record: Record<K, unknown>): K[] => Object.keys(record) as K[]

/**
 * Une page, traduite par `t` : le titre, la version, les puces, les parties. Chaque branche lit ses
 * propres clés (`$.legal.pages.rules…`), pour que le typage vérifie chacune ; une clé passée en
 * crochets (`sections[key]`) est typée par `SectionKey`, jamais par `string` (sinon `tsc` refuse).
 */
export const legalDocument = (page: LegalPage, t: T): LegalDocumentContent => {
  const version = LEGAL_VERSIONS[page]
  switch (page) {
    case 'rules':
      return {
        title: t(($) => $.legal.pages.rules.title, params),
        version,
        summary: keysOf(rulesPoints).map((key) => ({
          icon: rulesPoints[key],
          text: t(($) => $.legal.pages.rules.summary[key], params),
        })),
        sections: rulesParts.map((key) => ({
          id: key,
          title: t(($) => $.legal.pages.rules.sections[key].title, params),
          body: t(($) => $.legal.pages.rules.sections[key].body, params),
        })),
      }
    case 'privacy':
      return {
        title: t(($) => $.legal.pages.privacy.title, params),
        version,
        summary: keysOf(privacyPoints).map((key) => ({
          icon: privacyPoints[key],
          text: t(($) => $.legal.pages.privacy.summary[key], params),
        })),
        sections: privacyParts.map((key) => ({
          id: key,
          title: t(($) => $.legal.pages.privacy.sections[key].title, params),
          body: t(($) => $.legal.pages.privacy.sections[key].body, params),
        })),
      }
    case 'legal':
      return {
        title: t(($) => $.legal.pages.legal.title, params),
        version,
        summary: keysOf(legalPoints).map((key) => ({
          icon: legalPoints[key],
          text: t(($) => $.legal.pages.legal.summary[key], params),
        })),
        sections: legalParts.map((key) => ({
          id: key,
          title: t(($) => $.legal.pages.legal.sections[key].title, params),
          body: t(($) => $.legal.pages.legal.sections[key].body, params),
        })),
      }
    case 'accessibility':
      return {
        title: t(($) => $.legal.pages.accessibility.title, params),
        version,
        summary: keysOf(accessibilityPoints).map((key) => ({
          icon: accessibilityPoints[key],
          text: t(($) => $.legal.pages.accessibility.summary[key], params),
        })),
        sections: accessibilityParts.map((key) => ({
          id: key,
          title: t(($) => $.legal.pages.accessibility.sections[key].title, params),
          body: t(($) => $.legal.pages.accessibility.sections[key].body, params),
        })),
      }
  }
}
