// La clôture des signalements d'un visiteur sans compte (R12, plan, décisions 12 et 17) : quand un
// signalement qui porte l'adresse e-mail d'un visiteur est clos, quelle qu'en soit la raison
// (retrait, classement, cible disparue « sans objet »), l'adresse est lue, **effacée**, puis la
// décision lui est envoyée. L'effacement vient avant l'envoi et ne dépend pas de lui : un e-mail
// qui échoue ne garde pas l'adresse. Avec `routes/public-reports.ts`, ce fichier est le seul de
// l'API à lire cette colonne (`reporter-email.static.test.ts`) ; la modération, la file et l'export
// ne la voient jamais.
import { type Database, schema } from '@ruche/db'
import type { Language } from '@ruche/i18n'
import { and, inArray, isNotNull, ne } from 'drizzle-orm'
import { isLanguage } from '../email/language'
import type { Mailer } from '../email/mailer'
import { type VisitorReportKind, visitorReportDecisionEmail } from '../email/templates'

const r = schema.contentReport

/** Ce qu'il faut pour écrire la décision à un visiteur : jamais un texte du contenu signalé. */
export type ClosedVisitorReport = {
  address: string
  language: Language
  kind: VisitorReportKind
  part: boolean
  outcome: 'removed' | 'dismissed'
}

const isVisitorKind = (kind: string): kind is VisitorReportKind =>
  kind === 'project' || kind === 'update' || kind === 'member'

/**
 * Prend, dans une transaction, les signalements clos qui ont encore une adresse de visiteur, les en
 * débarrasse (adresse et langue remises à null) et rend de quoi écrire chaque décision.
 *
 * - `for update` verrouille les lignes lues : deux appels en même temps (une décision et la lecture
 *   de la file) ne prennent pas la même ligne deux fois ; le second relit sous le verrou, voit
 *   l'adresse déjà effacée, et n'envoie rien. Au plus un e-mail de décision par signalement.
 * - La condition reprend celle de l'index partiel `content_report_visitor_closed_idx` (adresse non
 *   nulle et statut autre qu'« open ») : PostgreSQL le lit, presque vide, plutôt que la table.
 * - « Sans objet » (`void`, la cible a disparu) dit « retiré » : le contenu n'est plus là, ce que
 *   le visiteur voulait ; le choix est celui de la décision 3 du plan.
 */
export const takeClosedVisitorReports = async (db: Database): Promise<ClosedVisitorReport[]> =>
  db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: r.id,
        address: r.reporterEmail,
        language: r.reporterLanguage,
        kind: r.targetKind,
        partField: r.partField,
        status: r.status,
      })
      .from(r)
      .where(and(isNotNull(r.reporterEmail), ne(r.status, 'open')))
      .for('update')
    if (rows.length === 0) return []
    await tx
      .update(r)
      .set({ reporterEmail: null, reporterLanguage: null })
      .where(
        inArray(
          r.id,
          rows.map((row) => row.id),
        ),
      )
    return rows.flatMap((row): ClosedVisitorReport[] =>
      row.address === null || !isVisitorKind(row.kind)
        ? []
        : [
            {
              address: row.address,
              language: isLanguage(row.language) ? row.language : 'fr',
              kind: row.kind,
              part: row.partField !== null,
              outcome: row.status === 'dismissed' ? 'dismissed' : 'removed',
            },
          ],
    )
  })

/** De quoi envoyer la décision : la messagerie et l'adresse de l'appli (le pied de l'e-mail). */
export type VisitorMail = { mailer: Mailer; appUrl: string }

/**
 * La clôture, en un appel : efface les adresses des signalements clos, puis envoie à chacun sa
 * décision. La modération (routes/moderation.ts) et la purge de nuit (reports/retention.ts) passent
 * toutes deux par ici : l'accusé a promis la décision, quel que soit le chemin qui clôt (relecture
 * juridique R12, point 2). Sans messagerie (`null` : la purge quand EMAIL_JOBS=off coupe les
 * e-mails automatiques), l'adresse est effacée quand même, sans e-mail : elle ne survit à aucune
 * clôture. L'envoi vient après la transaction de `takeClosedVisitorReports`, jamais pendant (on
 * ne tient pas de verrou le temps d'un appel à la messagerie).
 */
export const closeVisitorReports = async (db: Database, mail: VisitorMail | null) => {
  const closed = await takeClosedVisitorReports(db)
  if (mail) await sendVisitorDecisions(mail.mailer, mail.appUrl, closed)
}

/**
 * Envoie la décision à chaque visiteur, une par une. Un échec (la messagerie est en panne) est noté
 * sans l'adresse ni le détail de l'erreur (elle pourrait la recopier) et n'arrête ni les autres
 * envois ni la décision : l'adresse est déjà effacée (`takeClosedVisitorReports`).
 */
export const sendVisitorDecisions = async (
  mailer: Mailer,
  appUrl: string,
  closed: ClosedVisitorReport[],
) => {
  for (const { address, language, kind, part, outcome } of closed) {
    try {
      await mailer.send({
        to: address,
        ...visitorReportDecisionEmail(language, { kind, part, outcome }, appUrl),
      })
    } catch (error) {
      console.error('Visitor report decision e-mail failed', {
        error: error instanceof Error ? error.name : 'unknown',
      })
    }
  }
}
