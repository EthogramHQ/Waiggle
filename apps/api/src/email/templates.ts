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

type Link = {
  label: string
  url: string
  /**
   * Le libellé de la version texte, s'il diffère : sans bouton, l'adresse du lien suit sur la
   * ligne d'en dessous, d'où « Confirmer cette adresse : » (relecture de design des-E6).
   */
  textLabel?: string
}

/** Un élément d'une liste : une ligne, et éventuellement un extrait en dessous. */
type Item = { line: string; excerpt?: string }

/** Un morceau de paragraphe : du texte, en gras s'il faut le retenir (l'adresse de contact). */
type Run = { text: string; bold?: boolean }
/** Un paragraphe : un texte simple, ou une suite de morceaux dont certains sont en gras. */
type Paragraph = string | Run[]

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
  typeof paragraph === 'string' ? paragraph : paragraph.map((run) => run.text).join('')

/** Le paragraphe en HTML : chaque morceau échappé, les morceaux en gras dans un <strong>. */
const richHtml = (paragraph: Paragraph) =>
  typeof paragraph === 'string'
    ? escapeHtml(paragraph)
    : paragraph
        .map((run) =>
          run.bold ? `<strong>${escapeHtml(run.text)}</strong>` : escapeHtml(run.text),
        )
        .join('')

/**
 * Un paragraphe du corps : un texte, ou un texte libre écrit par quelqu'un (l'explication d'une
 * suspension) qui peut contenir un mot très long. Celui-là se coupe n'importe où quand un mot ne
 * tient pas dans la largeur (`overflow-wrap:anywhere`, et `word-break:break-word` pour les moteurs
 * qui ne connaissent que lui) : un <p> ordinaire ne se coupe qu'aux espaces, et un mot de 76
 * caractères faisait défiler l'e-mail de 431 px à l'horizontale sur un écran de 320 px (relecture
 * de design de 7c). Les autres paragraphes, écrits par nous, gardent les coupures ordinaires.
 */
type BodyParagraph = string | { freeText: string }

const paragraphText = (paragraph: BodyParagraph) =>
  typeof paragraph === 'string' ? paragraph : paragraph.freeText

type Layout = {
  /** La langue de l'e-mail, annoncée dans `<html lang>` (lecteurs d'écran, traduction). */
  language: Language
  /** La phrase titre, en gras sous le nom de l'appli (« Du nouveau cette semaine »). */
  heading?: string
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
  /** Le bouton ; absent d'un e-mail qui ne demande aucun geste (l'adresse changée, jur-R6). */
  button?: Link
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
  greeting,
  paragraphs,
  highlight,
  items = [],
  after = [],
  button,
  closing = [],
  notes,
  reason,
  links = [],
  footer,
}: Layout) => {
  // Le texte brut : chaque lien écrit en entier sous son libellé, pour les messageries sans HTML ;
  // un extrait en citation (« > », l'usage des e-mails), sous sa ligne.
  const textItems = items.flatMap(({ line, excerpt }) =>
    excerpt === undefined ? [`• ${line}`] : [`• ${line}`, `  > ${excerpt}`],
  )
  // Le titre (heading) n'y est pas : il sert la hiérarchie visuelle du HTML, et l'objet de l'e-mail
  // dit déjà la même chose en tête du texte brut.
  const text = [
    greeting,
    '',
    ...paragraphs.flatMap((p) => [paragraphText(p), '']),
    ...(highlight === undefined ? [] : [highlight, '']),
    ...(textItems.length > 0 ? [...textItems, ''] : []),
    ...after.flatMap((p) => [plain(p), '']),
    ...(button ? [button.textLabel ?? button.label, button.url, ''] : []),
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
  const htmlItems =
    items.length === 0
      ? ''
      : `<ul style="padding-left:20px;margin:16px 0">${items
          .map(
            ({ line, excerpt }) =>
              `<li style="font-size:16px;line-height:1.5;margin:0 0 10px">${escapeHtml(line)}${
                excerpt === undefined
                  ? ''
                  : `<br><span style="display:inline-block;margin-top:4px;padding-left:10px;border-left:3px solid ${c.groupBorder};color:${c.textMuted}">${escapeHtml(excerpt)}</span>`
              }</li>`,
          )
          .join('')}</ul>`
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
  const htmlButton = button
    ? `<p style="margin:28px 0">
      <a href="${escapeHtml(button.url)}" style="background:${c.honey};color:${c.onHoney};text-decoration:none;padding:14px 22px;border-radius:${radii.pill}px;font-weight:bold">${escapeHtml(button.label)}</a>
    </p>`
    : ''
  const html = `<!doctype html>
<html lang="${language}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${narrowScreenStyle}</style>
</head><body style="margin:0;background:${c.surfaceGrouped}">
<div class="page" style="padding:24px;background:${c.surfaceGrouped};font-family:Arial,sans-serif;color:${c.text}">
  <div class="card" style="max-width:520px;margin:0 auto;background:${c.surface};border:1px solid ${c.groupBorder};border-radius:${radii.group}px;padding:28px">
    ${top}
    ${p(greeting, 'font-size:16px')}
    ${paragraphs
      .map((value) =>
        typeof value === 'string'
          ? p(value)
          : p(value.freeText, `${body};overflow-wrap:anywhere;word-break:break-word`),
      )
      .join('\n    ')}
    ${htmlHighlight}
    ${htmlItems}
    ${after.map((value) => p(value)).join('\n    ')}
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
      paragraphs: [t.verify.body, t.verify.expires],
      button: { label: t.verify.button, url },
      notes: [t.verify.ignore],
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
      paragraphs: [t.existingAccount.body],
      button: { label: t.existingAccount.button, url: signInUrl },
      notes: [t.existingAccount.ignore],
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
      after: [fill(t.changeEmail.next), fill(t.changeEmail.expires)],
      button: { label: fill(t.changeEmail.button), url },
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
      greeting: fill(t.newEmail.greeting),
      paragraphs: [fill(t.newEmail.body), fill(t.newEmail.expires)],
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

export type RecapData = {
  /** Le nom du membre qui reçoit le récap (la salutation). */
  name: string
  /** Les lignes montrées, 5 au plus, de la plus récente à la plus ancienne. */
  lines: RecapLine[]
  /** Combien d'autres commentaires, réponses ou mentions ne sont pas montrés (« Et 2 autres »). */
  more: number
  reactions: number
  follows: number
  /** Son premier récap : on explique ce que c'est (relecture juridique R3). */
  first: boolean
  /** Le 3e récap de suite sans visite : on dit que c'est le dernier pour l'instant (R4). */
  last: boolean
  links: NotificationLinks
}

/**
 * Le récap de la semaine. Pas d'extrait : seulement qui, quoi, sur quel projet (relecture
 * juridique R5), puis les nombres de réactions et d'abonnements, sans aucun nom.
 */
export const recapEmail = (language: Language, data: RecapData): EmailContent => {
  const t = resources[language].translation.email
  const link = linkPlaceholder(language)
  const counts = [
    ...(data.reactions > 0
      ? [counted(t.recap.reactions_one, t.recap.reactions_other, data.reactions)]
      : []),
    ...(data.follows > 0
      ? [counted(t.recap.follows_one, t.recap.follows_other, data.follows)]
      : []),
  ]
  return {
    subject: fill(t.recap.subject),
    headers: unsubscribeHeaders(data.links.oneClick),
    ...render({
      language,
      heading: fill(t.recap.heading),
      greeting: fill(t.greeting, { name: defangLinks(data.name, link) }),
      // Ce qui est propre à cet e-mail (le premier, le dernier pour l'instant) vient juste sous
      // l'introduction, au corps normal, avant la liste et le bouton (relecture de design, 6c).
      paragraphs: [
        fill(t.recap.intro),
        ...(data.first ? [fill(t.recap.first)] : []),
        ...(data.last ? [fill(t.recap.last)] : []),
      ],
      items: data.lines.map((line) => ({ line: fill(t.recap[line.kind], lineParams(line, link)) })),
      after: [
        ...(data.more > 0 ? [counted(t.recap.more_one, t.recap.more_other, data.more)] : []),
        // « Et aussi : 3 réactions à tes projets, 2 nouveaux abonnements » ; sans liste au-dessus,
        // les nombres seuls.
        ...(counts.length > 0
          ? [
              data.lines.length > 0
                ? `${t.recap.alsoLabel} ${counts.join(', ')}`
                : counts.join(', '),
            ]
          : []),
      ],
      button: { label: fill(t.recap.button), url: data.links.button },
      notes: [],
      reason: fill(t.recap.reason),
      links: [
        { label: t.recap.unsubscribe, url: data.links.unsubscribe },
        { label: t.manage, url: data.links.manage },
      ],
      footer: fill(t.footer),
    }),
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
