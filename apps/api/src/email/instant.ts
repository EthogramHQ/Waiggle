// L'e-mail « tout de suite » (R8), qui remplace l'e-mail de mentions de 6c : un e-mail court qui
// regroupe tout ce qui vient d'arriver pour les types que le membre a réglés sur « Tout de suite »
// (commentaires sur ses projets, réponses et mentions, coin des testeurs). Scénario :
// docs/scenarios/refonte.md, « Les e-mails tout de suite ». La tâche qui l'envoie est
// jobs/instant-emails.ts ; ici, seulement la mise en forme, en texte brut et en HTML.
//
// Les règles des e-mails de notification (templates.ts) valent ici aussi, plus celles de la relecture
// du plan R8 :
// - chaque texte d'un membre (son nom, un titre, un extrait) passe par defangLinks (« [lien] »), puis
//   est échappé dans le HTML ;
// - chaque lien est fabriqué par la tâche (l'adresse de l'appli et des identifiants), jamais lu d'un
//   texte de membre ; aucune image ;
// - un message du coin des testeurs (appel, retour, réponse, « Réglé ») ne donne aucun texte : le
//   fil est privé, une messagerie le garderait ;
// - l'objet ne nomme jamais un message du coin (seul un appel à tester, que tous les testeurs
//   lisent, y est nommé).
import { appName, palettes, radii } from '@ruche/brand'
import type { InstantEmailType } from '@ruche/contracts'
import { fill, type Language, resources } from '@ruche/i18n'
import { defangLinks, linkPlaceholder } from './links'
import { type EmailContent, emailButton, type NotificationLinks } from './templates'
import { createUnsubscribeToken } from './unsubscribe-token'

/** Les types qu'un e-mail « tout de suite » peut contenir (ceux qui admettent « Tout de suite »). */
export type InstantType = InstantEmailType

/** Une ligne de l'e-mail : une nouveauté, avec ce qu'il faut pour l'écrire et y mener. */
export type InstantLine = {
  kind:
    | 'comment'
    | 'reply'
    | 'mention'
    | 'tester_call'
    | 'tester_feedback'
    | 'tester_reply_to_tester'
    | 'tester_reply_to_author'
    | 'feedback_settled'
  /** Le nom de qui a écrit, tel qu'il l'a saisi (désarmé ici). */
  who: string
  handle: string
  /** Le titre du projet, tel qu'écrit par son auteur (désarmé ici). */
  title: string
  /** Le début d'un commentaire (80 caractères, déjà désarmé par la tâche) ; null pour le coin. */
  excerpt: string | null
  at: Date
  /** L'adresse de la page dans l'appli, fabriquée par la tâche. */
  url: string
}

export type InstantData = {
  /** Le nom du membre qui reçoit l'e-mail (la salutation). */
  name: string
  /** Les nouveautés, de la plus ancienne à la plus récente : l'e-mail se lit comme la conversation. */
  lines: InstantLine[]
  /** Les types présents dans l'e-mail, dans l'ordre de l'écran des réglages (« pourquoi »). */
  types: InstantType[]
  links: NotificationLinks
}

/** Les textes de l'e-mail dans une langue (les deux langues ont les mêmes clés). */
type Texts = (typeof resources)[Language]['translation']['email']['instant']

/** La clé de la phrase d'une ligne, selon sa sorte. */
const sentenceKey = {
  comment: 'comment',
  reply: 'reply',
  mention: 'mention',
  tester_call: 'testerCall',
  tester_feedback: 'testerFeedback',
  tester_reply_to_tester: 'testerReplyToTester',
  tester_reply_to_author: 'testerReplyToAuthor',
  feedback_settled: 'feedbackSettled',
} as const satisfies Record<InstantLine['kind'], keyof Texts>

/** Le bouton de chaque ligne : le commentaire en contexte, ou le bon endroit du coin. */
const buttonKey = {
  comment: 'seeInContext',
  reply: 'seeInContext',
  mention: 'seeInContext',
  tester_call: 'readCall',
  tester_feedback: 'readFeedback',
  tester_reply_to_tester: 'readReply',
  tester_reply_to_author: 'readReply',
  feedback_settled: 'openCorner',
} as const satisfies Record<InstantLine['kind'], keyof Texts>

/** L'étiquette au-dessus de la ligne (« Commentaire · 18:02 ») : le coin a une seule étiquette. */
const labelKey = {
  comment: 'comment',
  reply: 'reply',
  mention: 'mention',
  tester_call: 'testers',
  tester_feedback: 'testers',
  tester_reply_to_tester: 'testers',
  tester_reply_to_author: 'testers',
  feedback_settled: 'testers',
} as const satisfies Record<InstantLine['kind'], keyof Texts['labels']>

/**
 * L'objet d'une première ligne, s'il peut la nommer. Un message du coin (retour, réponse,
 * « Réglé ») n'en a pas : l'objet s'affiche sur un écran verrouillé, et le fil est privé.
 */
const subjectKey: Partial<
  Record<
    InstantLine['kind'],
    'subjectComment' | 'subjectReply' | 'subjectMention' | 'subjectTesterCall'
  >
> = {
  comment: 'subjectComment',
  reply: 'subjectReply',
  mention: 'subjectMention',
  tester_call: 'subjectTesterCall',
}

/**
 * Les guillemets autour du nom d'un type, selon la langue : « … » en français, avec l'espace
 * insécable des textes (U+00A0, écrite par son code : invisible dans l'éditeur), “…” en anglais.
 */
const NO_BREAK_SPACE = String.fromCodePoint(0xa0)
const quote = (language: Language, text: string) =>
  language === 'fr' ? `«${NO_BREAK_SPACE}${text}${NO_BREAK_SPACE}»` : `“${text}”`

/**
 * « « A », « B » et « C » » : `Intl.ListFormat` joint une liste selon les règles de la langue (« et »
 * en français, « , and » en anglais), sans qu'on écrive ces règles nous-mêmes.
 */
const typeList = (language: Language, types: InstantType[]) => {
  const names = resources[language].translation.notificationSettings.types
  return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(
    types.map((type) => quote(language, names[type])),
  )
}

/** L'heure d'une ligne, à Paris, quelle que soit l'heure du serveur (comme les autres e-mails). */
const parisTime = (language: Language, at: Date) =>
  new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(at)

/**
 * « Échappe » un texte avant de l'insérer dans du HTML (< devient &lt;…) : un membre qui
 * s'appellerait `<img src=x onerror=…>` ne glisse ainsi aucun code dans l'e-mail.
 */
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Une ligne prête à écrire : chaque texte de membre désarmé, rien d'échappé encore. */
type Written = {
  when: string
  sentence: string
  excerpt: string | null
  note: string | null
  button: string
  url: string
}

const writeLine = (language: Language, t: Texts, line: InstantLine): Written => {
  const link = linkPlaceholder(language)
  const params = {
    name: defangLinks(line.who, link),
    // Le pseudo n'a que des lettres, des chiffres et « _ » (le schéma le garantit) : pas d'adresse.
    handle: line.handle,
    title: defangLinks(line.title, link),
  }
  // Le coin des testeurs : jamais d'extrait, même si la tâche en donnait un par erreur.
  const corner = !(line.kind === 'comment' || line.kind === 'reply' || line.kind === 'mention')
  return {
    when: fill(t.when, {
      label: t.labels[labelKey[line.kind]],
      time: parisTime(language, line.at),
    }),
    sentence: fill(t[sentenceKey[line.kind]], params),
    // L'extrait a été désarmé avant d'être coupé (une adresse coupée en deux ne serait plus
    // reconnue) ; on repasse quand même le filtre, qui ne trouve plus rien à changer.
    excerpt: corner || line.excerpt === null ? null : defangLinks(line.excerpt, link),
    note: corner ? fill(line.kind === 'tester_call' ? t.callPrivate : t.private) : null,
    button: fill(t[buttonKey[line.kind]]),
    url: line.url,
  }
}

/** L'objet : la première ligne nommée (« Malik a commenté « Météo » »), ou une nouveauté sans nom. */
const subjectOf = (language: Language, t: Texts, lines: InstantLine[]) => {
  const [first] = lines
  const key = first ? subjectKey[first.kind] : undefined
  const count = lines.length
  if (!first || !key) {
    return fill(count === 1 ? t.subjectNews_one : t.subjectNews_other, { count: String(count) })
  }
  const link = linkPlaceholder(language)
  const named = fill(t[key], {
    name: defangLinks(first.who, link),
    title: defangLinks(first.title, link),
  })
  if (count === 1) return named
  return fill(count === 2 ? t.subjectMore_one : t.subjectMore_other, {
    first: named,
    count: String(count - 1),
  })
}

// Les e-mails sont toujours en couleurs de jour : beaucoup de messageries ne gèrent pas le mode nuit.
const c = palettes.day

/**
 * L'e-mail « tout de suite », dans la langue du membre. Le texte brut se lit seul (chaque lien écrit
 * en entier sous son libellé) ; le HTML montre chaque ligne dans un bloc : l'étiquette et l'heure,
 * la phrase, l'extrait en citation ou la note du coin, puis son bouton.
 */
export const instantEmail = (data: InstantData, language: Language): EmailContent => {
  const email = resources[language].translation.email
  const t = email.instant
  const link = linkPlaceholder(language)
  const count = data.lines.length
  const lines = data.lines.map((line) => writeLine(language, t, line))
  const intro = fill(t.intro, { name: defangLinks(data.name, link) })
  const heading = fill(count === 1 ? t.heading_one : t.heading_other, { count: String(count) })
  const reason = fill(data.types.length === 1 ? t.reason_one : t.reason_other, {
    types: typeList(language, data.types),
  })
  const footerLinks = [
    { label: t.unsubscribe, url: data.links.unsubscribe },
    { label: email.changePreferences, url: data.links.manage },
  ]
  const footer = fill(email.footer)

  const text = [
    intro,
    '',
    ...lines.flatMap((line) => [
      line.when,
      line.sentence,
      ...(line.excerpt === null ? [] : [`> ${line.excerpt}`]),
      ...(line.note === null ? [] : [line.note]),
      line.button,
      line.url,
      '',
    ]),
    '—',
    reason,
    '',
    ...footerLinks.flatMap(({ label, url }) => [label, url, '']),
    footer,
  ].join('\n')

  const body = 'font-size:16px;line-height:1.5'
  const small = `text-align:center;font-size:13px;line-height:1.5;color:${c.textMuted}`
  // Un bloc par ligne, séparé du suivant par un filet. Un titre d'un seul long mot se coupe
  // n'importe où plutôt que de faire défiler l'e-mail à l'horizontale (comme templates.ts).
  const htmlLines = lines
    .map(
      (
        line,
      ) => `<div style="border-top:1px solid ${c.groupBorder};padding:16px 0;overflow-wrap:anywhere;word-break:break-word">
      <p style="margin:0 0 4px;font-size:13px;color:${c.textMuted}">${escapeHtml(line.when)}</p>
      <p style="margin:0;${body}">${escapeHtml(line.sentence)}</p>${
        line.excerpt === null
          ? ''
          : `
      <p style="margin:8px 0 0;padding-left:10px;border-left:3px solid ${c.groupBorder};${body};color:${c.textMuted}">${escapeHtml(line.excerpt)}</p>`
      }${
        line.note === null
          ? ''
          : `
      <p style="margin:8px 0 0;font-size:13px;color:${c.textMuted}">${escapeHtml(line.note)}</p>`
      }
      <p style="margin:12px 0 0">${emailButton(line.button, line.url, lines.length === 1)}</p>
    </div>`,
    )
    .join('\n    ')
  const htmlFooterLinks = footerLinks
    .map(
      ({ label, url }) =>
        `<p style="margin:0;text-align:center;font-size:14px;line-height:1.4"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 4px;color:${c.textMuted}">${escapeHtml(label)}</a></p>`,
    )
    .join('\n    ')
  const html = `<!doctype html>
<html lang="${language}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media (max-width:480px){.page{padding:12px 8px !important}.card{padding:20px 16px !important}}</style>
</head><body style="margin:0;background:${c.surfaceGrouped}">
<div class="page" style="padding:24px;background:${c.surfaceGrouped};font-family:Arial,sans-serif;color:${c.text}">
  <div class="card" style="max-width:520px;margin:0 auto;background:${c.surface};border:1px solid ${c.groupBorder};border-radius:${radii.group}px;padding:28px">
    <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:${c.amberText}">${escapeHtml(appName)}</p>
    <p style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:bold">${escapeHtml(heading)}</p>
    <p style="${body};overflow-wrap:anywhere;word-break:break-word">${escapeHtml(intro)}</p>
    ${htmlLines}
  </div>
  <div style="max-width:520px;margin:16px auto 0">
    <p style="${small}">${escapeHtml(reason)}</p>
    ${htmlFooterLinks}
    <p style="${small}">${escapeHtml(footer)}</p>
  </div>
</div>
</body></html>`

  return {
    subject: subjectOf(language, t, data.lines),
    // La désinscription en un clic (RFC 8058) : l'adresse de l'API, sans `choice`, qui passe les
    // types « Tout de suite » à « Dans le récap » (décision de Louis du 12/11/2026).
    headers: {
      'List-Unsubscribe': `<${data.links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text,
    html,
  }
}

// ─── L'aperçu (scripts/email-preview.ts, par email/preview.ts) ──────────────────────────────────

const PREVIEW_APP_URL = 'https://waiggle.com'
const PREVIEW_API_URL = 'https://api.waiggle.com'
// Une clé d'exemple : les jetons de l'aperçu ne valent rien sur le vrai serveur.
const PREVIEW_SECRET = 'preview-only-secret-not-used-anywhere'
// Un identifiant de la longueur de ceux de Better Auth (32 caractères), comme preview.ts.
const PREVIEW_MEMBER = 'Xk3vQ9pLm2RtY7wZ4aBcD8eFgH1jKlMn'
const PREVIEW_PROJECT = '0b7c2f3e-9a41-4d5e-8f6a-1c2d3e4f5a6b'
const PREVIEW_COMMENT = '5d6e7f80-1a2b-4c3d-9e8f-7a6b5c4d3e2f'

/**
 * Les données de l'aperçu : une ligne de chaque sorte, l'adresse réelle la plus longue (le lien
 * d'une réponse en contexte, le fil d'un testeur), un titre et un nom longs, un extrait coupé à 80.
 */
export const instantPreviewData = (): InstantData => {
  const query = new URLSearchParams({
    token: createUnsubscribeToken(PREVIEW_SECRET, PREVIEW_MEMBER, 'instant'),
  })
  const project = `${PREVIEW_APP_URL}/projects/${PREVIEW_PROJECT}`
  const at = (minutes: number) => new Date(Date.UTC(2026, 5, 15, 16, minutes))
  const malik = { who: 'Malik Benali-Fontaine', handle: 'malik_benali' }
  const zoe = { who: 'Zoé', handle: 'zoe' }
  const title = 'Le ciel de ce soir, raconté par une IA qui regarde les nuages'
  return {
    name: 'Inès Morel',
    lines: [
      {
        kind: 'comment',
        ...malik,
        title,
        excerpt:
          'Super idée, la carte des nuages ! Est-ce qu’on pourra choisir sa ville ? Je voudrais…',
        at: at(2),
        url: `${project}?comment=${PREVIEW_COMMENT}`,
      },
      {
        kind: 'reply',
        ...zoe,
        title,
        excerpt: 'Oui, et même son quartier.',
        at: at(4),
        url: `${project}?comment=${PREVIEW_COMMENT}`,
      },
      {
        kind: 'mention',
        ...malik,
        title: 'Jardin',
        excerpt: '@ines_morel tu as vu la pluie de demain ?',
        at: at(5),
        url: `${PREVIEW_APP_URL}/projects/${PREVIEW_PROJECT}?comment=${PREVIEW_COMMENT}`,
      },
      {
        kind: 'tester_call',
        ...zoe,
        title: 'Vélo',
        excerpt: null,
        at: at(6),
        url: `${project}/testers?tab=calls`,
      },
      {
        kind: 'tester_feedback',
        ...zoe,
        title,
        excerpt: null,
        at: at(7),
        url: `${project}/testers/threads/${PREVIEW_MEMBER}`,
      },
      {
        kind: 'tester_reply_to_tester',
        ...zoe,
        title: 'Vélo',
        excerpt: null,
        at: at(8),
        url: `${project}/testers?tab=feedback`,
      },
      {
        kind: 'tester_reply_to_author',
        ...zoe,
        title,
        excerpt: null,
        at: at(9),
        url: `${project}/testers/threads/${PREVIEW_MEMBER}`,
      },
      {
        kind: 'feedback_settled',
        ...zoe,
        title: 'Vélo',
        excerpt: null,
        at: at(10),
        url: `${project}/testers?tab=feedback`,
      },
    ],
    types: ['comments', 'replies', 'testers'],
    links: {
      button: `${PREVIEW_APP_URL}/notifications`,
      unsubscribe: `${PREVIEW_APP_URL}/unsubscribe?${query}`,
      manage: `${PREVIEW_APP_URL}/settings/notifications`,
      oneClick: `${PREVIEW_API_URL}/v1/email/unsubscribe?${query}`,
    },
  }
}
