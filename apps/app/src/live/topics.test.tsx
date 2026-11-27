// Tests du magasin des sujets du temps réel (R21, src/live/topics.ts) : les écrans ouverts déclarent
// ce qu'ils regardent, comptés par écran ; la connexion lit la liste (`liveTopics`) et apprend ses
// changements (`subscribeTopics`).
import { LIVE_MAX_TOPICS } from '@ruche/contracts'
import { act, render } from '@testing-library/react-native'
import { liveTopics, subscribeTopics, useLiveTopic } from './topics'

const P = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const Q = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

/** Un écran qui déclare un sujet tant qu'il est monté. */
function Screen({ topic }: { topic: string | null }) {
  useLiveTopic(topic)
  return null
}

/** Plusieurs écrans ouverts en même temps : leur nom, et le sujet de chacun (doublons permis). */
function Screens({ screens }: { screens: Record<string, string | null> }) {
  return Object.entries(screens).map(([name, topic]) => <Screen key={name} topic={topic} />)
}

describe('the live topics store', () => {
  it('keeps one topic for two screens on the same page, until the last one closes', async () => {
    const changes = jest.fn()
    const stop = subscribeTopics(changes)
    const view = await render(<Screens screens={{ a: `project:${P}`, b: `project:${P}` }} />)

    expect(liveTopics()).toEqual([`project:${P}`])
    expect(changes).toHaveBeenCalledTimes(1)

    await view.rerender(<Screens screens={{ a: `project:${P}` }} />)
    expect(liveTopics()).toEqual([`project:${P}`])
    expect(changes).toHaveBeenCalledTimes(1)

    await view.rerender(<Screens screens={{}} />)
    expect(liveTopics()).toEqual([])
    expect(changes).toHaveBeenCalledTimes(2)
    stop()
    await act(async () => view.unmount())
  })

  it('swaps the topic when the screen moves to another project', async () => {
    const view = await render(<Screen topic={`project:${P}`} />)
    await view.rerender(<Screen topic={`project:${Q}`} />)

    expect(liveTopics()).toEqual([`project:${Q}`])
    await act(async () => view.unmount())
    expect(liveTopics()).toEqual([])
  })

  it('declares nothing for null, a default topic, or a malformed id', async () => {
    const view = await render(
      <Screens screens={{ a: null, b: 'me', c: 'feed', d: 'project:not-a-uuid' }} />,
    )

    expect(liveTopics()).toEqual([])
    await act(async () => view.unmount())
  })

  it('gives the same list until a topic comes or goes', async () => {
    const view = await render(<Screens screens={{ a: 'member:nora' }} />)
    const first = liveTopics()

    await view.rerender(<Screens screens={{ a: 'member:nora', b: 'member:nora' }} />)
    expect(liveTopics()).toBe(first)
    await act(async () => view.unmount())
  })

  it('sends at most the 20 most recent topics the server accepts', async () => {
    const members = Array.from({ length: LIVE_MAX_TOPICS + 2 }, (_, i) => `member:m${i}`)
    const view = await render(<Screens screens={Object.fromEntries(members.map((m) => [m, m]))} />)

    expect(liveTopics()).toHaveLength(LIVE_MAX_TOPICS)
    expect(liveTopics()).toEqual(members.slice(2))
    await act(async () => view.unmount())
  })

  it('stops calling a listener once unsubscribed', async () => {
    const changes = jest.fn()
    subscribeTopics(changes)()
    const view = await render(<Screen topic="member:nora" />)

    expect(changes).not.toHaveBeenCalled()
    await act(async () => view.unmount())
  })
})
