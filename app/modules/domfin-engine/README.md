# El motor de Domfin dentro de la app (prueba)

Prueba de concepto para quitar la API como pieza aparte: la app de iOS lleva
adentro el mismo código de domfin-api (`api/mobile`, compilado con gomobile)
y le habla por un puerto de 127.0.0.1 del propio teléfono, sin computadora.
No hay código duplicado: el Go es uno solo, en `api/`, y
`ios/DomfinEngine.xcframework` es lo que sale de compilarlo (no va en git).

## Probarlo

Desde `app/`:

1. `npx expo run:ios`. El build compila también el motor (`build.sh`, desde
   el pod `ExpoDomfinEngine`), y solo lo recompila si cambió algo en
   `api/`: un cambio en el Go llega al teléfono con solo recompilar la app.
2. Con la app abierta en el simulador, `modules/domfin-engine/samples.sh`
   deja cuatro estados inventados en *Archivos → En mi iPhone → Domfin*:
   una tarjeta, una cuenta de ahorro escaneada (pasa por el OCR), un
   préstamo y un certificado.
3. En la app, *Importar estados* y elige esos cuatro. La terminal de Metro
   dice cuánto tardó el motor en arrancar y cada respuesta
   (`motor de Domfin: …`); el registro del simulador, lo mismo visto desde
   Go (`org.golang.mobile`).

En esta rama, la app de iOS usa siempre su propio motor, con una base nueva
en el teléfono, y no el domfin-api de la Mac. Android y la web no cambian.

## Lo que se vio en el simulador (4 de octubre de 2026)

- El motor arranca en 40 ms (300 ms la primera vez, que crea la base).
- Las lecturas tardan 2-4 ms en Go.
- Importar los cuatro estados, OCR incluido, tarda 0.43 s.
- La tasa del BCRD y el aviso de versiones llegan desde el teléfono.
- Los datos siguen ahí al cerrar y abrir la app.

## Cómo está hecho

- `api/internal/server` arma la API: `cmd/api` la sirve en un puerto de la
  computadora y `api/mobile` en 127.0.0.1, dentro de la app.
- `ios/DomfinEngineModule.swift` arranca el motor, con su base en
  *Application Support/Domfin*, y devuelve el puerto.
- `src/services/api/client.ts` usa ese puerto cuando la app trae el módulo.

Si se sigue, falta: Android (el mismo motor como `.aar`), llamar al motor
sin abrir un puerto, y compilarlo en CI.
