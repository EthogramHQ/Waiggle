// Les pages des réglages, réunies en un seul morceau chargé à la demande (R13,
// navigation/lazyScreen.tsx ; pourquoi les réunir : chunks/moderation.ts). « Mes commentaires » et
// « Mes retours envoyés » n'y sont pas : leurs routes restent l'écran lui-même (un test vérifie que
// la route est l'écran).
export { ChangeEmailScreen } from '../../screens/ChangeEmailScreen'
export { ChangePasswordScreen } from '../../screens/ChangePasswordScreen'
export { DeleteAccountScreen } from '../../screens/DeleteAccountScreen'
export { ProfileScreen } from '../../screens/ProfileScreen'
export { PublicPageSettingsScreen } from '../../screens/PublicPageSettingsScreen'
export { RankingsScreen } from '../../screens/RankingsScreen'
export { SettingsScreen } from '../../screens/SettingsScreen'
