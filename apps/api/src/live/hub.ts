// Le bus du temps réel (R21, ADR 0008) : il garde en mémoire les flux ouverts (une connexion SSE par
// appareil, routes/live.ts) et fait passer chaque signal aux connexions qui écoutent son sujet.
//
// Un « bus » est un aiguillage : une route qui vient d'écrire (un commentaire, une réaction) lui
// remet un signal, et le bus le recopie dans chaque flux concerné, sans que la route sache qui est
// connecté. Il vit dans la mémoire du processus de l'API : la production n'en a qu'un (ADR 0003).
// Une seconde instance demandera un bus partagé (`LISTEN/NOTIFY` de PostgreSQL), avec la même
// interface (ADR 0008, « Conséquences »).
//
// Le bus ne lit jamais la base pour décider qui reçoit quoi : c'est le travail des aides de
// live/emit.ts (le filtre des destinataires, relecture de sécurité B1), qui lui passent une fonction
// `allow`. La seule lecture qu'il déclenche est la revérification des sessions (B2), toutes les
// `LIVE_RECHECK_MS`, par la fonction `recheck` qu'on lui donne à sa création (live/access.ts).
//
// L'interface, pour les routes et les aides :
// - `open(...)` : une connexion neuve (son `hello` part le premier) ; au-delà de
//   `LIVE_MAX_STREAMS` flux d'un membre, le plus ancien reçoit `replaced`, puis se ferme (A2) ;
// - `forget(id)` : le flux a été coupé par l'appli (onglet fermé, réseau perdu) ;
// - `ownerOf(id)`, `declaredOf(id)`, `declare(id, topics)`, `exclusive(id, task)` : la déclaration
//   des sujets (PUT /v1/live/{connectionId}/topics), une seule à la fois par connexion (A1) ;
// - `listeners(topic)` : les membres dont une connexion écoute ce sujet (pour borner les lectures
//   du filtre : sans écouteur, aucune requête) ;
// - `emit(event, allow)` : le signal, aux seules connexions du sujet dont le membre passe `allow` ;
// - `toMembers(ids, kind)` : un signal sur le `me` de ces membres seulement ;
// - `withdraw(topic, allow)` : retire un sujet aux connexions dont le membre ne passe plus `allow`,
//   et leur envoie `gone` (la revérification d'une visibilité, B4) ;
// - `shutdown()` : l'arrêt du serveur ; plus aucun flux neuf, et les ouverts se ferment.
import {
  LIVE_EVENT_NAMES,
  LIVE_MAX_STREAMS,
  LIVE_PING_MS,
  LIVE_RECHECK_MS,
  type LiveEvent,
  type LiveKind,
} from '@ruche/contracts'

/**
 * Ce que le bus sait écrire dans un flux : un message nommé (`event:` et `data:`), ou du texte brut
 * (le battement `: ping`). `SSEStreamingApi` de Hono (hono/streaming) a exactement cette forme ; le
 * bus ne dépend donc pas de Hono, et un test peut lui donner un faux flux.
 */
export type LiveSink = {
  writeSSE(message: { event: string; data: string }): Promise<void>
  write(text: string): Promise<unknown>
}

/** Les sujets donnés d'office avec le flux (contrat : seuls les autres se déclarent). */
const STANDING_TOPICS = ['me', 'feed'] as const
/** Ceux d'un administrateur en fonction, en plus (la file de modération, la page de tri). */
export const ADMIN_TOPICS = ['moderation', 'scouts'] as const

/**
 * Au-delà de ce nombre de messages en attente d'écriture, l'appli ne lit plus son flux (un appareil
 * en veille dont la connexion n'est pas encore tombée) : on le ferme plutôt que de garder en
 * mémoire une file sans fin. Elle se reconnecte et relit tout à son retour.
 */
const MAX_BACKLOG = 200

/** Ce que la revérification apprend d'une session encore valide. */
export type SessionState = { admin: boolean }

/**
 * La revérification des sessions (B2) : reçoit les sessions des flux ouverts (identifiant, membre,
 * et s'il avait le rôle d'administrateur à l'ouverture), rend celles qui tiennent encore, avec
 * leur rôle d'aujourd'hui. Une session absente de la réponse a pris fin : ses flux se ferment.
 */
export type SessionRecheck = (
  sessions: readonly { sessionId: string; userId: string; admin: boolean }[],
) => Promise<ReadonlyMap<string, SessionState>>

/** Une connexion ouverte, vue du bus. */
type Connection = {
  id: string
  userId: string
  sessionId: string
  admin: boolean
  /** Tous ses sujets : d'office (`me`, `feed`, ceux de l'administrateur) et déclarés. */
  topics: Set<string>
  /** Les sujets déclarés seuls (la liste du dernier PUT, gardée). */
  declared: Set<string>
  sink: LiveSink
  /** La file d'écriture : chaque message attend le précédent, l'ordre est donc gardé. */
  chain: Promise<void>
  backlog: number
  /** La déclaration en cours (une seule à la fois, A1). */
  declaring: Promise<void>
  ping: ReturnType<typeof setInterval>
  /** Résolue quand le flux doit finir : la route le termine alors (routes/live.ts). */
  closed: Promise<void>
  finish: () => void
  done: boolean
}

export type LiveHub = ReturnType<typeof createLiveHub>

export const createLiveHub = ({ recheck }: { recheck?: SessionRecheck } = {}) => {
  /** Les connexions par identifiant (le `connectionId` du `hello`). */
  const byId = new Map<string, Connection>()
  /** Celles de chaque membre, de la plus ancienne à la plus récente (la limite de cinq). */
  const byUser = new Map<string, Connection[]>()
  /** Les connexions de chaque sujet : un signal ne parcourt que celles qui l'écoutent. */
  const byTopic = new Map<string, Set<Connection>>()
  let stopping = false
  let recheckTimer: ReturnType<typeof setInterval> | null = null
  let rechecking = false

  const subscribe = (conn: Connection, topic: string) => {
    conn.topics.add(topic)
    let set = byTopic.get(topic)
    if (!set) {
      set = new Set()
      byTopic.set(topic, set)
    }
    set.add(conn)
  }

  const unsubscribe = (conn: Connection, topic: string) => {
    conn.topics.delete(topic)
    const set = byTopic.get(topic)
    if (!set) return
    set.delete(conn)
    if (set.size === 0) byTopic.delete(topic)
  }

  /**
   * Met un écrit dans la file de la connexion, sans l'attendre : la route qui émet ne doit jamais
   * attendre qu'un appareil lise son flux. Une écriture ratée (flux déjà coupé) ne casse pas la file.
   */
  const enqueue = (conn: Connection, write: () => Promise<unknown>) => {
    if (conn.done) return
    conn.backlog += 1
    if (conn.backlog > MAX_BACKLOG) {
      close(conn, false)
      return
    }
    conn.chain = conn.chain
      .then(write)
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        conn.backlog -= 1
      })
  }

  const send = (conn: Connection, event: LiveEvent) =>
    enqueue(conn, () =>
      conn.sink.writeSSE({ event: LIVE_EVENT_NAMES.signal, data: JSON.stringify(event) }),
    )

  /**
   * Ferme une connexion : elle sort de tous les index tout de suite (plus aucun signal), puis son
   * flux finit, après les messages déjà en file si `flush` (le `replaced` doit arriver avant la
   * fermeture), sinon aussitôt.
   */
  const close = (conn: Connection, flush: boolean) => {
    if (conn.done) return
    conn.done = true
    clearInterval(conn.ping)
    byId.delete(conn.id)
    for (const topic of [...conn.topics]) unsubscribe(conn, topic)
    const mine = byUser.get(conn.userId)?.filter((other) => other !== conn) ?? []
    if (mine.length > 0) byUser.set(conn.userId, mine)
    else byUser.delete(conn.userId)
    if (flush) void conn.chain.then(conn.finish)
    else conn.finish()
    if (byId.size === 0 && recheckTimer !== null) {
      clearInterval(recheckTimer)
      recheckTimer = null
    }
  }

  /** Retire un sujet d'office à une connexion et lui envoie `gone` (rôle d'administrateur perdu). */
  const revoke = (conn: Connection, topic: string) => {
    if (!conn.topics.has(topic)) return
    unsubscribe(conn, topic)
    conn.declared.delete(topic)
    send(conn, { topic, kind: 'gone' })
  }

  /**
   * La revérification des sessions (B2) : une lecture groupée pour tous les flux ouverts. Une
   * session qui n'est plus rendue (déconnexion, mot de passe changé ailleurs, expirée, purgée,
   * compte supprimé) ferme ses flux ; un rôle d'administrateur retiré enlève `moderation` et
   * `scouts`, avec `gone`. Une revérification encore en cours n'en lance pas une seconde.
   */
  const runRecheck = async () => {
    if (!recheck || rechecking || byId.size === 0) return
    rechecking = true
    try {
      const open = [...byId.values()]
      const sessions = new Map<string, { sessionId: string; userId: string; admin: boolean }>()
      for (const conn of open) {
        const known = sessions.get(conn.sessionId)
        sessions.set(conn.sessionId, {
          sessionId: conn.sessionId,
          userId: conn.userId,
          admin: conn.admin || (known?.admin ?? false),
        })
      }
      const alive = await recheck([...sessions.values()])
      for (const conn of open) {
        const state = alive.get(conn.sessionId)
        if (!state) {
          close(conn, true)
          continue
        }
        if (conn.admin && !state.admin) {
          conn.admin = false
          for (const topic of ADMIN_TOPICS) revoke(conn, topic)
        }
      }
    } catch (error) {
      // Une panne de la base ne doit pas faire tomber l'API : la prochaine revérification
      // recommencera. Aucune donnée de membre dans le message.
      console.error('Live session recheck failed', {
        name: error instanceof Error ? error.name : 'unknown',
      })
    } finally {
      rechecking = false
    }
  }

  return {
    /** Vrai dès que l'arrêt du serveur a commencé : la route refuse alors tout flux neuf. */
    get stopping() {
      return stopping
    },

    /**
     * Ouvre une connexion pour ce membre et rend son identifiant, tiré au hasard (B3 : un uuid, que
     * personne ne devine), et la promesse de sa fin. Le `hello` est le premier message de sa file.
     */
    open({
      userId,
      sessionId,
      admin,
      sink,
    }: {
      userId: string
      sessionId: string
      admin: boolean
      sink: LiveSink
    }) {
      let finish = () => {}
      const closed = new Promise<void>((resolve) => {
        finish = resolve
      })
      const conn: Connection = {
        id: crypto.randomUUID(),
        userId,
        sessionId,
        admin,
        topics: new Set(),
        declared: new Set(),
        sink,
        chain: Promise.resolve(),
        backlog: 0,
        declaring: Promise.resolve(),
        // Le battement : un commentaire SSE (une ligne qui commence par « : »), que l'appli ignore,
        // mais qui empêche un intermédiaire de couper une connexion muette.
        ping: setInterval(() => enqueue(conn, () => conn.sink.write(': ping\n\n')), LIVE_PING_MS),
        closed,
        finish: () => finish(),
        done: false,
      }
      byId.set(conn.id, conn)
      for (const topic of STANDING_TOPICS) subscribe(conn, topic)
      if (admin) for (const topic of ADMIN_TOPICS) subscribe(conn, topic)
      enqueue(conn, () =>
        sink.writeSSE({
          event: LIVE_EVENT_NAMES.hello,
          data: JSON.stringify({ connectionId: conn.id }),
        }),
      )

      // Le sixième flux d'un membre renvoie le plus ancien (A2) : un dernier message `replaced`,
      // pour que l'appli ne se reconnecte qu'à son retour au premier plan, puis la fermeture.
      const mine = [...(byUser.get(userId) ?? []), conn]
      while (mine.length > LIVE_MAX_STREAMS) {
        const oldest = mine.shift()
        if (!oldest) break
        enqueue(oldest, () =>
          oldest.sink.writeSSE({ event: LIVE_EVENT_NAMES.replaced, data: '{}' }),
        )
        close(oldest, true)
      }
      byUser.set(userId, mine)

      if (recheck && recheckTimer === null) {
        recheckTimer = setInterval(() => void runRecheck(), LIVE_RECHECK_MS)
      }
      return { connectionId: conn.id, closed }
    },

    /** L'appli a coupé ce flux : la connexion est oubliée (le PUT suivant répond 404). */
    forget(connectionId: string) {
      const conn = byId.get(connectionId)
      if (conn) close(conn, false)
    },

    /** Le membre de cette connexion, ou null pour un identifiant inconnu ou fermé. */
    ownerOf(connectionId: string) {
      return byId.get(connectionId)?.userId ?? null
    },

    /** Les sujets déclarés de cette connexion (vide si elle est inconnue). */
    declaredOf(connectionId: string): ReadonlySet<string> {
      return byId.get(connectionId)?.declared ?? new Set()
    },

    /**
     * Remplace les sujets déclarés de cette connexion par `topics` (déjà vérifiés par l'appelant,
     * live/access.ts). Les sujets d'office restent.
     */
    declare(connectionId: string, topics: Iterable<string>) {
      const conn = byId.get(connectionId)
      if (!conn) return
      const next = new Set(topics)
      for (const topic of conn.declared) if (!next.has(topic)) unsubscribe(conn, topic)
      for (const topic of next) subscribe(conn, topic)
      conn.declared = next
    },

    /**
     * Fait `task` quand la déclaration précédente de cette connexion est finie (A1 : une seule à la
     * fois ; la suivante attend). Une erreur de `task` remonte à son appelant seul.
     */
    exclusive<T>(connectionId: string, task: () => Promise<T>): Promise<T> {
      const conn = byId.get(connectionId)
      if (!conn) return task()
      const run = conn.declaring.then(task)
      conn.declaring = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },

    /** Les membres dont au moins une connexion écoute ce sujet. */
    listeners(topic: string): ReadonlySet<string> {
      const users = new Set<string>()
      for (const conn of byTopic.get(topic) ?? []) users.add(conn.userId)
      return users
    },

    /** Vrai si aucun flux n'est ouvert : les aides d'émission n'ont alors rien à lire. */
    isIdle() {
      return byId.size === 0
    },

    /** Vrai si ce membre a au moins un flux ouvert. */
    isConnected(userId: string) {
      return byUser.has(userId)
    },

    /**
     * Le signal, à chaque connexion qui écoute `event.topic` et dont le membre passe `allow` (le
     * filtre des destinataires, live/emit.ts). Sans `allow`, à toutes : seulement pour un sujet
     * dont chaque écouteur a déjà le droit de tout voir (`moderation`).
     */
    emit(event: LiveEvent, allow: (userId: string) => boolean = () => true) {
      for (const conn of byTopic.get(event.topic) ?? []) {
        if (allow(conn.userId)) send(conn, event)
      }
    },

    /** Un signal sur le `me` de ces membres seulement (chacun de leurs appareils). */
    toMembers(userIds: Iterable<string>, kind: LiveKind) {
      for (const userId of new Set(userIds)) {
        for (const conn of byUser.get(userId) ?? []) send(conn, { topic: 'me', kind })
      }
    },

    /**
     * Retire `topic` aux connexions dont le membre ne passe plus `allow`, et leur envoie `gone` :
     * l'appli relit la ressource, reçoit le 404 et la retire de l'écran (revérification, B4).
     */
    withdraw(topic: string, allow: (userId: string) => boolean) {
      for (const conn of [...(byTopic.get(topic) ?? [])]) {
        if (!allow(conn.userId)) revoke(conn, topic)
      }
    },

    /** Lance une revérification des sessions tout de suite (sans attendre la minute). */
    recheckNow: runRecheck,

    /**
     * L'arrêt du serveur (index.ts, avant `server.close`) : aucun flux neuf n'est plus accepté, et
     * les flux ouverts se ferment, sinon `server.close` les attendrait sans fin.
     */
    shutdown() {
      stopping = true
      for (const conn of [...byId.values()]) close(conn, true)
    },
  }
}
