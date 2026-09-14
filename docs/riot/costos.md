# Costos y rentabilidad — ValoIA público

> **Etapa de solicitud (hasta la aprobación): COP 0.** El dominio que verá Riot
> es **`valoia.duckdns.org`** (ya existe y funciona, gratis); el dashboard
> personal se mueve a otro subdominio DuckDNS gratis. Sumado a Gmail y al VPS
> Oracle Always Free que ya tienes, la espera no cuesta nada. El plan de abajo
> (Hetzner CX23 + Porkbun) aplica a la **etapa de producción** opcional, cuando
> quieras separar el producto del dashboard personal y dar credibilidad. Al
> comprar, el desembolso es de una sola vez (~COP 49.500) y el recurrente
> ~COP 25.800/mes.

> Plan de producción: **Hetzner CX23 + dominio `valoia.app` en Porkbun (DNS en
> Porkbun) + Gmail del titular**. Análisis en **pesos colombianos (COP)**, precios
> verificados el **14 de septiembre de 2026**. Cambio usado: **USD 1 = COP 3.150**
> y **EUR 1 = COP 3.650** (TRM reciente: 3.110–3.165; rango 52 semanas:
> 3.035–3.985). Verifica IVA/impuestos en el checkout de cada proveedor.

---

## 1. Resumen: cuánto pagar y cuándo

| Momento | Concepto | COP |
|---|---|---|
| **Ya (mes 1)** | Dominio `valoia.app` año 1 (Porkbun, promo $8,75) | **27.600** |
| **Ya (mes 1)** | Primer mes de Hetzner CX23 (€5,99) | **21.900** |
| **Total desembolso inicial** | Dominio + primer mes de VPS | **~49.500** |
| Recurrente | Hetzner CX23, cada mes | **21.900/mes** |
| Recurrente | Renovación del dominio (a partir del año 2) | 47.000/año (3.920/mes) |
| **Costo total** | Año 1 | **~290.000** |
| **Costo total** | Año 2 en adelante | **~309.400/año · ~25.800/mes** |

Gmail, DNS de Porkbun, SSL (Let's Encrypt vía Caddy), WHOIS privacy, Riot API,
`riot.txt` y Web Push: **COP 0**.

---

## 2. Dominio y DNS — Porkbun

| Concepto | USD | COP |
|---|---|---|
| `valoia.app` **año 1** (promo) | $8,75 | **27.600** |
| `valoia.app` **renovación anual** | $14,93 | **47.000** (≈ 3.920/mes) |
| DNS gestionado en Porkbun (registro `A` → IP del VPS) | incluido | **0** |
| WHOIS privacy + SSL (Let's Encrypt) | incluido | 0 |

- DNS en **Porkbun** (no hace falta Cloudflare): un registro `A` apuntando al
  VPS y Caddy emite el certificado solo (HTTP-01).
- `.app` obliga HTTPS (HSTS preload de Google); ya lo tenemos con Caddy.
- Alternativa con renovación más barata: `.dev` ($12,87/año ≈ COP 40.500). Si
  se cambia, actualizar `CONTACT_EMAIL` y las URLs de la solicitud.

## 3. VPS — Hetzner CX23 (único plan)

| Especificación | Valor |
|---|---|
| vCPU / RAM / disco | 2 vCPU · 4 GB · 40 GB NVMe |
| Tráfico | 20 TB/mes |
| IPv4 | +€0,50/mes (incluido en el precio de abajo) |
| Precio | **€5,99/mes ≈ COP 21.900** · **COP 262.400/año** |
| Facturación | por hora con tope mensual (factura al cierre del mes) |
| Escalado | resize vertical a CX33 (4/8) o CX43 (8/16) sin migrar datos |

**Por qué alcanza:** la app es SSR ligero con caché L2 en disco; el techo real
es la **cuota de la API de Riot**, no la VM. Los datos viven en volúmenes
locales (JSON), así que se escala **verticalmente**; para varias instancias
habría que migrar a base de datos/Redis y añadir balanceador (no previsto a
corto plazo).

---

## 4. Monetización y retorno

### 4.1 Suscripción premium

- Precio sugerido: **COP 9.900/mes** (~USD 3,14) o **COP 79.000/año** (~USD 25).
- Comisión de cobro (~5% + COP 900): neto ≈ **COP 8.505/suscriptor/mes**.
- Requisito de Riot: mantener **plan gratis**; el premium vende funciones
  extra (análisis avanzado, exportes, sin anuncios), no los datos en sí.

**Punto de equilibrio:** 25.800 ÷ 8.505 ≈ 3,04 → **4 suscriptores** cubren todo
el costo (con 3 quedas a ~COP 300/mes del punto).

| Suscriptores | Ingreso neto/mes | Utilidad/mes* | Recupera la inversión inicial (COP 49.500) en |
|---|---|---|---|
| 1 | COP 8.500 | −17.300 | No cubre costos |
| 3 | COP 25.500 | −300 | No cubre del todo |
| **4** | COP 34.000 | **+8.200** | **~6 meses** |
| **10** | COP 85.100 | **+59.300** | **< 1 mes** |
| 25 | COP 212.600 | +186.800 | < 1 mes |
| 50 | COP 425.300 | +399.500 | < 1 mes |

\* Utilidad = ingreso neto − COP 25.800/mes (VPS + dominio amortizado).

**Utilidad anual (antes de impuestos, escenario Hetzner):**

| Suscriptores | Ingreso neto/año | Utilidad/año |
|---|---|---|
| 10 | COP 1.020.600 | **~COP 711.200** |
| 25 | COP 2.551.500 | ~COP 2.242.100 |
| 50 | COP 5.103.000 | ~COP 4.793.600 |

### 4.2 Publicidad (AdSense)

RPM realista gaming español/LATAM: **USD 0,30–2,00 por 1.000 páginas vistas**.

| Páginas vistas/mes | @ $0,50 | @ $1,00 | @ $2,00 |
|---|---|---|---|
| 10.000 | COP 15.750 | COP 31.500 | COP 63.000 |
| 50.000 | COP 78.750 | COP 157.500 | COP 315.000 |
| 100.000 | COP 157.500 | COP 315.000 | COP 630.000 |

**Vistas necesarias para cubrir el costo (COP 25.800/mes):**
~16.400 a $0,50 · ~8.200 a $1,00 · ~4.100 a $2,00.

### 4.3 Ejemplo combinado

10 suscriptores + 30.000 vistas/mes a $1 RPM:
- Suscripciones: **COP 85.050/mes**
- Ads: **COP 94.500/mes**
- Bruto: COP 179.550 − costo 25.800 = **~COP 153.750/mes de utilidad**
  (~COP 1,85 millones/año).

### 4.4 ¿Cuándo hay ROI?

El costo es tan bajo que el ROI **no depende del precio sino de la adopción**:

- Con **4 suscriptores** o **~8.200 vistas/mes** (@ $1 RPM) el negocio se
  sostiene solo; la inversión inicial (~COP 49.500) se recupera en ~6 meses con
  4 suscriptores y en menos de 1 mes con 10.
- Con **10 suscriptores** la utilidad anual ronda **COP 711.000**; con **50**,
  **COP 4,79 millones** (antes de impuestos).
- Objetivo realista: 2–6 meses para los primeros 4–10 usuarios premium si se
  promociona en comunidades/Discord de VALORANT; sin usuarios no hay ROI.
- Palanca principal: **suscripción** (los ads LATAM pagan poco); activar ads
  solo cuando el tráfico supere ~10.000 vistas/mes.

---

## 5. Notas fiscales y de política

- **Impuestos (Colombia):** los ingresos son renta; puede aplicar **IVA (19%)**
  a servicios digitales según régimen. Reserva **25–35%** de la utilidad y
  valida con un contador.
- **Comisiones:** cobrar en COP con pasarela local (Mercado Pago/Wompi)
  abarata frente a PayPal/Stripe internacional (~4–6% + fijo).
- **Riot:** se puede monetizar con **plan gratuito**, contenido transformativo,
  sin apuestas ni venta de datos de terceros. La publicidad está permitida.
- **Variables futuras:** más VPS si crece el uso (CX33 +COP 10.900/mes),
  backups externos (~COP 13.900/mes), correo en dominio (~COP 9.450/mes).

---

## 6. Veredicto

- **Pagar ya:** ~**COP 49.500** (dominio año 1 + primer mes de Hetzner).
- **Recurrente:** ~**COP 25.800/mes** (COP 309.400/año desde el año 2).
- **ROI:** con **4 suscriptores** (COP 9.900/mes) o **~8.200 vistas/mes** a $1
  RPM. Con 10 suscriptores, la inversión inicial se recupera el primer mes y la
  utilidad anual supera **COP 700.000**.
