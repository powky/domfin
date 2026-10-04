# El motor de Domfin dentro de la app (prueba)

Prueba de concepto para quitar la API como pieza aparte: la app de iOS lleva
adentro el mismo código de domfin-api (`api/mobile`, compilado con gomobile)
y le habla por un puerto de 127.0.0.1 del propio teléfono, sin computadora.

## Probarlo

Desde `app/`:

1. El motor ya está compilado en `ios/DomfinEngine.xcframework` (no va en
   git). Si cambia la API, `modules/domfin-engine/build.sh` lo hace de
   nuevo; tarda menos de un minuto.
2. `npx expo run:ios`: un development build nuevo, porque trae un módulo
   nativo.
3. Con la app abierta en el simulador, `modules/domfin-engine/samples.sh`
   deja cuatro estados inventados en *Archivos → En mi iPhone → Domfin*:
   una tarjeta, una cuenta de ahorro escaneada (pasa por el OCR), un
   préstamo y un certificado.
4. En la app, *Importar estados* y elige esos cuatro. La terminal de Metro
   dice cuánto tardó el motor en arrancar y cada respuesta
   (`motor de Domfin: …`).

Qué mirar:

- Que importe los cuatro y que Cuentas, Movimientos y Flujo de caja los
  muestren.
- Cuánto tarda. En la Mac, el motor arranca en unos 10 ms e importa los
  cuatro en unos 0.4 s.
- Cuánto pesa: *Configuración → General → Almacenamiento del iPhone →
  Domfin*. El motor son unos 20 MB sin comprimir.

En esta rama, la app de iOS usa siempre su propio motor, con una base nueva
en el teléfono, y no el domfin-api de la Mac. Android y la web no cambian.

## Cómo está hecho

- `api/internal/server` arma la API: `cmd/api` la sirve en un puerto de la
  computadora y `api/mobile` en 127.0.0.1, dentro de la app.
- `ios/DomfinEngineModule.swift` arranca el motor, con su base en
  *Application Support/Domfin*, y devuelve el puerto.
- `src/services/api/client.ts` usa ese puerto cuando la app trae el módulo.

Si la prueba sale bien, falta: Android (el mismo motor como `.aar`), llamar
al motor sin abrir un puerto, y compilarlo en CI en vez de a mano.
