// Le badge « Testeur » d'un commentaire (R7b) : `CommentAuthor.isTester` est vrai pour un testeur
// actuel du projet commenté, jamais pour l'auteur du projet, ni pour un membre qui n'a pas rejoint
// les testeurs, ni pour un ancien testeur. Il vaut pour ce projet seulement (décision de Louis du
// 11/11/2026 : le badge est pour tous les testeurs, anciens inscrits compris, sans les prévenir).
import { CommentPage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string
let ines: string
let malik: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.parse('2026-11-02T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  jean = await ctx.verifiedMember({
    name: 'Papi Jean',
    email: 'jean@example.com',
    password: 'jean-long-password',
  })
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = () => vi.setSystemTime(Date.now() + 60 * 1000)

/** Les auteurs des commentaires d'un projet, vus par Papi Jean : nom → `isTester`. */
const badges = async (projectId: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/comments`, jean)
  expect(res.status).toBe(200)
  return Object.fromEntries(
    CommentPage.parse(await res.json()).items.flatMap((comment) =>
      comment.author ? [[comment.author.name, comment.author.isTester]] : [],
    ),
  )
}

describe('the tester badge of a comment', () => {
  it('shows the badge to the current testers of this project only', async () => {
    const project = await act.publish(jean, 'Décollage !', {
      status: 'testable',
      demoUrl: 'https://demo.example.com/',
    })
    const other = await act.publish(jean, 'Le carnet de jardin', {
      status: 'testable',
      demoUrl: 'https://demo.example.com/',
    })
    later()
    await act.send('POST', `/v1/projects/${project.id}/testers`, ines)
    later()
    await act.send('POST', `/v1/projects/${other.id}/testers`, malik)
    await act.comment(project.id, jean, 'Merci de tester !')
    await act.comment(project.id, ines, 'Ça marche.')
    await act.comment(project.id, malik, 'Moi, je regarde seulement.')

    // Inès teste ce projet ; Malik teste un autre projet ; l'auteur n'est jamais « Testeur ».
    expect(await badges(project.id)).toEqual({
      'Papi Jean': false,
      Inès: true,
      Malik: false,
    })

    // Une fois partie, elle perd le badge.
    later()
    await act.send('DELETE', `/v1/projects/${project.id}/testers`, ines)
    expect((await badges(project.id)).Inès).toBe(false)
  })
})
