# Cómo contribuir a Domfin

Gracias por querer mejorar Domfin. El repositorio tiene dos partes:
domfin-api en [`api/`](api) (Go) y la app en [`app/`](app) (Expo). Un
cambio puede tocar las dos en un mismo pull request.

## Lo primero: nunca subas datos reales

Domfin maneja información financiera. En issues, pull requests, código,
tests, ejemplos y capturas:

- Nada de PDF de estados de cuenta, bases de datos (`*.db`) ni exportaciones.
- Nada de números de cuenta (ni sus últimos 4 dígitos), nombres de personas,
  referencias de transacciones ni montos copiados de un estado de verdad. En
  ejemplos y textos de ayuda, usa datos inventados.
- Si un estado no se lee bien, describe su formato con datos inventados: qué
  columnas trae, cómo se ve una línea (`27 MAR  27 MAR  CREDITO NOMINA
  30,000.00  110,000.00`). Los tests generan PDF falsos con
  `api/internal/testpdf`, que imita los reales.
- Las capturas, con los
  [datos de ejemplo](README.md#con-datos-de-ejemplo) o, si tienen que ser
  tuyas, con los montos ocultos (el ojito de arriba) y sin nombres que te
  identifiquen.
- Antes de abrir un pull request, revisa el diff buscando datos tuyos.

## Seguridad

Si encuentras una vulnerabilidad, no abras un issue público: mira
[SECURITY.md](SECURITY.md).

## Issues

- Busca primero si ya existe.
- Para un error, di qué hiciste, qué esperabas y qué pasó, con tu versión
  (*Configuración → Acerca de Domfin*), tu sistema y dónde corre la app (web,
  simulador de iOS, emulador de Android).
- Para un banco o formato nuevo, di cuál y describe el documento con datos
  inventados.

## Montar el entorno

Sigue [Cómo montarlo](README.md#cómo-montarlo): `./domfin setup` deja todo
listo y `./domfin start` arranca la API y la app. Antes de abrir un pull
request, según lo que cambies:

```bash
cd api && go test ./... && gofmt -l .      # gofmt debe salir vacío
cd app && npm run typecheck && npm run lint && npm run contrast && npm test
```

Para trabajar sin tus datos, usa los
[datos de ejemplo](README.md#con-datos-de-ejemplo) (`./domfin start --demo`):
cubren cada pantalla y sirven para las capturas. Para probar la API con tus estados sin tocar tu
base, usa otra carpeta:
`DOMFIN_DATA_DIR=/tmp/domfin-prueba go run ./cmd/api`, o
`go run ./cmd/statements import -dry-run <carpeta>`.

El lanzador tiene dos versiones que hacen lo mismo: `domfin`, en bash (3.2,
el que trae macOS), para macOS y Linux, y `scripts/domfin.ps1`, en Windows
PowerShell 5.1, que corre `domfin.cmd`. Un cambio va en las dos; el
workflow *Instalador* las prueba en los tres sistemas.

## Reglas del código

### En la API (`api/`)

- Comentarios y nombres en inglés; lo que ve el usuario (errores, `issues`,
  logs) en español neutro, de "tú".
- Montos en centavos (`int64`), en la moneda de su cuenta. En el libro,
  positivo entra a la cuenta y negativo sale.
- Los ids se arman con lo que imprime el banco y no cambian
  (`banco:tipo:últimos4:moneda`): las correcciones del usuario se atan a
  ellos, así que reimportar no debe cambiarlos.
- Todo endpoint con datos del banco va detrás de `localonly.Handler`.
- Migraciones: solo se agregan al final de `migrations` en
  `internal/store/store.go`; nunca se edita una ya publicada.
- Un formato nuevo de estado trae sus verificaciones (que los balances
  cuadren, que no falten páginas) y sus tests con `internal/testpdf`.
- Sin dependencias nuevas sin necesidad: casi todo sale de la biblioteca
  estándar.

### En la app (`app/`)

- Los datos salen siempre de domfin-api, con los hooks de
  `features/<feature>/api`. Nada de datos de ejemplo: si una pantalla
  necesita algo que la API no da, se agrega a la API.
- Las rutas de `src/app/` solo componen; la lógica vive en `src/features/`.
- Ningún texto visible escrito en un componente: va en
  `src/i18n/locales/en/<feature>.ts` y su traducción en `es/`. El español,
  neutro y de "tú"; los términos de la app son Transacciones (en la pestaña,
  Movimientos), Flujo de caja, Gastos, Patrimonio neto, Cuentas, Préstamos,
  Posesiones, Configuración, Saldo, Comercio y Monto.
- Solo tokens semánticos del tema (`theme.colors.*`, `theme.space[*]`…):
  nada de colores hex ni números sueltos, tampoco en las animaciones. Cada
  color tiene versión clara y oscura (`src/theme/themes.ts`), y
  `npm run contrast` revisa que el texto, los íconos y los gráficos se lean
  en las dos.
- Montos y fechas con `src/lib/format.ts` y `src/lib/dates.ts`, nunca con un
  locale fijo. Los montos se muestran con `Text`, para que el ojito los
  oculte.
- Dependencias con `npx expo install <paquete>`. `ios/` y `android/` se
  generan: no se suben.

Si cambias algo que describe un documento (`api/docs/`,
`app/docs/desarrollo.md`), actualízalo en el mismo pull request.

## Agregar un banco

1. En la API, un parser en `internal/statements` que reconozca el documento
   y devuelva sus movimientos, con sus verificaciones; que el importador lo
   pruebe (`internal/importer`), con tests que usen un PDF de
   `internal/testpdf`, y su descripción en `api/docs/estados-de-cuenta.md`.
2. En la app, el logo en `app/assets/institutions/<banco>.png` (192 px, fondo
   blanco, el símbolo ocupando cerca del 80 % del círculo) y su entrada, con
   el id que le da la API, en `app/src/features/accounts/lib/institutions.ts`.

## Commits y pull requests

- [Conventional Commits](https://www.conventionalcommits.org/), en inglés:
  `feat(statements): read Banreservas card statements`. Asunto en imperativo
  y de menos de 72 caracteres.
- Un pull request, un cambio. Explica qué y por qué; si cambia una pantalla,
  agrega una captura con los montos ocultos.
- El CI corre las pruebas de la parte que cambiaste.

## Publicar una versión

Para quien mantiene el proyecto. La app y la API comparten la versión:

1. Súbela en `api/internal/version/version.go`, `app/app.json` y
   `app/package.json` (y `npm install` en `app/`, para el
   `package-lock.json`). El CI revisa que coincidan.
2. Haz el commit, crea el tag (`git tag v0.2.0`) y súbelo
   (`git push origin v0.2.0`).
3. En GitHub, crea el release de ese tag con sus novedades. Las
   instalaciones verán el aviso en la app en unas horas.

## Licencia

Al contribuir, aceptas que tu aporte se publique con la licencia del
proyecto, [MIT](LICENSE), como el resto del código.
