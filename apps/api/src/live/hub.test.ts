// Tests unitaires du bus du temps réel (R21, live/hub.ts), sans base ni HTTP : ce que les tests
// d'intégration (live.*.test.ts) ne peuvent pas voir, l'arrêt du serveur (index.ts), une seule
// déclaration à la fois par connexion (relecture de sécurité du plan, A1) et l'appareil qui ne lit
// plus son flux.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveHub, type LiveSink } from './hub'

/** Un faux flux : note ce qui y est écrit ; `stuck` ne finit jamais d'écrire (l'appareil ne lit plus). */
const sinkOf = (stuck = false) => {
  const written: string[] = []
  const sink: LiveSink = {
    writeSSE: async ({ event, data }) => {
      if (stuck) return new Promise<void>(() => {})
      written.push(`${event} ${data}`)
    },
    write: async (text) => {
      written.push(text)
    },
  }
  return { sink, written }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the live hub', () => {
  it('refuses new streams once the server stops, and ends the open ones', async () => {
    const hub = createLiveHub()
    const { sink, written } = sinkOf()
    const { closed } = hub.open({ userId: 'lea', sessionId: 's1', admin: false, sink })

    hub.shutdown()

    await expect(closed).resolves.toBeUndefined()
    expect(hub.stopping).toBe(true)
    expect(hub.isConnected('lea')).toBe(false)
    expect(written[0]).toMatch(/^hello /)
  })

  it('runs one declaration at a time on a connection', async () => {
    const hub = createLiveHub()
    const { connectionId } = hub.open({
      userId: 'lea',
      sessionId: 's1',
      admin: false,
      sink: sinkOf().sink,
    })
    const order: string[] = []
    let release = () => {}
    const first = hub.exclusive(connectionId, async () => {
      order.push('first starts')
      await new Promise<void>((resolve) => {
        release = resolve
      })
      order.push('first ends')
    })
    const second = hub.exclusive(connectionId, async () => {
      order.push('second')
    })

    await Promise.resolve()
    release()
    await Promise.all([first, second])
    expect(order).toEqual(['first starts', 'first ends', 'second'])
    hub.shutdown()
  })

  it('closes the stream of a device that no longer reads it', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const hub = createLiveHub()
    hub.open({ userId: 'lea', sessionId: 's1', admin: false, sink: sinkOf(true).sink })

    // Plus de 200 signaux en attente : le flux est fermé plutôt que de grossir sans fin.
    for (let i = 0; i < 250; i++) hub.emit({ topic: 'feed', kind: 'feed' })

    expect(hub.isConnected('lea')).toBe(false)
    hub.shutdown()
  })
})
