/**
 * Diccionarios ES/EN de las superficies públicas y de cuenta.
 * El dashboard (Ranked/Equipo/Reglas) usa las mismas claves para nav/títulos;
 * el contenido denso de tablas queda en ES por ahora.
 */

export type Locale = 'es' | 'en';
export const LOCALES: Locale[] = ['es', 'en'];

export function normalizeLocale(v: string | null | undefined): Locale {
  return v === 'en' ? 'en' : 'es';
}

const es = {
  'lang.name': 'Español',
  'lang.other': 'English',

  'common.loading': 'Cargando…',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.error': 'Ocurrió un error',

  'landing.badge': 'Beta · Solicitud de API productiva en curso',
  'landing.title': 'ValoIA',
  'landing.subtitle':
    'Tu rendimiento en VALORANT, analizado con datos oficiales de Riot: historial, agentes, mapas, reglas de sesión y comparativas con consentimiento.',
  'landing.cta': 'Crear cuenta',
  'landing.ctaLogin': 'Iniciar sesión',
  'landing.demo': 'Ver demo (datos de ejemplo)',
  'landing.f1.title': 'Stats oficiales',
  'landing.f1.body': 'Partidas, K/D/A, ACS, ADR y HS% desde la API oficial de Riot (VAL-MATCH-V1).',
  'landing.f2.title': 'Analiza tu sesión',
  'landing.f2.body': 'Reglas de sesión, cortes, pool de agentes por mapa y récord V/D/E sin hojas de cálculo.',
  'landing.f3.title': 'Comparativas con consentimiento',
  'landing.f3.body':
    'Solo puedes ver perfiles de otros jugadores si ellos conectan su cuenta de Riot y activan explícitamente el perfil público.',
  'landing.f4.title': 'Tú controlas tus datos',
  'landing.f4.body': 'Vinculación y revocación en un clic, auditoría de consentimiento y borrado de cuenta.',
  'landing.optin':
    'ValoIA requiere que cada jugador vincule su cuenta de Riot (Riot Sign-On) y dé su consentimiento para compartir sus datos. Sin opt-in, su perfil no se muestra a terceros.',
  'landing.notAffiliated': 'ValoIA no está afiliado ni patrocinado por Riot Games. VALORANT es una marca de Riot Games, Inc.',

  'auth.login': 'Iniciar sesión',
  'auth.register': 'Crear cuenta',
  'auth.username': 'Usuario',
  'auth.password': 'Contraseña',
  'auth.password2': 'Repetir contraseña',
  'auth.submitLogin': 'Entrar',
  'auth.submitRegister': 'Crear cuenta',
  'auth.haveAccount': '¿Ya tienes cuenta? Inicia sesión',
  'auth.noAccount': '¿No tienes cuenta? Regístrate',
  'auth.err.mismatch': 'Las contraseñas no coinciden',
  'auth.err.invalid': 'Credenciales inválidas',
  'auth.err.generic': 'No se pudo completar la operación',
  'auth.logout': 'Cerrar sesión',
  'auth.menu.profile': 'Mi cuenta',
  'auth.admin': 'Admin',

  'account.title': 'Mi cuenta',
  'account.riotLink': 'Cuenta de Riot',
  'account.linked': 'Vinculada',
  'account.notLinked': 'Sin vincular',
  'account.link': 'Conectar con Riot',
  'account.unlink': 'Desvincular',
  'account.linkHelp':
    'La vinculación usa Riot Sign-On: ValoIA nunca ve tu contraseña de Riot. Si desvinculas, tu perfil deja de mostrarse.',
  'account.consentTitle': 'Consentimiento de datos',
  'account.consentBody':
    'Para mostrar tus estadísticas necesitamos tu consentimiento explícito. Si además activas el perfil público, otros jugadores verificados podrán ver tus stats en comparativas.',
  'account.consentAccept': 'Acepto el tratamiento de mis datos según la Política de Privacidad',
  'account.publicProfile': 'Hacer mi perfil público (visible para otros usuarios)',
  'account.consentSave': 'Guardar consentimiento',
  'account.consentSaved': 'Consentimiento guardado',
  'account.deleteWarn': 'Zona de riesgo',
  'account.deleteHelp': 'Borrar tu cuenta elimina tu perfil, notas y consentimiento de forma permanente.',
  'account.delete': 'Borrar mi cuenta',
  'account.deleteConfirm': '¿Seguro? Esta acción no se puede deshacer.',
  'account.mockLink': 'Vinculación simulada (demo sin credenciales RSO):',
  'account.mockHelp':
    'Mientras la solicitud de production key está en revisión, la vinculación usa un proveedor de demostración con la cuenta del entorno.',
  'account.passwordTitle': 'Contraseña',
  'account.currentPassword': 'Contraseña actual',
  'account.newPassword': 'Nueva contraseña',
  'account.changePassword': 'Cambiar contraseña',
  'account.passwordChanged': 'Contraseña cambiada. Inicia sesión de nuevo.',
  'account.consentRequired': 'Acepta el consentimiento para guardar.',
  'account.linkError': 'No se pudo vincular la cuenta',
  'account.unlinkHelp': 'Al desvincular, tu perfil deja de ser visible para terceros al instante.',

  'legal.terms': 'Términos de servicio',
  'legal.privacy': 'Política de privacidad',
  'legal.backHome': 'Volver al inicio',
  'legal.updated': 'Última actualización: septiembre de 2026',

  'nav.ranked': 'Ranked',
  'nav.team': 'Equipo',
  'nav.rules': 'Reglas',
  'nav.profile': 'Perfil',
  'nav.refresh': 'Actualizar',
  'nav.demo': 'DEMO',
};

const en: typeof es = {
  'lang.name': 'English',
  'lang.other': 'Español',

  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.error': 'Something went wrong',

  'landing.badge': 'Beta · Production API application in progress',
  'landing.title': 'ValoIA',
  'landing.subtitle':
    'Your VALORANT performance, analyzed with official Riot data: match history, agents, maps, session rules and consent-based comparisons.',
  'landing.cta': 'Create account',
  'landing.ctaLogin': 'Sign in',
  'landing.demo': 'View demo (sample data)',
  'landing.f1.title': 'Official stats',
  'landing.f1.body': 'Matches, K/D/A, ACS, ADR and HS% from Riot’s official API (VAL-MATCH-V1).',
  'landing.f2.title': 'Session analysis',
  'landing.f2.body': 'Session rules, stop-loss cuts, agent pool per map and win/loss record without spreadsheets.',
  'landing.f3.title': 'Consent-based comparisons',
  'landing.f3.body':
    'You can only see another player’s profile if they link their Riot account and explicitly enable a public profile.',
  'landing.f4.title': 'You control your data',
  'landing.f4.body': 'One-click link and revoke, consent audit trail and account deletion.',
  'landing.optin':
    'ValoIA requires every player to link their Riot account (Riot Sign-On) and give consent to share their data. Without opt-in, their profile is never shown to third parties.',
  'landing.notAffiliated': 'ValoIA is not affiliated with or endorsed by Riot Games. VALORANT is a trademark of Riot Games, Inc.',

  'auth.login': 'Sign in',
  'auth.register': 'Create account',
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.password2': 'Repeat password',
  'auth.submitLogin': 'Sign in',
  'auth.submitRegister': 'Create account',
  'auth.haveAccount': 'Already have an account? Sign in',
  'auth.noAccount': 'No account yet? Sign up',
  'auth.err.mismatch': 'Passwords do not match',
  'auth.err.invalid': 'Invalid credentials',
  'auth.err.generic': 'Could not complete the operation',
  'auth.logout': 'Sign out',
  'auth.menu.profile': 'My account',
  'auth.admin': 'Admin',

  'account.title': 'My account',
  'account.riotLink': 'Riot account',
  'account.linked': 'Linked',
  'account.notLinked': 'Not linked',
  'account.link': 'Connect with Riot',
  'account.unlink': 'Unlink',
  'account.linkHelp':
    'Linking uses Riot Sign-On: ValoIA never sees your Riot password. If you unlink, your profile stops being shown.',
  'account.consentTitle': 'Data consent',
  'account.consentBody':
    'Showing your stats requires your explicit consent. If you also enable the public profile, other verified players can see your stats in comparisons.',
  'account.consentAccept': 'I agree to the processing of my data under the Privacy Policy',
  'account.publicProfile': 'Make my profile public (visible to other users)',
  'account.consentSave': 'Save consent',
  'account.consentSaved': 'Consent saved',
  'account.deleteWarn': 'Danger zone',
  'account.deleteHelp': 'Deleting your account permanently removes your profile, notes and consent records.',
  'account.delete': 'Delete my account',
  'account.deleteConfirm': 'Are you sure? This cannot be undone.',
  'account.mockLink': 'Simulated link (demo without RSO credentials):',
  'account.mockHelp':
    'While the production key application is under review, linking uses a demo provider with the account configured in the environment.',
  'account.passwordTitle': 'Password',
  'account.currentPassword': 'Current password',
  'account.newPassword': 'New password',
  'account.changePassword': 'Change password',
  'account.passwordChanged': 'Password changed. Please sign in again.',
  'account.consentRequired': 'Accept the consent to save.',
  'account.linkError': 'Could not link the account',
  'account.unlinkHelp': 'After unlinking, your profile is no longer visible to third parties.',

  'legal.terms': 'Terms of Service',
  'legal.privacy': 'Privacy Policy',
  'legal.backHome': 'Back to home',
  'legal.updated': 'Last updated: September 2026',

  'nav.ranked': 'Ranked',
  'nav.team': 'Team',
  'nav.rules': 'Rules',
  'nav.profile': 'Profile',
  'nav.refresh': 'Refresh',
  'nav.demo': 'DEMO',
};

export const DICTS: Record<Locale, typeof es> = { es, en };

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[locale] ?? es;
  let text = (dict as Record<string, string>)[key] ?? (es as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  }
  return text;
}
