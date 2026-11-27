// Tests de l'analyseur du flux du temps réel (R21, docs/scenarios/refonte.md, « R21 — Le temps
// réel ») : le serveur écrit des messages SSE (« Server-Sent Events ») dans une réponse HTTP qui ne
// se termine pas. Chaque message est un bloc de lignes `champ: valeur` fini par une ligne vide :
//
//   event: signal
//   data: {"topic":"project:…","kind":"comments"}
//
// Le réseau livre ce texte par morceaux, coupés n'importe où : au milieu d'une ligne, entre deux
// messages, ou plusieurs messages d'un coup. L'analyseur garde ce qui n'est pas fini et ne rend que
// les messages complets. Une ligne qui commence par « : » est un commentaire (le battement `: ping`
// que le serveur envoie toutes les 20 s pour garder la connexion ouverte) : il ne donne rien.
//
// Ce que l'analyseur rend est déjà vérifié par le contrat (`LiveHello`, `LiveEvent` de
// @ruche/contracts) : un message mal formé, ou qui porterait plus qu'un sujet et une sorte, est
// ignoré sans casser la suite du flux.
//
// L'interface attendue (src/live/stream.ts) :
//   createLiveParser(): (chunk: string) => LiveMessage[]
//   LiveMessage = { type: 'hello'; connectionId } | { type: 'signal'; event: LiveEvent }
//               | { type: 'replaced' }
import { LIVE_EVENT_NAMES } from '@ruche/contracts'
import { createLiveParser, type LiveMessage } from './stream'

const connectionId = '3f2b6c1a-8d4e-4f5a-9b6c-7d8e9f0a1b2c'
const projectId = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

const hello = `event: ${LIVE_EVENT_NAMES.hello}\ndata: ${JSON.stringify({ connectionId })}\n\n`
const signal = (topic: string, kind: string) =>
  `event: ${LIVE_EVENT_NAMES.signal}\ndata: ${JSON.stringify({ topic, kind })}\n\n`
const comments = signal(`project:${projectId}`, 'comments')
/** Ce que l'analyseur rend pour `comments` : le témoin des tests qui ignorent un message. */
const commentsRead: LiveMessage[] = [
  { type: 'signal', event: { topic: `project:${projectId}`, kind: 'comments' } },
]

/** Donne tous les morceaux à un analyseur neuf, et rend tout ce qu'il a trouvé, dans l'ordre. */
const parseAll = (...chunks: string[]): LiveMessage[] => {
  const parse = createLiveParser()
  return chunks.flatMap((chunk) => parse(chunk))
}

describe('the live stream parser', () => {
  it('reads the hello message and its connection id', () => {
    expect(parseAll(hello)).toEqual([{ type: 'hello', connectionId }])
  })

  it('reads a signal as a topic and a kind, nothing more', () => {
    expect(parseAll(comments)).toEqual([
      { type: 'signal', event: { topic: `project:${projectId}`, kind: 'comments' } },
    ])
  })

  it('reads the « replaced » message that closes a sixth stream elsewhere', () => {
    expect(parseAll(`event: ${LIVE_EVENT_NAMES.replaced}\ndata: {}\n\n`)).toEqual([
      { type: 'replaced' },
    ])
  })

  it('reads several messages delivered in one chunk, in order', () => {
    expect(parseAll(hello + comments + signal('me', 'notifications'))).toEqual([
      { type: 'hello', connectionId },
      { type: 'signal', event: { topic: `project:${projectId}`, kind: 'comments' } },
      { type: 'signal', event: { topic: 'me', kind: 'notifications' } },
    ])
  })

  it('waits for the end of a message cut between two chunks, wherever the cut falls', () => {
    const text = hello + comments
    const whole = parseAll(text)
    expect(whole).toHaveLength(2)
    // Toutes les coupures possibles, même au milieu de « event », du JSON ou de la ligne vide.
    for (let at = 1; at < text.length; at++) {
      expect(parseAll(text.slice(0, at), text.slice(at))).toEqual(whole)
    }
  })

  it('gives nothing until the blank line that ends the message', () => {
    const parse = createLiveParser()
    expect(parse('event: signal\ndata: {"topic":"me","kind":"pollen"}\n')).toEqual([])
    expect(parse('\n')).toEqual([{ type: 'signal', event: { topic: 'me', kind: 'pollen' } }])
  })

  it('reads a stream delivered one character at a time', () => {
    const text = hello + comments
    expect(parseAll(...text.split(''))).toEqual([{ type: 'hello', connectionId }, ...commentsRead])
  })

  it('ignores the « : ping » heartbeat', () => {
    expect(parseAll(': ping\n\n', comments)).toEqual(commentsRead)
    expect(parseAll(`: ping\n\n${comments}: ping\n\n`)).toEqual(commentsRead)
  })

  it('accepts the line endings and spacing the SSE format allows', () => {
    // \r\n (Windows, certains relais), et « data:{…} » sans espace après les deux-points.
    const crlf = `event: signal\r\ndata: ${JSON.stringify({ topic: 'feed', kind: 'feed' })}\r\n\r\n`
    const tight = `event:signal\ndata:${JSON.stringify({ topic: 'feed', kind: 'feed' })}\n\n`
    const expected = [{ type: 'signal', event: { topic: 'feed', kind: 'feed' } }]
    expect(parseAll(crlf)).toEqual(expected)
    expect(parseAll(tight)).toEqual(expected)
  })

  it('ignores the id and retry fields the server may add', () => {
    const withId = `id: 42\nretry: 1000\n${comments}`
    expect(parseAll(withId)).toEqual(commentsRead)
  })

  it('ignores a message with an unknown name, and goes on', () => {
    expect(parseAll(`event: presence\ndata: {"who":"nora"}\n\n${comments}`)).toEqual(commentsRead)
  })

  it('ignores a message without a name (the default « message » event)', () => {
    expect(
      parseAll(`data: ${JSON.stringify({ topic: 'me', kind: 'pollen' })}\n\n`, comments),
    ).toEqual(commentsRead)
  })

  it('ignores a signal whose data is not JSON, without breaking the rest of the stream', () => {
    expect(parseAll(`event: signal\ndata: {"topic":\n\n${comments}`)).toEqual(commentsRead)
  })

  it('ignores a signal outside the contract: unknown kind, unknown topic, or any content', () => {
    const invalid = [
      signal(`project:${projectId}`, 'typing'),
      signal('everyone', 'comments'),
      signal('project:not-a-uuid', 'comments'),
      // Un signal ne porte jamais de contenu (choix 2 du plan) : un champ de plus le rend invalide.
      `event: signal\ndata: ${JSON.stringify({ topic: 'me', kind: 'notifications', text: 'Bonjour' })}\n\n`,
    ]
    expect(parseAll(...invalid, comments)).toEqual(commentsRead)
  })

  it('ignores a hello whose connection id is not a uuid', () => {
    expect(parseAll(`event: hello\ndata: {"connectionId":"abc"}\n\n`, comments)).toEqual(
      commentsRead,
    )
  })
})
