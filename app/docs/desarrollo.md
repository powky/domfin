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
npm run contrast     # el contraste de los colores, en el tema claro y el oscuro
npm test             # las pruebas de lo que no tiene pantalla
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
- *Configuración → Respaldos* (`features/backup`) activa los respaldos
  cifrados de domfin-api en una carpeta de nube (`/backup/*`), los corre y
  restaura uno, aquí o en otra computadora. Restaurar cambia todo lo que la
  API tiene: la app vuelve a pedir el libro, los activos y las cuentas, y las
  tarjetas de Configuración se montan de nuevo (`useRestored`). La clave de
  recuperación se muestra una vez; en la web se puede copiar, y en el
  teléfono se selecciona.
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

## Íconos y pantalla de carga

Todos salen del logo (`LogoMark` en `src/components/brand/Logo.tsx`) con
`scripts/icons.sh`, que los dibuja con `rsvg-convert` (librsvg) e
ImageMagick:

| Archivo | Para qué | Cómo es |
| --- | --- | --- |
| `assets/icon.png` | iOS, y Android antes de los íconos adaptativos | 1024 px, naranja de borde a borde (el sistema redondea las esquinas) y la vela del tamaño que tiene en el logo. Sin transparencia, como pide Apple. |
| `assets/android-icon-foreground.png` | La capa de adelante del ícono adaptativo | La vela blanca en 108 dp, de los que se ven los 72 del medio; queda dentro de la zona segura de 66. El fondo es el `backgroundColor` naranja de `app.json`. |
| `assets/android-icon-monochrome.png` | El ícono temático de Android 13 | La misma vela: Android la pinta con los colores del tema. |
| `assets/splash-icon.png` | La pantalla de carga (`expo-splash-screen`) | El logo en los dos tercios del medio (Android 12 recorta a ese círculo), sobre el fondo de la app (`#F7F6F3`, y `#121110` con el modo oscuro del dispositivo), a 200 de ancho. |
| `assets/favicon.png` | La pestaña del navegador | El logo, 48 px. |

La pantalla de carga sigue hasta que el layout raíz tiene las fuentes, el
idioma, la moneda y la preferencia de montos; después `_layout.tsx` la
esconde. Los íconos y la pantalla de carga cambian con un development build
nuevo; el favicon, al recargar la web.

## Arquitectura

```
src/
  app/                    Rutas (Expo Router). Solo composición, sin lógica.
    _layout.tsx           Fuentes, pantalla de carga, SafeArea, Stack raíz
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
    brand/                Logo (de él salen los íconos: scripts/icons.sh)
  theme/
    tokens/               Tokens crudos: palette, spacing, radius, typography, layout, motion, elevation
    themes.ts             Tokens semánticos (colors.text.primary, colors.accent.subtle, ...), claros y oscuros
    appearance.ts         Sistema, claro u oscuro: la preferencia y cómo se aplica
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
- Responsive con breakpoints de Unistyles dentro de los estilos para tamaños,
  espacios y direcciones (`gap: { xs: …, md: … }`), sin re-renders. Para
  mostrar algo solo en el celular o solo en pantallas anchas, elige la
  versión con `usePhoneLayout()` (de `@/theme`; `rt.breakpoint` para otro
  corte) y dibuja solo esa. Nunca `display: 'none'` por breakpoint: en las
  compilaciones de prueba, React Native se cierra cuando cambian las vistas
  de alrededor (facebook/react-native#52349), incluso al arrancar. Una lista
  llama al hook una vez y pasa `phone` a sus filas.
- Decorados dentro de un botón (un ícono, un logo) van con
  `pointerEvents="none"`, para que el toque sea del botón: en Android, el SVG
  de un ícono puede quedárselo.
- Cada color tiene su versión clara y oscura (ver *Temas*): un token nuevo va
  en los dos temas.
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

### Temas: claro y oscuro

- `src/theme/themes.ts` da a cada token semántico su color en el tema claro y
  en el oscuro. El oscuro usa grises cálidos, con las tarjetas más claras que
  el fondo, y conserva el naranja de la marca: sobre él, las etiquetas y las
  marcas van oscuras, y el texto naranja es un tono más claro. Los gráficos y
  los avatares de marca tienen los mismos colores en los dos temas, salvo los
  pocos que no se leían sobre el fondo oscuro. El logo no cambia
  (`colors.brand`).
- *Configuración → Apariencia* elige Sistema, Claro u Oscuro, y se guarda en
  el dispositivo (`src/theme/appearance.ts`). Con Sistema, la app sigue el
  modo del dispositivo y cambia con él aunque esté abierta. En iOS y Android,
  lo que el sistema dibuja dentro de la app (el teclado en iOS, las barras de
  desplazamiento) sigue el tema elegido (`Appearance.setColorScheme`). La app
  elige el tema y Unistyles lo pone con `setTheme`, sin `adaptiveThemes`.
- `npm test` (`scripts/test.mjs`) corre los `*.test.ts` de `src` con el
  corredor de pruebas de Node, que lee TypeScript solo (22.18 o más nuevo):
  es para lo que no tiene pantalla, así que esos archivos no importan nada
  de React Native. Corre en CI.
- `npm run contrast` (`scripts/contrast.mjs`) revisa que lo que la app pone
  junto se lea en los dos temas, con los mínimos de WCAG 2.2 AA: 4.5:1 el
  texto; 3:1 los íconos, los gráficos y el borde de los controles. Un token
  nuevo que sea texto o ícono va también en su lista de pares. El tema claro
  es anterior a esta revisión y tiene pares por debajo (`pendingInLight`, con
  el contraste de hoy, que no puede bajar). Corre en CI.
- En la web, Unistyles cambia los colores del tema por variables CSS dentro de
  `StyleSheet.create`, así que ahí no se puede operar con ellos (agregarles
  transparencia, compararlos). Para eso `useUnistyles()` da los valores
  reales, como en el Sankey. Por lo mismo las sombras (`elevation`, en
  `tokens/`) están fuera del tema: una variable no acepta la opacidad de la
  sombra.
- El fondo de cada tema está también en `app.json` (la pantalla de carga y su
  variante oscura) y en `public/index.html` (lo que pinta la web mientras
  carga la app): si cambia, cámbialo ahí.

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
  datos nuevos (líneas, barras, dona, Sankey, barras de progreso). Las líneas
  y el Sankey aparecen de izquierda a derecha con `Wipe`, que recorta con una
  vista y no con un `ClipPath` animado dentro del SVG: Android no vuelve a
  pintar un `ClipPath` que cambia y la gráfica se quedaba vacía.
- **Reduce motion**: `useReducedMotion()` (de `components/motion`) sigue el
  ajuste del sistema en vivo. Con él activo nada se mueve: fundidos cortos y los
  valores saltan. Para probarlo en web: `__setReducedMotion(true)` en la consola.
