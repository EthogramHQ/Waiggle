// Les e-mails envoyés par l'appli, dans la langue du membre.
// Chaque e-mail existe en deux versions : texte brut (lu par tous les logiciels de messagerie)
// et HTML (plus joli). Les textes viennent de @ruche/i18n, et les couleurs de @ruche/brand,
// comme dans l'appli : changer le miel là-bas le change aussi ici.
import { palettes, radii } from '@ruche/brand'
import { fill, type Language, resources } from '@ruche/i18n'

export type Email = { to: string; subject: string; text: string; html: string }
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

type Layout = {
  greeting: string
  paragraphs: string[]
  button: { label: string; url: string }
  note: string
  footer: string
}

// Mise en page commune à tous les e-mails. Styles écrits directement dans les balises :
// beaucoup de messageries ignorent les feuilles de style.
const render = ({ greeting, paragraphs, button, note, footer }: Layout) => ({
  text: [greeting, '', ...paragraphs, '', button.url, '', note, '', '—', footer].join('\n'),
  html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:${c.surfaceGrouped};font-family:Arial,sans-serif;color:${c.text}">
  <div style="max-width:520px;margin:0 auto;background:${c.surface};border:1px solid ${c.groupBorder};border-radius:${radii.group}px;padding:28px">
    <p style="font-size:16px">${escapeHtml(greeting)}</p>
    ${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5">${escapeHtml(p)}</p>`).join('\n    ')}
    <p style="margin:28px 0">
      <a href="${escapeHtml(button.url)}" style="background:${c.honey};color:${c.onHoney};text-decoration:none;padding:14px 22px;border-radius:${radii.pill}px;font-weight:bold">${escapeHtml(button.label)}</a>
    </p>
    <p style="font-size:13px;color:${c.textMuted}">${escapeHtml(note)}</p>
  </div>
  <p style="text-align:center;font-size:12px;color:${c.textMuted}">${escapeHtml(footer)}</p>
</body></html>`,
})

/** L'e-mail qui contient le lien pour vérifier l'adresse et activer le compte. */
export const verificationEmail = (
  language: Language,
  { name, url }: { name: string; url: string },
): EmailContent => {
  const t = resources[language].translation.email
  return {
    subject: fill(t.verify.subject),
    ...render({
      greeting: fill(t.greeting, { name }),
      paragraphs: [t.verify.body, t.verify.expires],
      button: { label: t.verify.button, url },
      note: t.verify.ignore,
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
      greeting: fill(t.greeting, { name }),
      paragraphs: [t.existingAccount.body],
      button: { label: t.existingAccount.button, url: signInUrl },
      note: t.existingAccount.ignore,
      footer: fill(t.footer),
    }),
  }
}
