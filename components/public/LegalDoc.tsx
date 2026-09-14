'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { LocaleSwitch, useLocale, useT } from '@/lib/i18n/useLocale';

/** Buzón de contacto legal del titular. */
export const CONTACT_EMAIL = 'brayan12r@gmail.com';

/**
 * Documentos legales bilingües (Términos y Privacidad).
 *
 * Alineados con los estándares de la industria (OP.GG, Blitz, Tracker Network):
 * identificación del responsable, categorías de datos y retención por tipo,
 * bases jurídicas GDPR, cookies necesarias, transferencias internacionales,
 * derechos GDPR/CCPA, edad mínima, uso aceptable (sin scraping), propiedad
 * intelectual, limitación de responsabilidad y resolución de disputas.
 *
 * NOTA: el contacto legal vive en `CONTACT_EMAIL` (correo personal del
 * titular); revisar con un profesional antes de publicar.
 */
export function LegalDoc({ kind }: { kind: 'terms' | 'privacy' }) {
  const t = useT();
  const [locale] = useLocale();
  const title = kind === 'terms' ? t('legal.terms') : t('legal.privacy');
  return (
    <div className="wrap legal-doc" style={{ maxWidth: 880, margin: '0 auto' }}>
      <header className="legal-head">
        <Link href="/" className="legal-head-brand" aria-label={t('legal.backHome')}>
          <b>
            Valo<em style={{ color: '#ff4655', fontStyle: 'normal' }}>IA</em>
          </b>
        </Link>
        <span className="legal-head-title">{title}</span>
        <LocaleSwitch />
      </header>

      <div className="panel" style={{ padding: 24, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p className="window-info">{t('legal.updated')}</p>
        {locale === 'es' ? <EsText kind={kind} /> : <EnText kind={kind} />}
        <p className="window-info" style={{ marginTop: 20 }}>
          {t('landing.notAffiliated')}
        </p>
        <p style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="f-chip" href="/" style={{ textDecoration: 'none' }}>
            {t('legal.backHome')}
          </Link>
          <Link className="f-chip" href={kind === 'terms' ? '/privacy' : '/terms'} style={{ textDecoration: 'none' }}>
            {kind === 'terms' ? t('legal.privacy') : t('legal.terms')}
          </Link>
        </p>
      </div>

      <ScrollTop label={t('legal.backHome')} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      <div className="window-info" style={{ display: 'block', lineHeight: 1.65 }}>
        {children}
      </div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="table-scroll legal-table" style={{ marginTop: 6 }}>
      <table className="score-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} data-label={head[j]}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- ESPAÑOL

function EsText({ kind }: { kind: 'terms' | 'privacy' }) {
  if (kind === 'privacy') return <EsPrivacy />;
  return <EsTerms />;
}

function EsPrivacy() {
  return (
    <>
      <Section title="1. Responsable del tratamiento">
        ValoIA («el Servicio») es un proyecto independiente con domicilio en Bogotá, Colombia. Contacto de privacidad:{' '}
        <b>{CONTACT_EMAIL}</b>.
      </Section>
      <Section title="2. Ámbito y aceptación">
        Esta Política describe cómo recopilamos, usamos, compartimos y protegemos los datos personales de los usuarios de
        ValoIA, y forma parte de los Términos de servicio. Al usar el Servicio, reconoces haber leído esta Política. No se
        aplica a servicios de terceros que no operamos (por ejemplo, Riot Games o sitios enlazados).
      </Section>
      <Section title="3. Datos que tratamos">
        <ul>
          <li>
            <b>Cuenta:</b> nombre de usuario, hash de contraseña (scrypt con sal; nunca almacenamos tu contraseña),
            fechas de alta y de último cambio.
          </li>
          <li>
            <b>Vinculación con Riot (Riot Sign-On):</b> nombre de Riot, tag y PUUID, y la fecha de vinculación. ValoIA
            nunca ve ni almacena tu contraseña de Riot.
          </li>
          <li>
            <b>Datos de juego:</b> partidas competitivas, agentes, mapas, estadísticas y demás datos que la API oficial
            de Riot entrega para las cuentas vinculadas.
          </li>
          <li>
            <b>Contenido del usuario:</b> notas por partida y ajustes del perfil (rol, preferencias, reglas de sesión).
          </li>
          <li>
            <b>Consentimiento y auditoría:</b> fecha, versión de esta Política y dirección IP del opt-in/opt-out, para
            poder demostrar tu consentimiento y su revocación.
          </li>
          <li>
            <b>Datos técnicos y de seguridad:</b> dirección IP, agente de usuario, fechas de acceso y registros de
            sesiones (dispositivo, última actividad) generados al autenticarte.
          </li>
          <li>
            <b>Cookies necesarias:</b> cookie de sesión (autenticación) y cookie de idioma (preferencia). No usamos
            cookies publicitarias ni de análisis de terceros.
          </li>
        </ul>
        <p>
          <b>No recopilamos:</b> datos de pago (el Servicio es gratuito), geolocalización precisa, datos biométricos,
          datos de salud, información racial o étnica, ni datos de menores de 13 años de forma consciente.
        </p>
      </Section>
      <Section title="4. Finalidad y bases jurídicas">
        {/*
          Bases del art. 6 RGPD: (a) consentimiento, (b) contrato, (c) obligación legal, (f) interés legítimo.
        */}
        <Table
          head={['Finalidad', 'Datos usados', 'Base jurídica (RGPD art. 6)']}
          rows={[
            ['Crear y administrar tu cuenta y prestarte el Servicio', 'Cuenta, datos técnicos', 'Contrato (6.1.b)'],
            ['Mostrarte tus propias estadísticas de VALORANT', 'Datos de juego, vinculación Riot', 'Contrato (6.1.b)'],
            [
              'Mostrar tu perfil a otros usuarios (solo si activas el perfil público)',
              'Riot ID, datos de juego',
              'Consentimiento explícito (6.1.a)',
            ],
            [
              'Seguridad, prevención de abuso y límites de peticiones',
              'IP, agente de usuario, registros de sesión',
              'Interés legítimo (6.1.f) y obligación legal (6.1.c)',
            ],
            [
              'Auditoría de consentimiento (demostrar opt-in y revocación)',
              'Registro de consentimiento',
              'Obligación legal / defensa jurídica (6.1.c y 6.1.f)',
            ],
            ['Comunicaciones operativas sobre el Servicio', 'Cuenta', 'Contrato (6.1.b)'],
          ]}
        />
        <p style={{ marginTop: 8 }}>
          <b>No usamos tus datos para publicidad</b>, perfilado comercial ni para entrenar modelos de terceros. No
          vendemos ni alquilamos datos personales.
        </p>
      </Section>
      <Section title="5. Visibilidad y opt-in">
        Tu perfil es <b>privado por defecto</b>. Solo si vinculas tu cuenta de Riot y activas el perfil público daremos
        acceso a tus estadísticas a otros usuarios registrados. Puedes desactivarlo o desvincular tu cuenta en un clic:
        la visibilidad cesa de inmediato y queda registrada la revocación.
      </Section>
      <Section title="6. Conservación de datos">
        <Table
          head={['Categoría', 'Plazo', 'Fundamento']}
          rows={[
            ['Datos de cuenta y perfil', 'Mientras la cuenta esté activa; se eliminan al borrarla', 'Contrato y solicitud del usuario'],
            ['Registros de sesión y seguridad', '1 año', 'Seguridad y prevención de abuso'],
            ['Registro de consentimiento (auditoría)', '3 años desde la última acción', 'Demostrar cumplimiento'],
            ['Registros de partidas (datos de juego)', 'Mientras el Servicio mantenga el histórico; sin asociación a tu cuenta tras la baja', 'Interés legítimo / estadísticas'],
          ]}
        />
        <p style={{ marginTop: 8 }}>
          Al borrar tu cuenta eliminamos tu perfil, notas, suscripciones de notificaciones y el vínculo con Riot. Los
          registros de partidas son datos de juego desasociados de tu cuenta de la app; puedes solicitar su eliminación
          escribiendo al contacto indicado.
        </p>
      </Section>
      <Section title="7. Destinatarios y terceros">
        No vendemos ni cedemos tus datos personales. Los compartimos únicamente con:
        <ul>
          <li>
            <b>Riot Games:</b> mediante su API oficial y Riot Sign-On, conforme a sus propias políticas.
          </li>
          <li>
            <b>Proveedores de infraestructura:</b> alojamiento del sitio y bases de datos, sujetos a confidencialidad.
          </li>
          <li>
            <b>Proveedores de assets:</b> valorant-api.com para iconos de agentes, mapas y armas (sin datos personales).
          </li>
          <li>
            <b>Autoridades:</b> cuando exista obligación legal o requerimiento válido.
          </li>
          <li>
            <b>Operaciones corporativas:</b> en caso de fusión, adquisición o venta de activos, con las salvaguardas
            aplicables.
          </li>
        </ul>
        Otros usuarios solo ven lo que decidas publicar conforme al apartado 5.
      </Section>
      <Section title="8. Cookies y tecnologías similares">
        Usamos únicamente cookies <b>necesarias</b>:
        <ul>
          <li><b>Sesión:</b> identificar tu sesión autenticada (httpOnly, SameSite=Lax, Secure bajo HTTPS).</li>
          <li><b>Preferencia:</b> recordar el idioma (ES/EN).</li>
          <li><b>Seguridad:</b> aplicar límites y proteger la cuenta.</li>
        </ul>
        No usamos cookies publicitarias, píxeles ni analítica de terceros. Puedes bloquear o eliminar cookies desde tu
        navegador, pero si desactivas las necesarias el Servicio no funcionará. No respondemos a señales «Do Not Track»
        por falta de estándar, pero al no vender ni compartir datos con fines publicitarios, respetamos mecanismos de
        opt-out universal (p. ej. Global Privacy Control, sin efecto práctico adicional).
      </Section>
      <Section title="9. Transferencias internacionales">
        Tus datos pueden almacenarse en servidores ubicados fuera de tu país (por ejemplo, en la infraestructura de
        alojamiento) y se consultan con la API de Riot Games en Estados Unidos. Aplicamos medidas contractuales y
        técnicas razonables para protegerlos conforme a esta Política.
      </Section>
      <Section title="10. Seguridad">
        Aplicamos medidas técnicas y organizativas razonables: HTTPS/TLS en tránsito, contraseñas con scrypt y sal,
        sesiones firmadas (HMAC) revocables, control de acceso a los datos y límites de peticiones. Ningún sistema es
        completamente seguro; si detectamos una brecha que afecte tus derechos, notificaremos a los usuarios afectados
        y a las autoridades cuando corresponda.
      </Section>
      <Section title="11. Tus derechos">
        Dependiendo de tu jurisdicción, puedes ejercer los derechos de:
        <ul>
          <li>Acceso, rectificación y supresión de tus datos.</li>
          <li>Limitación y oposición al tratamiento.</li>
          <li>Portabilidad de los datos que nos diste.</li>
          <li>Retirar tu consentimiento en cualquier momento (desde «Mi cuenta» o por correo).</li>
          <li>No ser discriminado por ejercer estos derechos.</li>
          <li>Reclamar ante la autoridad de protección de datos de tu país.</li>
        </ul>
        Ejerce la mayoría de derechos directamente desde <b>Mi cuenta</b> (desvincular, desactivar perfil público, borrar
        cuenta). Para otras solicitudes escribe a <b>{CONTACT_EMAIL}</b>; responderemos en un máximo de 30 días y
        podremos verificar tu identidad antes de actuar. California (CCPA/CPRA): no vendemos datos personales; puedes
        solicitar saber, corregir, borrar y limitar el uso de datos sensibles. EEE/Reino Unido (RGPD): puedes reclamar
        ante tu autoridad local.
      </Section>
      <Section title="12. Menores">
        El Servicio no está dirigido a menores de 13 años y no recopilamos conscientemente sus datos. Si eres menor de
        edad pero cumples la edad mínima de tu país, necesitas la autorización de tu padre, madre o tutor para usar
        Riot y, por tanto, este Servicio. Si detectamos datos de un menor de 13 años, los eliminaremos y cerraremos la
        cuenta.
      </Section>
      <Section title="13. Decisiones automatizadas">
        No tomamos decisiones automatizadas que produzcan efectos jurídicos o significativos sobre ti en el sentido del
        art. 22 RGPD. Las métricas del Servicio son informativas y no constituyen asesoramiento.
      </Section>
      <Section title="14. Cambios y contacto">
        Publicaremos cualquier cambio en esta página con su fecha de actualización. Para cambios materiales avisaremos
        con al menos 30 días de antelación cuando la ley lo exija. Contacto: <b>{CONTACT_EMAIL}</b>.
      </Section>
    </>
  );
}

function EsTerms() {
  return (
    <>
      <Section title="1. Aceptación y ámbito">
        Estos Términos regulan el acceso y uso de ValoIA (el «Servicio»), proyecto independiente con domicilio en
        Bogotá, Colombia. Al registrarte o usar el Servicio aceptas estos Términos y la Política de privacidad, que
        forma parte integrante de este acuerdo. Si no estás de acuerdo, no uses el Servicio.
      </Section>
      <Section title="2. Descripción del Servicio">
        ValoIA permite a jugadores de VALORANT vincular su cuenta de Riot para analizar su rendimiento competitivo
        (historial, estadísticas, reglas de sesión) y comparar con otros jugadores que hayan consentido publicar su
        perfil. Los datos de juego provienen de la API oficial de Riot y pueden contener errores, retrasos o
        incompletitudes.
      </Section>
      <Section title="3. Elegibilidad y cuenta">
        <ul>
          <li>Debes tener al menos 13 años (o más si tu país exige otra edad) y capacidad legal; si eres menor, cuentas con autorización de tu tutor.</li>
          <li>Debes proporcionar información veraz y mantenerla actualizada. Tu cuenta es personal y no transferible.</li>
          <li>Eres responsable de la confidencialidad de tu contraseña y de toda actividad en tu cuenta; notifícanos de inmediato cualquier uso no autorizado.</li>
          <li>No puedes crear cuentas para suplantar a otra persona ni mantener múltiples cuentas para eludir límites.</li>
        </ul>
      </Section>
      <Section title="4. Uso aceptable">
        No está permitido:
        <ul>
          <li>Usar el Servicio con fines ilícitos, para acosar, desanonimizar o perjudicar a otras personas.</li>
          <li>Acceder mediante scraping, rastreadores, robots u otro medio automatizado distinto de las interfaces publicadas.</li>
          <li>Eludir, desactivar o burlar el modelo de consentimiento/opt-in o intentar acceder a perfiles privados.</li>
          <li>Reutilizar, revender o redistribuir datos de otros jugadores.</li>
          <li>Interferir con el Servicio, sondear su seguridad, introducir malware o generar cargas desproporcionadas.</li>
          <li>Aplicar ingeniería inversa o copiar el software y diseño, salvo lo permitido por ley.</li>
          <li>Usar cuentas de Riot que no te pertenezcan (la vinculación se realiza vía Riot Sign-On).</li>
          <li>Vulnerar las políticas de Riot Games o de cualquier tercero aplicable.</li>
        </ul>
      </Section>
      <Section title="5. Vinculación con Riot y datos de terceros">
        La vinculación usa Riot Sign-On: nunca pedimos tu contraseña de Riot. Tus estadísticas son tuyas; las de otros
        jugadores solo se muestran si su titular ha vinculado su cuenta y activado el perfil público. Si revocas el
        consentimiento, tu perfil deja de ser visible de inmediato. ValoIA no está afiliado ni patrocinado por Riot
        Games; VALORANT y sus marcas pertenecen a Riot Games, Inc.
      </Section>
      <Section title="6. Contenido del usuario">
        Las notas y ajustes que creas siguen siendo tuyos. Nos concedes una licencia limitada para almacenarlos y
        mostrarlos con el único fin de operar el Servicio. Eres responsable del contenido que publicas y no debes
        incluir datos personales de terceros sin su consentimiento. Podemos retirar contenido que vulnere estos Términos
        o la ley.
      </Section>
      <Section title="7. Propiedad intelectual">
        El software, el diseño y el contenido propio de ValoIA están protegidos por la propiedad intelectual. Te
        concedemos una licencia limitada, personal y no transferible para usar el Servicio. Los assets de agentes,
        mapas y armas pertenecen a Riot Games; su uso es el permitido por la política de Riot. Las marcas de terceros
        pertenecen a sus titulares y no implican patrocinio.
      </Section>
      <Section title="8. Reclamaciones por derechos de autor">
        Si crees que un contenido infringe tus derechos de autor, envía una descripción del contenido, su ubicación,
        tus datos de contacto y una declaración de buena fe a <b>{CONTACT_EMAIL}</b>. Retiraremos o deshabilitaremos
        el material cuando corresponda.
      </Section>
      <Section title="9. Disponibilidad y cambios del Servicio">
        El Servicio se ofrece «tal cual» y «según disponibilidad», sin garantía de disponibilidad, exactitud o
        idoneidad. Podemos modificar, suspender o discontinuar el Servicio (total o parcialmente) en cualquier momento,
        con o sin aviso, así como actualizar los requisitos técnicos y el alcance de las funciones.
      </Section>
      <Section title="10. Descargos y limitación de responsabilidad">
        En la medida permitida por la ley, ValoIA no será responsable de daños indirectos, incidentales, especiales,
        consecuenciales ni por lucro cesante, ni de la pérdida de datos derivada de causas fuera de su control
        razonable. La responsabilidad total agregada por cualquier reclamación se limitará al mayor de (i) el importe
        que hayas pagado por el Servicio en los 3 meses anteriores (el Servicio es gratuito, por lo que puede ser cero)
        o (ii) USD 100. Se aplican las limitaciones que tu ley imperativa no permita excluir.
      </Section>
      <Section title="11. Indemnización">
        Aceptas defender e indemnizar a ValoIA frente a reclamaciones de terceros derivadas de tu uso indebido del
        Servicio, del contenido que publiques o del incumplimiento de estos Términos o de derechos de terceros.
      </Section>
      <Section title="12. Terminación">
        Podemos suspender o cerrar tu cuenta si incumples estos Términos, si lo exige la ley o para proteger el
        Servicio o a otros usuarios. Tú puedes cerrar tu cuenta en cualquier momento desde «Mi cuenta», lo que elimina
        tus datos personales conforme a la Política de privacidad. Las cláusulas que por su naturaleza deban sobrevivir
        (propiedad intelectual, limitaciones, disputas) seguirán vigentes.
      </Section>
      <Section title="13. Servicios de terceros">
        El Servicio depende de servicios de terceros (API de Riot, alojamiento, assets). No controlamos ni respondemos
        por la disponibilidad, exactitud o políticas de esos terceros. Los enlaces externos se ofrecen solo por
        comodidad.
      </Section>
      <Section title="14. Cambios de los Términos">
        Podemos actualizar estos Términos publicando la nueva versión en esta página. Si el cambio es material,
        avisaremos con al menos 30 días de antelación cuando la ley lo exija. El uso continuado tras la entrada en
        vigor implica su aceptación.
      </Section>
      <Section title="15. Ley aplicable y disputas">
        Estos Términos se rigen por las leyes de Colombia. Antes de acudir a tribunales, ambas partes
        intentarán resolver la controversia de buena fe (soporte/contacto). Si no fuera posible, las partes se someten
        a los tribunales competentes que correspondan al consumidor, sin renunciar a los derechos que la ley imperativa
        de tu residencia te reconozca. Salvo que tu ley disponga otra cosa, cualquier reclamación deberá presentarse en
        el plazo de un (1) año desde su origen.
      </Section>
      <Section title="16. Varios">
        Estos Términos, junto con la Política de privacidad, constituyen el acuerdo completo. Si alguna cláusula fuera
        inválida, el resto seguirá vigente. La falta de ejercicio de un derecho no implica renuncia. No puedes ceder
        este acuerdo sin nuestro consentimiento. No se crea ninguna relación de agencia o sociedad. Contacto:{' '}
        <b>{CONTACT_EMAIL}</b>.
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- ENGLISH

function EnText({ kind }: { kind: 'terms' | 'privacy' }) {
  if (kind === 'privacy') return <EnPrivacy />;
  return <EnTerms />;
}

function EnPrivacy() {
  return (
    <>
      <Section title="1. Controller">
        ValoIA (the “Service”) is an independent project located in Bogotá, Colombia. Privacy contact:{' '}
        <b>{CONTACT_EMAIL}</b>.
      </Section>
      <Section title="2. Scope and acceptance">
        This Policy describes how we collect, use, share and protect personal data of ValoIA users, and forms part of
        our Terms of Service. By using the Service you acknowledge that you have read this Policy. It does not apply to
        third-party services we do not operate (e.g., Riot Games or linked sites).
      </Section>
      <Section title="3. Data we process">
        <ul>
          <li>
            <b>Account:</b> username, hashed password (scrypt with salt; we never store your password) and account
            timestamps.
          </li>
          <li>
            <b>Riot link (Riot Sign-On):</b> Riot name, tag, PUUID and link date. ValoIA never sees or stores your Riot
            password.
          </li>
          <li>
            <b>Game data:</b> competitive matches, agents, maps, statistics and other data Riot’s official API provides
            for linked accounts.
          </li>
          <li>
            <b>User content:</b> per-match notes and profile settings (role, preferences, session rules).
          </li>
          <li>
            <b>Consent and audit:</b> timestamp, policy version and IP address of opt-in/opt-out, to evidence consent
            and revocation.
          </li>
          <li>
            <b>Technical and security data:</b> IP address, user agent, access times and session records (device, last
            activity) generated when you sign in.
          </li>
          <li>
            <b>Strictly necessary cookies:</b> session cookie (authentication) and locale cookie (preference). We do not
            use advertising or third-party analytics cookies.
          </li>
        </ul>
        <p>
          <b>We do not collect:</b> payment data (the Service is free), precise geolocation, biometric data, health
          data, racial or ethnic information, or data from children under 13 knowingly.
        </p>
      </Section>
      <Section title="4. Purposes and legal bases">
        {/* GDPR Art. 6 bases: (a) consent, (b) contract, (c) legal obligation, (f) legitimate interest. */}
        <Table
          head={['Purpose', 'Data used', 'Legal basis (GDPR Art. 6)']}
          rows={[
            ['Create and manage your account and provide the Service', 'Account, technical data', 'Contract (6(1)(b))'],
            ['Show you your own VALORANT stats', 'Game data, Riot link', 'Contract (6(1)(b))'],
            [
              'Show your profile to other users (only if you enable the public profile)',
              'Riot ID, game data',
              'Explicit consent (6(1)(a))',
            ],
            ['Security, abuse prevention and rate limiting', 'IP, user agent, session logs', 'Legitimate interest (6(1)(f)) and legal obligation (6(1)(c))'],
            ['Consent audit (evidencing opt-in and revocation)', 'Consent records', 'Legal obligation / legal claims (6(1)(c), 6(1)(f))'],
            ['Operational communications about the Service', 'Account', 'Contract (6(1)(b))'],
          ]}
        />
        <p style={{ marginTop: 8 }}>
          <b>We do not use your data for advertising</b>, commercial profiling or training third-party models. We do
          not sell or rent personal data.
        </p>
      </Section>
      <Section title="5. Visibility and opt-in">
        Your profile is <b>private by default</b>. Only if you link your Riot account and enable the public profile will
        other registered users see your stats. You can disable it or unlink your account with one click: visibility
        stops immediately and the revocation is logged.
      </Section>
      <Section title="6. Data retention">
        <Table
          head={['Category', 'Retention', 'Basis']}
          rows={[
            ['Account and profile data', 'While the account is active; deleted when you delete it', 'Contract and user request'],
            ['Session and security logs', '1 year', 'Security and abuse prevention'],
            ['Consent audit records', '3 years from the last action', 'Demonstrating compliance'],
            ['Match records (game data)', 'While the Service keeps the history; not associated with your app account after deletion', 'Legitimate interest / statistics'],
          ]}
        />
        <p style={{ marginTop: 8 }}>
          Deleting your account removes your profile, notes, push subscriptions and Riot link. Match records are game
          data detached from your app account; you may request their deletion by contacting us.
        </p>
      </Section>
      <Section title="7. Recipients and third parties">
        We do not sell or transfer your personal data. We share it only with:
        <ul>
          <li>
            <b>Riot Games:</b> through its official API and Riot Sign-On, under its own policies.
          </li>
          <li>
            <b>Infrastructure providers:</b> site hosting and databases, bound by confidentiality.
          </li>
          <li>
            <b>Asset providers:</b> valorant-api.com for agent, map and weapon icons (no personal data).
          </li>
          <li>
            <b>Authorities:</b> where legally required or under a valid request.
          </li>
          <li>
            <b>Corporate transactions:</b> in a merger, acquisition or asset sale, with applicable safeguards.
          </li>
        </ul>
        Other users only see what you choose to publish under section 5.
      </Section>
      <Section title="8. Cookies and similar technologies">
        We use only <b>strictly necessary</b> cookies:
        <ul>
          <li><b>Session:</b> identify your authenticated session (httpOnly, SameSite=Lax, Secure over HTTPS).</li>
          <li><b>Preference:</b> remember your language (ES/EN).</li>
          <li><b>Security:</b> enforce limits and protect the account.</li>
        </ul>
        We do not use advertising cookies, pixels or third-party analytics. You can block or delete cookies in your
        browser, but disabling the necessary ones will break the Service. We do not respond to “Do Not Track” signals
        due to the lack of an industry standard; since we never sell or share data for advertising, we honor universal
        opt-out mechanisms (e.g., Global Privacy Control) with no practical additional effect.
      </Section>
      <Section title="9. International transfers">
        Your data may be stored on servers outside your country (for example, our hosting infrastructure) and is
        queried from Riot Games’ API in the United States. We apply reasonable contractual and technical safeguards to
        protect it under this Policy.
      </Section>
      <Section title="10. Security">
        We apply reasonable technical and organizational measures: HTTPS/TLS in transit, scrypt-hashed passwords with
        salt, signed revocable sessions (HMAC), access controls and rate limiting. No system is completely secure; if
        we become aware of a breach affecting your rights, we will notify affected users and regulators where
        required.
      </Section>
      <Section title="11. Your rights">
        Depending on your jurisdiction, you may exercise:
        <ul>
          <li>Access, rectification and erasure of your data.</li>
          <li>Restriction of and objection to processing.</li>
          <li>Portability of the data you provided.</li>
          <li>Withdrawal of consent at any time (from “My account” or by email).</li>
          <li>Non-discrimination for exercising these rights.</li>
          <li>Complaint to your local data protection authority.</li>
        </ul>
        Exercise most rights directly from <b>My account</b> (unlink, disable public profile, delete account). For other
        requests email <b>{CONTACT_EMAIL}</b>; we respond within 30 days and may verify your identity first.
        California (CCPA/CPRA): we do not sell personal data; you may request to know, correct, delete and limit the use
        of sensitive data. EEA/UK (GDPR): you may lodge a complaint with your local authority.
      </Section>
      <Section title="12. Children">
        The Service is not directed to children under 13 and we do not knowingly collect their data. If you are a minor
        above the minimum age in your country, you need your parent’s or guardian’s authorization to use Riot and,
        therefore, this Service. If we detect data from a child under 13, we will delete it and close the account.
      </Section>
      <Section title="13. Automated decisions">
        We do not make solely automated decisions producing legal or similarly significant effects within the meaning of
        GDPR Art. 22. Service metrics are informational and do not constitute advice.
      </Section>
      <Section title="14. Changes and contact">
        We will publish any changes on this page with its update date. For material changes we will provide at least 30
        days’ notice where required by law. Contact: <b>{CONTACT_EMAIL}</b>.
      </Section>
    </>
  );
}

function EnTerms() {
  return (
    <>
      <Section title="1. Acceptance and scope">
        These Terms govern access to and use of ValoIA (the “Service”), an independent project located in Bogotá,
        Colombia. By registering or using the Service you accept these Terms and the Privacy Policy, which forms an
        integral part of this agreement. If you do not agree, do not use the Service.
      </Section>
      <Section title="2. Service description">
        ValoIA lets VALORANT players link their Riot account to analyze competitive performance (history, statistics,
        session rules) and compare with other players who consented to publish their profile. Game data comes from
        Riot’s official API and may contain errors, delays or gaps.
      </Section>
      <Section title="3. Eligibility and account">
        <ul>
          <li>You must be at least 13 (or older if your country requires it) and legally capable; minors need guardian authorization.</li>
          <li>You must provide accurate information and keep it updated. Your account is personal and non-transferable.</li>
          <li>You are responsible for your password and all activity under your account; notify us immediately of unauthorized use.</li>
          <li>You may not impersonate others or maintain multiple accounts to bypass limits.</li>
        </ul>
      </Section>
      <Section title="4. Acceptable use">
        You may not:
        <ul>
          <li>Use the Service unlawfully, to harass, de-anonymize or harm others.</li>
          <li>Access it via scraping, crawlers, bots or any automated means other than our published interfaces.</li>
          <li>Bypass, disable or circumvent the consent/opt-in model or attempt to access private profiles.</li>
          <li>Reuse, resell or redistribute other players’ data.</li>
          <li>Interfere with the Service, probe its security, introduce malware or create disproportionate load.</li>
          <li>Reverse engineer or copy the software and design, except as permitted by law.</li>
          <li>Use Riot accounts that do not belong to you (linking is done via Riot Sign-On).</li>
          <li>Violate Riot Games’ policies or any applicable third-party terms.</li>
        </ul>
      </Section>
      <Section title="5. Riot linking and third-party data">
        Linking uses Riot Sign-On: we never ask for your Riot password. Your stats are yours; other players’ stats are
        only shown when they have linked their account and enabled the public profile. If you revoke consent, your
        profile stops being visible immediately. ValoIA is not affiliated with or endorsed by Riot Games; VALORANT and
        its trademarks belong to Riot Games, Inc.
      </Section>
      <Section title="6. User content">
        Notes and settings you create remain yours. You grant us a limited license to store and display them solely to
        operate the Service. You are responsible for what you publish and must not include third-party personal data
        without their consent. We may remove content that violates these Terms or the law.
      </Section>
      <Section title="7. Intellectual property">
        ValoIA’s software, design and own content are protected by intellectual property laws. We grant you a limited,
        personal, non-transferable license to use the Service. Agent, map and weapon assets belong to Riot Games and are
        used as permitted by Riot policy. Third-party trademarks belong to their owners and do not imply endorsement.
      </Section>
      <Section title="8. Copyright complaints">
        If you believe content infringes your copyright, send a description of the content, its location, your contact
        details and a good-faith statement to <b>{CONTACT_EMAIL}</b>. We will remove or disable the material where
        appropriate.
      </Section>
      <Section title="9. Availability and changes">
        The Service is provided “as is” and “as available”, without warranty of availability, accuracy or fitness. We
        may modify, suspend or discontinue the Service (in whole or in part) at any time, with or without notice, and
        update technical requirements and feature scope.
      </Section>
      <Section title="10. Disclaimers and limitation of liability">
        To the extent permitted by law, ValoIA is not liable for indirect, incidental, special or consequential damages
        or lost profits, nor for data loss caused by events beyond its reasonable control. Total aggregate liability
        for any claim is limited to the greater of (i) the amount you paid for the Service in the prior 3 months (the
        Service is free, so this may be zero) or (ii) USD 100. Limitations that your mandatory law does not allow to be
        excluded will not apply.
      </Section>
      <Section title="11. Indemnification">
        You agree to defend and indemnify ValoIA against third-party claims arising from your misuse of the Service,
        content you publish, or your breach of these Terms or third-party rights.
      </Section>
      <Section title="12. Termination">
        We may suspend or close your account if you breach these Terms, if required by law, or to protect the Service
        or other users. You may close your account at any time from “My account”, which deletes your personal data as
        described in the Privacy Policy. Provisions that by nature should survive (intellectual property, limitations,
        disputes) will survive.
      </Section>
      <Section title="13. Third-party services">
        The Service relies on third-party services (Riot API, hosting, assets). We do not control and are not
        responsible for their availability, accuracy or policies. External links are provided for convenience only.
      </Section>
      <Section title="14. Changes to the Terms">
        We may update these Terms by posting the new version on this page. For material changes we will provide at least
        30 days’ notice where required by law. Continued use after the effective date means acceptance.
      </Section>
      <Section title="15. Governing law and disputes">
        These Terms are governed by the laws of Colombia. Before going to court, both parties will
        attempt to resolve the dispute in good faith (support/contact). If that fails, the parties submit to the
        competent courts applicable to consumers, without waiving mandatory rights of your residence. Unless your law
        provides otherwise, any claim must be filed within one (1) year of arising.
      </Section>
      <Section title="16. Miscellaneous">
        These Terms, together with the Privacy Policy, constitute the entire agreement. If any provision is invalid,
        the rest remains in force. Failure to enforce a right is not a waiver. You may not assign this agreement
        without our consent. No agency or partnership is created. Contact: <b>{CONTACT_EMAIL}</b>.
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Scroll

/** true cuando la página superó el umbral de scroll (sin setState en efectos). */
function useScrolled(threshold = 480): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('scroll', cb, { passive: true });
      window.addEventListener('resize', cb);
      return () => {
        window.removeEventListener('scroll', cb);
        window.removeEventListener('resize', cb);
      };
    },
    () => window.scrollY > threshold,
    () => false,
  );
}

/** Botón flotante "volver arriba": solo en documentos legales largos. */
function ScrollTop({ label }: { label: string }) {
  const on = useScrolled();
  return (
    <button
      type="button"
      className={`legal-to-top${on ? ' on' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      ↑
    </button>
  );
}
