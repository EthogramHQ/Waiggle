// Le jeton des liens de désinscription (tranche 6c). Il dit « le membre X peut couper telle sorte
// d'e-mail », sans connexion, et rien d'autre : il ne donne accès à aucune donnée et ne rallume
// jamais rien. Forme fixe : `v1.<id du membre en base64url>.<sorte>.<signature>`.
//
// La signature est une empreinte HMAC-SHA256 : un calcul qui mêle le texte signé et une clé
// secrète. Sans la clé, impossible de fabriquer l'empreinte d'un autre texte (un autre membre, une
// autre sorte). Le jeton n'expire pas : un lien de désinscription doit marcher dans un vieil e-mail.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { UnsubscribeKind, UnsubscribeToken } from '@ruche/contracts'

/**
 * La clé des signatures, dérivée de BETTER_AUTH_SECRET (un HMAC du secret sur une étiquette fixe),
 * jamais le secret lui-même : si un jour cette clé fuitait (dans un outil, un log), le secret des
 * sessions resterait inconnu. L'étiquette « v1 » permettrait d'en changer sans toucher au secret.
 */
const keyFrom = (secret: string) =>
  createHmac('sha256', secret).update('waiggle:unsubscribe:v1').digest()

/** La signature (43 caractères base64url : 32 octets) du texte signé « v1.<id>.<sorte> ». */
const sign = (secret: string, signed: string) =>
  createHmac('sha256', keyFrom(secret)).update(signed).digest('base64url')

/** Fabrique le jeton d'un lien de désinscription, pour le membre `userId` et la sorte `kind`. */
export const createUnsubscribeToken = (secret: string, userId: string, kind: UnsubscribeKind) => {
  const signed = `v1.${Buffer.from(userId, 'utf8').toString('base64url')}.${kind}`
  return `${signed}.${sign(secret, signed)}`
}

/**
 * Lit un jeton : le membre et la sorte s'il est intact et signé par nous, null sinon. Jamais
 * d'exception, quoi qu'on lui donne : la route répond alors le même 400 que pour un faux lien.
 *
 * Dans l'ordre :
 * 1. la forme exacte (l'expression régulière du contrat : longueurs bornées, alphabet base64url
 *    sans « = », une sorte connue) ;
 * 2. l'identifiant se décode, et se ré-encode à l'identique (sinon deux écritures du même
 *    identifiant passeraient pour le même texte signé) ;
 * 3. la signature, comparée à temps constant (timingSafeEqual) : une comparaison ordinaire
 *    s'arrête au premier caractère différent, et en chronométrant les réponses on devinerait la
 *    signature caractère par caractère. timingSafeEqual lève une erreur si les longueurs diffèrent :
 *    elles sont vérifiées juste avant.
 */
export const readUnsubscribeToken = (
  secret: string,
  token: string,
): { userId: string; kind: UnsubscribeKind } | null => {
  if (!UnsubscribeToken.safeParse(token).success) return null
  const [version, encodedId, kindText, signature] = token.split('.')
  if (version !== 'v1' || !encodedId || !kindText || !signature) return null
  const kind = UnsubscribeKind.safeParse(kindText)
  if (!kind.success) return null
  const userId = Buffer.from(encodedId, 'base64url').toString('utf8')
  if (userId === '' || Buffer.from(userId, 'utf8').toString('base64url') !== encodedId) return null

  const expected = Buffer.from(sign(secret, `v1.${encodedId}.${kind.data}`), 'utf8')
  const given = Buffer.from(signature, 'utf8')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return { userId, kind: kind.data }
}
