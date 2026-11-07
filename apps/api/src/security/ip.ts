// La clé de quota tirée de l'adresse IP d'un visiteur (audit de sécurité du 7/11/2026, N3).
//
// Une adresse IPv4 désigne une connexion : une box, un téléphone. En IPv6, un fournisseur donne à
// chaque box, et un hébergeur à chaque serveur, tout un réseau « /64 » : les 64 premiers bits sont
// fixes, les 64 derniers au choix, soit des milliards d'adresses. Compter adresse par adresse, ce
// serait laisser chacun changer d'adresse à chaque demande et ne jamais rencontrer le quota. On
// compte donc tout le /64 ensemble, comme Better Auth le fait pour ses propres routes.
import { isIP } from 'node:net'

/** Une demande arrivée sans adresse (hors de Caddy, en essai) : un seul compteur pour toutes. */
const UNKNOWN = 'unknown'

// Les huit groupes de 16 bits d'une adresse IPv6, en nombres : « 2001:db8::1 » → [0x2001, 0xdb8,
// 0, 0, 0, 0, 0, 1]. Une adresse peut finir par une IPv4 écrite à l'ancienne (« ::ffff:1.2.3.4 »),
// qui compte pour deux groupes.
const groupsOf = (ip: string): number[] => {
  const dotted = ip.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  const text = dotted
    ? `${dotted[1]}${((Number(dotted[2]) << 8) | Number(dotted[3])).toString(16)}:${(
        (Number(dotted[4]) << 8) | Number(dotted[5])
      ).toString(16)}`
    : ip
  // « :: » remplace une suite de groupes nuls : on la rallonge jusqu'à huit groupes.
  const [head = '', tail] = text.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0')
  return [...left, ...zeros, ...right].map((group) => Number.parseInt(group, 16))
}

/**
 * La part d'une adresse IP qui sert de clé aux quotas : l'adresse IPv4 telle quelle, ou le réseau
 * /64 d'une adresse IPv6 (« 2001:db8:1:2::/64 »). Une IPv4 écrite en IPv6 redevient l'IPv4.
 */
export const ipCounterId = (raw: string | undefined): string => {
  // Une adresse de lien local peut porter le nom de sa carte réseau (« fe80::1%eth0 »).
  const ip = (raw ?? '').trim().toLowerCase().split('%')[0] ?? ''
  if (ip === '') return UNKNOWN
  const version = isIP(ip)
  if (version === 4) return ip
  // Autre chose qu'une adresse : Caddy en pose toujours une, on garde le texte, borné.
  if (version !== 6) return ip.slice(0, 64)
  const groups = groupsOf(ip)
  // ::ffff:a.b.c.d, une adresse IPv4 vue par un serveur qui parle IPv6.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const [high = 0, low = 0] = groups.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`
}
