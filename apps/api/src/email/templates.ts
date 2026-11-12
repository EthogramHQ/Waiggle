// Les e-mails envoyés par l'appli, dans la langue du membre.
// Chaque e-mail existe en deux versions : texte brut (lu par tous les logiciels de messagerie)
// et HTML (plus joli). Les textes viennent de @ruche/i18n, et les couleurs de @ruche/brand,
// comme dans l'appli : changer le miel là-bas le change aussi ici.
//
// Les e-mails de notification (tranche 6c : le récap de la semaine, l'e-mail de mentions) suivent
// des règles de plus (relectures de sécurité et juridique du plan) :
// - aucun lien venu d'un membre : son nom, un titre ou un extrait passent par defangLinks, qui
//   écrit « [lien] » dans la langue de l'e-mail (cela vaut aussi pour le nom saisi à l'inscription,
//   dans les e-mails de compte) ;
// - chaque lien (href) mène à l'appli ou à l'API, jamais ailleurs ; aucune image (ni avatar, ni
//   pixel d'ouverture) ;
// - l'objet est fixe : rien d'écrit par un membre ne s'affiche sur un écran verrouillé ;
// - chaque e-mail dit pourquoi on le reçoit, et son lien de désinscription nomme ce qu'il coupe.
//
// Le pied de chaque e-mail (`footer`) donne l'adresse de contact (tranche 7a, règle 23), écrite en
// texte et jamais en lien « mailto: » : tout lien d'un e-mail mène à l'appli ou à l'API.
import { appName, contactEmail, palettes, radii } from '@ruche/brand'
import type { RemovalGround } from '@ruche/contracts'
import { fill, type Language, resources } from '@ruche/i18n'
import { defangLinks, linkPlaceholder } from './links'

export type Email = {
  to: string
  subject: string
  text: string
  html: string
  /**
   * Des en-têtes ajoutés : seulement ceux de la désinscription en un clic (List-Unsubscribe et
   * List-Unsubscribe-Post, RFC 8058). Le Mailer refuse tout autre en-tête (voir mailer.ts).
   */
  headers?: Record<string, string>
  /**
   * R8 : les vignettes du récap, jointes « en ligne » : le HTML les montre par `cid:<cid>`, jamais
   * chargées à distance (A5). `cid` et `filename` sont fabriqués (`thumb-1`, `projet-1.jpg`), jamais
   * tirés d'un texte de membre. Un transport qui ne sait pas les joindre refuse l'e-mail plutôt que
   * de les perdre (voir mailer.ts).
   */
  attachments?: Attachment[]
}
export type Attachment = {
  filename: string
  contentType: 'image/jpeg' | 'image/png'
  content: Uint8Array
  cid: string
}
export type EmailContent = Omit<Email, 'to'>

// Les e-mails sont toujours en couleurs de jour : beaucoup de messageries ne gèrent pas le mode nuit.
const c = palettes.day

/**
 * « Échappe » un texte avant de l'insérer dans du HTML : < devient &lt;, etc.
 * Sans ça, un membre qui s'appellerait `<img src=x onerror=...>` pourrait glisser du code
 * dans les e-mails. Règle d'or : tout ce qui vient d'un utilisateur est échappé.
 */
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/**
 * Un bouton d'e-mail (lien en `inline-block`, pour que son fond entoure ses deux lignes à 320 px),
 * commun au récap et à l'e-mail « tout de suite ». `honey` : le bouton plein de l'action
 * principale ; sinon le style secondaire (fond `surface`, bordure `outline`), pour les listes où
 * huit boutons miel l'un sous l'autre cacheraient l'action qui compte.
 */
export const emailButton = (label: string, url: string, honey: boolean) =>
  `<a href="${escapeHtml(url)}" style="display:inline-block;max-width:100%;box-sizing:border-box;text-align:center;line-height:1.3;padding:${honey ? '12px 20px' : '9px 16px'};border-radius:${radii.pill}px;font-weight:bold;font-size:15px;text-decoration:none;${honey ? `background:${c.honey};color:${c.onHoney}` : `background:${c.surface};color:${c.text};border:1px solid ${c.outline}`}">${escapeHtml(label)}</a>`

type Link = {
  label: string
  url: string
  /**
   * Le libellé de la version texte, s'il diffère : sans bouton, l'adresse du lien suit sur la
   * ligne d'en dessous, d'où « Confirmer cette adresse : » (relecture de design des-E6).
   */
  textLabel?: string
}

/**
 * Un élément d'une liste : une ligne, et éventuellement un extrait en dessous, ou un lien (R7a :
 * la ligne d'un projet mène à ses mises à jour). L'adresse est toujours fabriquée par le serveur,
 * jamais lue d'un champ écrit par un membre.
 */
type Item = { line: string; excerpt?: string; url?: string }

/**
 * Une partie de plus, avec son titre, sa liste et ses paragraphes (R7a : « Les projets que tu suis
 * ou que tu testes » du récap), sous la liste principale et avant le bouton.
 */
type Section = { title: string; items: Item[]; after: Paragraph[] }

/** Un morceau de paragraphe : du texte, en gras s'il faut le retenir (l'adresse de contact). */
type Run = { text: string; bold?: boolean }
/**
 * R8 : un paragraphe écrit deux fois, l'une pour le HTML, l'autre pour la version texte. Le HTML a
 * un bouton, la version texte n'a qu'un lien : elle ne doit pas parler d'un « bouton ci-dessous ».
 */
type Twin = { html: string; text: string }
/**
 * Un paragraphe : un texte simple, une suite de morceaux dont certains sont en gras, ou un texte
 * propre à chaque version.
 */
type Paragraph = string | Run[] | Twin

/**
 * Remplit un texte et met en gras la valeur d'un de ses paramètres : on coupe le modèle à
 * l'endroit du paramètre (`{{contactEmail}}`), on remplit chaque morceau, et la valeur passe entre
 * eux. La version texte, qui recolle les morceaux, est identique à `fill(template)`.
 */
const withBold = (template: string, name: string, value: string): Run[] =>
  template
    .split(`{{${name}}}`)
    .flatMap((part, index) => [
      ...(index > 0 ? [{ text: value, bold: true }] : []),
      { text: fill(part) },
    ])
    .filter((run) => run.text !== '')

/** Le paragraphe en texte brut : les morceaux recollés, sans marque de gras. */
const plain = (paragraph: Paragraph) =>
  typeof paragraph === 'string'
    ? paragraph
    : Array.isArray(paragraph)
      ? paragraph.map((run) => run.text).join('')
      : paragraph.text

/** Le paragraphe en HTML : chaque morceau échappé, les morceaux en gras dans un <strong>. */
const richHtml = (paragraph: Paragraph) =>
  typeof paragraph === 'string'
    ? escapeHtml(paragraph)
    : Array.isArray(paragraph)
      ? paragraph
          .map((run) =>
            run.bold ? `<strong>${escapeHtml(run.text)}</strong>` : escapeHtml(run.text),
          )
          .join('')
      : escapeHtml(paragraph.html)

/**
 * Un paragraphe du corps : un texte, ou un texte libre écrit par quelqu'un (l'explication d'une
 * suspension) qui peut contenir un mot très long. Celui-là se coupe n'importe où quand un mot ne
 * tient pas dans la largeur (`overflow-wrap:anywhere`, et `word-break:break-word` pour les moteurs
 * qui ne connaissent que lui) : un <p> ordinaire ne se coupe qu'aux espaces, et un mot de 76
 * caractères faisait défiler l'e-mail de 431 px à l'horizontale sur un écran de 320 px (relecture
 * de design de 7c). Les autres paragraphes, écrits par nous, gardent les coupures ordinaires.
 */
type BodyParagraph = string | Twin | { freeText: string }

const paragraphText = (paragraph: BodyParagraph) =>
  typeof paragraph === 'string'
    ? paragraph
    : 'freeText' in paragraph
      ? paragraph.freeText
      : paragraph.text

type Layout = {
  /** La langue de l'e-mail, annoncée dans `<html lang>` (lecteurs d'écran, traduction). */
  language: Language
  /** La phrase titre, en gras sous le nom de l'appli (« Du nouveau cette semaine »). */
  heading?: string
  /**
   * R8 : le titre aussi en tête de la version texte, quand l'objet ne dit pas la même chose (l'e-mail
   * vers la nouvelle adresse). Sans ce réglage, la version texte commence par la salutation.
   */
  headingInText?: boolean
  greeting: string
  paragraphs: BodyParagraph[]
  /**
   * Une donnée à vérifier d'un coup d'œil (la nouvelle adresse), seule sur sa ligne sous les
   * paragraphes, en gras, et coupée n'importe où : une adresse n'a pas d'espace (des-E1, des-E3).
   */
  highlight?: string
  /** Une liste (les notifications d'un récap ou d'un e-mail de mentions). */
  items?: Item[]
  /** Des paragraphes après la liste (« Et 2 autres », les nombres). */
  after?: Paragraph[]
  /** D'autres parties, chacune avec son titre (R7a), après ces paragraphes. */
  sections?: Section[]
  /** Le bouton ; absent d'un e-mail qui ne demande aucun geste (l'adresse changée, jur-R6). */
  button?: Link
  /**
   * D'autres boutons, sous le premier, de la même forme (R6b : le récap des « Autre » mène à deux
   * pages, « Outils » et « Catégories »).
   */
  moreButtons?: Link[]
  /**
   * Des paragraphes au corps normal sous le bouton : une consigne qui compte trop pour une petite
   * note grise (« Ce n'est pas toi ? », des-E4).
   */
  closing?: Paragraph[]
  /** Les petites lignes sous le bouton (« si tu n'as rien demandé, ignore cet e-mail »). */
  notes: string[]
  /** Le pied : pourquoi on reçoit cet e-mail, puis les liens (se désinscrire, gérer). */
  reason?: string
  links?: Link[]
  footer: string
}

/**
 * La seule feuille de style de l'e-mail : une « requête média » (@media), qui ne s'applique que
 * sur un écran de moins de 480 px, resserre les marges (relecture de design, 6c : à 320 px, il ne
 * restait que 214 px de texte). Apple Mail et Gmail la suivent ; une messagerie qui l'ignore garde
 * les marges larges. « !important » : sinon les styles écrits dans les balises l'emportent.
 */
const narrowScreenStyle = `@media (max-width:480px){.page{padding:12px 8px !important}.card{padding:20px 16px !important}}`

// Mise en page commune à tous les e-mails. Styles écrits directement dans les balises :
// beaucoup de messageries ignorent les feuilles de style (seule la requête média ci-dessus en a une).
const render = ({
  language,
  heading,
  headingInText = false,
  greeting,
  paragraphs,
  highlight,
  items = [],
  after = [],
  sections = [],
  button,
  moreButtons = [],
  closing = [],
  notes,
  reason,
  links = [],
  footer,
}: Layout) => {
  const buttons = [...(button ? [button] : []), ...moreButtons]
  // Le texte brut : chaque lien écrit en entier sous son libellé, pour les messageries sans HTML ;
  // un extrait en citation (« > », l'usage des e-mails), sous sa ligne ; l'adresse d'un élément
  // lien en dessous, en retrait.
  const textList = (list: Item[]) =>
    list.flatMap(({ line, excerpt, url }) => [
      `• ${line}`,
      ...(excerpt === undefined ? [] : [`  > ${excerpt}`]),
      ...(url === undefined ? [] : [`  ${url}`]),
    ])
  const textItems = textList(items)
  const textSections = sections.flatMap((section) => [
    section.title,
    '',
    ...(section.items.length > 0 ? [...textList(section.items), ''] : []),
    ...section.after.flatMap((p) => [plain(p), '']),
  ])
  // Le titre (heading) n'y est pas : il sert la hiérarchie visuelle du HTML, et l'objet de l'e-mail
  // dit déjà la même chose en tête du texte brut (sauf `headingInText`).
  const text = [
    ...(headingInText && heading !== undefined ? [heading, ''] : []),
    greeting,
    '',
    ...paragraphs.flatMap((p) => [paragraphText(p), '']),
    ...(highlight === undefined ? [] : [highlight, '']),
    ...(textItems.length > 0 ? [...textItems, ''] : []),
    ...after.flatMap((p) => [plain(p), '']),
    ...textSections,
    ...buttons.flatMap((link) => [link.textLabel ?? link.label, link.url, '']),
    ...closing.flatMap((p) => [plain(p), '']),
    ...notes.flatMap((note) => [note, '']),
    '—',
    ...(reason ? [reason, ''] : []),
    ...links.flatMap((link) => [link.label, link.url, '']),
    footer,
  ].join('\n')

  const body = 'font-size:16px;line-height:1.5'
  const p = (value: Paragraph, style = body) => `<p style="${style}">${richHtml(value)}</p>`
  // La donnée à vérifier : en gras, et coupée n'importe où (`word-break:break-all`, et
  // `overflow-wrap:anywhere` pour les moteurs qui ne connaissent que lui). Un <p> ordinaire ne se
  // coupe qu'aux espaces et aux tirets : à 320 px, une adresse de 88 caractères faisait défiler
  // tout l'e-mail de 224 px à l'horizontale (des-E1). Le gras passe par le style du paragraphe, pas
  // par un <strong> : le texte reste seul entre deux balises, comme le vérifient les tests.
  const htmlHighlight =
    highlight === undefined
      ? ''
      : p(highlight, `${body};font-weight:bold;word-break:break-all;overflow-wrap:anywhere`)
  // Une ligne lien (R7a) : tout le texte de la ligne est le lien, souligné et de la couleur du
  // texte (le couple texte / fond déjà vérifié), pour qu'on le touche sans viser un petit mot.
  // L'adresse comme le texte sont échappés : un titre écrit par un membre reste du texte.
  const htmlLine = (line: string, url: string | undefined) =>
    url === undefined
      ? escapeHtml(line)
      : `<a href="${escapeHtml(url)}" style="color:${c.text};text-decoration:underline">${escapeHtml(line)}</a>`
  const htmlList = (list: Item[]) =>
    list.length === 0
      ? ''
      : `<ul style="padding-left:20px;margin:16px 0">${list
          .map(
            ({ line, excerpt, url }) =>
              // Un titre de projet d'un seul mot de 80 lettres se coupe n'importe où plutôt que de
              // faire défiler l'e-mail à l'horizontale (adresse-E1, comme les paragraphes libres).
              `<li style="font-size:16px;line-height:1.5;margin:0 0 10px;overflow-wrap:anywhere;word-break:break-word">${htmlLine(line, url)}${
                excerpt === undefined
                  ? ''
                  : `<br><span style="display:inline-block;margin-top:4px;padding-left:10px;border-left:3px solid ${c.groupBorder};color:${c.textMuted}">${escapeHtml(excerpt)}</span>`
              }</li>`,
          )
          .join('')}</ul>`
  const htmlItems = htmlList(items)
  // Le titre d'une partie : en gras, au corps du texte, avec de l'air au-dessus pour la séparer de
  // ce qui précède.
  const htmlSections = sections
    .map((section) =>
      [
        p(section.title, `${body};font-weight:bold;margin:24px 0 0`),
        htmlList(section.items),
        ...section.after.map((value) => p(value)),
      ].join('\n    '),
    )
    .join('\n    ')
  const muted = `font-size:13px;color:${c.textMuted}`
  const small = `text-align:center;font-size:13px;line-height:1.5;color:${c.textMuted}`
  // Le haut de l'e-mail (relecture de design, 6c) : le nom de l'appli, en texte (aucune image), puis
  // la phrase titre en gras ; « Bonjour Inès » vient ensuite, au corps normal.
  const top = [
    p(
      appName,
      `margin:0 0 ${heading ? 8 : 20}px;font-size:15px;font-weight:bold;color:${c.amberText}`,
    ),
    ...(heading
      ? [p(heading, 'margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:bold')]
      : []),
  ].join('\n    ')
  // Les liens du pied, l'un sous l'autre (relecture de design, 6c) : en 14 px, avec 10 px de jeu
  // au-dessus et en dessous, chacun se touche du doigt sans toucher l'autre.
  const footerLinks = links
    .map(
      (link) =>
        `<p style="margin:0;text-align:center;font-size:14px;line-height:1.4"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:10px 4px;color:${c.textMuted}">${escapeHtml(link.label)}</a></p>`,
    )
    .join('\n    ')
  // Le bouton est un lien en `inline-block` : quand son libellé passe sur deux lignes (320 px), le
  // fond et le jeu intérieur entourent les deux lignes, au lieu que chaque ligne garde son propre
  // fond et que les deux se chevauchent (relecture de design de R2, B3).
  // Plusieurs boutons : l'un sous l'autre, 12 px entre eux (assez pour toucher l'un sans l'autre).
  const htmlButton = buttons
    .map(
      (
        link,
        i,
      ) => `<p style="margin:${i === 0 ? 28 : 12}px 0 ${i === buttons.length - 1 ? 28 : 0}px">
      <a href="${escapeHtml(link.url)}" style="display:inline-block;max-width:100%;box-sizing:border-box;text-align:center;line-height:1.3;background:${c.honey};color:${c.onHoney};text-decoration:none;padding:14px 22px;border-radius:${radii.pill}px;font-weight:bold">${escapeHtml(link.label)}</a>
    </p>`,
    )
    .join('\n    ')
  const html = `<!doctype html>
<html lang="${language}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${narrowScreenStyle}</style>
</head><body style="margin:0;background:${c.surfaceGrouped}">
<div class="page" style="padding:24px;background:${c.surfaceGrouped};font-family:Arial,sans-serif;color:${c.text}">
  <div class="card" style="max-width:520px;margin:0 auto;background:${c.surface};border:1px solid ${c.groupBorder};border-radius:${radii.group}px;padding:28px">
    ${top}
    ${p(greeting, 'font-size:16px;overflow-wrap:anywhere;word-break:break-word')}
    ${paragraphs
      .map((value) =>
        typeof value === 'string' || !('freeText' in value)
          ? p(value)
          : p(value.freeText, `${body};overflow-wrap:anywhere;word-break:break-word`),
      )
      .join('\n    ')}
    ${htmlHighlight}
    ${htmlItems}
    ${after.map((value) => p(value)).join('\n    ')}
    ${htmlSections}
    ${htmlButton}
    ${closing.map((value) => p(value)).join('\n    ')}
    ${notes.map((note) => p(note, muted)).join('\n    ')}
  </div>
  <div style="max-width:520px;margin:16px auto 0">
    ${reason ? p(reason, small) : ''}
    ${footerLinks}
    ${p(footer, small)}
  </div>
</div>
</body></html>`
  return { text, html }
}

/** L'e-mail qui contient le lien pour vérifier l'adresse et activer le compte. */
export const verificationEmail = (
  language: Language,
  { name, url }: { name: string; url: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.verify.subject),
    ...render({
      language,
      // Le nom saisi à l'inscription part vers l'adresse saisie, quelle qu'elle soit : sans ce
      // filtre, « Ton compte est bloqué, va sur waiggle-login.com » partirait de notre domaine
      // vers n'importe qui (relecture de sécurité A2).
      greeting: fill(t.greeting, { name: defangLinks(name, linkPlaceholder(language)) }),
      // fill, même sans paramètre : un {{appName}} ajouté un jour à ces textes sera rempli.
      paragraphs: [fill(t.verify.body), fill(t.verify.expires)],
      button: { label: fill(t.verify.button), url },
      notes: [fill(t.verify.ignore)],
      footer: fill(t.footer),
    }),
  }
}

/**
 * L'e-mail envoyé quand quelqu'un essaie de s'inscrire avec une adresse déjà utilisée.
 * L'API répond comme pour une inscription normale (pour ne pas révéler que l'adresse existe),
 * et c'est le vrai propriétaire de l'adresse qui est prévenu, ici.
 */
export const existingAccountEmail = (
  language: Language,
  { name, signInUrl }: { name: string; signInUrl: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.existingAccount.subject),
    ...render({
      language,
      // Le nom du compte existant : filtré comme dans verificationEmail (relecture de sécurité A2).
      greeting: fill(t.greeting, { name: defangLinks(name, linkPlaceholder(language)) }),
      // Chaque texte passe par fill : render() écrit les paragraphes tels quels, et le texte de R2
      // contient {{appName}}, qui s'affichait brut (relecture de R2).
      paragraphs: [fill(t.existingAccount.body)],
      button: { label: fill(t.existingAccount.button), url: signInUrl },
      notes: [fill(t.existingAccount.ignore)],
      footer: fill(t.footer),
    }),
  }
}

// ─── Le mot de passe (tranche R2) ───────────────────────────────────────────────────────────────
// Deux e-mails de sécurité (relecture juridique jur-1) : ils partent toujours, sans publicité ni
// lien de désinscription, et disent pourquoi ils arrivent (`reason`, dans le pied).

/**
 * Le lien pour choisir un nouveau mot de passe (« Mot de passe oublié ? »). Il peut partir vers une
 * adresse jamais vérifiée, peut-être celle d'un inconnu après une faute de frappe à l'inscription :
 * la salutation ne porte aucun nom (jur-2). La durée de validité est celle du réglage du serveur
 * (`hours`, jur-4), et la conséquence (tous les appareils déconnectés) est dite avant le bouton
 * (jur-3). Le lien mène à la page de l'appli et ne porte que le jeton (auth/password.ts).
 */
export const resetPasswordEmail = (
  language: Language,
  { url, hours }: { url: string; hours: number },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.resetPassword.subject),
    ...render({
      language,
      heading: fill(t.resetPassword.heading),
      greeting: fill(t.resetPassword.greeting),
      paragraphs: [
        // R8 : la version texte n'a pas de bouton, elle parle du lien ci-dessous.
        { html: fill(t.resetPassword.body), text: fill(t.resetPassword.textBody) },
        // La durée s'écrit en toutes lettres : « une heure », puis « 2 heures » (décision du
        // 30/10/2026). Le nombre vient toujours du réglage du serveur (jur-4).
        fill(t.resetPassword.expires, {
          duration:
            hours === 1
              ? fill(t.resetPassword.oneHour)
              : fill(t.resetPassword.hours, { hours: String(hours) }),
        }),
      ],
      button: {
        label: fill(t.resetPassword.button),
        textLabel: fill(t.resetPassword.textLink),
        url,
      },
      notes: [fill(t.resetPassword.ignore)],
      reason: fill(t.resetPassword.reason),
      footer: fill(t.footer),
    }),
  }
}

/**
 * « Ton mot de passe a changé », après un mot de passe oublié ou un changement depuis les
 * réglages. Jamais le mot de passe lui-même. « Ce n'est pas toi ? » dit d'abord comment reprendre
 * la main (Réglages, Sécurité, ou « Mot de passe oublié ? »), puis d'écrire au contact, en gras et
 * en texte (jur-5). Le bouton ouvre les réglages.
 */
export const passwordChangedEmail = (
  language: Language,
  { name, settingsUrl }: { name: string; settingsUrl: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.passwordChanged.subject),
    ...render({
      language,
      heading: fill(t.passwordChanged.heading),
      // Le nom saisi par le membre : filtré comme dans les autres e-mails de compte.
      greeting: fill(t.greeting, { name: defangLinks(name, linkPlaceholder(language)) }),
      paragraphs: [fill(t.passwordChanged.body)],
      button: { label: fill(t.passwordChanged.button), url: settingsUrl },
      closing: [withBold(t.passwordChanged.notYou, 'contactEmail', contactEmail)],
      notes: [],
      reason: fill(t.passwordChanged.reason),
      footer: fill(t.footer),
    }),
  }
}

// ─── Changer son adresse (tranche « adresse ») ──────────────────────────────────────────────────
// Trois e-mails de service, sans publicité ni lien de désinscription : ils partent parce que le
// membre l'a demandé, et ne disent que ce qu'il faut pour finir (ou arrêter) son changement.
//
// La nouvelle adresse s'écrit seule sur sa ligne (`highlight`), telle que saisie, en gras et coupée
// n'importe où, pour qu'une faute de frappe saute aux yeux sur tout écran (relecture de sécurité
// S10, de design des-E1 et des-E3). Elle ne passe pas par defangLinks : le membre doit
// reconnaître son adresse, pas lire « [lien] ». Le contrat (ChangeEmailRequest, z.email) n'y laisse
// que des lettres ASCII, des chiffres et « . _ ' + - » ; render() l'échappe dans le HTML, comme
// tout texte (l'apostrophe devient &#39;).
//
// « Ce n'est pas toi ? » est le geste qui compte en cas de vol de compte : un paragraphe normal,
// l'adresse de contact en gras (en texte, jamais en lien), et non une note grise (des-E2, des-E4).

/**
 * Le premier e-mail, vers l'adresse ACTUELLE : « tu as demandé à la remplacer par celle-ci ;
 * confirme ». Le bouton mène au premier lien (GET /api/auth/verify-email).
 */
export const changeEmailConfirmationEmail = (
  language: Language,
  { name, newEmail, url }: { name: string; newEmail: string; url: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.changeEmail.subject),
    ...render({
      language,
      greeting: fill(t.greeting, { name: defangLinks(name, linkPlaceholder(language)) }),
      paragraphs: [fill(t.changeEmail.body)],
      highlight: newEmail,
      // R8 : la version texte parle du lien ci-dessous, et le libellé qui précède ce lien finit par
      // « : » (« Confirmer le changement : »), comme les autres e-mails de compte.
      after: [
        { html: fill(t.changeEmail.next), text: fill(t.changeEmail.textNext) },
        fill(t.changeEmail.expires),
      ],
      button: {
        label: fill(t.changeEmail.button),
        textLabel: fill(t.changeEmail.textLink),
        url,
      },
      closing: [withBold(t.changeEmail.ignore, 'contactEmail', contactEmail)],
      notes: [],
      footer: fill(t.footer),
    }),
  }
}

/**
 * Le deuxième e-mail, vers la NOUVELLE adresse, pour la vérifier. Une faute de frappe l'enverrait
 * chez un inconnu (relecture de sécurité S6) : la salutation est neutre, sans le nom du membre, et
 * aucune adresse n'y est écrite, ni l'ancienne ni celle-ci (seule celle du contact, dans le pied).
 * Le lien non plus ne la dit pas : son jeton est chiffré (auth/change-email.ts, relecture R1).
 */
export const newEmailVerificationEmail = (
  language: Language,
  { url }: { url: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.newEmail.subject),
    ...render({
      language,
      // R8 : un titre, en tête du HTML comme de la version texte.
      heading: fill(t.newEmail.heading),
      headingInText: true,
      greeting: fill(t.newEmail.greeting),
      paragraphs: [
        { html: fill(t.newEmail.body), text: fill(t.newEmail.textBody) },
        fill(t.newEmail.expires),
      ],
      button: { label: fill(t.newEmail.button), textLabel: fill(t.newEmail.textLink), url },
      notes: [fill(t.newEmail.ignore)],
      footer: fill(t.footer),
    }),
  }
}

/**
 * Le dernier e-mail, vers l'ANCIENNE adresse, une fois le changement fait : il cite la nouvelle,
 * pour qu'un changement fait par quelqu'un d'autre ne passe pas inaperçu. Aucun bouton (relecture
 * juridique R6, décision de Louis du 26/10/2026) : cette adresse ne sert plus à se connecter, et
 * le seul geste utile est d'écrire au contact si ce n'était pas le membre.
 */
export const emailChangedEmail = (
  language: Language,
  { name, newEmail }: { name: string; newEmail: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.emailChanged.subject),
    ...render({
      language,
      greeting: fill(t.greeting, { name: defangLinks(name, linkPlaceholder(language)) }),
      paragraphs: [fill(t.emailChanged.body)],
      highlight: newEmail,
      // Sans bouton, l'appel à écrire au contact est le dernier paragraphe de la carte (des-E2).
      after: [
        fill(t.emailChanged.after),
        withBold(t.emailChanged.help, 'contactEmail', contactEmail),
      ],
      notes: [],
      footer: fill(t.footer),
    }),
  }
}

// ─── Les e-mails de notification (tranche 6c) ───────────────────────────────────────────────────

/** Les adresses d'un e-mail de notification, toutes chez nous (appli ou API). */
export type NotificationLinks = {
  /** Le bouton : l'écran des notifications de l'appli. */
  button: string
  /** La page de désinscription de l'appli, avec le jeton signé (elle demande confirmation). */
  unsubscribe: string
  /** « Gérer mes e-mails » : Mon profil, dans l'appli. */
  manage: string
  /**
   * L'adresse de l'API pour la désinscription en un clic de la messagerie (en-tête
   * List-Unsubscribe) : elle reçoit un POST, jamais une simple ouverture de lien.
   */
  oneClick: string
}

/** Les en-têtes de la désinscription en un clic (RFC 8058). */
const unsubscribeHeaders = (oneClick: string) => ({
  'List-Unsubscribe': `<${oneClick}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
})

/** Qui a écrit : son nom (sans adresse cliquable), son pseudo et le titre du projet. */
export type Mention = {
  kind: 'mention' | 'reply'
  name: string
  handle: string
  title: string
}
export type RecapLine = {
  kind: 'comment' | 'reply' | 'mention'
  name: string
  handle: string
  title: string
}

/**
 * Les paramètres d'une ligne, nettoyés : aucune adresse écrite par un membre n'en sort. Le pseudo
 * n'a pas besoin du filtre : le schéma n'y admet ni point ni barre (lettres, chiffres et « _ »).
 */
const lineParams = (
  { name, handle, title }: { name: string; handle: string; title: string },
  link: string,
) => ({
  name: defangLinks(name, link),
  handle,
  title: defangLinks(title, link),
})

/** « 1 réaction » ou « 3 réactions » : la clé _one ou _other, sans règle de pluriel de plus. */
const counted = (one: string, other: string, count: number) =>
  fill(count === 1 ? one : other, { count: String(count) })

/** R8 : un projet du membre dans « Tes projets », avec ses nombres de la semaine en pastilles. */
export type RecapProject = {
  title: string
  /** Les réactions, les commentaires et les nouveaux abonnés du projet ; 0 : pas de pastille. */
  reactions: number
  comments: number
  follows: number
  /** La page du projet dans l'appli (« Lire les commentaires »), fabriquée par la tâche. */
  url: string
  /** Sa vignette, déjà réduite et nommée par la tâche (recap-images.ts), ou aucune. */
  image: Attachment | null
}

/**
 * R8 : le projet d'un membre suivi (« Nouveaux projets de tes proches ») ou qui cherche des
 * testeurs. Son titre et le nom de son auteur seulement, jamais l'accroche (décision de Louis du
 * 12/11/2026) ; le lien mène à sa page dans l'appli, jamais à la démo (sec-A4).
 */
export type RecapFriendProject = {
  title: string
  author: string
  url: string
  image: Attachment | null
}

export type RecapData = {
  /** Le nom du membre qui reçoit le récap (le titre du bandeau). */
  name: string
  /** R8 : « Tes projets », le plus récemment actif en tête. */
  projects: RecapProject[]
  /** Les réponses et mentions montrées, 5 au plus, de la plus récente à la plus ancienne. */
  lines: RecapLine[]
  /** Combien d'autres réponses ou mentions ne sont pas montrées (« Et 2 autres »). */
  more: number
  /** Les nouveaux abonnés au compte du membre (ceux d'un projet sont dans sa pastille). */
  follows: number
  /** Son premier récap : on explique ce que c'est (relecture juridique R3). */
  first: boolean
  /** R8 : le premier récap habillé de qui recevait déjà le récap : la note unique. */
  news: boolean
  /** Le 3e récap de suite sans visite : on dit que c'est le dernier pour l'instant (R4). */
  last: boolean
  /** R8 : « Nouveaux projets de tes proches », 3 au plus (RECAP_FRIEND_PROJECTS_MAX). */
  friends: RecapFriendProject[]
  /** R8 : « Ils cherchent des testeurs », un projet ou aucun. */
  testersWanted: RecapFriendProject | null
  /**
   * R7a, « Les projets que tu suis ou que tu testes » : 5 projets au plus, le plus récemment mis à
   * jour en tête ; leur titre, leur nombre de mises à jour de la semaine, et le lien vers leur
   * frise, fabriqué par la tâche (jamais lu d'un champ de membre). Jamais le titre, la version ni
   * les lignes d'une mise à jour (relecture de sécurité A9, juridique P4).
   */
  updates: { title: string; count: number; url: string }[]
  /** Combien d'autres projets mis à jour ne sont pas montrés (« Et 2 autres projets »). */
  updatesMore: number
  /**
   * R7b, « Le coin des testeurs » : 5 projets au plus, celui qui a la nouveauté la plus récente en
   * tête ; leur titre, le nombre de nouveautés du coin pour ce membre (appels, messages de l'autre
   * personne d'un fil, retours réglés), et le lien vers le coin, fabriqué par la tâche. Jamais le
   * texte d'un appel ni d'un message (relecture juridique J12) : le modèle ne le reçoit pas.
   */
  testers: { title: string; count: number; url: string }[]
  /** Combien d'autres projets du coin ne sont pas montrés (« Et 2 autres projets »). */
  testersMore: number
  links: NotificationLinks
}

/**
 * La feuille de style du récap habillé : comme `narrowScreenStyle`, elle resserre les marges sur un
 * écran de moins de 480 px (chaque partie du récap porte la classe « part »).
 */
const recapNarrowStyle = `@media (max-width:480px){.page{padding:8px 4px !important}.part{padding:20px 16px !important}}`

/** Une pièce jointe « en ligne », montrée par son `cid`, avec le titre désarmé pour texte. */
const imageTag = (image: Attachment, alt: string, size: number) =>
  `<img src="cid:${escapeHtml(image.cid)}" alt="${escapeHtml(alt)}" width="${size}" style="display:block;width:${size}px;max-width:${size}px;height:auto;border:0">`

/**
 * La place d'une vignette : un carré arrondi au fond miel pâle, qui montre l'image si le projet en
 * a une (une photo en hauteur est coupée en bas, une photo en largeur laisse voir le fond), et reste
 * vide sinon : les titres restent alignés d'un projet à l'autre.
 */
const thumbBox = (image: Attachment | null, alt: string, size: number) =>
  `<div style="width:${size}px;height:${size}px;overflow:hidden;border-radius:${size >= 80 ? radii.small : 14}px;background:${c.honeySoft}">${image === null ? '' : imageTag(image, alt, size)}</div>`

/**
 * Une ligne à deux colonnes : la vignette à gauche, le texte à droite. Un tableau plutôt que des
 * blocs flottants : c'est la seule mise en page côte à côte que toutes les messageries respectent
 * (Outlook compris). `role="presentation"` dit aux lecteurs d'écran que ce n'est pas un tableau de
 * données.
 */
const thumbRow = (thumb: string, size: number, content: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px"><tr><td style="width:${size}px;padding:0 14px 0 0;vertical-align:top">${thumb}</td><td style="vertical-align:top;overflow-wrap:anywhere;word-break:break-word">${content}</td></tr></table>`

/**
 * Le récap de la semaine, habillé (R8, planche R8-Recap) : un bandeau miel avec le titre, puis une
 * partie par sorte de nouveauté (aucune partie vide), puis le pied. Pas d'extrait : seulement qui,
 * quoi, sur quel projet (relecture juridique R5) ; les nombres de ses projets en pastilles, sans
 * aucun nom. Les images sont jointes (`attachments`) et montrées par `cid:` ; aucune autre image, et
 * rien n'est chargé à distance (A5). Le texte d'un membre (nom, titre, texte de remplacement d'une
 * image) passe par defangLinks, puis par l'échappement du HTML.
 */
export const recapEmail = (language: Language, data: RecapData): EmailContent => {
  const t = resources[language].translation.email
  const r = t.recap
  const link = linkPlaceholder(language)
  const clean = (value: string) => defangLinks(value, link)
  const heading = fill(r.heading, { name: clean(data.name) })
  // Ce qui est propre à cet e-mail : le premier récap l'emporte sur la note unique, qui dit la même
  // chose ; puis « le dernier pour l'instant ».
  const notes = [
    ...(data.first ? [fill(r.first)] : data.news ? [fill(r.news)] : []),
    ...(data.last ? [fill(r.last)] : []),
  ]
  const pillsOf = (project: RecapProject) =>
    [
      project.reactions > 0
        ? counted(r.pillReactions_one, r.pillReactions_other, project.reactions)
        : null,
      project.comments > 0
        ? counted(r.pillComments_one, r.pillComments_other, project.comments)
        : null,
      project.follows > 0 ? counted(r.pillFollows_one, r.pillFollows_other, project.follows) : null,
    ].filter((pill) => pill !== null)
  const accountFollows =
    data.follows > 0 ? counted(r.follows_one, r.follows_other, data.follows) : null
  const lines = data.lines.map((line) => fill(r[line.kind], lineParams(line, link)))
  const moreLines = data.more > 0 ? counted(r.more_one, r.more_other, data.more) : null
  const byProject = [
    {
      title: fill(r.updatesTitle),
      texts: [r.updates_one, r.updates_other, r.updatesMore_one, r.updatesMore_other] as const,
      projects: data.updates,
      more: data.updatesMore,
    },
    {
      title: fill(r.testersTitle),
      texts: [r.testers_one, r.testers_other, r.testersMore_one, r.testersMore_other] as const,
      projects: data.testers,
      more: data.testersMore,
    },
  ]
    .filter((part) => part.projects.length > 0)
    .map(({ title, texts: [one, other, moreOne, moreOther], projects, more }) => ({
      title,
      items: projects.map((project) => ({
        line: fill(project.count === 1 ? one : other, {
          title: clean(project.title),
          count: String(project.count),
        }),
        url: project.url,
      })),
      more: more > 0 ? counted(moreOne, moreOther, more) : null,
    }))
  const wanted = data.testersWanted
  // Les images, dans l'ordre où l'e-mail les montre ; chacune une seule fois.
  const attachments = [
    ...data.projects.map((project) => project.image),
    ...data.friends.map((friend) => friend.image),
    wanted?.image ?? null,
  ].filter((image) => image !== null)

  // ─── La version texte : chaque lien écrit en entier sous son libellé, sans image. ───
  const text = [
    heading,
    '',
    fill(r.intro),
    '',
    ...notes.flatMap((note) => [note, '']),
    ...(data.projects.length > 0 || accountFollows !== null
      ? [
          r.yourProjects,
          '',
          ...data.projects.flatMap((project) => [
            clean(project.title),
            pillsOf(project).join(' · '),
            ...(project.comments > 0 ? [r.readComments, project.url] : []),
            '',
          ]),
          ...(accountFollows === null ? [] : [accountFollows, '']),
        ]
      : []),
    ...(data.friends.length > 0
      ? [
          r.friendsTitle,
          '',
          ...data.friends.flatMap((friend) => [
            clean(friend.title),
            clean(friend.author),
            r.viewProject,
            friend.url,
            '',
          ]),
        ]
      : []),
    ...(wanted === null
      ? []
      : [
          r.testersWanted,
          '',
          clean(wanted.title),
          clean(wanted.author),
          r.tryDemo,
          wanted.url,
          '',
        ]),
    ...(lines.length > 0
      ? [
          fill(t.mentions.heading),
          '',
          ...lines.map((line) => `• ${line}`),
          '',
          ...(moreLines === null ? [] : [moreLines, '']),
        ]
      : []),
    ...byProject.flatMap((part) => [
      part.title,
      '',
      ...part.items.flatMap((item) => [`• ${item.line}`, `  ${item.url}`]),
      '',
      ...(part.more === null ? [] : [part.more, '']),
    ]),
    '—',
    fill(r.reason),
    '',
    t.changePreferences,
    data.links.manage,
    '',
    r.unsubscribe,
    data.links.unsubscribe,
    '',
    fill(t.footer),
  ].join('\n')

  // ─── Le HTML ───
  const body = 'font-size:16px;line-height:1.5'
  const wrap = 'overflow-wrap:anywhere;word-break:break-word'
  const h2 = (title: string) =>
    `<h2 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:bold;color:${c.text}">${escapeHtml(title)}</h2>`
  const part = (content: string) =>
    `<div class="part" style="padding:24px 28px;border-top:1px solid ${c.line}">${content}</div>`
  const projectTitle = (title: string, size = 17) =>
    `<p style="margin:0 0 6px;font-size:${size}px;line-height:1.3;font-weight:bold;color:${c.text};${wrap}">${escapeHtml(clean(title))}</p>`
  const pill = (label: string) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:${radii.pill}px;background:${c.honeySoft};color:${c.statusText};font-size:13px;line-height:1.3;font-weight:bold">${escapeHtml(label)}</span>`
  const textLink = (label: string, url: string) =>
    `<a href="${escapeHtml(url)}" style="color:${c.amberText};font-weight:bold;text-decoration:underline">${escapeHtml(label)}</a>`
  const button = emailButton
  const author = (name: string) =>
    `<p style="margin:0 0 10px;font-size:15px;line-height:1.4;color:${c.textSecondary};${wrap}">${escapeHtml(clean(name))}</p>`
  const list = (items: { line: string; url?: string }[]) =>
    `<ul style="padding-left:20px;margin:0 0 12px">${items
      .map(
        ({ line, url }) =>
          `<li style="${body};margin:0 0 10px;${wrap}">${
            url === undefined
              ? escapeHtml(line)
              : `<a href="${escapeHtml(url)}" style="color:${c.text};text-decoration:underline">${escapeHtml(line)}</a>`
          }</li>`,
      )
      .join('')}</ul>`
  const paragraph = (value: string, style = body) =>
    `<p style="margin:0 0 12px;${style}">${escapeHtml(value)}</p>`

  const parts = [
    ...(data.projects.length > 0 || accountFollows !== null
      ? [
          part(
            [
              h2(r.yourProjects),
              ...data.projects.map((project) =>
                thumbRow(
                  thumbBox(project.image, clean(project.title), 88),
                  88,
                  [
                    projectTitle(project.title),
                    `<div>${pillsOf(project).map(pill).join('')}</div>`,
                    project.comments > 0
                      ? `<p style="margin:4px 0 0;font-size:15px">${textLink(r.readComments, project.url)}</p>`
                      : '',
                  ].join(''),
                ),
              ),
              // Les abonnés au compte : une phrase à part, pas une pastille. Posée en pastille sous
              // le dernier projet, elle se lisait comme les abonnés de ce projet (relecture de
              // design de R8, Louis 12/11/2026).
              accountFollows === null
                ? ''
                : `<p style="margin:12px 0 0;${body};color:${c.text}">${escapeHtml(accountFollows)}</p>`,
            ].join(''),
          ),
        ]
      : []),
    ...(data.friends.length > 0
      ? [
          part(
            [
              h2(r.friendsTitle),
              // Le bouton sous le nom, et non à droite comme sur la planche : à 320 px, trois
              // colonnes ne laissaient au titre que la largeur d'un mot.
              ...data.friends.map((friend) =>
                thumbRow(
                  thumbBox(friend.image, clean(friend.title), 56),
                  56,
                  [
                    projectTitle(friend.title, 16),
                    author(friend.author),
                    button(r.viewProject, friend.url, false),
                  ].join(''),
                ),
              ),
            ].join(''),
          ),
        ]
      : []),
    ...(wanted === null
      ? []
      : [
          part(
            [
              h2(r.testersWanted),
              thumbRow(
                thumbBox(wanted.image, clean(wanted.title), 88),
                88,
                [
                  projectTitle(wanted.title),
                  author(wanted.author),
                  button(r.tryDemo, wanted.url, true),
                ].join(''),
              ),
            ].join(''),
          ),
        ]),
    ...(lines.length > 0
      ? [
          part(
            [
              h2(fill(t.mentions.heading)),
              list(lines.map((line) => ({ line }))),
              moreLines === null ? '' : paragraph(moreLines),
            ].join(''),
          ),
        ]
      : []),
    ...byProject.map((section) =>
      part(
        [
          h2(section.title),
          list(section.items),
          section.more === null ? '' : paragraph(section.more),
        ].join(''),
      ),
    ),
  ]
  // Le pied : pourquoi on le reçoit, puis les deux liens l'un sous l'autre (relecture de design de
  // 6c : chacun se touche du doigt sans toucher l'autre), puis le contact, en texte.
  const small = `font-size:13px;line-height:1.5;color:${c.textMuted}`
  const footerLink = (label: string, url: string) =>
    `<p style="margin:0;font-size:14px;line-height:1.4"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 4px 10px 0;color:${c.text};font-weight:bold">${escapeHtml(label)}</a></p>`
  const html = `<!doctype html>
<html lang="${language}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${recapNarrowStyle}</style>
</head><body style="margin:0;background:${c.background}">
<div class="page" style="padding:24px;background:${c.background};font-family:Arial,sans-serif;color:${c.text}">
  <div class="card" style="max-width:600px;margin:0 auto;background:${c.surface};border:1px solid ${c.surfaceBorder};border-radius:${radii.tile}px;overflow:hidden">
    <div class="part" style="padding:28px;background:${c.honey};background-image:linear-gradient(180deg,${c.honeyLight},${c.honey});color:${c.onHoney}">
      <p style="margin:0 0 16px;font-size:22px;line-height:1.2;font-weight:bold;color:${c.onHoney}">${escapeHtml(appName)}</p>
      <h1 style="margin:0 0 10px;font-size:28px;line-height:1.2;font-weight:bold;color:${c.onHoney};${wrap}">${escapeHtml(heading)}</h1>
      <p style="margin:0;${body};color:${c.onHoney}">${escapeHtml(fill(r.intro))}</p>
    </div>
    ${notes.length > 0 ? `<div class="part" style="padding:20px 28px 8px">${notes.map((note) => paragraph(note, `font-size:16px;line-height:1.5`)).join('')}</div>` : ''}
    ${parts.join('\n    ')}
    <div class="part" style="padding:24px 28px;background:${c.surfaceGrouped};border-top:1px solid ${c.line}">
      <p style="margin:0 0 10px;font-size:18px;font-weight:bold;color:${c.text}">${escapeHtml(appName)}</p>
      <p style="margin:0 0 6px;${small}">${escapeHtml(fill(r.reason))}</p>
      ${footerLink(t.changePreferences, data.links.manage)}
      ${footerLink(r.unsubscribe, data.links.unsubscribe)}
      <p style="margin:6px 0 0;${small}">${escapeHtml(fill(t.footer))}</p>
    </div>
  </div>
</div>
</body></html>`
  return {
    subject: fill(r.subject),
    headers: unsubscribeHeaders(data.links.oneClick),
    text,
    html,
    attachments,
  }
}

// ─── L'alerte de modération (tranche 7a) ─────────────────────────────────────────────────────────

export type ModerationAlertData = {
  /** Le nom de l'administrateur qui la reçoit (la salutation). */
  name: string
  /** Le nombre de signalements en attente. */
  count: number
  /** Le lien vers l'écran « Modération » de l'appli. */
  url: string
}

/**
 * L'e-mail d'alerte à un administrateur : des signalements attendent une décision. Aucun extrait,
 * aucun motif, personne de nommé (précision 5 du plan) : le nombre et le lien, rien de plus ne part
 * chez l'envoyeur d'e-mails. Pas de lien de désinscription : il cesse avec le rôle
 * (infra/grant-admin.sh --revoke) ou avec EMAIL_JOBS=off. L'adresse de contact est dans le pied,
 * comme dans tous les e-mails (`footer`, en texte).
 */
export const moderationAlertEmail = (
  language: Language,
  { name, count, url }: ModerationAlertData,
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.moderationAlert.subject),
    ...render({
      language,
      heading: fill(t.moderationAlert.heading),
      greeting: fill(t.greeting, { name: defangLinks(name, linkPlaceholder(language)) }),
      paragraphs: [counted(t.moderationAlert.body_one, t.moderationAlert.body_other, count)],
      button: { label: fill(t.moderationAlert.button), url },
      notes: [],
      reason: fill(t.moderationAlert.reason),
      footer: fill(t.footer),
    }),
  }
}

// ─── Le récap des « Autre » aux administrateurs (tranche R6b) ───────────────────────────────────

export type OtherRecapData = {
  /** Le nom de l'administrateur qui le reçoit (la salutation), le seul texte libre de l'e-mail. */
  name: string
  /** Les « Autre » apparus dans les sept jours, cités par un projet visible des membres. */
  tools: number
  /** Les projets visibles classés « Autre », publiés dans les sept jours. */
  projects: number
  /** Ceux, outils et projets ensemble, qui attendent depuis plus d'une semaine. */
  older: number
  /** Les deux pages de l'appli : « Outils » et « Catégories » de la Modération. */
  toolsUrl: string
  projectsUrl: string
}

/**
 * Le récap du lundi (relecture juridique jur-T1, option A) : des nombres et deux boutons, rien de
 * plus. Aucun nom d'outil, titre, accroche ni auteur ne part chez l'envoyeur d'e-mails : les
 * données ne leur laissent aucune place. Un nombre nul n'a pas de ligne. Un e-mail de service aux
 * administrateurs, comme l'alerte de modération : ni lien de désinscription, ni en-tête de liste.
 */
export const otherRecapEmail = (language: Language, data: OtherRecapData): EmailContent => {
  const t = resources[language].translation.email
  const r = t.otherRecap
  const lines = [
    data.tools > 0 ? counted(r.tools_one, r.tools_other, data.tools) : null,
    data.projects > 0 ? counted(r.projects_one, r.projects_other, data.projects) : null,
  ].filter((line): line is string => line !== null)
  // Un bouton par page qui a quelque chose à montrer (relecture du design) : sans outil, « Voir les
  // outils » menait à une page vide. L'e-mail ne part que si l'un des deux nombres dépasse zéro
  // (`jobs/other-recap.ts`) : il garde donc toujours au moins un bouton.
  const [button, ...moreButtons] = [
    data.tools > 0 ? { label: fill(r.toolsButton), url: data.toolsUrl } : null,
    data.projects > 0 ? { label: fill(r.projectsButton), url: data.projectsUrl } : null,
  ].filter((link) => link !== null)
  return {
    subject: fill(r.subject),
    ...render({
      language,
      heading: fill(r.heading),
      greeting: fill(t.greeting, { name: defangLinks(data.name, linkPlaceholder(language)) }),
      paragraphs: lines,
      after: data.older > 0 ? [counted(r.older_one, r.older_other, data.older)] : [],
      ...(button && { button }),
      moreButtons,
      notes: [],
      reason: fill(r.reason),
      footer: fill(t.footer),
    }),
  }
}

// ─── La suspension d'un compte (tranche 7c) ──────────────────────────────────────────────────────

export type SuspensionEmailData = {
  /** La fin prévue, à la seconde ; null : jusqu'à nouvel ordre. */
  endsAt: Date | null
  ground: RemovalGround
  /** L'explication écrite par l'administrateur, montrée telle quelle (adresses désarmées). */
  explanation: string
  /** Vrai si la suspension a suivi un signalement (J2) ; jamais de qui. */
  afterReport: boolean
}

/** Le fuseau de toutes les dates de la modération, quelle que soit la langue (J4). */
const PARIS_TIME_ZONE = 'Europe/Paris'

/**
 * La fin écrite à l'heure de Paris : « 4 novembre 2026 » et « 00:30 » (« November 4, 2026 » et
 * « 12:30 AM » en anglais). `Intl.DateTimeFormat` met une date en forme selon la langue ;
 * `timeZone` impose Paris, jamais le fuseau du serveur : 23 h 30 UTC un soir de novembre, c'est
 * déjà le lendemain à Paris. L'année est toujours écrite : un e-mail se relit longtemps après.
 */
const parisEnd = (language: Language, endsAt: Date) => {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { ...options, timeZone: PARIS_TIME_ZONE }).format(endsAt)
  return {
    date: format({ day: 'numeric', month: 'long', year: 'numeric' }),
    time: format({ hour: '2-digit', minute: '2-digit' }),
  }
}

/**
 * L'e-mail de service envoyé à un membre suspendu (article 17 du DSA), le seul de la suspension
 * (la levée n'est qu'une notification). Il dit : la décision, après un signalement ou non ; la fin
 * à l'heure de Paris, ou « jusqu'à nouvel ordre » ; le fondement et l'explication ; ce que le
 * membre peut encore faire ; comment contester. Ni le nom de l'administrateur, ni qui a signalé, ni
 * lien de désinscription (c'est un e-mail de service), ni bouton, ni image. La salutation est
 * neutre : l'e-mail n'a besoin d'aucune donnée du compte.
 */
export const suspensionEmail = (
  language: Language,
  { endsAt, ground, explanation, afterReport }: SuspensionEmailData,
): EmailContent => {
  const t = resources[language].translation.email.suspension
  return {
    subject: fill(t.subject),
    ...render({
      language,
      heading: fill(t.heading),
      greeting: fill(t.greeting),
      paragraphs: [
        fill(afterReport ? t.bodyAfterReport : t.body),
        ...(endsAt === null
          ? [fill(t.indefinite)]
          : [fill(t.until, parisEnd(language, endsAt)), fill(t.earlier)]),
        fill(t.grounds[ground]),
        // L'explication vient d'un administrateur, mais elle part chez l'envoyeur d'e-mails et
        // s'affiche dans une messagerie : aucune adresse cliquable (« [lien] »), et le HTML est
        // échappé par render, comme tout le reste. Un texte libre : son paragraphe se coupe
        // n'importe où si un mot est trop long (BodyParagraph).
        {
          freeText: fill(t.explanation, {
            explanation: defangLinks(explanation, linkPlaceholder(language)),
          }),
        },
        fill(t.meanwhile),
      ],
      // Contester : l'adresse de contact, en gras et en texte, jamais en lien « mailto: ».
      after: [withBold(t.contest, 'contactEmail', contactEmail)],
      notes: [],
      footer: fill(resources[language].translation.email.footer),
    }),
  }
}

export type MentionData = {
  name: string
  /** Chaque mention ou réponse, avec l'extrait du commentaire (80 caractères au plus). */
  items: (Mention & { excerpt: string })[]
  links: NotificationLinks
}

/**
 * L'e-mail de mentions et de réponses, que le membre active lui-même : la seule sorte d'e-mail qui
 * montre un extrait du texte des autres. L'objet reste fixe (écran verrouillé).
 */
export const mentionEmail = (language: Language, data: MentionData): EmailContent => {
  const t = resources[language].translation.email
  const link = linkPlaceholder(language)
  return {
    subject: fill(t.mentions.subject),
    headers: unsubscribeHeaders(data.links.oneClick),
    ...render({
      language,
      heading: fill(t.mentions.heading),
      greeting: fill(t.greeting, { name: defangLinks(data.name, link) }),
      paragraphs: [],
      items: data.items.map((item) => ({
        line: fill(t.mentions[item.kind], lineParams(item, link)),
        excerpt: defangLinks(item.excerpt, link),
      })),
      button: { label: fill(t.mentions.button), url: data.links.button },
      notes: [],
      reason: fill(t.mentions.reason),
      links: [
        { label: t.mentions.unsubscribe, url: data.links.unsubscribe },
        { label: t.manage, url: data.links.manage },
      ],
      footer: fill(t.footer),
    }),
  }
}
