// Adresses de l'API et de l'appli web. Expo remplace les variables EXPO_PUBLIC_… au moment de
// construire l'appli : elles sont donc publiques (jamais de secret dans une variable EXPO_PUBLIC_).
// En local, on garde les valeurs par défaut ; en production, on les fixe au build.
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
export const webAppUrl = process.env.EXPO_PUBLIC_APP_URL ?? 'http://localhost:8081'
// Le commit dont l'appli web est construite (image de production), comparé à celui de l'API
// (`/health`) après une réponse refusée : voir api/newVersion.ts. Absent en développement.
export const appVersion = process.env.EXPO_PUBLIC_APP_VERSION ?? null
