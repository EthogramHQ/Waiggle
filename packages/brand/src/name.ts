// Le nom de l'appli tel que les membres le voient. C'est le seul endroit où il est écrit : les textes
// (fr, en), l'appli, l'API et les e-mails le lisent ici. Pour renommer l'appli, on change cette ligne
// (et le champ "name" de apps/app/app.json, que les téléphones affichent sous l'icône).
// « Ruche » reste le nom de code des paquets (@ruche/...), des images Docker et du dossier du serveur :
// les membres ne le voient pas.
export const appName = 'Waiggle'

// Le code source de l'appli, public (licence AGPL) : l'appli le signale à ses membres.
export const sourceUrl = 'https://github.com/EthogramHQ/Waiggle'

// L’adresse de contact (tranche 6d) : questions, contenus à signaler, demandes sur les données. Seul
// endroit où elle est écrite ; les textes la citent par {{contactEmail}}, rempli automatiquement.
export const contactEmail = 'contact@waiggle.com'
