// L'image Docker installe sharp à part (paquet apps/api/runtime, voir le Dockerfile).
// Ce test vérifie que c'est bien la version avec laquelle tous les autres tests tournent.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dependencies = (path: string) =>
  (
    JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>
    }
  ).dependencies

describe('the Docker runtime dependencies', () => {
  it('ship the same sharp version as the one we test with', () => {
    expect(dependencies('../runtime/package.json').sharp).toBe(
      dependencies('../package.json').sharp,
    )
  })
})
