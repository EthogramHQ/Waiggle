// Les comptes d'exemples (tranche R12b, « Les exemples ») : la seule brique qui dit si un compte est
// d'exemples. Toute lecture qui construit un auteur ou un membre (projets, Fil, Explorer, page d'un
// membre, vitrine, pages publiques) en tire la pastille « Exemple » ; la tête des pages, le plan du
// site, les suggestions et le récap s'en servent pour écarter ces comptes. Le marquage lui-même vit
// dans la table `example_account`, posé par infra/mark-example.sh.
import { schema } from '@ruche/db'
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'

/**
 * L'expression SQL « ce compte est-il d'exemples ? », pour la colonne d'identifiant de membre
 * donnée (`schema.project.authorId`, `schema.user.id`…) : vraie s'il a une ligne dans
 * `example_account`. Elle se met dans le `select` de la requête qui lit déjà l'auteur, si bien que
 * le drapeau ne coûte aucune requête de plus ; ou dans un `where` (`not (…)`) pour écarter ces
 * comptes.
 *
 * `exists (select 1 … where user_id = …)` : PostgreSQL s'arrête à la première ligne trouvée, par la
 * clé primaire de `example_account`. La table n'a que quelques lignes : même si le planificateur
 * préfère la lire en entier une fois pour la ranger en mémoire (un « hashed SubPlan »), c'est
 * négligeable.
 *
 * La sous-requête est un `sql` à part, imbriqué : Drizzle écrit alors chaque colonne avec le nom de
 * sa table (`"project"."author_id"`). Sans cela, dans un `select` sur une seule table, il écrirait
 * la colonne seule (`"user_id"`), que PostgreSQL lirait comme celle d'`example_account` : la
 * condition deviendrait toujours vraie.
 */
export const isExampleAccountSql = (memberId: SQLWrapper): SQL<boolean> => {
  const marked = sql`select 1 from ${schema.exampleAccount}
    where ${schema.exampleAccount.userId} = ${memberId}`
  return sql<boolean>`exists (${marked})`
}

/**
 * Ajoute `example: true` à un auteur ou à un membre seulement si le drapeau lu est vrai ; sinon,
 * l'objet reste tel quel, sans le champ (contrat `ExampleFlag` : absent, jamais `false`). Un drapeau
 * nul ou absent (une jointure externe sans ligne) compte comme faux.
 */
export const withExampleFlag = <T extends object>(
  target: T,
  isExample: boolean | null | undefined,
): T & { example?: true } => (isExample === true ? { ...target, example: true } : target)
