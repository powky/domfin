# La app por dentro

Cómo está hecha la app: de dónde sale cada dato, la estructura de carpetas y
las reglas del design system, las monedas y las animaciones. Para montar
Domfin, ver el [README principal](../../README.md); para proponer cambios,
[CONTRIBUTING.md](../../CONTRIBUTING.md).

```bash
npm install
npm run web          # web, en http://localhost:8081
npx expo run:ios     # development build (Unistyles usa módulos nativos: Expo Go no sirve)
npx expo run:android
npm run typecheck && npm run lint
```

## Datos

No hay datos de ejemplo: todo sale de los estados de cuenta importados en
domfin-api. Sin estados, las pantallas lo dicen y llevan a importarlos.

- *Importar estados* (`/imports`) sube los PDF del banco a domfin-api
  (`POST /statements/import`), que los abre con la contraseña guardada en
  *Configuración* (o la de `STATEMENTS_PDF_PASSWORD`), y muestra qué meses
  tiene cada cuenta. El selector de archivos
  (`expo-document-picker`) es un módulo nativo: los development builds
  anteriores a él no lo traen, así que hay que volver a compilarlos para
  importar desde iOS o Android.
- *Cuentas*, *Patrimonio neto* y *Préstamos* salen de `GET /accounts`: las
  cuentas de los estados, con sus balances de fin de mes. Los historiales de
  préstamo no traen tasa ni plazo, así que Préstamos muestra balance y pagos,
  sin amortización.
- *Transacciones*, *Gastos*, *Flujo de caja* y el detalle de cada cuenta salen
  del libro (`features/ledger`: `GET /ledger/movements` y
  `/ledger/categories`), que se pide una vez para todos los meses y se
  refresca al importar. Marcar como revisada, ocultar o agregar una
  transacción a mano solo dura la sesión: la API aún no los guarda.
- La clasificación se ajusta en la app y la guarda domfin-api: en
  *Transacciones*, la categoría de cada fila es un selector (o se
  seleccionan varios movimientos y *Categorizar*), con una corrección por
  movimiento. El selector solo ofrece lo que tiene sentido para el
  movimiento (`fits` en `features/ledger/lib/fit.ts`): lo que entra a una
  cuenta es ingreso o una transferencia de entrada, nunca un retiro. Si lo
  corregido es una transferencia a una persona o cuenta
  (`recipientOf`, `lib/recipient.ts`), la app ofrece crear la regla para
  todas las de esa persona. En *Configuración*, la *Nómina* (cuenta, texto y
  días de pago, que separan Salario de Ingreso adicional) y las *Reglas*.
  Guardar vuelve a clasificar todo.
- *Inversiones que ningún estado muestra* (una casa comprada en plano,
  acciones, el fondo de pensiones, un vehículo) y *deudas fuera de tus
  estados* (un préstamo de un familiar, o uno que paga tu empleador): las
  posesiones tienen su pantalla, *Posesiones* (`/possessions`), por tipo, con
  lo que vale cada una y, en un inmueble, cómo va su plan de pagos (o el botón
  para agregarlo). Se agregan desde ahí o desde *Cuentas → Agregar inversión
  o deuda* (ruta
  `/investments/new`; `/assets` no sirve, Metro la usa en desarrollo) y
  domfin-api las guarda (`/ledger/assets`). La casa tiene precio y plan de
  pagos (reserva, inicial, cuotas cada *n* meses, entrega); su página
  muestra qué está pagado y qué falta, y sus pagos se vinculan solos por un
  texto de la descripción o desde *Transacciones → Vincular a*. Cuentan en
  Patrimonio neto, y en Flujo de caja van aparte de los gastos, como
  Inversiones. Una deuda se vincula igual (lo que te prestaron y lo que
  pagas): sale en Préstamos y resta en Patrimonio neto; su id empieza por
  `asset:` como las inversiones (`isAsset`), pero su tipo es `loan`. El
  fondo de pensiones (la AFP) lleva los saldos de sus estados, con su fecha:
  vale el más reciente, suma en Patrimonio neto como *Pensiones* y nunca es
  ingreso, porque lo que la nómina le aporta no pasa por tus cuentas. Un
  vehículo vale lo que costó menos lo que pierde cada año (*Vehículos* en
  Patrimonio neto). Una deuda con *plan de cuotas* (saldo a una fecha, tasa,
  primera y última cuota) baja con sus cuotas sin movimientos: es para un
  préstamo que otro paga por ti, y en Préstamos sus pagos salen de ese plan.
- Los periodos van de enero del año pasado al mes en curso (`LEDGER_MONTHS`
  en `src/lib/period.ts`).
- La tasa de cambio viene de `GET /rates/usd-dop`. Los ingresos, gastos,
  inversiones y pagos en otra moneda se suman con el valor de cada movimiento
  a la tasa del BCRD de su fecha (`amounts` del libro, `valueInDisplay`): lo
  que entra a la tasa de compra y lo que sale a la de venta. Los saldos van a
  la tasa de hoy.

domfin-api solo acepta los pedidos con datos del banco desde la misma
computadora (web o simulador).

Las versiones nuevas: domfin-api pregunta a GitHub por los releases
(`GET /updates`) y `features/updates` muestra el aviso en la barra lateral,
en *Más* y en *Configuración → Acerca de Domfin*. La versión de la app es la
de `app.json`.

## Arquitectura

```
src/
  app/                    Rutas (Expo Router). Solo composición, sin lógica.
    _layout.tsx           Fuentes, SafeArea, Stack raíz
    (app)/_layout.tsx     AppShell: sidebar (md+) o tab bar (móvil)
    (app)/cash-flow.tsx   Cada ruta monta la pantalla de su feature
  features/<feature>/     Un módulo por dominio (cash-flow, transactions, ...)
    api/                  Hooks de datos (domfin-api)
    components/           Pantalla y componentes propios del feature
    lib/                  Lógica pura (p. ej. layout del Sankey)
    types.ts              Tipos del dominio
    index.ts              API pública del feature
  components/
    ui/                   Primitivas del design system (Text, Card, SegmentedControl, ...)
    motion/               Animaciones: entradas escalonadas, odómetro, indicadores, reduce motion
    navigation/           AppShell, Sidebar, BottomTabBar y config de navegación
    brand/                Logo
  theme/
    tokens/               Tokens crudos: palette, spacing, radius, typography, layout, motion
    themes.ts             Tokens semánticos (colors.text.primary, colors.accent.subtle, ...)
    breakpoints.ts        xs 0 · sm 576 · md 768 · lg 1024 · xl 1280
    unistyles.ts          StyleSheet.configure + tipos
  services/api/           Cliente HTTP compartido
  i18n/                   Idiomas con i18next: diccionarios en/ y es/ por feature, el idioma
                          del sistema o el guardado en Configuración, y el locale de formatos
  lib/                    Utilidades (formato de moneda, porcentajes y fechas en el locale,
                          meses de los periodos)
```

### Reglas

- Los componentes solo leen tokens semánticos del tema (`theme.colors.*`,
  `theme.space[*]`, `theme.radius.*`, `theme.font.*`); nunca hex ni números mágicos.
- Responsive con breakpoints de Unistyles dentro de los estilos
  (`display: { xs: 'none', md: 'flex' }`), sin re-renders.
- Para agregar dark mode: crear `darkTheme` con la misma forma en `themes.ts`,
  añadirlo a `appThemes` y activar `adaptiveThemes`.
- Las pantallas consumen datos solo vía hooks en `features/<feature>/api`.
- Ningún texto visible se escribe en los componentes: va como clave en
  `src/i18n/locales/en/<feature>.ts` y su traducción en `es/` (TypeScript exige que el
  español tenga todas las claves). Español neutro latinoamericano, de "tú". Los nombres
  que vienen de los datos (comercios, cuentas, notas) no se traducen. domfin-api nombra
  sus categorías en español; en inglés se traducen por id con `categoryLabel` y
  `groupLabel` (`src/i18n/locales/en/categories.ts`).
- Montos y fechas siempre con `src/lib/format.ts` y `src/lib/dates.ts`, que usan el
  idioma de la app con la región del dispositivo (es-US, es-DO...). Nunca `'en-US'` fijo.
- Dentro de `<Link asChild>` usar `Touchable` (de `components/ui`), porque el
  Slot de Expo Router no acepta arrays de estilos.

### Monedas

- Cada cuenta tiene moneda (`DOP` o `USD`), y sus transacciones y préstamos
  la heredan. Filas y páginas de una cuenta, transacción o préstamo muestran
  su propia moneda; totales y gráficos que mezclan monedas usan la moneda de
  visualización (RD$ por defecto) que se elige en Configuración.
- Los montos se formatean con `formatCurrency(amount, currency?)`, que escribe
  `RD$` o `US$` (Intl solo lo hace con es-DO). Sin `currency`, usa la de
  visualización; el componente que lo haga debe suscribirse con
  `useDisplayCurrency()` o `useConverter()` para cambiar cuando se elige otra.
- Para convertir, los hooks de datos usan `useConverter()` de
  `features/currency`: toma la tasa de domfin-api (`GET /rates/usd-dop`, tasa
  de referencia del BCRD) y convierte al promedio de compra y venta. Si la API
  no responde, usa la última tasa conocida (la última respuesta se guarda en
  el dispositivo) y lo indica.
- Ingresos, gastos e inversiones se suman movimiento por movimiento con su
  valor a la tasa del BCRD de su fecha, que da domfin-api (`amounts`): lo que
  entra a la tasa de compra y lo que sale a la de venta (`valueInDisplay` de
  `features/currency`, `monthlyValues` de `features/ledger`). Así un mes
  cerrado no cambia con la tasa de hoy. Los saldos (Cuentas, Patrimonio neto)
  sí van a la tasa de hoy.
- El ojito de cada encabezado (`AmountsToggle`) tapa los montos:
  `src/lib/privacy.ts` guarda la preferencia y `Text` (y `Odometer`) cambian
  por x los dígitos que van junto a `RD$` o `US$`. Un texto público, como la
  tasa de cambio, lleva `revealAmounts`.

### Animaciones

Con Reanimated, en web y nativo. Duraciones, curvas y resortes salen de
`theme.motion` (`src/theme/tokens/motion.ts`); nada de números sueltos.

- **Pantallas**: `Screen` entra con un fundido y un deslizamiento corto: desde
  la derecha al avanzar (un detalle, una sección más abajo en la navegación) y
  desde la izquierda al volver. La dirección sale de `navDirection`.
- **Tarjetas**: `Card`, `StatCard` y `Reveal` suben en orden de lectura cuando
  abre la pantalla. Lo que monta después aparece sin animación.
- **Selección**: tab bar, sidebar y `SegmentedControl` usan `useSlidingIndicator`.
- **Números**: `StatCard` pinta su valor con `Odometer`; los dígitos ruedan al
  cambiar de periodo.
- **Gráficos**: se dibujan la primera vez y después se transforman hacia los
  datos nuevos (líneas, barras, dona, Sankey, barras de progreso).
- **Reduce motion**: `useReducedMotion()` (de `components/motion`) sigue el
  ajuste del sistema en vivo. Con él activo nada se mueve: fundidos cortos y los
  valores saltan. Para probarlo en web: `__setReducedMotion(true)` en la consola.
