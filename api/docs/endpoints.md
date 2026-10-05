# Endpoints de domfin-api

La API escucha en `http://localhost:8080` (`PORT` lo cambia). Los endpoints
con datos del banco (`/statements/*`, `/accounts`, `/ledger/*`) solo
responden a esta computadora y a páginas servidas desde `localhost`, nunca a
otros equipos de la red ni a otros sitios abiertos en el navegador. Los
públicos (`/health`, `/rates/usd-dop`, `/updates`) no tienen datos tuyos.

## `GET /rates/usd-dop`

Tasa de cambio de referencia del dólar (mercado spot) que publica el Banco
Central de la República Dominicana, en pesos por dólar:

```json
{
  "base": "USD",
  "quote": "DOP",
  "date": "2026-09-28",
  "buy": 59.2669,
  "sell": 59.5577,
  "source": "Banco Central de la República Dominicana",
  "sourceUrl": "https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx",
  "fetchedAt": "2026-09-29T05:12:35Z",
  "stale": false
}
```

- `buy` es la tasa de compra y `sell` la de venta; `date` es el día hábil al
  que corresponden.
- La fuente es el Excel de la serie diaria que el BCRD enlaza en
  [Mercado cambiario](https://www.bancentral.gov.do/a/d/2538-mercado-cambiario)
  y actualiza cada día hábil antes de las 6:30 p. m.
- Caché diaria: la API descarga la serie una vez por publicación (después de
  las 6:30 p. m., hora de Santo Domingo) y guarda la tasa en
  `$DOMFIN_CACHE_DIR/usd-dop.json` (por defecto `~/Library/Caches/domfin-api`
  en macOS). Si a esa hora aún no sale la del día, vuelve a mirar cada hora.
- Si el BCRD no responde, devuelve la última tasa guardada con `stale: true`
  y espera 5 minutos antes de reintentar. Sin ninguna tasa guardada responde
  `503`.
- La caché guarda la serie diaria completa (desde 1991): con ella se
  convierten los pagos a un activo a la tasa de su fecha.

## `POST /statements/import`

Importa estados de cuenta en PDF (ver [estados-de-cuenta.md](estados-de-cuenta.md)).
Recibe un formulario `multipart/form-data` con uno o más archivos en `files`
(hasta 32 MB en total) y responde qué pasó con cada uno:

```json
{
  "results": [
    {
      "file": "estado.pdf",
      "status": "added",
      "account": { "kind": "credit_card", "institution": "popular", "name": "Contigo", "brand": "Mastercard", "product": "MC CONTIGO", "last4": "1234" },
      "date": "2026-01-28",
      "sections": [{ "currency": "DOP", "transactions": 60 }, { "currency": "USD", "transactions": 11 }]
    },
    { "file": "otro.pdf", "status": "skipped", "reason": "unsupported" }
  ]
}
```

- `status`: `added`, `replaced` (había un estado de esa tarjeta y fecha de
  corte con otro contenido), `unchanged` (ya estaba), `skipped` (no es un
  estado que sepa leer) o `failed`, con `reason` `missing_password`,
  `wrong_password`, `unreadable` o `not_saved` y el error en `detail`.
- `date` es la fecha de corte de una tarjeta, o el día en que se generó el
  historial de un préstamo (`kind: "loan"`), que además trae `from`, su
  primer movimiento. `issues` lista, en español, lo que no cuadró.

## `GET /statements/coverage`

Los meses importados de cada cuenta, del primero al último, con `status`
`ok`, `review` (importado con problemas, en `issues`) o `missing`:

```json
{
  "accounts": [
    {
      "account": { "kind": "credit_card", "institution": "popular", "name": "Contigo", "brand": "Mastercard", "last4": "1234" },
      "months": [
        { "month": "2026-01", "status": "ok", "date": "2026-01-28", "sections": [{ "currency": "DOP", "transactions": 60 }] },
        { "month": "2026-02", "status": "missing" }
      ]
    }
  ]
}
```

Estos dos endpoints manejan datos del banco: solo responden a esta
computadora (la app web en desarrollo o un simulador) y a páginas servidas
desde `localhost`, nunca a otros equipos de la red ni a otros sitios abiertos
en el navegador.

## `/statements/password`

La contraseña con que se abren los PDF que la tienen (los estados de tarjeta
del Banco Popular). La app la guarda desde *Configuración*.

- `GET` dice si hay una: `{"saved": true, "environment": false}` (`environment`:
  si `STATEMENTS_PDF_PASSWORD` tiene una). Nunca devuelve la contraseña.
- `PUT` la guarda: `{"password": "..."}`. `DELETE` la olvida.
- Se guarda en la base local (solo legible por tu usuario). La guardada gana
  sobre `STATEMENTS_PDF_PASSWORD`, que queda como respaldo.

## `GET /accounts`

Las cuentas que salen de los estados importados, una por moneda (una tarjeta
que factura en pesos y dólares son dos), con su balance más reciente y el de
fin de cada mes del rango (`?from=2026-01&to=2026-09`; sin rango, los doce
meses hasta el último estado). Montos en centavos, como los imprime el banco:
lo que tiene una cuenta o un certificado, lo que se debe en una tarjeta o un
préstamo.

```json
{
  "accounts": [
    {
      "id": "popular:savings:1234:DOP",
      "institution": "popular",
      "kind": "savings",
      "name": "Ahorro Empleado",
      "last4": "1234",
      "currency": "DOP",
      "balance": 1229106,
      "asOf": "2026-09-21",
      "months": [{ "month": "2026-08", "balance": 1839662 }, { "month": "2026-09", "balance": 1229106 }]
    }
  ]
}
```

- `kind`: `savings`, `checking`, `credit_card` (con `creditLimit`), `loan` o
  `certificate`; `asOf` es la fecha del último estado o historial.
- El balance de un mes es el que queda después del último movimiento
  registrado hasta su fin; antes del primer estado de la cuenta es `null`.
- Solo responde a esta computadora y a páginas servidas desde `localhost`.

## `/ledger/*`

El libro: las cuentas y movimientos de todos los estados importados, ya
clasificados como ingreso, gasto o transferencia, lo que los clasifica
(categorías, tus reglas y correcciones, y la configuración de nómina), los
activos que ningún estado muestra (un apartamento en plano, acciones), con
los movimientos que les pagan, y el presupuesto (tus gastos fijos). Como los
de estados de cuenta, solo responden a esta computadora. El modelo, las reglas
y cada endpoint están en [modelo-de-datos.md](modelo-de-datos.md).

## `/backup`

Respaldos cifrados de la base en una carpeta que elijas, normalmente la de tu
nube (iCloud Drive, Google Drive, Dropbox u OneDrive), que la app de
escritorio del servicio sube sola. Domfin nunca habla con el servicio. Como
los de estados de cuenta, solo responden a esta computadora.

- `GET /backup`: cómo van.

  ```json
  {
    "configured": true,
    "folder": "/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/Domfin",
    "place": { "service": "icloud", "root": "/Users/ana/Library/Mobile Documents/com~apple~CloudDocs", "folder": "/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/Domfin", "hasBackups": true },
    "automatic": true,
    "needsPassword": false,
    "available": true,
    "last": { "at": "2026-10-01T09:30:15-04:00", "file": "domfin-2026-10-01-093015.age", "bytes": 67585 },
    "backups": [{ "file": "domfin-2026-10-01-093015.age", "at": "2026-10-01T09:30:15-04:00", "bytes": 67585 }]
  }
  ```

  Si el último falló, `last.error` trae el código (como `folder_missing`).
  `available` dice si la carpeta está; `needsPassword`, si se restauró con la
  clave de recuperación desde una carpeta sin `domfin-clave.age` y falta
  elegir una contraseña.
- `GET /backup/places`: las carpetas de nube de esta computadora, con
  `service` (`icloud`, `google-drive`, `dropbox` u `onedrive`), `account` si
  la carpeta lo dice, `folder` (la de Domfin dentro) y `hasBackups`.
- `POST /backup/setup` `{"folder", "password"}`: los activa. Con una clave
  nueva responde `{"recoveryKey": "AGE-SECRET-KEY-PQ-1…"}`, la única vez que
  sale; si la carpeta ya tiene respaldos, la contraseña tiene que abrirlos,
  se sigue usando su clave y responde `{"recoveryKey": ""}`.
- `POST /backup/run`: respalda ahora: `{"backup": {"file", "at", "bytes"}}`.
- `PUT /backup` `{"automatic"?, "folder"?}`: los automáticos y la carpeta.
  Responde como `GET /backup`.
- `PUT /backup/password` `{"password"` o `"recoveryKey", "newPassword"}`:
  cambia la contraseña; los respaldos no cambian.
- `GET /backup/files?folder=…`: los respaldos de una carpeta, del más nuevo
  al más viejo, y si tiene la clave (`hasKey`).
- `POST /backup/restore` `{"folder", "file", "password"` o `"recoveryKey"}`:
  reemplaza la base por la del respaldo sin reiniciar la API y deja una copia
  de la anterior junto a ella: `{"safetyCopy": "…/domfin-antes-de-restaurar-2026-10-01-101500.db"}`
  (quedan las últimas 3).
- `DELETE /backup`: los apaga. Los respaldos se quedan donde están.

Los errores son `{"error": "<código>"}`: `bad_folder` (la ruta no es
absoluta), `folder_missing`, `short_password` (menos de 10 caracteres),
`wrong_password`, `wrong_key`, `bad_recovery_key`, `no_key` (la carpeta no
tiene `domfin-clave.age`), `other_key` (la carpeta tiene respaldos con otra
clave), `bad_file`, `damaged`, `newer_version` y `not_configured`.

Cómo se cifran:

- Cada respaldo es una copia de la base (`VACUUM INTO`) comprimida con gzip
  y cifrada con [age](https://age-encryption.org) a una clave poscuántica
  (ML-KEM-768 + X25519) que Domfin crea al activarlos.
- La parte pública de la clave queda en la base, así que los automáticos no
  necesitan la contraseña. La privada va en `domfin-clave.age`, junto a los
  respaldos, cifrada con la contraseña (scrypt), y es también la clave de
  recuperación.
- Hay un respaldo al día y otro un minuto después de cada importación. Se
  guardan todos los del último día, el más nuevo de cada uno de los últimos
  7 días con respaldos y el de cada uno de los últimos 12 meses.
- Sin Domfin, con la clave de recuperación en `clave.txt`:
  `age -d -i clave.txt domfin-2026-10-01-093015.age | gunzip > domfin.db`.

## `GET /updates`

La versión de Domfin que corre y su último release en GitHub, para que la
app avise cuando hay uno nuevo:

```json
{ "version": "0.1.0", "latest": "0.2.0", "url": "https://github.com/powky/domfin/releases/tag/v0.2.0", "available": true }
```

- Le pregunta a GitHub como mucho dos veces al día, y solo por el
  repositorio de Domfin (`DOMFIN_REPO`). Sin releases no trae `latest`.
- La app y la API tienen la misma versión; la app también compara la suya
  con `latest`.
- Con `DOMFIN_UPDATE_CHECK=off` nunca le pregunta a GitHub: solo devuelve
  `version`.

## `GET /health`

Responde `ok`.
