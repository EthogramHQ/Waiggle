// Les règles du contrat du temps réel (R21) : les sujets permis, ceux qu'un écran peut déclarer, et
// un signal qui ne porte jamais de contenu.
import { describe, expect, it } from 'vitest'
import { LIVE_MAX_TOPICS, LiveEvent, LiveHello, LiveTopic, LiveTopicsBody } from './live'
import { MemberId } from './members'

const project = 'project:0b6f3c1e-2f5a-4c8e-9d7a-1a2b3c4d5e6f'

describe('LiveTopic', () => {
  it('accepts the personal, feed and admin topics and a page with its id', () => {
    for (const topic of ['me', 'feed', 'moderation', 'scouts', project, 'member:AbC123_xyz-9']) {
      expect(LiveTopic.safeParse(topic).success).toBe(true)
    }
    expect(LiveTopic.safeParse('hive:0b6f3c1e-2f5a-4c8e-9d7a-1a2b3c4d5e6f').success).toBe(true)
    expect(LiveTopic.safeParse('corner:0b6f3c1e-2f5a-4c8e-9d7a-1a2b3c4d5e6f').success).toBe(true)
  })

  it('refuses an unknown topic, a page without an id and an id of the wrong shape', () => {
    for (const topic of [
      '',
      'project',
      'project:',
      'project:42',
      'hive:abc',
      'member:',
      'admin',
      'me:x',
    ]) {
      expect(LiveTopic.safeParse(topic).success).toBe(false)
    }
  })

  it('takes a member id exactly as MemberId does', () => {
    for (const id of ['a', 'A'.repeat(64), 'x-y_z']) {
      expect(LiveTopic.safeParse(`member:${id}`).success).toBe(MemberId.safeParse(id).success)
    }
    expect(LiveTopic.safeParse(`member:${'A'.repeat(65)}`).success).toBe(false)
    expect(LiveTopic.safeParse('member:a b').success).toBe(false)
  })
})

describe('LiveTopicsBody', () => {
  it('declares only the topics of an open page, up to the limit', () => {
    expect(LiveTopicsBody.safeParse({ topics: [project] }).success).toBe(true)
    expect(LiveTopicsBody.safeParse({ topics: [] }).success).toBe(true)
    expect(LiveTopicsBody.safeParse({ topics: Array(LIVE_MAX_TOPICS).fill(project) }).success).toBe(
      true,
    )
    expect(
      LiveTopicsBody.safeParse({ topics: Array(LIVE_MAX_TOPICS + 1).fill(project) }).success,
    ).toBe(false)
  })

  it('refuses to declare the topics that come with the stream', () => {
    for (const topic of ['me', 'feed', 'moderation', 'scouts']) {
      expect(LiveTopicsBody.safeParse({ topics: [topic] }).success).toBe(false)
    }
  })
})

describe('LiveEvent', () => {
  it('carries a topic and a kind, nothing else', () => {
    expect(LiveEvent.safeParse({ topic: project, kind: 'comments' }).success).toBe(true)
    expect(LiveEvent.safeParse({ topic: project, kind: 'comments', text: 'Bravo' }).success).toBe(
      false,
    )
    expect(LiveEvent.safeParse({ topic: project, kind: 'typing' }).success).toBe(false)
  })
})

describe('LiveHello', () => {
  it('gives a connection id that cannot be guessed', () => {
    expect(LiveHello.safeParse({ connectionId: crypto.randomUUID() }).success).toBe(true)
    expect(LiveHello.safeParse({ connectionId: '1' }).success).toBe(false)
  })
})
