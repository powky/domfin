# domfin-api (`api/`)

API de Domfin en Go (módulo `github.com/powky/domfin/api`), sin
frameworks: `net/http` y SQLite con `modernc.org/sqlite`. Qué hace cada
endpoint: `docs/endpoints.md`; cómo se leen los PDF:
`docs/estados-de-cuenta.md`; el libro y la clasificación:
`docs/modelo-de-datos.md`. Mantenlos al día cuando cambies algo que
describen. Las reglas para contribuir están en `../CONTRIBUTING.md`.

## Comandos

```bash
go run ./cmd/api                          # :8080 (PORT para otro)
go test ./...                             # antes de dar algo por terminado
gofmt -l .                                # debe salir vacío
go run ./cmd/statements import -dry-run <carpeta>   # prueba sin guardar
go run ./cmd/glyphs <pdf>                 # glyphs que el atlas no conoce
DOMFIN_DATA_DIR=/tmp/domfin-demo go run ./cmd/demo   # base con datos inventados
```

## Mapa

| Paquete | Qué hace |
| --- | --- |
| `cmd/api` | Arma el servidor: rutas públicas con CORS abierto y rutas con datos del banco detrás de `localonly`. |
| `cmd/statements` | CLI para importar PDF y ver la cobertura por mes. |
| `cmd/glyphs` | Encuentra caracteres nuevos para `internal/gridocr/popular.atlas`. |
| `cmd/demo` | Llena una base nueva con datos inventados: para probar la app sin datos reales y para las capturas del README. |
| `internal/rates` | Tasa USD/DOP del BCRD con caché diaria y la serie histórica. |
| `internal/pdftext` | Texto de un PDF como líneas de celdas (descifra con pdfcpu). |
| `internal/gridocr` | OCR de cuadrícula para los estados escaneados. |
| `internal/statements` | Parsers de cada formato del Banco Popular y sus verificaciones. |
| `internal/importer` | Reconoce el PDF, lo importa y sirve `/statements/*`. |
| `internal/store` | SQLite: tablas de importación, libro, balances y migraciones. |
| `internal/ledger` | Modelo del libro y la clasificación (ingreso, gasto, transferencia). |
| `internal/assets` | Activos que ningún estado muestra (inmueble en plano con su plan de pagos, acciones, fondo de pensiones, vehículo que se deprecia), deudas fuera de tus estados (por movimientos vinculados o por plan de cuotas) y su valor. |
| `internal/books` | Endpoints `/ledger/*`. |
| `internal/accounts` | `GET /accounts` con balances de fin de mes. |
| `internal/localonly` | Guard para los endpoints con datos del banco. |
| `internal/updates` | Último release de Domfin en GitHub (`GET /updates`). |
| `internal/version` | Versión de Domfin (la misma de la app) y repositorio de los releases. |
| `internal/testpdf` | Genera PDF sintéticos (texto, cifrados y escaneados) para los tests. |

## Convenciones

- Comentarios y nombres en inglés; lo que ve el usuario (mensajes de error,
  `issues`, logs) en español neutro.
- Montos en centavos (`int64`), en la moneda de su cuenta. Los signos siguen
  a cada tabla (ver `docs/estados-de-cuenta.md`); en el libro, positivo entra
  a la cuenta y negativo sale.
- Los ids se arman con lo que imprime el banco y no cambian
  (`banco:tipo:últimos4:moneda`, más la referencia del movimiento). Las
  correcciones del usuario se atan a ellos, así que reimportar no debe
  cambiarlos.
- Todo endpoint nuevo con datos del banco va detrás de `localonly.Handler`.
- Migraciones: solo se agregan al final de `migrations` en
  `internal/store/store.go` (versión en `PRAGMA user_version`); nunca se
  edita una ya publicada.
- Un formato nuevo de estado trae sus verificaciones (que el balance cuadre,
  que no falten páginas) y sus tests con `internal/testpdf`.

## Datos reales

- La contraseña de los PDF se guarda desde Configuración en la app (en la
  base) o en `STATEMENTS_PDF_PASSWORD` (`.env`, ignorado por git). Nunca la
  muestres, ni la pases por línea de comandos, ni la devuelvas por la API.
- La base real vive fuera del repo (en la carpeta de configuración del
  usuario; `DOMFIN_DATA_DIR` la cambia). Pregunta antes de importar ahí;
  para probar, usa `-dry-run` o una copia con otro `DOMFIN_DATA_DIR`.
- Nada de datos reales en el repo: ni PDF, ni bases, ni números de cuenta en
  ejemplos o tests. `.gitignore` ya excluye `*.pdf` y `*.db`.

## Trampas conocidas

- `.gitignore` tiene `coverage.*`, que ignora en silencio un archivo
  `coverage.go`. Elige otro nombre.
- `ledongthuc/pdf` lee mal el RC4 de 40 bits: `pdftext` descifra primero con
  pdfcpu.
- El CDN del BCRD a veces sirve una copia vieja de días. La API pide el
  archivo con un query string único y sin gzip; si la tasa se atrasa, mira el
  CDN antes que el parser.
- Los estados de cuentas bancarias no traen referencias: el id de un
  movimiento es la fecha de corte más la línea (`2026-08-20#3`).
- Una transferencia entre dos cuentas bancarias solo se empareja cuando un
  lado nombra los últimos 4 del otro.
