// Reconnaître un lien https vers un site public (sorti de projects.ts en R6b, pour que tools.ts
// s'en serve sans import circulaire ; projects.ts le réexporte).
import { isCleanText } from './text'

// Suffixes de noms qui ne désignent pas un site public : réseaux locaux (box, imprimante, NAS…),
// noms réservés aux tests ou aux documentations, réseau Tor. Un lien vers eux ne marcherait que
// chez l'auteur, ou pourrait viser la machine de celui qui clique.
const RESERVED_SUFFIXES = [
  'localhost',
  'localdomain',
  'local',
  'lan',
  'home',
  'internal',
  'intranet',
  'corp',
  'private',
  'arpa',
  'test',
  'invalid',
  'example',
  'onion',
]

/**
 * L'adresse découpée si c'est un lien https vers un site public, désigné par son nom ; sinon null.
 * On laisse la classe URL découper l'adresse : elle connaît toutes les façons tordues d'écrire une
 * adresse IP (« 0x7f.1 », « 2130706433 »…) et les ramène à la forme habituelle.
 * Sert à l'API (lien de démo), à l'appli (liens Markdown) et à la page d'avertissement.
 */
export const publicHttpsUrl = (value: string): URL | null => {
  // Aucun caractère invisible ou de contrôle, nulle part dans l'adresse.
  if (!isCleanText(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null // ce n'est pas une adresse
  }
  if (url.protocol !== 'https:') return null
  // « https://waiggle.com@pirate.example.com » mène à pirate.example.com : ce qui précède @ est un identifiant.
  if (url.username || url.password) return null

  // Un seul point final est permis (« example.com. » est une écriture valide) ; plusieurs, non.
  if (/\.\.$/.test(url.hostname)) return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  // Une adresse IPv4 (4 nombres) plutôt qu'un nom.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  // Un nom ordinaire : des lettres latines, des chiffres et des tirets, en au moins deux parties
  // non vides séparées par des points. Cela écarte les adresses IPv6 ([::1]), les noms sans point
  // (« intranet ») et les noms dans un autre alphabet que le téléphone n'a pas convertis en
  // « xn--… » (impossible de vérifier qu'ils n'imitent pas un nom connu).
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null
  if (RESERVED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))
    return null
  return url
}
