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
// Le pied de chaque e-mail (`footer`) donne l'adresse de contact (tranche 6d, règle 23), écrite en
// texte et jamais en lien « mailto: » : tout lien d'un e-mail mène à l'appli ou à l'API.
import { appName, palettes, radii } from '@ruche/brand'
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

type Link = { label: string; url: string }

/** Un élément d'une liste : une ligne, et éventuellement un extrait en dessous. */
type Item = { line: string; excerpt?: string }

type Layout = {
  /** La langue de l'e-mail, annoncée dans `<html lang>` (lecteurs d'écran, traduction). */
  language: Language
  /** La phrase titre, en gras sous le nom de l'appli (« Du nouveau cette semaine »). */
  heading?: string
  greeting: string
  paragraphs: string[]
  /** Une liste (les notifications d'un récap ou d'un e-mail de mentions). */
  items?: Item[]
  /** Des paragraphes après la liste (« Et 2 autres », les nombres). */
  after?: string[]
  button: Link
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
  items = [],
  after = [],
  button,
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
    ...paragraphs.flatMap((p) => [p, '']),
    ...(textItems.length > 0 ? [...textItems, ''] : []),
    ...after.flatMap((p) => [p, '']),
    button.label,
    button.url,
    '',
    ...notes.flatMap((note) => [note, '']),
    '—',
    ...(reason ? [reason, ''] : []),
    ...links.flatMap((link) => [link.label, link.url, '']),
    footer,
  ].join('\n')

  const p = (value: string, style = 'font-size:16px;line-height:1.5') =>
    `<p style="${style}">${escapeHtml(value)}</p>`
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
    ${paragraphs.map((value) => p(value)).join('\n    ')}
    ${htmlItems}
    ${after.map((value) => p(value)).join('\n    ')}
    <p style="margin:28px 0">
      <a href="${escapeHtml(button.url)}" style="background:${c.honey};color:${c.onHoney};text-decoration:none;padding:14px 22px;border-radius:${radii.pill}px;font-weight:bold">${escapeHtml(button.label)}</a>
    </p>
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

// ─── L'alerte de modération (tranche 6d) ─────────────────────────────────────────────────────────

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
