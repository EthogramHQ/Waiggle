// La page d'un membre, telle que les autres membres la voient (GET /v1/members/{id}).
// Elle ne contient que ce qui est public entre membres : jamais l'adresse e-mail, la langue ou
// les dates de connexion. z.object ne garde que les champs listés ici, et l'API passe sa réponse
// par Member.parse : un champ de plus, lu par erreur dans la base, ne pourrait pas en sortir.
import { z } from 'zod'
import { ExampleFlag } from './example'
import { FollowState } from './follows'
import { MemberGame } from './game'
import { PROJECT_LIST_MAX, ProjectSummary, PublicProjectCard } from './projects'
import { RemovedPart } from './removal'
import { Suspension } from './suspension'
import { ProjectTool } from './tools'

/**
 * L'identifiant d'un membre dans une adresse. Ceux de Better Auth sont faits de lettres, de
 * chiffres, de « _ » et de « - » : tout le reste ne peut désigner personne.
 */
export const MemberId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

export const Member = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Son pseudo, sans le « @ » : unique, contrairement au nom. */
    handle: z.string(),
    avatarUrl: z.url().nullable(), // null : pas d'avatar
    bio: z.string(),
    /** Les outils favoris du profil, chacun avec son étiquette pour mener à sa page. */
    favoriteTools: z.array(ProjectTool),
    /** Vrai si c'est la page du membre qui regarde : ses projets privés y figurent aussi. */
    isMe: z.boolean(),
    /**
     * Vrai si le visiteur a bloqué ce membre (tranche 7b) : la page n'en montre plus que l'en-tête
     * (nom, pseudo, photo), pour le débloquer ou signaler son profil. Bio vide, ni outils, ni
     * projets, ni abonnés. Un membre qui a bloqué le visiteur n'a pas de page pour lui (404).
     */
    isBlocked: z.boolean(),
    /**
     * R12 : vrai si ce membre a rendu sa page publique (« Rendre ma page publique ») : la feuille
     * de partage dit alors que tout le monde peut l'ouvrir ; faux, seulement les membres.
     */
    publicPage: z.boolean(),
    /** R12b : `true` pour un compte d'exemples (pastille et phrase « fictifs »), absent sinon. */
    example: ExampleFlag,
    /** Si le visiteur la suit, et combien de membres la suivent (jamais leurs noms). */
    ...FollowState.shape,
    /** Ses projets que le visiteur a le droit de voir, du plus récent au plus ancien. */
    projects: z.array(ProjectSummary).max(PROJECT_LIST_MAX),
    /**
     * R9 (7d) : les parties de son profil retirées par la modération (nom, pseudo, bio, outils
     * favoris, photo), sur sa propre page seulement (`isMe`) ; vide pour tout autre visiteur.
     */
    removedParts: z.array(RemovedPart),
    /**
     * R19 : son niveau, son titre, ses sceaux et son rayon (game.ts), pour tout membre connecté,
     * soi compris (le miel et les réglages sont dans « Ma récolte », jamais ici). null pour un
     * compte d'exemple (il ne joue pas) et pour un membre bloqué (la page n'en montre que l'en-tête).
     */
    game: MemberGame.nullable(),
    /**
     * Ce que seul un administrateur voit de ce membre (tranche 7c) ; null pour tout autre visiteur.
     * `canSuspend` : faux pour soi-même, pour un administrateur en fonction ou un membre déjà
     * suspendu. `decisions` : le nombre de décisions de modération qui le visent (ses contenus et
     * son compte), pour mener à son historique.
     */
    moderation: z
      .object({
        isAdmin: z.boolean(),
        suspension: Suspension.nullable(),
        decisions: z.int().nonnegative(),
        canSuspend: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .meta({ id: 'Member' })
export type Member = z.infer<typeof Member>

// --- R12 : la page publique d'un membre ---

/**
 * Ce que le membre a choisi de montrer sur sa page publique (« Mon profil public ») : la page
 * elle-même (`publicPage`, fermée par défaut : rien n'est public sans son accord), puis ce qu'un
 * visiteur y lit. Le nom et la photo y sont toujours, sans case. Les quatre cases gardent leur valeur
 * quand la page est fermée : la rouvrir retrouve les mêmes choix.
 */
export const PublicPageSettings = z
  .strictObject({
    publicPage: z.boolean(),
    /** « Ma bio » (cochée par défaut). */
    showBio: z.boolean(),
    /** « Mes outils favoris » (cochée par défaut). */
    showFavoriteTools: z.boolean(),
    /** « Mes projets publics » (cochée par défaut) : ses seuls projets `web`, jamais les autres. */
    showProjects: z.boolean(),
    /** « Mon nombre d'abonnés » (décochée par défaut) : un nombre, jamais qui. */
    showFollowerCount: z.boolean(),
  })
  .meta({ id: 'PublicPageSettings' })
export type PublicPageSettings = z.infer<typeof PublicPageSettings>

/**
 * Ce que PATCH /v1/me/public-page accepte : une ou plusieurs des cinq cases. `partial()` rend chaque
 * champ facultatif ; le `refine` refuse un corps vide, qui ne changerait rien. Un membre suspendu
 * peut seulement fermer sa page (`publicPage: false`) : tout le reste lui répond 403 `suspended`
 * (Q6), une règle de l'API, pas de la forme.
 */
export const PublicPageSettingsPatch = PublicPageSettings.partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'change at least one setting' })
  .meta({ id: 'PublicPageSettingsPatch' })
export type PublicPageSettingsPatch = z.infer<typeof PublicPageSettingsPatch>

/**
 * La réponse de GET et PATCH /v1/me/public-page : les cases, et de quoi écrire sous « Mes projets
 * publics » « 2 sur 4 : les autres restent entre membres » (`webProjectCount` sur `projectCount`,
 * ses projets non retirés, privés compris).
 */
export const MyPublicPage = z
  .strictObject({
    settings: PublicPageSettings,
    webProjectCount: z.int().nonnegative(),
    projectCount: z.int().nonnegative(),
  })
  .meta({ id: 'MyPublicPage' })
export type MyPublicPage = z.infer<typeof MyPublicPage>

/**
 * La page publique d'un membre, vue par un visiteur sans compte (GET /v1/public/members/{id}) :
 * son nom et sa photo, puis seulement ce qu'il a coché. Une case décochée donne un champ **absent**
 * (pas vide) : la réponse ne dit même pas qu'il a une bio. Jamais son pseudo (Q8), ses ruches, qui
 * il suit, ses commentaires ni ses réactions. Liste blanche (`strictObject`), comme les projets
 * publics. Une page fermée, un membre inconnu, non vérifié ou supprimé : le même 404.
 */
export const PublicMember = z
  .strictObject({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.url().nullable(),
    bio: z.string().optional(),
    /** Ses outils favoris, sans lien vers leur page (réservée aux membres). */
    favoriteTools: z.array(ProjectTool.strict()).optional(),
    /** Ses projets `web` visibles d'un visiteur, du plus récent au plus ancien. */
    projects: z.array(PublicProjectCard).max(PROJECT_LIST_MAX).optional(),
    /** Le nombre de membres qui le suivent, jamais leurs noms. */
    followerCount: z.int().nonnegative().optional(),
    /** R12b : `true` pour un compte d'exemples, absent sinon. */
    example: ExampleFlag,
  })
  .meta({ id: 'PublicMember' })
export type PublicMember = z.infer<typeof PublicMember>
