# Estados de cuenta que lee domfin-api

`cmd/statements` y `POST /statements/import` (que usa la app en *Importar
estados*) importan estados de cuenta en PDF a una base SQLite local. Leen
los del Banco Popular (estados de tarjeta de crédito, que vienen con
contraseña; historiales de préstamo y de certificado financiero, y estados
de cuentas de ahorro y corrientes, que vienen como imágenes y se leen con
OCR, ver [Cómo se leen las imágenes](#cómo-se-leen-las-imágenes)) y los de
tarjeta de crédito de Qik. Los PDF que no reconocen se omiten.

```bash
go run ./cmd/statements import ~/estados/tarjeta                 # importa los PDF de una carpeta
go run ./cmd/statements import -dry-run ~/estados                # revisa sin guardar
go run ./cmd/statements status                                   # qué meses tiene cada cuenta
```

Los PDF con contraseña se abren con la que guardaste en *Configuración* de
la app (o con `STATEMENTS_PDF_PASSWORD`).

- La base vive en `$DOMFIN_DATA_DIR/domfin.db` (por defecto
  `~/Library/Application Support/domfin-api/domfin.db` en macOS), fuera del
  repo y solo legible por tu usuario. Los PDF no se copian.
- Cada cuenta, tarjeta o préstamo se identifica por el banco y sus últimos 4
  dígitos, y cada estado por la cuenta o tarjeta y su fecha de corte.
  Importar dos veces el mismo estado, o dos descargas del mismo PDF, no
  duplica nada. Los historiales de préstamo se solapan, así que cada
  movimiento se guarda una vez por su referencia.
- Un mes de tarjeta queda ✓ cuando cuadra: en cada moneda, el balance
  anterior más los movimientos da el balance total, no falta ninguna página y
  el balance anterior es el balance con que cerró el mes previo. Un mes de
  cuenta bancaria, cuando cada movimiento lleva del balance anterior al
  suyo, los totales coinciden con el resumen y abre con el cierre del mes
  previo. Un
  historial de préstamo o de certificado cubre desde su primer movimiento
  hasta el día en que se generó, y queda ✓ cuando no le falta ninguna página
  y cada balance sale del anterior. Si algo no cuadra sale ⚠ con el detalle, y los meses sin
  estado entre el primero y el último salen como faltantes.
- Los montos se guardan en centavos. En `transactions.amount` los cargos son
  negativos y los pagos, cashback y devoluciones positivos, como en la app;
  en `loan_movements.amount` los desembolsos son negativos y los pagos
  positivos, y en `bank_transactions.amount` los débitos son negativos. Los
  balances quedan como los imprime el banco, con la deuda en positivo.
- Todo entra al libro (`store.Accounts` y `store.Movements`, ver
  [modelo-de-datos.md](modelo-de-datos.md)); los movimientos de
  cuentas bancarias no traen referencia, así que su id es la fecha de corte
  y la línea del estado.

## Formato del Banco Popular

Un PDF por fecha de corte, cifrado (RC4 de 40 bits) con la contraseña del
cliente. Trae una sección por moneda: las tarjetas en pesos y dólares imprimen
`MC CONTIGO DOP` y luego `MC CONTIGO USD`, cada una con su propia numeración
de páginas; las que solo dicen el producto (`VISA ISI`) son en pesos. Las
etiquetas están dibujadas fuera de la capa de texto, así que solo salen los
valores, siempre en las mismas columnas. Cada página repite:

- Encabezado: tarjeta enmascarada (`****-****-****-1234`), línea de crédito,
  crédito disponible, fecha de corte, fecha límite de pago y balance anterior.
- Movimientos: fecha de entrada y de la transacción (`DD/MM`, el año sale de
  la fecha de corte), número de referencia, descripción (comercio y ciudad
  separados por dos espacios) y cantidad, negativa para los créditos. Debajo
  de las compras con tarjeta va el código de categoría del comercio (MCC) y
  la autorización; los pagos, cashback y comisiones del banco no lo traen.
- Resumen: cuotas vencidas, monto vencido, pago mínimo, balance a pagar y
  balance total.

La última página de cada sección agrega la tasa de interés anual y, desde
agosto de 2026, la tasa anual efectiva (TAE).

## Tarjeta de crédito de Qik

Una página web impresa a PDF (Chrome), sin contraseña y en pesos, con sus
etiquetas en el texto: período, fecha de corte, límite aprobado, la tarjeta
(`************1234`), balance al corte, monto mínimo, balance anterior y
fecha límite de pago (cada valor bajo su etiqueta), y los movimientos con
fecha, entrada, descripción y monto (`RD$ 1,800.00` un cargo, `- RD$ 28.00`
un crédito). Una descripción larga sigue en la línea de abajo.

- No trae referencias: cada movimiento se identifica por la fecha de corte y
  su línea. Tampoco códigos de comercio (MCC): las compras son lo que no es
  pago, cashback (`Recompensas Qik Rebate`), contracargo ni devolución, y
  toman la categoría que su comercio tiene en tus otras tarjetas.
- El comercio trae pegados la ciudad y los códigos de estado y país
  (`Utopia Santo Domingododom`); el importador los separa como el Popular:
  comercio `Utopia`, ciudad `Santo Domingo`.
- Sus fuentes (Type3) nombran cada letra con un glifo inventado; `pdftext`
  las lee por su mapa `ToUnicode`.

## Historial de préstamo del Banco Popular

Lo genera la banca en línea para el rango de fechas que se elija, sin
contraseña. Cada página repite `Pág 1 de 2`, la fecha en que se generó, el
número de producto (el préstamo se identifica por sus últimos 4), el tipo
(`Prestamos`) y la moneda (`RD$ (Peso Dominicano)`), y luego la tabla:

- Fecha de posteo y fecha efectiva (`DD/MM/AAAA`), referencia, descripción
  (`DESEMBOLSO`, `PAGO CUOTA`, `PAGO TOTAL`), monto y balance: el capital
  que se debe después del movimiento. Los montos redondos vienen sin
  centavos (`RD$ 20,000`).
- Los días van del más viejo al más nuevo, pero los movimientos de un mismo
  día van del más nuevo al más viejo; el importador los reordena para
  seguir el balance.
- No separa capital e intereses: un desembolso suma su monto al balance y un
  pago baja el balance solo en la parte que fue a capital. El importador
  guarda esa parte en `loan_movements.principal` (lo demás fue interés y
  cargos), salvo para un pago que abre el historial, porque no hay balance
  anterior con qué comparar.

## Estados de cuenta bancarios del Banco Popular

Llegan como imágenes de página (2550 × 3300, sin capa de texto), impresas
con una letra monoespaciada sobre una cuadrícula fija. La primera página
trae el resumen y todas repiten el encabezado:

- Arriba, `PAG 1` y la fecha de corte (`20 AGO 2026`); luego el producto, el
  número de cuenta y la moneda (`AHORRO EMPLEADO   800001234   RD$`, `AHORRO
  US$ PERS ... USD`, `CUENTA DIGITAL ...`).
- Resumen: balance anterior, `+ DEPOSITOS Y OTROS CREDITOS` y `- CHEQUES Y
  OTROS DEBITOS` (cantidad y monto), `+ INTERES PAGADO` y balance al corte.
  El interés se totaliza aparte, y la retención sobre él (`WH`) suma a los
  débitos sin contar en su cantidad.
- Tabla: fecha de posteo (o de entrada) y fecha valor (o de la transacción)
  como `28 JUL`, descripción, monto (con un `-` al final si es débito) y el
  balance después del movimiento. La descripción va en la misma línea o en
  las siguientes. Empieza con `BALANCE ANTERIOR` y termina con `BALANCE AL
  CORTE`.

## Cómo se leen las imágenes

`internal/gridocr` no es un OCR general: aprovecha que el texto está en una
cuadrícula. Encuentra los renglones (cada 39 px) y el ancho de celda (unos
24 px, la frecuencia más fuerte de la tinta), descarta lo que no cae en la
cuadrícula (el logo, el pie de página) y compara cada celda con los glyphs
de `internal/gridocr/popular.atlas`, aprendidos de páginas reales. Así el
texto sale con sus columnas intactas, y con un año de estados reales lee
cada monto sin errores (cada balance encadena con el anterior). Los estados que el banco entrega impresos a PDF (a 100 ppp,
850 × 1100) se amplían a la escala del atlas antes de leerlos, y se leen
igual que los escaneados.

Si un estado nuevo trae un carácter que el atlas no conoce, se lee como el
más parecido y lo delatan las verificaciones de balance. Para agregarlo:

```bash
go run ./cmd/glyphs ~/estados/cuenta/estado.pdf >> internal/gridocr/popular.atlas
```

lista cada glyph dudoso con una línea donde aparece; cambia su `?` por el
carácter correcto (o bórralo) antes de usar el atlas.

## Historial de certificado financiero del Banco Popular

Como el del préstamo (sin contraseña, con `Pág 1 de 9`, la fecha en que se
generó, el número de producto y la moneda), pero titulado *Historial
Depósito a Plazo* y con más columnas: fecha efectiva, fecha de posteo (solo
cuando difiere), código y descripción de la transacción, tasa, monto, tipo y
saldo de capital. Cada fila ocupa tres líneas de texto, porque la
descripción y el tipo se parten en dos; el importador junta las celdas
alrededor de la línea con la fecha y las ubica por columna.

- Códigos: `87` depósito, `20` interés agregado (se capitaliza), `06`
  retención de la DGII sobre ese interés y `15` renovación, que no mueve
  dinero pero trae la tasa nueva y la próxima fecha de vencimiento
  (`RENOVACION DE CD 22-10-26`); esas dos quedan en `certificates`.
- La impresión no trae referencias: cada movimiento se identifica por su
  fecha efectiva y su código (`2026-09-22/20`).
