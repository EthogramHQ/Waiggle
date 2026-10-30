// « Ouvrir ma messagerie » (tranche R2) : à partir de l'adresse d'un membre, retrouve le webmail de
// son service (Gmail, Outlook…) pour lui ouvrir sa boîte en un geste, sur ordinateur.
//
// Deux règles des relectures :
// - sécurité (sec-S15) : une table fixe, et le domaine comparé en entier. Un « finit par »
//   (`endsWith('gmail.com')`) accepterait « evil-gmail.com », et une adresse choisie par un tiers
//   ouvrirait alors un site qui se fait passer pour Gmail ;
// - juridique (jur-10) : l'adresse du webmail ne porte rien du membre (ni son adresse, ni son nom).
//   On ouvre la boîte de réception, jamais un message pré-rempli.
import { Linking, Platform } from 'react-native'

export type Mailbox = {
  /** Le nom du service, tel qu'on l'écrit (« Gmail », « La Poste »). */
  name: string
  /** La boîte de réception du webmail, la même pour tous les membres du service. */
  url: string
}

const GMAIL: Mailbox = { name: 'Gmail', url: 'https://mail.google.com/mail/' }
const OUTLOOK: Mailbox = { name: 'Outlook', url: 'https://outlook.live.com/mail/' }
const YAHOO: Mailbox = { name: 'Yahoo', url: 'https://mail.yahoo.com/' }
const PROTON: Mailbox = { name: 'Proton', url: 'https://mail.proton.me/' }
const ICLOUD: Mailbox = { name: 'iCloud', url: 'https://www.icloud.com/mail/' }
const ORANGE: Mailbox = { name: 'Orange', url: 'https://messagerie.orange.fr/' }
const FREE: Mailbox = { name: 'Free', url: 'https://webmail.free.fr/' }
const SFR: Mailbox = { name: 'SFR', url: 'https://webmail.sfr.fr/' }
const LA_POSTE: Mailbox = { name: 'La Poste', url: 'https://www.laposte.net/accueil' }

// Une `Map` plutôt qu'un objet : `mailboxes['constructor']` d'un objet littéral répondrait quelque
// chose (son prototype) ; une `Map` ne connaît que ce qu'on y a mis.
const mailboxes = new Map<string, Mailbox>([
  ['gmail.com', GMAIL],
  ['googlemail.com', GMAIL],
  ['outlook.com', OUTLOOK],
  ['outlook.fr', OUTLOOK],
  ['hotmail.com', OUTLOOK],
  ['hotmail.fr', OUTLOOK],
  ['live.com', OUTLOOK],
  ['live.fr', OUTLOOK],
  ['msn.com', OUTLOOK],
  ['yahoo.com', YAHOO],
  ['yahoo.fr', YAHOO],
  ['proton.me', PROTON],
  ['protonmail.com', PROTON],
  ['pm.me', PROTON],
  ['icloud.com', ICLOUD],
  ['me.com', ICLOUD],
  ['mac.com', ICLOUD],
  ['orange.fr', ORANGE],
  ['wanadoo.fr', ORANGE],
  ['free.fr', FREE],
  ['sfr.fr', SFR],
  ['neuf.fr', SFR],
  ['laposte.net', LA_POSTE],
])

/** Le webmail de cette adresse, ou `null` si le service n'est pas connu (ou l'adresse mal formée). */
export function mailboxFor(email: string): Mailbox | null {
  const at = email.lastIndexOf('@')
  // Il faut une partie avant le « @ » et un domaine après ; avec deux « @ », le domaine est ce qui
  // suit le dernier (« lea@gmail.com@evil.fr » est chez evil.fr).
  if (at <= 0 || at === email.length - 1) return null
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
  return mailboxes.get(domain) ?? null
}

/**
 * Peut-on proposer « Ouvrir ma messagerie » ? Sur téléphone, toujours : on ouvre l'appli de
 * messagerie de l'appareil, quelle que soit l'adresse. Sur ordinateur, seulement pour un service
 * connu : sinon, on ne sait pas où est la boîte, et un bouton qui ne mène nulle part mentirait.
 */
export const canOpenMailbox = (email: string | null): boolean =>
  Platform.OS !== 'web' || (email !== null && mailboxFor(email) !== null)

// Sur iOS, « message: » ouvre l'appli Mail sur la boîte de réception. Android n'a pas d'adresse
// équivalente : « mailto: » ouvre l'appli de messagerie choisie par le membre (sur un brouillon
// vide, qu'il referme pour trouver sa boîte).
const PHONE_MAILBOX = Platform.OS === 'ios' ? 'message:' : 'mailto:'

/**
 * Ouvre la messagerie. Sur le web, dans un nouvel onglet, sans référent (jur-10) : `noopener`
 * empêche le webmail d'agir sur notre onglet, `noreferrer` ne lui dit pas d'où l'on vient.
 */
export const openMailbox = (email: string | null) => {
  if (Platform.OS !== 'web') {
    // L'appareil n'a peut-être aucune appli de messagerie : rien ne s'ouvre, sans planter.
    Linking.openURL(PHONE_MAILBOX).catch(() => {})
    return
  }
  const mailbox = email ? mailboxFor(email) : null
  if (!mailbox) return
  // window n'existe que dans le navigateur ; les types de React Native ne le décrivent pas.
  const browser = globalThis as { open?: (url: string, target: string, features: string) => void }
  browser.open?.(mailbox.url, '_blank', 'noopener,noreferrer')
}
