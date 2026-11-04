// La répartition des captures en parts (`shots.mjs --shard i/n`) : la CI prend les captures en
// deux tâches parallèles, chacune avec sa moitié de la liste. Ce petit module est à part pour se
// tester sans navigateur (shard.test.ts).

export type Shard = { index: number; count: number }

// Lit « 2/3 » (la part 2 sur 3). Une valeur mal formée arrête le script avec un message clair.
export function parseShard(value: string): Shard {
  const match = /^(\d+)\/(\d+)$/.exec(value)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  if (!match || count < 1 || index < 1 || index > count) {
    throw new Error(`--shard attend « i/n » avec 1 <= i <= n (par exemple 1/2), reçu « ${value} ».`)
  }
  return { index, count }
}

// La part `index` sur `count` d'une liste : le travail k va à la part (k % count) + 1 (un « tour de
// table », comme on distribue des cartes). Les parts diffèrent d'un travail au plus, et surtout les
// travaux voisins, c'est-à-dire les quatre captures d'une même page (téléphone / ordinateur, jour /
// nuit), vont dans des parts différentes : une page lourde, ou un groupe de pages lourdes, ne
// tombe donc pas tout entier dans la même moitié. La répartition ne dépend que de la place dans la
// liste : stable d'un lancement à l'autre. Sans part, la liste entière.
export function shardOf<T>(jobs: readonly T[], shard: Shard | undefined): T[] {
  if (!shard) return [...jobs]
  return jobs.filter((_, k) => k % shard.count === shard.index - 1)
}
