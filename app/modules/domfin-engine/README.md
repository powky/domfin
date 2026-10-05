# El motor de Domfin dentro de la app (prueba)

Prueba de concepto para quitar la API como pieza aparte: las apps de iOS y
Android llevan adentro el mismo código de domfin-api (`api/mobile`,
compilado con gomobile) y le hablan por un puerto de 127.0.0.1 del propio
teléfono, sin computadora. No hay código duplicado: el Go es uno solo, en
`api/`, y lo que sale de compilarlo (`ios/DomfinEngine.xcframework`,
`android/libs` y `android/src/main/jniLibs`) no va en git.

## Probarlo

Desde `app/`:

1. `npx expo run:ios` o `npx expo run:android`. El build compila también el
   motor (`build.sh`, desde el pod `ExpoDomfinEngine` en iOS y desde
   `android/build.gradle` en Android), y solo lo recompila si cambió algo en
   `api/`: un cambio en el Go llega al teléfono con solo recompilar la app.
   En Android se compila para las mismas arquitecturas que la app: la del
   dispositivo al probar, las cuatro en una release.
2. Con la app abierta, `modules/domfin-engine/samples.sh` (iOS) o
   `modules/domfin-engine/samples.sh android` deja cuatro estados inventados
   donde el selector de archivos los encuentra: *Archivos → En mi iPhone →
   Domfin* en el simulador, *Download/Domfin* en Android. Son una tarjeta,
   una cuenta de ahorro escaneada (pasa por el OCR), un préstamo y un
   certificado.
3. En la app, *Importar estados* y elige esos cuatro. La terminal de Metro
   dice cuánto tardó el motor en arrancar y cada respuesta
   (`motor de Domfin: …`); el registro del dispositivo, lo mismo visto desde
   Go (`GoLog` en Android, `org.golang.mobile` en iOS).

En esta rama, las apps de iOS y Android usan siempre su propio motor, con una
base nueva en el teléfono, y no el domfin-api de la computadora. La web no
cambia.

## Lo que se vio (4 de octubre de 2026)

| | iPhone 17 Pro (simulador) | Pixel 9 (emulador, Android 16) |
| --- | --- | --- |
| Arranque del motor | 40 ms (300 ms la primera vez, que crea la base) | 420-560 ms |
| Lecturas, medidas en Go | 2-4 ms | 1-12 ms |
| Importar los cuatro estados, OCR incluido | 0.43 s | 0.61 s |

En los dos, la tasa del BCRD y el aviso de versiones llegan desde el
teléfono y los datos siguen ahí al cerrar y abrir la app.

## Cómo está hecho

- `api/internal/server` arma la API: `cmd/api` la sirve en un puerto de la
  computadora y `api/mobile` en 127.0.0.1, dentro de la app.
- `ios/DomfinEngineModule.swift` y
  `android/src/main/java/.../DomfinEngineModule.kt` arrancan el motor, con su
  base en *Application Support/Domfin* (iOS) o en `files/Domfin` (Android), y
  devuelven el puerto.
- `src/services/api/client.ts` usa ese puerto cuando la app trae el módulo.
- Android solo deja usar HTTP sin cifrar en las compilaciones de prueba; las
  release lo permiten solo para `localhost`
  (`android/src/release/res/xml/domfin_engine_network.xml`).

Si se sigue, falta: llamar al motor sin abrir un puerto y compilarlo en CI.
