// Les pages des réglages, réunies en un seul morceau chargé à la demande (R13,
// navigation/lazyScreen.tsx ; pourquoi les réunir : chunks/moderation.ts). « Mes commentaires » et
// « Mes retours envoyés » n'y sont pas : leurs routes restent l'écran lui-même (un test vérifie que
// la route est l'écran).
export { ChangeEmailScreen } from '../../screens/ChangeEmailScreen'
export { ChangePasswordScreen } from '../../screens/ChangePasswordScreen'
export { DeleteAccountScreen } from '../../screens/DeleteAccountScreen'
// R19 : « Ma récolte » et le classement de la semaine, ouverts depuis sa propre page comme les
// réglages : ils partent dans ce morceau plutôt que dans un neuf.
export { HarvestScreen } from '../../screens/HarvestScreen'
export { ProfileScreen } from '../../screens/ProfileScreen'
export { PublicPageSettingsScreen } from '../../screens/PublicPageSettingsScreen'
export { RankingsScreen } from '../../screens/RankingsScreen'
export { SettingsScreen } from '../../screens/SettingsScreen'
