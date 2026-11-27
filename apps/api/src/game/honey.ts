// Le miel qu'on dépense (R19, plan, choix 13) : offrir du miel au projet d'un autre membre, et
// décorer son rayon. Le miel se gagne ailleurs (semaines butinées : weeks.ts ; défis :
// challenges.ts) ; ici, seulement le solde, ce qui est déjà acheté, et les deux débits.
//
// Le solde est la somme des lignes de `honey_entry` du membre (crédits positifs, débits négatifs).
// Un débit se décide sous le verrou de jeu du membre (`lockMembers`, award.ts) : deux offres lancées
// en même temps lisent le solde l'une après l'autre, et 5 miel ne paient qu'une fois.
import { randomUUID } from 'node:crypto'
import {
  DECORATIONS,
  type Decoration,
  DecorationPattern,
  DecorationTint,
  decorationPrice,
  HONEY,
  type OwnedDecorations,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { visibleTo } from '../projects/load'
import { lockMembers, type Tx } from './award'
// La clé d'une offre (`gift:<projet>`, une seule par membre et par projet) : celle que relit
// « Miel offert » sur la page du projet (`honeyGiven`).
import { giftKey } from './gifts'
import { writeNotice } from './notices'

const h = schema.honeyEntry

/** Le début des clés d'un achat de décoration : `decoration:tint:amber`, `decoration:pattern:waffle`. */
const DECORATION_KEY = 'decoration:'
const tintKey = (tint: string) => `${DECORATION_KEY}tint:${tint}`
const patternKey = (pattern: string) => `${DECORATION_KEY}pattern:${pattern}`

/** Le solde de miel d'un membre et les décorations qu'il possède (les offertes y sont toujours). */
export type HoneyState = { balance: number; owned: OwnedDecorations }

/**
 * Lit le solde et les achats d'un membre en une requête. `sum(amount)` additionne crédits et débits ;
 * `array_agg(source_key) filter (where reason = 'decoration')` ne garde que les clés des achats.
 * Index : `honey_entry_once_idx` (member_id, source_key), lu par son début (member_id) : seules les
 * lignes de ce membre. `db` peut être une transaction (le débit relit ainsi sous verrou).
 */
export const honeyStateOf = async (
  db: Pick<Database, 'select'>,
  memberId: string,
): Promise<HoneyState> => {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${h.amount}), 0)`.mapWith(Number),
      bought: sql<
        string[] | null
      >`array_agg(${h.sourceKey}) filter (where ${h.reason} = 'decoration')`,
    })
    .from(h)
    .where(eq(h.memberId, memberId))
  const bought = new Set(row?.bought ?? [])
  // Les offerts (prix 0) n'ont jamais de ligne : ils sont toujours à soi. L'ordre suit le contrat.
  const tints = DecorationTint.options.filter(
    (tint) => DECORATIONS.tint[tint] === 0 || bought.has(tintKey(tint)),
  )
  const patterns = DecorationPattern.options.filter(
    (pattern) => DECORATIONS.pattern[pattern] === 0 || bought.has(patternKey(pattern)),
  )
  return { balance: row?.balance ?? 0, owned: { tints, patterns } }
}

/** Le refus d'un débit faute de miel : le prix et le solde, pour le corps du 409 `honey_short`. */
export type HoneyShort = { kind: 'honey_short'; needed: number; balance: number }

/**
 * Choisit la décoration du rayon (PUT /v1/me/game/decoration) : débite ce qui n'est pas encore
 * acheté (`decorationPrice` du contrat, le calcul du bouton de l'appli), puis la retient. Rend null
 * si c'est fait, ou le refus `honey_short` (rien n'est débité ni changé).
 *
 * Une transaction : le verrou de jeu du membre, le solde relu dessous, les achats et le choix
 * écrits ensemble (tout ou rien). Un achat est une ligne de `honey_entry` par teinte ou motif
 * payant (`decoration:tint:amber`, montant négatif) : acheté une fois, il se choisit ensuite
 * librement, sans miel.
 */
export const decorate = (
  db: Database,
  memberId: string,
  choice: Decoration,
  now: Date,
): Promise<HoneyShort | null> =>
  db.transaction(async (tx) => {
    await lockMembers(tx, [memberId])
    const { balance, owned } = await honeyStateOf(tx, memberId)
    const needed = decorationPrice(choice, owned)
    if (needed > balance) return { kind: 'honey_short', needed, balance }
    const purchases = [
      {
        key: tintKey(choice.tint),
        price: DECORATIONS.tint[choice.tint],
        owned: owned.tints.includes(choice.tint),
      },
      {
        key: patternKey(choice.pattern),
        price: DECORATIONS.pattern[choice.pattern],
        owned: owned.patterns.includes(choice.pattern),
      },
    ].filter((item) => !item.owned && item.price > 0)
    if (purchases.length > 0) {
      // « on conflict do nothing » : un achat déjà écrit ne se paie pas deux fois (sous le verrou,
      // ce cas n'arrive pas ; la clé unique le garantit quand même).
      await tx
        .insert(h)
        .values(
          purchases.map((item) => ({
            id: randomUUID(),
            memberId,
            amount: -item.price,
            reason: 'decoration',
            sourceKey: item.key,
            createdAt: now,
          })),
        )
        .onConflictDoNothing()
    }
    // « Upsert » : la ligne des réglages naît au premier choix (insert), ou change (on conflict
    // do update), par la clé primaire member_id.
    await tx
      .insert(schema.memberGame)
      .values({ memberId, decorationTint: choice.tint, decorationPattern: choice.pattern })
      .onConflictDoUpdate({
        target: schema.memberGame.memberId,
        set: { decorationTint: choice.tint, decorationPattern: choice.pattern },
      })
    return null
  })

/** Ce que rend une offre de miel : faite, introuvable (404), déjà faite (409), miel qui manque. */
export type GiftOutcome =
  // R21 : `authorId`, l'auteur du projet, à qui la route signale l'avis « … t'a offert du miel ».
  | { kind: 'done'; authorId: string }
  | { kind: 'not_found' }
  | { kind: 'honey_already' }
  | HoneyShort

/**
 * Offre 5 miel au projet d'un autre membre (POST /v1/projects/{id}/honey), une seule fois par
 * projet ; l'auteur reçoit l'avis « Léa t'a offert du miel », sans miel en retour (pas de
 * circulation). `projectId` est un uuid déjà vérifié par la route.
 *
 * Le même « introuvable » pour un projet inconnu, privé, retiré, séparé par un blocage dans un sens
 * ou dans l'autre (`visibleTo`, la règle de visibilité de tous les gestes), le sien, ou celui d'un
 * compte d'exemple (relecture de sécurité du plan, B2) : la réponse ne dit jamais lequel.
 *
 * Une transaction : le projet (clé primaire de project, plus les sous-requêtes de visibleTo, et la
 * clé primaire de example_account par la jointure), le verrou de jeu du donneur, l'offre déjà faite
 * et le solde relus dessous, le débit et l'avis écrits ensemble.
 */
export const offerHoney = (
  db: Database,
  giverId: string,
  projectId: string,
  now: Date,
): Promise<GiftOutcome> =>
  db.transaction(async (tx: Tx) => {
    // `left join` vers example_account : une ligne trouvée dit que l'auteur est un compte
    // d'exemples. On lit seulement l'auteur et l'identifiant rangé (en minuscules).
    const [project] = await tx
      .select({ id: schema.project.id, authorId: schema.project.authorId })
      .from(schema.project)
      .leftJoin(schema.exampleAccount, eq(schema.exampleAccount.userId, schema.project.authorId))
      .where(
        and(
          eq(schema.project.id, projectId),
          visibleTo(giverId),
          isNull(schema.exampleAccount.userId),
        ),
      )
    if (!project || project.authorId === giverId) return { kind: 'not_found' }

    await lockMembers(tx, [giverId])
    const key = giftKey(project.id)
    // L'offre déjà faite : une lecture de `honey_entry_once_idx` (member_id, source_key), exacte.
    const [already] = await tx
      .select({ id: h.id })
      .from(h)
      .where(and(eq(h.memberId, giverId), eq(h.sourceKey, key)))
    if (already) return { kind: 'honey_already' }
    const { balance } = await honeyStateOf(tx, giverId)
    if (balance < HONEY.gift) return { kind: 'honey_short', needed: HONEY.gift, balance }

    await tx.insert(h).values({
      id: randomUUID(),
      memberId: giverId,
      amount: -HONEY.gift,
      reason: 'gift',
      sourceKey: key,
      createdAt: now,
    })
    // L'avis n'est pas écrit si l'auteur a coupé « Ma récolte » (notices.ts) ; le miel part quand même.
    await writeNotice(
      tx,
      project.authorId,
      { kind: 'honey_gift', actorId: giverId, projectId: project.id },
      now,
    )
    return { kind: 'done', authorId: project.authorId }
  })
