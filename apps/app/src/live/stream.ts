// L'analyseur du flux du temps réel (R21, docs/scenarios/refonte.md, « R21 — Le temps réel ») : il
// transforme le texte que le serveur écrit dans `GET /v1/live` en messages que l'appli comprend.
//
// Le flux est du SSE (« Server-Sent Events ») : une réponse HTTP qui ne se termine pas, où le
// serveur écrit un message chaque fois qu'il a quelque chose à dire. Un message est un bloc de
// lignes `champ: valeur`, fini par une ligne vide :
//
//   event: signal
//   data: {"topic":"project:…","kind":"comments"}
//
// Le réseau livre ce texte par morceaux coupés n'importe où (au milieu d'une ligne, entre deux
// messages, ou plusieurs messages d'un coup) : l'analyseur garde ce qui n'est pas fini et ne rend
// que les messages complets. Une ligne qui commence par « : » est un commentaire : le battement
// `: ping` que le serveur envoie toutes les 20 s pour que les intermédiaires ne coupent pas la
// connexion. Il ne donne rien.
//
// Chaque message passe par le contrat (`LiveHello`, `LiveEvent`) : un message mal formé, d'un nom
// inconnu, ou qui porterait plus qu'un sujet et une sorte (un signal n'a jamais de contenu) est
// ignoré sans casser la suite du flux. Le décodage des octets en texte (UTF-8) se fait dans la
// connexion, avant l'analyseur.
import { LIVE_EVENT_NAMES, LiveEvent, LiveHello } from '@ruche/contracts'

/** Ce que le flux peut dire à l'appli. */
export type LiveMessage =
  /** Le premier message : l'identifiant de la connexion, pour déclarer les sujets des écrans. */
  | { type: 'hello'; connectionId: string }
  /** « Ceci a changé » : un sujet et une sorte, sans contenu ; l'appli relit avec ses droits. */
  | { type: 'signal'; event: LiveEvent }
  /** Le membre a ouvert un sixième flux ailleurs : celui-ci est fermé par le serveur. */
  | { type: 'replaced' }

/** Lit le JSON d'un message ; `undefined` s'il n'en est pas (le message sera ignoré). */
const parseJson = (data: string): unknown => {
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}

/** Le message d'un bloc complet, d'après son nom (`event:`) et ses données (`data:`) ; ou rien. */
const toMessage = (name: string, data: string): LiveMessage | null => {
  if (name === LIVE_EVENT_NAMES.replaced) return { type: 'replaced' }
  if (name === LIVE_EVENT_NAMES.hello) {
    const hello = LiveHello.safeParse(parseJson(data))
    return hello.success ? { type: 'hello', connectionId: hello.data.connectionId } : null
  }
  if (name === LIVE_EVENT_NAMES.signal) {
    const event = LiveEvent.safeParse(parseJson(data))
    return event.success ? { type: 'signal', event: event.data } : null
  }
  // Un nom inconnu, ou pas de nom du tout (l'événement « message » par défaut du SSE) : rien.
  return null
}

/**
 * Un analyseur neuf, pour un flux : on lui donne chaque morceau de texte reçu, il rend les
 * messages que ce morceau a terminés, dans l'ordre. Il garde entre deux appels la ligne en cours et
 * le bloc en cours ; une nouvelle connexion prend un analyseur neuf, pour ne rien mêler.
 */
export const createLiveParser = (): ((chunk: string) => LiveMessage[]) => {
  // Le texte reçu dont la ligne n'est pas encore finie.
  let pending = ''
  // Le bloc en cours : son nom et ses lignes `data:` (le SSE les joint par des retours à la ligne).
  let name = ''
  let data: string[] = []

  /** Une ligne complète : un champ du bloc, un commentaire, ou la ligne vide qui finit le bloc. */
  const readLine = (line: string, messages: LiveMessage[]) => {
    if (line === '') {
      const message = toMessage(name, data.join('\n'))
      if (message) messages.push(message)
      name = ''
      data = []
      return
    }
    // « : ping » et tout autre commentaire.
    if (line.startsWith(':')) return
    // `champ: valeur` ; l'espace après les deux-points est facultatif (« data:{…} » est permis).
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') name = value
    else if (field === 'data') data.push(value)
    // `id:` et `retry:` (la reprise et le délai que le format permet) : l'appli a les siens.
  }

  return (chunk) => {
    pending += chunk
    const messages: LiveMessage[] = []
    // Une ligne finit par « \n », « \r\n » ou « \r » seul (les trois que le format permet).
    let start = 0
    for (let at = 0; at < pending.length; at++) {
      const char = pending[at]
      if (char !== '\n' && char !== '\r') continue
      if (char === '\r') {
        // Un « \r » en fin de morceau : son « \n » est peut-être dans le suivant ; on attend.
        if (at === pending.length - 1) break
        readLine(pending.slice(start, at), messages)
        if (pending[at + 1] === '\n') at++
      } else {
        readLine(pending.slice(start, at), messages)
      }
      start = at + 1
    }
    pending = pending.slice(start)
    return messages
  }
}
