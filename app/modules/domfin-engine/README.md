# El motor de Domfin dentro de la app

Para que el teléfono no necesite una computadora, las apps de iOS y Android
llevan adentro el mismo código de domfin-api (`api/mobile`, compilado con
gomobile) y le hablan por un puerto de 127.0.0.1 del propio teléfono. Ahí
llegan también las demás apps del teléfono, así que el motor solo le
responde a quien manda el secreto que genera en cada arranque (`Token`). No hay código duplicado: el Go es uno solo, en
`api/`, y lo que sale de compilarlo (`ios/DomfinEngine.xcframework`,
`android/libs` y `android/src/main/jniLibs`) no va en git.

## Probarlo

Necesitas Go (`./domfin setup` lo instala si falta) y, para Android, el NDK
(Android Studio → SDK Manager → NDK). Desde `app/`:

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

Las apps de iOS y Android usan siempre su propio motor, con su base en el
teléfono, y no el domfin-api de la computadora. La web sigue con domfin-api.

## Lo que se vio (4 de octubre de 2026)

| | iPhone 17 Pro (simulador) | Pixel 9 (emulador, Android 16) |
| --- | --- | --- |
| Arranque del motor | 40 ms (300 ms la primera vez, que crea la base) | 420-560 ms |
| Lecturas, medidas en Go | 2-4 ms | 1-12 ms |
| Importar los cuatro estados, OCR incluido | 0.43 s | 0.61 s |

En los dos, la tasa del BCRD y el aviso de versiones llegan desde el
teléfono y los datos siguen ahí al cerrar y abrir la app.

## Prueba de punta a punta (5 de octubre de 2026)

Con todo lo de `main` (presupuesto, compartir PDF), sin domfin-api ni
computadora:

- En Android, el primer arranque crea la base. Después se restauró ahí un
  respaldo cifrado hecho en la computadora (con la contraseña de respaldo,
  en 0.9 s), y Flujo de caja, Presupuesto y Nómina mostraron sus 21 meses.
  Lo que se agrega (un gasto fijo) sigue ahí al cerrar la app, y sin
  internet todo funciona salvo la tasa del día, que sale de la última
  guardada.
- Compartir varios PDF desde Archivos los importa en el motor, con la app
  abierta y, en una release, con la app cerrada. El escaneado (con OCR)
  tarda 0.5-0.6 s y el resto menos de 20 ms. La contraseña de los PDF se
  guarda en la misma pantalla y el que la necesitaba se importa solo.
- En una release de Android, la app abre en ~0.5 s, el motor arranca en
  14-21 ms y responde el libro completo en 75-112 ms. El APK de arm64 pesa
  67 MB, de los que el motor ocupa 17.6 MB (sin comprimir).
- En iOS (simulador), el motor arranca en 68 ms (223 ms en frío) e importó
  cuatro PDF compartidos.

Se arreglaron:
- Cualquier app del teléfono podía leer los datos por 127.0.0.1. Ahora el
  motor pide un secreto nuevo en cada arranque (`Token`), que solo tiene la
  app; desde otro usuario de Android responde 401.
- Restaurar fallaba en Android porque Go usaba `/data/local/tmp` como
  carpeta temporal.
- Gradle podía meter en el APK las clases del motor anterior.

Falta para no depender de la API:
- Respaldos en el teléfono. Hoy solo aceptan una ruta escrita a mano. Falta
  guardarlos en iCloud Drive (el contenedor de iCloud de la app) y, en
  Android, en la carpeta que se elija con el selector del sistema (Drive,
  OneDrive, Dropbox), y restaurar eligiendo el archivo.
- Textos: unos 26 hablan de domfin-api, de "esta computadora" o de la
  terminal, y el aviso de versiones dice que se actualiza con `git pull`.
- Escritorio sin servidor (por ejemplo, Wails con la web de Expo y el motor
  en el mismo proceso). La web sigue necesitando domfin-api.
- Sincronizar entre dispositivos: hoy solo se puede restaurar, y restaurar
  reemplaza todo.
- Builds de tienda: firma, el grupo de la app registrado en Apple, y CI o
  EAS con Go, gomobile y el NDK.
- Decidir si los respaldos del propio teléfono (Google e iCloud) incluyen la
  base, como pasa hoy por defecto, y si la contraseña de los PDF va al
  llavero del sistema.

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

Más adelante: llamar al motor sin abrir un puerto (sin red de por medio, ni
secreto que pasar) y compilarlo en CI.
