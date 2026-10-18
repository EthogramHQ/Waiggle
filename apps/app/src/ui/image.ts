// Ce que les composants d'interface reçoivent pour afficher une image : son adresse et, sur
// téléphone, l'en-tête qui prouve qui regarde. Les composants ne parlent jamais à l'API eux-mêmes :
// l'écran leur donne une source toute prête (voir src/api/media.ts).

export type ImageSource = { uri: string; headers?: Record<string, string> }
