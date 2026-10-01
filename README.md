# Domfin

Tus finanzas personales en República Dominicana, armadas con los estados de
cuenta de tu banco: en pesos y en dólares, y sin que tu información salga de
tu computadora.

Domfin lee los PDF que te da tu banco, clasifica cada movimiento y te muestra
a dónde se fue tu dinero, cuánto tienes y cuánto debes.

## Qué hace

- **Flujo de caja**: lo que entró y a dónde se fue, en un diagrama de Sankey
  (ingresos, gastos por grupo, inversiones, lo que quedó en tus cuentas y lo
  que cubriste con préstamos), y una tabla con el porcentaje de tus
  ingresos.
- **Gastos**: por grupo, por categoría y por comercio, mes a mes.
- **Transacciones**: cada movimiento clasificado solo (por el código del
  comercio, la descripción del banco, tu nómina y tus reglas). Lo que falte
  lo cambias desde la fila, y Domfin te ofrece crear la regla para la
  próxima vez.
- **Patrimonio neto**, **Cuentas** y **Préstamos**: tus saldos de fin de mes,
  con su historia.
- **Posesiones**: lo que tienes y ningún estado muestra, como un apartamento
  comprado en plano (con su plan de pagos), acciones, tu fondo de pensiones
  (AFP) o tu vehículo. También las deudas fuera del banco.
- **Pesos y dólares**: cada movimiento se convierte con la tasa del Banco
  Central del día en que ocurrió.
- **Montos ocultos**: el ojito de arriba los cambia por `RD$x,xxx.xx` cuando
  alguien más puede ver tu pantalla.
- En español y en inglés, en la web, iOS y Android.

## Qué bancos lee

| Banco | Documentos |
| --- | --- |
| Banco Popular | Estados de tarjeta de crédito, estados de cuentas de ahorro y corrientes (escaneados o impresos), historiales de préstamo (incluido el Extracrédito) y de certificado financiero. |
| Qik | Estados de tarjeta de crédito. |

¿Tu banco no está? Mira [cómo agregar uno](CONTRIBUTING.md#agregar-un-banco).

## Tu información no sale de tu computadora

- Domfin son dos programas que corren en tu computadora: domfin-api
  ([`api/`](api)), que lee y guarda tus estados, y la app ([`app/`](app)).
  No hay cuentas que crear, ni servidor en la nube, ni conexión con tu
  banco: tú le das los PDF.
- domfin-api solo le da tus datos a esta misma computadora, nunca a otros
  equipos de tu red.
- La contraseña de tus PDF se guarda en la base local, que solo tu usuario
  puede leer. Domfin nunca la muestra.
- Domfin solo se conecta a Internet para buscar la tasa del dólar del Banco
  Central (una vez al día) y para ver si hay una versión nueva en GitHub
  (como mucho dos veces al día; se puede apagar). Ninguna de las dos lleva
  datos tuyos.

## Cómo montarlo

### Lo que necesitas

- macOS, Linux o Windows.
- [Git](https://git-scm.com/downloads).
- [Go](https://go.dev/dl/) 1.26 o más nuevo, para domfin-api.
- [Node.js](https://nodejs.org/) 20.19.4 o más nuevo (la versión LTS sirve),
  con npm, para la app.

### 1. Descarga Domfin

```bash
git clone https://github.com/powky/domfin.git
cd domfin
```

### 2. Arranca domfin-api

```bash
cd api
go run ./cmd/api
```

La primera vez descarga sus dependencias. Cuando diga
`domfin-api escuchando en :8080`, déjala corriendo en esa terminal.

### 3. Arranca la app

En otra terminal, desde la carpeta `domfin`:

```bash
cd app
npm install
npm run web
```

Abre [http://localhost:8081](http://localhost:8081) en tu navegador.

### 4. Primeros pasos

1. **Configuración → Contraseña de los PDF**: guarda la contraseña con que
   tu banco protege los estados (en el Popular, la de los estados de
   tarjeta).
2. **Importar estados**: elige tus PDF, varios a la vez si quieres. Domfin
   te dice qué meses tiene cada cuenta y si algo no cuadró. Importar dos
   veces el mismo estado no duplica nada.
3. **Configuración → Nómina**: la cuenta donde cobras, el texto con que
   llega tu salario (como `nomina`) y tus días de pago. Así separa tu salario
   de los ingresos adicionales.
4. **Transacciones**: revisa lo que quedó *Sin categoría*. Al corregir una
   transferencia a una persona, Domfin te ofrece la regla para todas las
   suyas.
5. **Posesiones**: agrega tu casa, tus acciones, tu AFP o tu vehículo, si
   aplica.

Cada mes, descarga tus estados nuevos e impórtalos.

### Tus datos y tus respaldos

Todo queda en un solo archivo, `domfin.db`:

| Sistema | Dónde |
| --- | --- |
| macOS | `~/Library/Application Support/domfin-api/domfin.db` |
| Linux | `~/.config/domfin-api/domfin.db` |
| Windows | `%AppData%\domfin-api\domfin.db` |

Para respaldar, copia ese archivo con domfin-api apagada. Los PDF quedan
donde los tengas: Domfin no los copia.

### Actualizar

Cuando hay una versión nueva, la app lo avisa en la barra lateral (o en
*Más*, en el teléfono), y en *Configuración → Acerca de Domfin* ves qué
trae. Para actualizar, apaga los dos programas y, desde la carpeta
`domfin`:

```bash
git pull
cd app && npm install
```

Vuelve a arrancarlos como en los pasos 2 y 3. Tu base se pone al día sola.

### En el teléfono

La app también corre en iOS y Android, con un
[development build](https://docs.expo.dev/develop/development-builds/introduction/)
de Expo (Expo Go no sirve: usa módulos nativos). Desde `app/`:

```bash
npx expo run:ios       # simulador de iOS, en macOS con Xcode
npx expo run:android   # emulador de Android, con Android Studio
```

Por privacidad, domfin-api solo le da tus datos a la computadora donde
corre: funciona en el simulador o el emulador de esa computadora, pero no
en un teléfono de verdad. En el emulador de Android, apunta la app a la
computadora con `EXPO_PUBLIC_API_URL=http://10.0.2.2:8080`.

### Configuración avanzada

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | Dónde está domfin-api. | `http://localhost:8080` |

Ponla en un archivo `.env` en `app/` (copia `app/.env.example`). Las
opciones de domfin-api están en [su README](api/README.md#configuración).

### Si algo falla

- **"¿Está corriendo domfin-api?"**: arráncala (paso 2) y recarga la app.
  Si usas otro puerto, cambia `EXPO_PUBLIC_API_URL`.
- **Un PDF "tiene contraseña"**: guárdala en *Configuración → Contraseña de
  los PDF*.
- **Un mes sale con ⚠**: algo no cuadró al leerlo (un balance, una página).
  El detalle sale en *Importar estados*. Si crees que es un error de
  Domfin, abre un issue describiéndolo **sin datos reales**.
- **"No es un estado que Domfin sepa leer"**: ese banco o documento aún no
  está soportado.

## Cómo está hecho

| Carpeta | Qué es |
| --- | --- |
| [`api/`](api) | domfin-api, en Go: lee los PDF, los guarda en SQLite, clasifica cada movimiento y trae la tasa del Banco Central. Sus documentos: [endpoints](api/docs/endpoints.md), [estados de cuenta](api/docs/estados-de-cuenta.md) y [el libro y la clasificación](api/docs/modelo-de-datos.md). |
| [`app/`](app) | La app, en Expo (React Native): web, iOS y Android. Por dentro: [docs/desarrollo.md](app/docs/desarrollo.md). |

Para proponer cambios, mira [CONTRIBUTING.md](CONTRIBUTING.md); para
reportar un problema de seguridad, [SECURITY.md](SECURITY.md).

## Licencia

Domfin es de código abierto, con la licencia [MIT](LICENSE): puedes usarlo,
estudiarlo, modificarlo, compartirlo y venderlo, siempre que mantengas el
aviso de copyright. El nombre "Domfin" y su logo no son parte de la
licencia: no los uses para presentar otro producto como si fuera este.
