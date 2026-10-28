# Preparación HTTPS y escucha local

Este documento describe el comportamiento actual. No afirma que el HTTPS de producción ni el navegador bajo HTTPS estén verificados. No hay proxy inverso configurado en el repositorio ni en los virtual hosts de XAMPP.

## Desarrollo local

- API: `npm run start:dev` en `erp-backend`. Puerto `PORT`, por defecto de entorno `3789`.
- Si `HOST` no está definido y `NODE_ENV` no es `production`, la API escucha solo en `127.0.0.1`.
- Angular de desarrollo llama a `http://localhost:3789/api` desde `http://localhost:4202`.
- Un `HOST` explícito en desarrollo se respeta, incluido uno de la red local. Eso no abre el puerto en el firewall.
- `NODE_ENV` vacío no es producción. Las cookies salen sin `Secure` y Helmet no envía HSTS.
- `SameSite` por defecto es `lax`.

## cPanel y Phusion Passenger

Los sistemas de referencia arrancan con Passenger. Clínica López usa el mismo mecanismo de NestJS 11: `app.listen('passenger')`, que el adaptador Express reenvía a `http.Server.listen`. Eso no se ha ejecutado en este hosting.

En la aplicación Node de cPanel, sin ejecutarlo desde aquí:

1. El directorio de la aplicación contiene `app.js`, el `main.js` compilado desde `dist/apps/api/main.js`, `package.json` y `node_modules` instalados en el servidor.
2. Application startup file: `app.js`.
3. La aplicación queda montada de forma que el navegador pide `/api` en el mismo origen que Angular. Passenger no quita ese prefijo. `API_PREFIX` sigue siendo `api`.
4. `NODE_ENV=production`.
5. No hace falta `HOST`: el modo Passenger solo existe si el runtime inyecta `PhusionPassenger`. No abre `0.0.0.0` ni `::`.
6. `DOCUMENTOS_ROOT` es un directorio absoluto, persistente y fuera de `public_html`, de `htdocs` y de la carpeta `uploads`. El valor de Windows del ejemplo local no sirve en el servidor.
7. `COOKIE_SECURE` queda activo. `CORS_ORIGINS` es el origen HTTPS público exacto.
8. `FRONTEND_URL` es el origen HTTPS del sitio. Sin esa variable, o con `localhost`, el proceso no arranca. No hay dominio inventado.
9. La carpeta `uploads` queda junto al `package.json`. El código la encuentra subiendo desde `main.js` hasta ese manifiesto, así que no cambia al copiar el bundle al lado de `app.js`. No contiene expedientes.

El script `npm run start:prod` sigue siendo el arranque TCP local: `node dist/apps/api/main`. No es el archivo de arranque de cPanel. `trust proxy` permanece desactivado. Esta preparación no demuestra que el hosting ya sirva la API.

## Manifiesto cerrado del backend

La futura raíz Node no se arma recorriendo el repositorio ni filtrando lo que sobre. Solo pueden entrar estas rutas, ya colocadas en esa raíz:

1. `app.js`, copiado desde `erp-backend/app.js`.
2. `main.js`, copiado desde `erp-backend/dist/apps/api/main.js` y dejado al lado de `app.js`.
3. `package.json`.
4. `package-lock.json`.
5. `assets/branding/logo-clinica-lopez.png`.

`esRutaDeManifiestoBackend` solo convierte `\` en `/` y después exige la cadena exacta. No resuelve `.` ni `..`, no acepta rutas absolutas, espacios ni otro uso de mayúsculas. `./app.js` y `assets/../package.json` quedan fuera. No entran `dist` como destino, `node_modules` de Windows, `.env.example`, `uploads` ni `DOCUMENTOS_ROOT`. El frontend es otro artefacto: `erp-frontend/dist/frontend/browser`, con `/api` y su `.htaccess`. `node_modules` se instala en el servidor. Esta fase no crea la carpeta ni el ZIP.

| Destino en la raíz Node | Origen dentro de `erp-backend` |
|---|---|
| `app.js` | `app.js` |
| `main.js` | `dist/apps/api/main.js` |
| `package.json` | `package.json` |
| `package-lock.json` | `package-lock.json` |
| `assets/branding/logo-clinica-lopez.png` | `assets/branding/logo-clinica-lopez.png` |

`copiarManifiestoBackend` recibe la raíz de origen y la de destino. No usa el directorio de trabajo ni recorre el repositorio. Antes de la primera copia comprueba las cinco entradas: archivo regular, nombre con la capitalización real del disco, sin `..` y sin segmentos `node_modules`, `storage`, `uploads` o `.env`. Rechaza un enlace simbólico en la raíz, en un directorio intermedio o en el archivo. El destino tiene que seguir dentro de su raíz; `assets/branding` solo se crea ahí. Si un destino ya existe, aborta. Si falla cualquier comprobación, no copia ninguno.

La comprobación de la copia y la copia misma tampoco son atómicas. `COPYFILE_EXCL` impide un reemplazo silencioso si el archivo aparece en ese hueco, pero no hay bloqueo de directorio. No se afirma protección total frente a esa carrera.

Eso no es un empaquetado. Falta invocar esta rutina desde un empaquetador, instalar dependencias en el servidor y no subir `node_modules` de Windows. El logo del PDF se resuelve solo junto al `package.json` de la API, sin buscar en el directorio de trabajo ni tres niveles por encima de `__dirname`.

`preflightEmpaquetadoBackend` lee el origen y el destino antes de esa copia. No crea la raíz, no prepara `assets/branding`, no copia y no borra. Si la raíz de destino no existe, el resultado falla y lo dice. Si falta `assets` o `assets/branding`, las anota en `carpetasPendientes` y las deja sin crear. Un destino ya presente, un origen ausente, un enlace o una entrada distinta de las cinco correspondencias devuelve `ok: false` con la comprobación, la ruta relativa y el ámbito (`origen`, `destino` o `manifiesto`). Los diagnósticos no llevan contenido de archivos.

Esta lectura no cierra la carrera con una copia posterior. El disco puede cambiar entre las dos. El preflight no autoriza a empaquetar.

## Dos artefactos distintos

El futuro empaquetado, cuando exista, son dos piezas independientes. Esta fase no copia ninguna.

Backend Node, en su propia raíz:

- `app.js`
- `main.js`, procedente de `erp-backend/dist/apps/api/main.js`
- `package.json`
- `package-lock.json`
- `assets/branding/logo-clinica-lopez.png`

Frontend Angular, aparte:

- `erp-frontend/dist/frontend/browser`
- `apiUrlGestion` de producción en `/api`
- `.htaccess` de esa carpeta

`node_modules` se instala en el servidor. No forma parte de ninguno de los dos artefactos.

`excluirDelPaquete` es una red de seguridad, no el selector. Compara segmentos sin distinguir mayúsculas y revisa cada tramo del nombre. Excluye `storage` completo, `backups`, `node_modules`, `dist`, `logs`, `certs`, `coverage` y `uploads`. La única plantilla de entorno que deja pasar por nombre es exactamente `.env.example`. Un archivo como `clave.pem.txt` o `dump.sql.gz` también queda fuera.

Falso positivo conocido: cualquier carpeta llamada `pacientes` o `clientes` se excluye, incluido el código fuente que usa ese nombre. El manifiesto cerrado no depende de esa regla.

## Producción TCP, obligatoria si no hay Passenger

El proceso debe arrancar con:

- `NODE_ENV=production`
- `HOST` con una interfaz concreta. `127.0.0.1` sirve cuando el proxy está en la misma máquina. `0.0.0.0` y `::` impiden el arranque. No se elige un host por defecto.
- `COOKIE_SECURE=true`, o la variable omitida. `false` impide el arranque. Solo se aceptan `true` y `false`.
- `COOKIE_SAMESITE=lax` para el frontend servido en el mismo origen (`/api`). `none` solo tendría sentido con HTTPS y orígenes separados, y no es la arquitectura prevista.
- `CORS_ORIGINS` con el origen HTTPS público exacto. No usar `*`.
- `JWT_SECRET` aleatorio de al menos 32 caracteres, solo en `.env`.

HSTS en producción es `max-age=31536000`, sin `includeSubDomains` y sin `preload`. Configurarlo no demuestra que HTTPS funcione. En desarrollo el encabezado no se envía. El resto de Helmet permanece.

El puerto 3789 no debe publicarse en Internet. El proxy, cuando exista, debe terminar TLS, reenviar `/api` conservando el prefijo y las cabeceras `Origin`, `Cookie`, `Set-Cookie`, `X-CSRF-Token` y `X-Unidad-Id`, y no confiar en `X-Forwarded-*` enviados por el cliente. `trust proxy` sigue desactivado.

## Sigue sin verificarse

- Phusion Passenger en el hosting. La prueba local no lo ejecuta.
- Certificado vigente y cadena completa.
- Navegador real sobre HTTPS.
- Recepción de `cli_refresh` como `HttpOnly` en ese navegador.
- Que el cortafuegos impida el acceso externo al puerto 3789.

## Pruebas del preflight

Desde `erp-backend`, solo la validación previa y la copia ya existente:

```text
npx jest apps/api/src/core/archivos/preflight-empaquetado.spec.ts apps/api/src/core/archivos/copia-manifiesto.spec.ts --watchman=false --forceExit
```

Esa corrida no genera el paquete ni sustituye la verificación pendiente de Passenger, HTTPS y el navegador.
