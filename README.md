# Box Signage — Fase 1

Digital signage para boxes de CrossFit: varias TVs, WOD, imágenes de cualquier
proporción (con bandas negras, `cover` o `blur-fill`), logo del box, publicidad
rotativa y actualización en tiempo real desde el móvil.

Todo corre sobre **Cloudflare Workers + Static Assets + un Durable Object**, con
las imágenes en **Backblaze B2**, sin backend tradicional ni coste adicional. El
Worker sirve el build de Vite (rol de "Pages") y expone la API/WebSocket en
`/api/*`.

> **CLI:** el proyecto usa **`cf`** (el CLI nuevo de Cloudflare) junto con el
> plugin `@cloudflare/vite-plugin@beta`. La configuración vive en
> `cloudflare.config.ts` (ya no en `wrangler.jsonc`). `wrangler` se mantiene
> como dependencia solo para `wrangler tail` y `wrangler secret put`, que la
> beta de `cf` todavía no cubre.

---

## Arquitectura

```
Navegador TV  ──WebSocket──┐
Navegador Admin ──WebSocket┤──►  Worker (worker/index.ts)
Admin POST /api/... ──HTTP──┘        │
                                     ▼
                         GymSignageDO (Durable Object, 1 por gimnasio)
                         · guarda las Screen en storage
                         · mantiene los WebSockets (con hibernación)
                         · difunde deltas a las TVs
                                     │
Admin POST /api/uploads ─────────────┴──►  Backblaze B2 (S3, bucket privado)
                                            · imágenes subidas desde el panel
                                            · el Worker firma y hace de proxy
```

- `worker/index.ts` — API HTTP, subida/servido de imágenes (B2) y puente WebSocket.
- `worker/mediaStorage.ts` — cliente S3 (SigV4) contra Backblaze B2.
- `worker/durable/GymSignageDO.ts` — estado persistente + WebSockets + broadcast.
- `src/shared/types/signage.ts` — contrato de tipos (`Screen`, `AdminCommand`, `TvEvent`).
- `src/shared/timer.ts` — cálculo local del temporizador compartido por TV y panel.
- `src/tv/` — reproductor de la tele.
- `src/admin/` — panel móvil con previsualización 16:9.
- `src/shared/hooks/` — socket con reconexión, reloj, temporizador, fullscreen, refresco nocturno.

### Flujo en tiempo real

1. Una tele se conecta a `/api/ws/:screenId?role=tv` y recibe `STATE_SYNC`.
2. El panel envía comandos por `POST /api/screens/:screenId/command`.
3. El DO persiste, actualiza `updatedAt` y difunde solo los deltas
   (`CONTENT_CHANGED`, `ADS_CHANGED`, `BRAND_CHANGED`, `TIMER_CHANGED`,
   `SCREEN_NAME_CHANGED`) a los sockets de esa pantalla.
4. El temporizador no se transmite segundo a segundo: se guarda
   `startedAt`/`pausedAt` y cada tele calcula el tiempo localmente.

---

## Puesta en marcha

```bash
npm install
```

### Desarrollo

Un único comando:

```bash
npm run dev   # cf dev → Vite + plugin de Cloudflare (cliente + Worker + DO)
```

`cf dev` arranca Vite con el plugin oficial de Cloudflare, que ejecuta el
Worker (API, WebSocket y Durable Object) y sirve el cliente desde el **mismo
origen** en http://localhost:5173. Ya no hay dos terminales ni proxy `/api`:
el plugin enruta `/api/*` al Worker.

Abre:

- Panel: http://localhost:5173/admin
- TV principal: http://localhost:5173/tv/wod

### Producción

```bash
npm run build      # typecheck + cf build (Build Output en .cloudflare/output/v0)
npm run deploy     # typecheck + cf deploy
```

La primera vez autentícate con `npx cf auth login`. En CI, `cf` también lee
`CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

Tras el despliegue tendrás algo como:

```
https://boxtv.<subdominio>.workers.dev          # → abre la tele (raíz)
https://boxtv.<subdominio>.workers.dev/admin    # → panel de administración
```

---

## Clave del panel

El panel admite una clave secreta compartida. Si `ADMIN_KEY` no está definida,
la API queda abierta (útil en local). Para activarla en producción:

```bash
# Opción cf: sube el secreto junto a un nuevo deploy
npx cf deploy --secrets-file .secrets.env

# Alternativa mientras `cf` sigue en beta (aún no fija secretos sueltos)
npx wrangler secret put ADMIN_KEY --name boxtv
```

`.secrets.env` es un fichero JSON o `.env` con `ADMIN_KEY=...`; añádelo a
`.gitignore` y no lo subas al repositorio.

La clave se guarda en `localStorage` del móvil la primera vez que se introduce.
Las TVs no la necesitan.

Variables opcionales en `cloudflare.config.ts`:

| Variable         | Por defecto | Descripción                                  |
| ---------------- | ----------- | -------------------------------------------- |
| `DEFAULT_GYM_ID` | `default`   | Gimnasio usado cuando no se pasa `?gym=`.    |

---

## Modelo de datos

Definido en `src/shared/types/signage.ts`. Resumen:

- `Screen`: `id`, `name`, `gymId`, `brand`, `main`, `ads`, `updatedAt`.
- `BrandConfig`: logo, color primario/secundario, fondo, mostrar reloj.
- `MainContent`: `text` | `image` | `carousel` | `timer`.
- `ImageFit`: `contain` (por defecto), `cover`, `blur-fill`.
- `AdPlaylist`: `enabled`, `items`, `secondsPerAd`, `pauseDuringTimer`.
- `TimerState`: `status`, `mode`, `workSeconds`, `restSeconds`, `rounds`,
  `currentRound`, `startedAt`, `pausedAt`.

Pantallas creadas automáticamente: `wod` (la TV principal). El resto se añaden
desde el panel y reciben un id único generado a partir de su nombre.

---

## Añadir televisiones

El panel admite varias TVs en el mismo box:

1. Entra en `/admin` y pulsa **+ Añadir TV**.
2. Escribe un nombre (p. ej. `TV sala 2`) y pulsa **Crear televisión**. La nueva
   TV hereda el aspecto y la publicidad de la principal, pero empieza con su
   propio contenido.
3. En la tarjeta de la TV, pulsa **Copiar enlace** y ábrelo en el navegador del
   nuevo dispositivo (o pulsa **Ver** y copia la URL del navegador). El enlace
   tiene la forma `/tv/<id>` y conserva el `?gym=` configurado.
4. Pulsa **Editar** para publicar contenido, aspecto o publicidad solo en esa
   TV, o en **Estado** para ver sus conexiones.

La TV principal (`wod`) no se puede eliminar; siempre debe quedar al menos una.
Al eliminar otra TV se desconectan sus reproductores y se borran sus datos.

---

## Comportamiento ante fallos

- **Heartbeat:** PING cada 30 s; el DO registra el último latido.
- **Reconexión:** backoff de 2, 5, 10, 30 y 60 s (y al volver a la pestaña).
- **Caché local:** la tele guarda el último `STATE_SYNC` y lo muestra mientras
  resincroniza (sin pantallas en blanco).
- **Reloj local:** sigue funcionando sin red.
- **Refresco nocturno:** recarga a las 03:00 para liberar memoria del navegador.
- **Pantalla completa:** botón manual y doble clic; detecta la salida de fullscreen.

---

## Modos de imagen

| Modo        | Comportamiento                                        |
| ----------- | ----------------------------------------------------- |
| `contain`   | Imagen completa con bandas negras (por defecto).      |
| `cover`     | Rellena el marco recortando bordes.                   |
| `blur-fill` | Copia ampliada y desenfocada detrás + imagen centrada.|

Solo se aceptan URLs HTTPS o rutas relativas al sitio (se rechazan las URLs
protocol-relative `//…`); se avisa en el panel si la URL no es válida. Las
imágenes subidas desde el panel se sirven como rutas relativas
(`/api/media/…`), así que también pasan esta validación.

---

## Subida de imágenes (Backblaze B2)

El panel incluye un botón **Subir imagen** en cada campo de imagen (contenido,
carrusel, publicidad, logo y fondo). El flujo es:

1. El móvil hace `POST /api/uploads` con el archivo en binario y la cabecera
   `X-Admin-Key` (solo admins).
2. El Worker valida el tipo (`png`, `jpeg`, `webp`, `gif`, `avif`, `svg`) y el
   tamaño (máx. 10 MB) y sube el objeto a **Backblaze B2** (API S3, firmada con
   SigV4 vía `aws4fetch`) bajo una clave única `<gym>/<uuid>.<ext>`.
3. Devuelve una URL estable `/api/media/<clave>` que se guarda en el `Screen`.
4. La TV la carga con un `<img>` normal. El Worker hace de **proxy** contra B2,
   así el egress va de B2 a Cloudflare (Backblaze está en el *Bandwidth
   Alliance* → gratis) y el bucket queda privado.

### Por qué B2 y no R2

R2 no tiene **tope duro**: si te pasas del free tier te cobra (solo puedes poner
alertas). B2 tiene **Caps & Alerts**: pones un cap y, al alcanzarlo, las subidas
**fallan** en vez de cobrarte. Gratis: 10 GB de almacenamiento.

### Configuración

Credenciales en `.dev.vars` (secreto, local) / `.secrets.env` (secreto, deploy):

| Binding | Descripción |
| ------- | ----------- |
| `B2_KEY_ID` | keyID de una Application Key de B2 (25 caracteres) |
| `B2_APPLICATION_KEY` | applicationKey (31 caracteres, solo se muestra una vez) |

Bucket y región en `cloudflare.config.ts` (texto fijo, **no** secreto):
`B2_BUCKET` (`boxtv-media`) y `B2_REGION` (`eu-central-003`). Como son valores
literales, `.dev.vars` **no** los sobreescribe: si cambias de bucket/región,
edítalos en el config.

Pasos (una vez):

1. En Backblaze, crea un **bucket privado** y una **Application Key** con acceso
   a ese bucket (con `Read and Write`).
2. Anota la **región** del endpoint del bucket (B2 → bucket → *Endpoint*,
   `s3.<región>.backblazeb2.com`) y ponla en `B2_REGION` en el config.
3. Copia `.dev.vars.example` a `.dev.vars` y rellena `B2_KEY_ID` y
   `B2_APPLICATION_KEY` (desarrollo local).
4. Para producción, sube los secretos en el deploy:
   `npx cf deploy --secrets-file .secrets.env` (con `B2_KEY_ID` y
   `B2_APPLICATION_KEY` dentro; el fichero va en `.gitignore`). Como alternativa:
   `npx wrangler secret put B2_KEY_ID --name boxtv`.

Sin configurar, la subida devuelve `503` y el resto de la app sigue igual
(las imágenes por URL funcionan siempre). En local, `cf dev` no simula B2: hace
las peticiones reales a Backblaze, así que necesitas el `.dev.vars` rellenado.

---

## Publicidad

Franja inferior (~20 %) con rotación automática configurable (`secondsPerAd`),
transición de entrada suave y máximo un elemento animado. Durante el
temporizador se compacta (`pauseDuringTimer`) para no competir con el cronómetro.

---

## Scripts

| Script                     | Descripción                                              |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | `cf dev`: Vite + plugin de Cloudflare (cliente + Worker).|
| `npm run build`            | Tipos + typecheck + `cf build` a `.cloudflare/output/v0`.|
| `npm run typecheck`        | `cf workers types` + typecheck de app y worker.          |
| `npm run typecheck:app`    | Typecheck solo del cliente React.                        |
| `npm run typecheck:worker` | Typecheck solo del Worker y el Durable Object.           |
| `npm test`                 | Tests unitarios (Vitest, una pasada).                    |
| `npm run test:watch`       | Tests en modo watch durante el desarrollo.               |
| `npm run deploy`           | Typecheck + `cf deploy`.                                 |
| `npm run cf-typegen`       | `cf workers types`: tipos de bindings.                   |

---

## Desarrollo con agentes de código

La guía para agentes (mapa del repositorio, invariantes, recetas para añadir
comandos/campos/rutas y verificaciones) vive en [`AGENTS.md`](./AGENTS.md).
Léela antes de tocar el contrato de datos o el Worker.

---

## Roadmap (Fase 3)

Usuarios, programación horaria, plantillas y monitorización.
