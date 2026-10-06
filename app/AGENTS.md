# La app de Domfin (`app/`)

App de Domfin en Expo (SDK 57) para iOS, Android y web, con Expo Router,
Unistyles v3, Reanimated e i18next. La arquitectura, las reglas del design
system, las monedas y las animaciones están en `docs/desarrollo.md`; léelo
antes de tocar una pantalla y mantenlo al día. Las reglas para contribuir,
en `../CONTRIBUTING.md`; cómo se monta, en `../README.md`.

## Comandos

```bash
npm run web                 # dev server web
npm run typecheck           # tsc --noEmit
npm run lint                # expo lint
npm run contrast            # contraste de los colores, en el tema claro y el oscuro
npm test                    # pruebas (src/**/*.test.ts) con el corredor de Node
npx expo install <paquete>  # siempre en vez de npm install <paquete>: elige la versión del SDK
npx expo-doctor             # problemas de dependencias y configuración
```

Corre typecheck, lint y contrast antes de dar algo por terminado, y di qué
cambiaste y cómo revisarlo en la app.

## Expo cambia en cada SDK: no confíes en lo que recuerdas

Antes de escribir código con una API de Expo, EAS o React Native, lee la
documentación de la versión instalada
(`https://docs.expo.dev/versions/v57.0.0/`) o el índice
`https://docs.expo.dev/llms.txt`. Nunca respondas de memoria.

- `ios/` y `android/` se generan (Continuous Native Generation): no los crees
  ni los edites; configura en `app.json` y con config plugins. Si algo los
  genera, bórralos y revierte los cambios de `app.json` o `package.json`
  antes del commit.
- `modules/domfin-engine` compila el motor en Go (`../api/mobile`) con
  gomobile durante el build nativo: hace falta Go y, en Android, el NDK
  (Android Studio → SDK Manager → NDK).
- Unistyles, `expo-document-picker` y `expo-splash-screen` traen código
  nativo: no funcionan en Expo Go, y un development build anterior a una
  dependencia nativa nueva hay que volver a compilarlo.
- Los íconos, la pantalla de carga y el favicon salen del logo con
  `scripts/icons.sh`: si el logo cambia, córrelo otra vez.

## Datos

No hay mocks: las pantallas leen de domfin-api con los hooks de
`features/<feature>/api`, que usan `services/api/client.ts`. En iOS y
Android, `client.ts` le habla al motor que la app lleva adentro
(`modules/domfin-engine`), que responde lo mismo.

| Pantalla | Fuente |
| --- | --- |
| Importar estados | `POST /statements/import`, `GET /statements/coverage` |
| Cuentas, Patrimonio neto, Préstamos | `GET /accounts` (`features/accounts`, `useLiveAccounts`) |
| Transacciones, Gastos, Flujo de caja, detalle de cuenta | El libro: `GET /ledger/movements` y `/ledger/categories` (`features/ledger`, `useLedger`) |
| Tasa de cambio (Configuración, sidebar) | `GET /rates/usd-dop` |
| Respaldos (Configuración) | `/backup/*` (`features/backup`) |
| Posesiones e inversiones (casa en plano, acciones, fondo de pensiones, vehículo) y deudas fuera de tus estados | `/ledger/assets` (`features/ledger`, `useAssets`); salen también en `GET /accounts` como `asset:<id>` |
| Presupuesto | `/ledger/budget` (`features/budget`) |
| Cuándo termina cada préstamo | `/ledger/loans` (`features/loans`, `useLoanPlans`) |

El modelo del libro (ids, signos, flujos, categorías) está en
`../api/docs/modelo-de-datos.md`. Lo que el banco no da no se inventa: los
historiales de préstamo no traen la tasa ni la cuota, así que las pone el
usuario, y sin ellas no hay amortización.
Si una pantalla necesita algo que la API no expone, agrégalo a la API en vez
de simularlo en la app. Sin datos para el periodo, usa `DataNotice`.

## Reglas que más se olvidan

- Ningún texto visible en los componentes: va en
  `src/i18n/locales/en/<feature>.ts` y su traducción en `es/`, en español
  neutro de "tú" (glosario: Transacciones, que en la pestaña es
  Movimientos; Flujo de caja, Gastos, Patrimonio neto, Cuentas, Préstamos,
  Configuración, Saldo, Comercio, Monto). Un texto que habla de domfin-api
  o de la computadora lleva su versión del teléfono en
  `locales/<idioma>/phone.ts` (un test lo revisa).
- Solo tokens semánticos del tema; nada de hex ni números sueltos, tampoco en
  las animaciones (`theme.motion`). Cada color tiene versión clara y oscura:
  un token nuevo va en los dos temas, y si es texto o ícono, en los pares de
  `scripts/contrast.mjs`.
- Montos y fechas con `src/lib/format.ts` y `src/lib/dates.ts`; nunca un
  locale fijo.
- Rutas en `src/app/` solo componen; la lógica vive en `src/features/`.
- Un banco nuevo lleva su logo en `assets/institutions/<banco>.png` (192 px,
  fondo blanco, el símbolo ocupando cerca del 80 % del círculo) y su entrada,
  con el id que le da domfin-api, en `src/features/accounts/lib/institutions.ts`.

## Datos reales

Nada de datos reales en el repositorio: ni PDF, ni bases, ni números de
cuenta, nombres o montos de estados de verdad en ejemplos, placeholders o
tests.
