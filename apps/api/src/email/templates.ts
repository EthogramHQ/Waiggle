// Les e-mails envoyés par l'appli, dans la langue du membre.
// Chaque e-mail existe en deux versions : texte brut (lu par tous les logiciels de messagerie)
// et HTML (plus joli). Les textes viennent de @ruche/i18n, et les couleurs de @ruche/brand,
// comme dans l'appli : changer le miel là-bas le change aussi ici.
//
// Les e-mails de notification (tranche 6c : le récap de la semaine, l'e-mail de mentions) suivent
// des règles de plus (relectures de sécurité et juridique du plan) :
// - aucun lien venu d'un membre : son nom, un titre ou un extrait passent par defangLinks ;
// - chaque lien (href) mène à l'appli ou à l'API, jamais ailleurs ; aucune image (ni avatar, ni
//   pixel d'ouverture) ;
// - l'objet est fixe : rien d'écrit par un membre ne s'affiche sur un écran verrouillé ;
// - chaque e-mail dit pourquoi on le reçoit, et son lien de désinscription nomme ce qu'il coupe.
import { palettes, radii } from '@ruche/brand'
import { fill, type Language, resources } from '@ruche/i18n'
import { defangLinks } from './links'

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
  greeting: string
  paragraphs: string[]
  /** Une liste (les notifications d'un récap ou d'un e-mail de mentions). */
  items?: Item[]
  /** Des paragraphes après la liste (« Et 2 autres », les nombres). */
  after?: string[]
  button: Link
  /** Les petites lignes sous le bouton (« ce lien est valable une heure », « le dernier récap »). */
  notes: string[]
  /** Le pied : pourquoi on reçoit cet e-mail, puis les liens (se désinscrire, gérer). */
  reason?: string
  links?: Link[]
  footer: string
}

// Mise en page commune à tous les e-mails. Styles écrits directement dans les balises :
// beaucoup de messageries ignorent les feuilles de style.
const render = ({
  language,
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
  const html = `<!doctype html>
<html lang="${language}"><body style="margin:0;padding:24px;background:${c.surfaceGrouped};font-family:Arial,sans-serif;color:${c.text}">
  <div style="max-width:520px;margin:0 auto;background:${c.surface};border:1px solid ${c.groupBorder};border-radius:${radii.group}px;padding:28px">
    ${p(greeting, 'font-size:16px')}
    ${paragraphs.map((value) => p(value)).join('\n    ')}
    ${htmlItems}
    ${after.map((value) => p(value)).join('\n    ')}
    <p style="margin:28px 0">
      <a href="${escapeHtml(button.url)}" style="background:${c.honey};color:${c.onHoney};text-decoration:none;padding:14px 22px;border-radius:${radii.pill}px;font-weight:bold">${escapeHtml(button.label)}</a>
    </p>
    ${notes.map((note) => p(note, muted)).join('\n    ')}
  </div>
  ${reason ? p(reason, `text-align:center;font-size:12px;color:${c.textMuted}`) : ''}
  ${
    links.length > 0
      ? `<p style="text-align:center;font-size:12px">${links
          .map(
            (link) =>
              `<a href="${escapeHtml(link.url)}" style="color:${c.textMuted}">${escapeHtml(link.label)}</a>`,
          )
          .join(' · ')}</p>`
      : ''
  }
  <p style="text-align:center;font-size:12px;color:${c.textMuted}">${escapeHtml(footer)}</p>
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
      greeting: fill(t.greeting, { name }),
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
      greeting: fill(t.greeting, { name }),
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

/** Les paramètres d'une ligne, nettoyés : aucune adresse écrite par un membre n'en sort. */
const lineParams = ({ name, handle, title }: { name: string; handle: string; title: string }) => ({
  name: defangLinks(name),
  handle,
  title: defangLinks(title),
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
      greeting: fill(t.greeting, { name: defangLinks(data.name) }),
      paragraphs: [fill(t.recap.intro), ...(data.first ? [fill(t.recap.first)] : [])],
      items: data.lines.map((line) => ({ line: fill(t.recap[line.kind], lineParams(line)) })),
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
      notes: data.last ? [fill(t.recap.last)] : [],
      reason: fill(t.recap.reason),
      links: [
        { label: t.recap.unsubscribe, url: data.links.unsubscribe },
        { label: t.manage, url: data.links.manage },
      ],
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
  return {
    subject: fill(t.mentions.subject),
    headers: unsubscribeHeaders(data.links.oneClick),
    ...render({
      language,
      greeting: fill(t.greeting, { name: defangLinks(data.name) }),
      paragraphs: [],
      items: data.items.map((item) => ({
        line: fill(t.mentions[item.kind], lineParams(item)),
        excerpt: defangLinks(item.excerpt),
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
