// Tests de la file d'attente qui limite le nombre de traitements d'images simultanés.
import { describe, expect, it } from 'vitest'
import { createQueue, QueueFullError } from './queue'

// Une tâche qu'on termine à la main, pour contrôler l'ordre des événements.
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('createQueue', () => {
  it('never runs more tasks at once than allowed', async () => {
    const queue = createQueue(2)
    let running = 0
    let peak = 0
    const gates = [deferred(), deferred(), deferred(), deferred()]

    const results = gates.map((gate, i) =>
      queue(async () => {
        running++
        peak = Math.max(peak, running)
        await gate.promise
        running--
        return i
      }),
    )
    // On libère les tâches une à une.
    for (const gate of gates) {
      await new Promise((r) => setTimeout(r, 5))
      gate.resolve()
    }

    expect(await Promise.all(results)).toEqual([0, 1, 2, 3])
    expect(peak).toBe(2)
  })

  it('frees its place when a task fails', async () => {
    const queue = createQueue(1)

    await expect(queue(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(await queue(async () => 'next')).toBe('next')
  })

  it('turns new tasks away once too many are waiting, instead of piling them up', async () => {
    const queue = createQueue(1, 1)
    const gate = deferred()

    const running = queue(() => gate.promise) // occupe la seule place
    const waiting = queue(async () => 'waited') // attend son tour
    const refused = queue(async () => 'never')

    await expect(refused).rejects.toBeInstanceOf(QueueFullError)
    gate.resolve()
    await running
    expect(await waiting).toBe('waited')
  })
})
