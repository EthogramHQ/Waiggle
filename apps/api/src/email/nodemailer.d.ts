// Le petit morceau de nodemailer que `mailer.ts` utilise, décrit à la main : le paquet n'apporte pas
// ses types, et `@types/nodemailer` n'est pas ajouté (décision de la relecture du plan R8 : une
// dépendance de moins). Une « déclaration de module » dit à TypeScript la forme de ce que le paquet
// exporte ; elle ne produit aucun code.
declare module 'nodemailer' {
  export type SmtpOptions = {
    host: string
    port: number
    /** TLS dès la connexion (port 465). */
    secure?: boolean
    /** STARTTLS exigé (port 587) : sans lui, l'envoi est refusé plutôt que fait en clair. */
    requireTLS?: boolean
    auth: { user: string; pass: string }
    /** Ne jamais lire un fichier du disque ni une adresse distante pour une pièce jointe. */
    disableFileAccess?: boolean
    disableUrlAccess?: boolean
    connectionTimeout?: number
    greetingTimeout?: number
    socketTimeout?: number
  }
  export type MailMessage = {
    from: { name: string; address: string }
    to: string
    subject: string
    text: string
    html?: string
    headers?: Record<string, string>
    attachments?: {
      filename: string
      contentType: string
      content: Buffer
      cid: string
      contentDisposition: 'inline'
    }[]
  }
  export type Transporter = {
    sendMail(message: MailMessage): Promise<unknown>
    close(): void
  }
  export function createTransport(options: SmtpOptions): Transporter
  const nodemailer: { createTransport: typeof createTransport }
  export default nodemailer
}
