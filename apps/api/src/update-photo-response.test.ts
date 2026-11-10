// Test de la réponse de POST /v1/projects/{id}/visuals avec `slot=update` (R7a) : la photo en
// attente elle-même (son identifiant sert à citer la photo dans la mise à jour), et non le projet que
// rendent `gallery` et `portrait` ; le schéma OpenAPI le dit. Les autres règles des photos de mises à
// jour (plafonds, droits, service des fichiers) sont dans visuals.test.ts.
import { Project, ProjectVisual } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, photoWithGps, visualForm } from './testing/images'

let ctx: TestContext
let cookie: string
let projectId: string

beforeEach(async () => {
  ctx = await createTestContext()
  cookie = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  const res = await ctx.request('/v1/projects', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Mon agent de recettes',
      primaryCategory: 'other',
      pitch: 'Un menu avec ce qu’il y a au frigo.',
      visibility: 'public',
    }),
  })
  expect(res.status).toBe(201)
  projectId = Project.parse(await res.json()).id
})

afterEach(async () => {
  await ctx.close()
})

const upload = async (form: FormData) =>
  ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })

describe('the response of an update photo upload', () => {
  it('answers with the pending photo itself, whose id is the one stored', async () => {
    const res = await upload(visualForm(await jpegImage(800, 600), 'update'))

    expect(res.status).toBe(201)
    const visual = ProjectVisual.parse(await res.json())
    const stored = (
      (await ctx.db.execute(
        sql`select id, update_id, slot from project_media where project_id = ${projectId}`,
      )) as unknown as { rows: { id: string; update_id: string | null; slot: string }[] }
    ).rows
    expect(stored).toEqual([{ id: visual.id, update_id: null, slot: 'update' }])
  })

  it('still answers with the project for a gallery photo (witness)', async () => {
    const res = await upload(visualForm(await photoWithGps()))

    expect(res.status).toBe(201)
    expect(Project.parse(await res.json()).visuals).toHaveLength(1)
  })

  it('documents both bodies in the OpenAPI document', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }

    const created = doc.paths['/v1/projects/{id}/visuals']?.post?.responses['201']

    expect(JSON.stringify(created)).toContain('ProjectVisual')
    expect(JSON.stringify(created)).toContain('Project')
  })
})
