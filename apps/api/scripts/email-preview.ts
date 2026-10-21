// Écrit l'aperçu des e-mails de notification (tranche 6c) dans un dossier, pour les relire dans un
// navigateur : pnpm --filter @ruche/api email:preview <dossier>
// Chaque e-mail donne deux fichiers : la version HTML, et la version texte (avec son objet et ses
// en-têtes), celle que lisent les messageries sans HTML. Les données viennent de src/email/preview.ts.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { emailPreviews } from '../src/email/preview'

const target = process.argv[2]
if (!target) {
  console.error('Usage: pnpm --filter @ruche/api email:preview <folder>')
  process.exit(1)
}
const folder = resolve(target)
mkdirSync(folder, { recursive: true })

for (const { file, email } of emailPreviews()) {
  writeFileSync(join(folder, file), email.html, 'utf8')
  const headers = Object.entries(email.headers ?? {}).map(([key, value]) => `${key}: ${value}`)
  const text = [...headers, `Subject: ${email.subject}`, '', email.text].join('\n')
  writeFileSync(join(folder, file.replace(/\.html$/, '.txt')), text, 'utf8')
}
console.log(`E-mail previews written to ${folder}`)
