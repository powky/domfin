# domfin-api

El servidor local de [Domfin](../README.md): lee los
PDF de tus estados de cuenta, los guarda en una base SQLite en tu
computadora y le da a la app tus cuentas, tus movimientos ya clasificados y
la tasa del dólar del Banco Central.

Está escrito en Go, sin frameworks (`net/http` y `modernc.org/sqlite`, que no
necesita C).

> **¿Quieres montar Domfin?** Sigue el [README principal](../README.md#cómo-montarlo):
> ahí están los dos programas, paso a paso.

## Arrancar

Con [Go 1.26](https://go.dev/dl/) o más nuevo:

```bash
go run ./cmd/api
```

Queda escuchando en `http://localhost:8080`. Para tener un ejecutable:

```bash
go build -o domfin-api ./cmd/api
./domfin-api
```

## Tus datos

- La base vive en la carpeta de configuración de tu usuario, fuera del
  repositorio, y solo tu usuario puede leerla:

  | Sistema | Carpeta |
  | --- | --- |
  | macOS | `~/Library/Application Support/domfin-api/domfin.db` |
  | Linux | `~/.config/domfin-api/domfin.db` |
  | Windows | `%AppData%\domfin-api\domfin.db` |

  Para respaldar, copia ese archivo con la API apagada. Los PDF no se copian:
  quedan donde los tengas.
- Los endpoints con datos del banco solo responden a esta misma computadora:
  ni otros equipos de tu red ni otras páginas abiertas en el navegador.
- La contraseña de los PDF se guarda desde *Configuración* en la app, en la
  misma base. Nunca se devuelve por la API.
- Las únicas salidas a Internet: la tasa del Banco Central (una vez al día) y
  los releases de Domfin en GitHub (como mucho dos veces al día, y se puede
  apagar). Ninguna lleva datos tuyos.

## Configuración

Todo es opcional. Se puede poner en el ambiente o en un archivo `.env` en la
carpeta desde donde arrancas la API (copia `.env.example`).

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto de la API. | `8080` |
| `DOMFIN_DATA_DIR` | Carpeta de la base (`domfin.db`). | La de la tabla de arriba |
| `DOMFIN_CACHE_DIR` | Carpeta de la caché de la tasa del dólar. | La caché de tu usuario |
| `STATEMENTS_PDF_PASSWORD` | Contraseña de respaldo para los PDF. La que guardas en *Configuración* tiene prioridad. | — |
| `DOMFIN_UPDATE_CHECK` | `off` para que nunca le pregunte a GitHub por versiones nuevas. | Encendido |
| `DOMFIN_REPO` | De qué repositorio salen los releases (`dueño/nombre`), para un fork. | `powky/domfin` |

## Importar desde la terminal

La app importa desde *Importar estados*; también se puede desde aquí:

```bash
go run ./cmd/statements import ~/estados          # PDF sueltos o carpetas
go run ./cmd/statements import -dry-run ~/estados # revisa sin guardar
go run ./cmd/statements status                    # qué meses tiene cada cuenta
```

## Qué lee

| Banco | Documentos |
| --- | --- |
| Banco Popular | Estados de tarjeta de crédito (PDF con contraseña), estados de cuentas de ahorro y corrientes (escaneados o impresos, se leen con un OCR propio), historiales de préstamo (incluido el Extracrédito) y de certificado financiero. |
| Qik | Estados de tarjeta de crédito. |

Cada estado se verifica: que los balances cuadren, que no falten páginas y
que cada mes abra con el cierre del anterior. Importar dos veces el mismo
estado no duplica nada.

## Documentación

- [docs/endpoints.md](docs/endpoints.md): cada endpoint, con ejemplos.
- [docs/estados-de-cuenta.md](docs/estados-de-cuenta.md): cómo es cada formato
  y cómo se lee.
- [docs/modelo-de-datos.md](docs/modelo-de-datos.md): el libro, las
  categorías y cómo se clasifica cada movimiento.

## Desarrollo

```bash
go test ./...   # todos los tests, con PDF inventados (internal/testpdf)
gofmt -l .      # debe salir vacío
```

Las reglas para proponer cambios están en [CONTRIBUTING.md](../CONTRIBUTING.md).
