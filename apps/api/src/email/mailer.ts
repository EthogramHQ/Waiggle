// L'envoi des e-mails. Le reste du code ne parle qu'à l'interface `Mailer` (« envoie cet e-mail »),
// sans savoir qui l'envoie vraiment. On peut ainsi brancher :
// - Scaleway en production (ADR 0005 ; Brevo reste disponible, réservé au futur marketing),
// - la console en développement (le lien s'affiche dans le terminal),
// - une boîte en mémoire dans les tests (on peut relire ce qui aurait été envoyé).
import nodemailer from 'nodemailer'
import { z } from 'zod'
import type { Email } from './templates'

export type { Email }

export interface Mailer {
  send(email: Email): Promise<void>
}

/**
 * Les seuls en-têtes qu'un e-mail peut ajouter (tranche 6c, relecture de sécurité S-A7) : ceux de
 * la désinscription en un clic (RFC 8058), que la messagerie lit pour afficher son bouton « Se
 * désabonner ». Toute autre clé est refusée, et chaque valeur doit être de l'ASCII imprimable (du
 * code 32, l'espace, au code 126, « ~ ») : un retour à la ligne glissé dans une valeur ajouterait
 * un en-tête de plus (« Bcc: … », une copie cachée vers n'importe qui).
 */
const ALLOWED_HEADERS = new Set(['List-Unsubscribe', 'List-Unsubscribe-Post'])
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/

/** Vérifie les en-têtes d'un e-mail, et lève une erreur (rien ne part) s'ils sortent des règles. */
const checkedHeaders = (headers: Email['headers']): [string, string][] => {
  const entries = Object.entries(headers ?? {})
  for (const [key, value] of entries) {
    if (!ALLOWED_HEADERS.has(key) || !PRINTABLE_ASCII.test(value)) {
      // Le message ne recopie ni la clé ni la valeur : elles pourraient contenir n'importe quoi.
      throw new Error('Email header refused')
    }
  }
  return entries
}

/**
 * Les pièces jointes (les vignettes du récap, R8) ne passent que par le SMTP. Les autres transports
 * refusent un e-mail qui en porte, plutôt que de les perdre en silence : l'appelant (le récap)
 * renvoie alors son e-mail sans vignettes. Rien n'est envoyé ni écrit avant ce refus.
 */
const refuseAttachments = ({ attachments }: { attachments: Email['attachments'] | undefined }) => {
  if ((attachments ?? []).length > 0) {
    throw new Error('This email transport cannot send attachments')
  }
}

/** Pour les tests : garde les e-mails dans un tableau au lieu de les envoyer. */
export const createMemoryMailer = () => {
  const sent: Email[] = []
  return {
    sent,
    async send(email: Email) {
      sent.push(email)
    },
  } satisfies Mailer & { sent: Email[] }
}

/** Pour le développement : affiche l'e-mail (et donc le lien à cliquer) dans le terminal. */
export const createConsoleMailer = (): Mailer => ({
  async send({ to, subject, text, headers, attachments }) {
    refuseAttachments({ attachments })
    // Les en-têtes ajoutés (désinscription en un clic) s'affichent avant l'objet.
    const lines = checkedHeaders(headers).map(([key, value]) => `${key}: ${value}\n`)
    console.log(
      `\n--- E-mail pour ${to} ---\n${lines.join('')}${subject}\n\n${text}\n--- fin ---\n`,
    )
  },
})

type BrevoOptions = {
  apiKey: string
  from: { email: string; name: string }
  /** Remplaçable dans les tests, pour ne rien envoyer sur Internet. */
  fetch?: typeof fetch
}

/** Pour la production : envoi par l'API HTTP de Brevo. */
export const createBrevoMailer = ({
  apiKey,
  from,
  fetch: doFetch = fetch,
}: BrevoOptions): Mailer => ({
  async send({ to, subject, text, html, headers, attachments }) {
    refuseAttachments({ attachments })
    // Les en-têtes sont vérifiés avant tout envoi : un en-tête refusé, et rien ne part.
    const extra = checkedHeaders(headers)
    const res = await doFetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: from,
        // contactPixelTrackingConsent: false → Brevo n'insère ni pixel d'ouverture ni lien de
        // suivi des clics dans cet e-mail (les liens pointent directement chez nous). C'est la
        // promesse « pas de traqueurs », et un membre n'a jamais à passer par un domaine inconnu
        // pour activer son compte. Ce champ n'agit que si le « consentement au suivi des pixels par
        // contact » est activé dans le compte Brevo (docs/ops/serveur.md, partie 2) : sinon Brevo
        // l'ignore sans rien dire. Aucun test ne peut le voir : on vérifie sur un vrai e-mail.
        to: [{ email: to, contactPixelTrackingConsent: false }],
        subject,
        textContent: text,
        htmlContent: html,
        // Brevo prend les en-têtes ajoutés sous forme d'objet { clé: valeur }.
        ...(extra.length > 0 && { headers: Object.fromEntries(extra) }),
      }),
      signal: AbortSignal.timeout(10_000), // on n'attend jamais plus de 10 secondes
    })
    // On ne lit jamais le corps de la réponse (il pourrait contenir des détails internes), mais on
    // le libère : sinon la connexion reste occupée jusqu'au nettoyage de la mémoire.
    await res.body?.cancel()
    // Un échec d'envoi doit se voir : on lève une erreur plutôt que de l'ignorer en silence.
    if (!res.ok) throw new Error(`Brevo refused the email (HTTP ${res.status})`)
  },
})

type ScalewayOptions = {
  /** La clé secrète d'une application IAM limitée à Transactional Email. */
  secretKey: string
  /** Le projet Scaleway où le domaine d'envoi a été vérifié. */
  projectId: string
  /** La région de l'API, « fr-par » pour Paris. */
  region: string
  from: { email: string; name: string }
  /** Remplaçable dans les tests, pour ne rien envoyer sur Internet. */
  fetch?: typeof fetch
}

/**
 * Pour la production : envoi par Transactional Email de Scaleway (ADR 0005). Scaleway ne sait ni
 * insérer de pixel d'ouverture ni réécrire les liens : l'e-mail part tel quel, sans traqueur.
 */
export const createScalewayMailer = ({
  secretKey,
  projectId,
  region,
  from,
  fetch: doFetch = fetch,
}: ScalewayOptions): Mailer => ({
  async send({ to, subject, text, html, headers, attachments }) {
    // L'API JSON de Scaleway ne sait pas poser de Content-ID : les vignettes passent par le SMTP.
    refuseAttachments({ attachments })
    const extra = checkedHeaders(headers)
    const res = await doFetch(
      `https://api.scaleway.com/transactional-email/v1alpha1/regions/${region}/emails`,
      {
        method: 'POST',
        headers: {
          // La clé passe dans un en-tête, jamais dans l'adresse : les adresses finissent dans les logs.
          'x-auth-token': secretKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          from,
          to: [{ email: to }],
          subject,
          text,
          html,
          // Scaleway prend les en-têtes ajoutés sous forme de liste de paires { key, value } :
          // champ additional_headers de l'API v1alpha1 (CreateEmailRequest, vérifié dans son SDK
          // officiel, scaleway-sdk-go, le 21/10/2026).
          ...(extra.length > 0 && {
            additional_headers: extra.map(([key, value]) => ({ key, value })),
          }),
        }),
        signal: AbortSignal.timeout(10_000), // on n'attend jamais plus de 10 secondes
      },
    )
    // Même règle que pour Brevo : la réponse n'est ni lue ni recopiée, et un échec se voit.
    await res.body?.cancel()
    if (!res.ok) throw new Error(`Scaleway refused the email (HTTP ${res.status})`)
  },
})

type SmtpOptions = {
  host: string
  /** 465 : TLS dès la connexion ; 587 : STARTTLS exigé. Aucun autre port : jamais sans chiffrement. */
  port: number
  /** Sur Scaleway : l'identifiant du projet. */
  user: string
  /** Sur Scaleway : la clé secrète de l'application IAM. */
  password: string
  from: { email: string; name: string }
}

/** L'adresse du destinataire doit être une seule adresse ordinaire (le contrat : `z.email()`). */
const RecipientSchema = z.email()

/**
 * Pour la production : envoi par le SMTP de Scaleway (R8), message construit par nodemailer. C'est
 * le seul transport qui joint les vignettes du récap « en ligne » : chaque image porte un `cid` et
 * le HTML l'appelle par `cid:…`, donc la messagerie ne charge rien à distance (pas de pixel).
 */
export const createSmtpMailer = ({ host, port, user, password, from }: SmtpOptions): Mailer => {
  // Défense en profondeur : `env.ts` ne laisse déjà passer que ces deux ports, mais ce transport
  // refuse lui-même d'exister sans chiffrement.
  if (port !== 465 && port !== 587) throw new Error('SMTP port must be 465 (TLS) or 587 (STARTTLS)')
  // Le transport est créé une fois : nodemailer ouvre sa connexion au premier envoi.
  // - `secure` (465) ou `requireTLS` (587) : sans l'un des deux, nodemailer enverrait
  //   l'identification en clair si le serveur n'annonçait pas STARTTLS.
  // - Le certificat du serveur reste vérifié (jamais `rejectUnauthorized: false`), et ni `logger` ni
  //   `debug` : la conversation SMTP porte l'identification et les adresses.
  // - `disableFileAccess` et `disableUrlAccess` : une pièce jointe ne va jamais lire un fichier ni
  //   une adresse ; seuls les octets que nous donnons partent.
  const transporter = nodemailer.createTransport({
    host,
    port,
    ...(port === 465 ? { secure: true } : { requireTLS: true }),
    auth: { user, pass: password },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return {
    async send({ to, subject, text, html, headers, attachments }) {
      // nodemailer lit `to` comme une liste d'adresses (virgules, noms, commentaires) : une valeur
      // piégée ajouterait des destinataires (avis GHSA-3q53-mvfw-q9v8). Une seule adresse ordinaire
      // passe, vérifiée avant toute connexion ; le message ne la recopie pas.
      if (!RecipientSchema.safeParse(to).success) throw new Error('Email recipient refused')
      const extra = checkedHeaders(headers)
      const inline = (attachments ?? []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        // Les octets seuls, jamais un chemin (`path`) ni une adresse (`href`).
        content: Buffer.from(a.content),
        cid: a.cid,
        contentDisposition: 'inline' as const,
      }))
      try {
        await transporter.sendMail({
          from: { name: from.name, address: from.email },
          to,
          subject,
          text,
          html,
          ...(extra.length > 0 && { headers: Object.fromEntries(extra) }),
          ...(inline.length > 0 && { attachments: inline }),
        })
      } catch {
        // L'erreur du serveur peut citer l'adresse ou des détails du relais, et finir dans un
        // journal : on ne la recopie pas, un échec se voit sans elle.
        throw new Error('SMTP server refused the email')
      }
    },
  }
}
