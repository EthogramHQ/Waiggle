// Réglages de Vitest pour ce paquet. Chaque test démarre une base PGlite neuve et applique les
// migrations : c'est rapide sur un ordinateur récent, plus lent sur les machines de la CI.
// On laisse donc 30 secondes par test au lieu de 5.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
