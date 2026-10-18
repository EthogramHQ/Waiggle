// L'envoi des e-mails. Le reste du code ne parle qu'à l'interface `Mailer` (« envoie cet e-mail »),
// sans savoir qui l'envoie vraiment. On peut ainsi brancher :
// - Scaleway en production (ADR 0005 ; Brevo reste disponible, réservé au futur marketing),
// - la console en développement (le lien s'affiche dans le terminal),
// - une boîte en mémoire dans les tests (on peut relire ce qui aurait été envoyé).
import type { Email } from './templates'

export type { Email }

export interface Mailer {
  send(email: Email): Promise<void>
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
  async send({ to, subject, text }) {
    console.log(`\n--- E-mail pour ${to} ---\n${subject}\n\n${text}\n--- fin ---\n`)
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
  async send({ to, subject, text, html }) {
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
  async send({ to, subject, text, html }) {
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
        }),
        signal: AbortSignal.timeout(10_000), // on n'attend jamais plus de 10 secondes
      },
    )
    // Même règle que pour Brevo : la réponse n'est ni lue ni recopiée, et un échec se voit.
    await res.body?.cancel()
    if (!res.ok) throw new Error(`Scaleway refused the email (HTTP ${res.status})`)
  },
})
