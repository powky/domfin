# Modelo de datos

Cómo guarda Domfin tus cuentas y movimientos reales, y cómo decide si cada
movimiento es un **ingreso**, un **gasto** o una **transferencia** entre tus
cuentas. Es la referencia para la API, la app y cualquier importador nuevo.

- Código: `internal/ledger` (el modelo y la clasificación),
  `internal/store/ledger.go` (tablas) e `internal/books` (endpoints `/ledger/*`).
- Montos siempre en **centavos**, en la moneda de su cuenta (`DOP` o `USD`).
- Fechas `YYYY-MM-DD`, hora de Santo Domingo.

## Capas

| Capa | Qué guarda | Quién la escribe |
| --- | --- | --- |
| Importación | Cada estado de cuenta tal como lo imprime el banco: `bank_accounts`, `bank_statements`, `bank_transactions` (cuentas de ahorro y corrientes), `cards`, `statements`, `transactions` (tarjetas), `loans`, `loan_histories`, `loan_movements` (préstamos) y `certificates`, `certificate_histories`, `certificate_movements` (certificados). Los volantes de pago van aparte, en `payslips` y `payslip_lines`: su dinero ya está en el libro. | Los importadores (`cmd/statements`, `POST /statements/import`). |
| Libro | Las **cuentas** y los **movimientos** de todas las fuentes con la misma forma, más los que agregas a mano (`manual_movements`). Se arma al leer, no se copia. | `store.Accounts` y `store.Movements`. |
| Clasificación | Categorías, tus reglas, tus correcciones, lo que marcas como revisado u oculto (`movement_marks`) y la configuración de nómina. El resultado se calcula al leer. | Tú, desde la app (`/ledger/*`). |

Como la clasificación se calcula cada vez, cambiar una regla o la nómina
reclasifica todo el historial al instante, y reimportar un estado no pierde
nada: tus correcciones están atadas al id estable de cada movimiento.

## Cuentas

Una cuenta tiene **una sola moneda**. Una tarjeta que factura en pesos y en
dólares son dos cuentas (Contigo RD$ y Contigo US$).

| Tipo (`kind`) | Qué es | Grupo en Patrimonio |
| --- | --- | --- |
| `checking` | Cuenta corriente | Efectivo |
| `savings` | Cuenta de ahorro | Efectivo |
| `credit_card` | Tarjeta de crédito | Pasivos |
| `loan` | Préstamo (incluye el Extracrédito) | Pasivos |
| `certificate` | Certificado financiero / depósito a plazo | Inversiones |
| `brokerage` | Cuenta en un puesto de bolsa (acciones) | Inversiones |
| `cash` | Efectivo: lo que gastas en efectivo, anotado a mano (ver *Efectivo*) | No sale: se da por gastado |

El **id** se arma con lo que imprime el banco y no cambia:
`banco:tipo:últimos4:moneda`, por ejemplo `popular:credit_card:5678:DOP`.
Las cuentas de efectivo, que no son de un banco, son `cash:cash::DOP` y una
por cada otra moneda de tus cuentas (`cash:cash::USD`).

Qué se importa hoy: las cuentas de ahorro del Popular (nómina, dólares y
digital), sus tarjetas (Contigo, Gnial, Infinia, ISI) y los historiales de
préstamos y certificados, y la tarjeta Qik.

## Movimientos

| Campo | Qué es |
| --- | --- |
| `id` | Id de la cuenta + referencia del banco: `popular:credit_card:5678:DOP:0570000001`. Los estados de cuentas bancarias no imprimen referencia: su id es la fecha de corte y la línea, `popular:savings:1234:DOP:2026-08-20#3`; en los certificados, la fecha efectiva y el código, `popular:certificate:1234:DOP:2026-09-22/20`. |
| `accountId` | La cuenta. |
| `date` | Fecha en que el banco lo registró. |
| `description` | Tal como la imprime el banco. |
| `merchant`, `mcc` | En compras con tarjeta: el comercio y su código de categoría (MCC). |
| `kind` | Lo que el banco dice que es para la cuenta (tabla abajo). Las cuentas bancarias no lo traen. |
| `amount` | Centavos. **Positivo entra a la cuenta, negativo sale.** Una compra con tarjeta es negativa; el pago a la tarjeta, positivo. Un desembolso de préstamo es negativo en el préstamo (la deuda crece); una cuota, positiva. |
| `currency` | La de la cuenta. |
| `amounts` | El movimiento en pesos y en dólares (centavos), con la tasa del BCRD de su fecha, como te lo cambiaría el banco ese día: lo que te entra (ingresos, transferencias que llegan) a la tasa de compra, la baja; lo que pagas (gastos y sus devoluciones, transferencias que salen) a la de venta, la alta. De pesos a dólares, al revés. No viene si no hay tasa de ese día (ni de antes). |

`kind` posibles: `purchase`, `refund`, `payment`, `cashback`, `fee`,
`interest` y `cash_advance` (tarjetas); `disbursement`, `payment` y `payoff`
(préstamos); `deposit`, `withdrawal`, `interest_earned`, `dividend` y
`withholding` (inversiones).

## Flujos: ingreso, gasto o transferencia

| Flujo | Qué es | Cuenta en |
| --- | --- | --- |
| Ingreso (`income`) | Dinero que te entra de fuera: salario, bonos, rendimientos, entregas. | Ingresos de Flujo de caja. |
| Gasto (`expense`) | Dinero que sale de tus finanzas: compras, comisiones, intereses, cuotas de préstamos, impuestos. Una **devolución** es un gasto positivo: baja el gasto de su categoría, no es un ingreso. | Gastos y Flujo de caja. |
| Transferencia (`transfer`) | Dinero que se mueve entre tus cuentas: pago de tarjeta, desembolso, retiro de efectivo, aporte a un certificado, cambio de moneda. | En ninguno: no te hace ni más rico ni más pobre. |

Casos que suelen confundirse:

- **Tarjetas.** El gasto es cada compra en la tarjeta. Pagar la tarjeta desde
  tu cuenta es una transferencia en ambos lados; si contara, cada compra se
  contaría dos veces.
- **Préstamos.** La cuota completa es un gasto (**Cuotas de préstamos**) en la
  cuenta que la paga, y el mismo pago visto desde el préstamo es una
  transferencia, para no contarlo dos veces. Si la cuenta que pagó no está en
  Domfin, el gasto queda en el préstamo. El desglose de capital e intereses de
  cada cuota lo muestra la pantalla de Préstamos.
- **Desembolsos.** Recibir el dinero de un préstamo no es un ingreso: es
  deuda. Es una transferencia en ambos lados.
- **Avance de efectivo.** Pasar dinero de la tarjeta a tu cuenta (el
  "Avance de efectivo vía App" del Popular) es una transferencia en ambos
  lados (Avance de efectivo): la deuda de la tarjeta y el dinero de la cuenta
  suben lo mismo, así que no eres ni más rico ni más pobre. El gasto es lo que
  pagues con ese dinero cuando sale de la cuenta, más lo que cuesta el avance:
  la comisión (Comisiones y cargos) y los intereses (Intereses de tarjetas).
  Sacarlo en un cajero con la tarjeta es Retiro de efectivo.
- **Cambio de moneda.** Pasar dólares de tu cuenta en dólares a una en pesos
  (o al revés) es una transferencia en ambos lados (Cambio de moneda), aunque
  los montos no coincidan.

## Categorías

Cada categoría pertenece a un grupo y a un flujo. Las de Domfin vienen de
fábrica (`system`); puedes renombrarlas, moverlas a otro grupo del mismo flujo
o archivarlas, pero no borrarlas ni cambiarles el flujo. Puedes crear las
tuyas. Un movimiento que nada reconoce queda en **Sin categoría** (sin
`categoryId`) y marcado para revisar.

| Flujo | Grupo | Categorías de fábrica |
| --- | --- | --- |
| Ingreso | Trabajo | Salario, Ingreso adicional, Bonos, Bonificaciones |
| Ingreso | Rendimientos | Intereses, Dividendos, Ganancias realizadas |
| Ingreso | Otros ingresos | Entregas sueltas, Reembolsos del seguro, Cashback, Otros ingresos |
| Gasto | Alimentación | Supermercado, Restaurantes, Comida rápida |
| Gasto | Transporte | Combustible, Taxi y transporte, Peajes y parqueo, Mantenimiento del vehículo |
| Gasto | Hogar | Luz, agua y gas; Internet, TV y teléfono; Artículos del hogar; Alquiler |
| Gasto | Salud | Farmacia, Médicos y clínicas, Seguros |
| Gasto | Compras | Ropa y calzado, Electrónica, Tiendas, Envíos y courier |
| Gasto | Estilo de vida | Entretenimiento, Suscripciones, Gimnasio y deporte, Cuidado personal, Mascotas, Donaciones |
| Gasto | Viajes | Vuelos, Hoteles, Agencias y alquiler de vehículos |
| Gasto | Educación | Colegios y cursos |
| Gasto | Finanzas | Cuotas de préstamos, Intereses de tarjetas, Comisiones y cargos |
| Gasto | Impuestos | Retenciones (DGII), Impuestos y trámites |
| Gasto | Otros gastos | Efectivo sin detallar (ver *Efectivo*) |
| Transferencia | Transferencias | Pago de tarjeta, Pago a préstamo, Desembolso de préstamo, Retiro de efectivo, Avance de efectivo, Depósito de efectivo, Reversos y devoluciones, Aporte a inversión, Retiro de inversión, Entre mis cuentas, Cambio de moneda |

Los ids (`salary`, `groceries`, `card-payment`…) están en
`internal/ledger/categories.go` y nunca cambian, aunque cambie el nombre.
Un grupo o categoría de fábrica nuevo aparece en su lugar al abrir la base.
*Ingresos en dólares* ya no viene de fábrica: la moneda no dice de dónde
sale el dinero, y lo que estaba ahí (correcciones y reglas) pasó a Ingreso
adicional.

También puedes crear tus propios grupos de ingresos o gastos (`POST
/ledger/groups`), por ejemplo "Pareja" con sus categorías (Salud, Cuidado
personal), para ver aparte lo que se va en alguien sin perder qué fue cada
gasto.

## Cómo se clasifica un movimiento

Se aplica lo primero que decida, en este orden:

1. **Tu corrección manual** para ese movimiento.
2. **El activo al que paga**, si está vinculado a uno: Aporte a inversión (o
   Retiro de inversión si el dinero vuelve).
   El efectivo que no detallaste (ver *Efectivo*) va a Efectivo sin
   detallar.
3. **Tus reglas**, en el orden en que las pongas: la primera que coincide gana.
4. **Nómina**: en fecha es Salario; fuera de fecha, Ingreso adicional (ver abajo).
5. **Transferencias entre tus cuentas**: un pago de tarjeta o de préstamo, un
   desembolso, un avance de efectivo, o un aporte o retiro de una inversión
   se empareja con el movimiento del otro lado en tu cuenta corriente o de
   ahorro: el mismo monto al revés, en la misma moneda, con hasta 5 días de
   diferencia (gana el más cercano). El avance solo se empareja con un
   depósito que el banco describa como avance de efectivo, porque sus montos
   redondos se repiten. Después, el dinero que sale de una cuenta de ahorro o
   corriente y entra a otra (Entre mis cuentas), con una condición más: que
   alguno de los dos lados nombre la otra cuenta, con un número que termine en
   sus últimos 4 dígitos, como hace el Popular (`Transf. via MB a …1234`).
   Sin eso, dos montos iguales pueden ser casualidad, así que se quedan para
   una regla o una corrección. Antes de eso, lo que el banco te devuelve
   (una LBTR fallida, `DEV LBTR … BENEF. INCORR`; un pago ACH que no pasó,
   `Desde SCONTAINER`; una corrección, `CORREC IB`) se empareja con el
   movimiento que deshace: en la misma cuenta, el mismo monto al revés, hasta
   15 días antes, y los dos quedan en Reversos y devoluciones. Por último, los
   cambios entre tu cuenta en dólares y una en pesos (Cambio de moneda): el
   mismo día o al siguiente, con un lado que nombre al otro, o los dos a la
   misma persona (le vendiste dólares a alguien que te pagó en pesos), y una
   tasa creíble entre los dos montos (de 40 a 90 pesos por dólar). Los dos
   lados quedan enlazados (`pairId`).
6. **Lo que dice el banco**: el `kind` del movimiento y, en las compras con
   tarjeta, el código MCC del comercio (`internal/ledger/mcc.go`: 5411
   Supermercado, 5541 Combustible, 5814 Comida rápida, 4789 Uber…). Uber
   Eats cobra con los códigos de transporte de Uber, así que va por su
   nombre a Comida rápida. Las cuentas de ahorro y
   corrientes no traen ni una cosa ni la otra, solo la descripción, y
   `internal/ledger/descriptions.go` reconoce las que el Popular imprime
   siempre igual: el impuesto de 0.15% de la DGII (Impuestos y trámites),
   COD CASH y retiros en cajeros (Retiro de efectivo), depósitos de efectivo
   (`DEP AHORRO`, `DEPOSITO`), pagos a tarjetas (aunque sus estados no estén
   importados todavía), las devoluciones del banco sin su movimiento,
   `PAG CLARO` y otras facturas, `PAGO INTERES`, `WH` (la retención sobre
   esos intereses), comisiones, cashback, desembolsos, dólares recibidos del
   exterior (`TRNFUSD`, remesas), que son Ingreso adicional, y lo que una ARS
   te devuelve de algo que pagaste (`PAGOS A TERCEROS ARS …`, Reembolsos del
   seguro).
7. **El comercio en tus otras compras**: una compra sin código MCC (Qik no
   los imprime) toma la categoría que su comercio tiene en las compras que sí
   lo traen (`EXCITING BAR` en la Contigo, `Exciting Bar` en la Qik).
8. **Sin categoría**: el flujo sale del signo (en tarjetas y préstamos, gasto)
   y queda para revisar.

Con un año de estados reales (cuatro
tarjetas, tres cuentas, un préstamo y un certificado), 87% de los
movimientos se clasifican solos. Lo que queda para revisar son sobre todo
transferencias a personas (`MB a … <nombre>`, `APP INTERB`, `Pago ACH`,
LBTR), que dependen de a quién le pagas y se resuelven con una regla por
destinatario, pagos a una tarjeta que aún no está en Domfin y compras con
códigos MCC ambiguos (servicios de negocios, condominios).

## Nómina

Se configura una vez, en la app (`PUT /ledger/payroll`):

| Campo | Qué es | Por defecto |
| --- | --- | --- |
| `accountId` | Tu cuenta nómina. Vacío mira todas las cuentas. | vacío |
| `keyword` | Texto que marca la nómina en la descripción. Da igual mayúsculas o tildes: `nomina` encuentra `CREDITO NÓMINA`. | `nomina` |
| `days` | Días del mes en que cobras, por ejemplo 15 y 30. Un día que el mes no tiene es su último día: el 30 de febrero es el 28 (o 29). | 15 y 30 |
| `daysBefore`, `daysAfter` | Cuánto antes o después del día todavía cuenta como esa quincena: cuando cae en fin de semana o feriado te pagan antes, y a veces el banco lo registra un día después. | 3 y 1 |

Cómo decide, para cada entrada de dinero en la cuenta nómina con la palabra
clave:

- Si cae dentro de la ventana de un día de pago, es **Salario**. Si en esa
  ventana hay más de una, el Salario es la más cercana al día (en empate, la
  que cae antes); las demás son **Ingreso adicional** y quedan para revisar.
- Fuera de toda ventana es **Ingreso adicional**.
- Una salida de dinero nunca es nómina (un reverso, por ejemplo).

| Movimiento | Resultado |
| --- | --- |
| 15 ene, CREDITO NOMINA | Salario |
| 27 feb (el 28 es sábado), CREDITO NOMINA | Salario de la quincena del 30 |
| 22 mar, CREDITO NOMINA | Ingreso adicional |
| 15 abr, dos créditos de nómina | El primero Salario; el segundo Ingreso adicional, para revisar |
| 18 dic, CREDITO NOMINA (regalía) | Ingreso adicional, o Bonos con una regla |

Para separar los bonos de los demás ingresos adicionales se usa una regla (la
siguiente sección), porque solo tú sabes cuándo y de cuánto llegan.

## Tus reglas

Una regla junta condiciones (todas deben cumplirse) y dice a qué categoría va
lo que coincide. Una regla sin condiciones no se acepta, porque se lo llevaría
todo.

| Condición | Ejemplo |
| --- | --- |
| `accounts`: en estas cuentas | `["popular:savings:2222:USD"]` |
| `direction`: `in` (entra) u `out` (sale) | `in` |
| `currency` | `USD` |
| `contains`: la descripción tiene alguno de estos textos (sin importar mayúsculas ni tildes) | `["nomina"]` |
| `mccs`: códigos MCC | `["5812", "5814"]` |
| `minAmount`, `maxAmount`: monto sin signo, en centavos | `8000000` (RD$80,000.00) |
| `months`: meses del año | `[12]` |

Además de `categoryId`, una regla puede pedir `review: true` para que lo que
atrape quede marcado para revisar.

Ejemplos con tus casos:

| Regla | Condiciones | Categoría |
| --- | --- | --- |
| Regalía de diciembre | contiene `nomina`, mes 12, desde RD$80,000 | Bonos |
| Bono trimestral | contiene `nomina`, meses 3, 6, 9 y 12, desde RD$40,000 | Bonos |
| Entradas en dólares | cuenta dólares, entra | Ingresos en dólares |
| Entregas de una persona | contiene `transferencia de juan` | Entregas sueltas |
| Uber Eats | contiene `uber eats` | Restaurantes |

Las reglas van antes que la nómina, así que un bono pagado el mismo día que la
quincena no se confunde con el salario si la regla lo reconoce.

## Correcciones manuales

Desde la app puedes cambiar la categoría de un movimiento concreto
(`PUT /ledger/classifications`). Gana sobre todo lo demás y sobrevive a
reimportar el estado. Si el mismo caso se repite, conviene una regla.

## Revisado y oculto

`PUT /ledger/marks` marca movimientos como **revisados** (dejan de pedir
revisión) u **ocultos** (no cuentan en ninguna pantalla; *Transacciones*
los lista en *Ocultas*). Se guardan en `movement_marks` por el id del
movimiento, como las correcciones, así que sobreviven a reimportar.

## Movimientos agregados a mano

Desde *Transacciones* puedes agregar un movimiento a una de tus cuentas
(`POST /ledger/movements`): una compra antes de que llegue su estado, o algo
que ningún estado muestra. Se guarda en `manual_movements`, con el id
`manual:N` (que nunca se repite), y se clasifica como los demás (tus reglas,
la nómina, su descripción), salvo que nunca se empareja como transferencia:
le quitaría su pareja al movimiento del banco. La categoría que le pones es
una corrección suya. Solo pide revisión en un caso (abajo).

Cuando llega el estado que lo trae, el movimiento del banco toma su lugar
(`settleManual`, al guardar cada estado):

- Si los estados de su cuenta todavía no cubren una semana después de su
  fecha, queda **pendiente**: cuenta como cualquier otro.
- Al guardar un estado, cada pendiente busca en su cuenta un movimiento del
  mismo monto a 7 días o menos (el más cercano, y uno para cada pendiente).
  Ese movimiento lo reemplaza y se queda con su categoría, sus marcas, su
  vínculo a un activo y sus notas.
- Si los estados ya cubren una semana después de su fecha sin traerlo,
  queda como **faltante** (`missing`): sigue contando y pide revisión, por
  si el banco cobró otro monto (una propina) o fue en efectivo.
- Uno que agregas para días que tus estados ya cubren se queda como está:
  es lo que el estado no muestra.

Solo se borran los agregados a mano (`DELETE /ledger/movements/{id}`), con
su categoría, marcas y vínculo; los importados se ocultan.

## Efectivo

Lo que sacas del cajero no es un gasto todavía: pasa de tu cuenta a tu
bolsillo. **Efectivo** es la cuenta de tu bolsillo, una en pesos y una en
cada otra moneda de tus cuentas, sin estados: ahí anotas a mano lo que
gastas en efectivo (y lo que te pagan en efectivo), y nunca queda pendiente
de un estado.

- **Entra** lo que el libro clasifica como Retiro de efectivo (un `COD CASH`
  o un retiro en cajero de tu cuenta; un avance de tu tarjeta que no entró a
  una de tus cuentas) y lo positivo que anotas en Efectivo.
- **Sale** lo negativo que anotas en Efectivo y lo que vuelve a un banco
  (Depósito de efectivo).
- Lo que sale toma del efectivo más reciente que entró hasta su fecha, y si
  no alcanza, del anterior. Lo que no anotaste cuenta como gastado el día que
  entró: un movimiento de Efectivo, **Efectivo sin detallar** (`kind:
  "undetailed_cash"`, `by: "cash"`), con el id `cash:` más el id del retiro.
  Se calcula al leer el libro, desde el primer movimiento: cada gasto que
  anotas lo baja. El retiro sigue siendo una transferencia.
- Como cualquier movimiento, el que queda sin detallar se puede
  recategorizar (la parte que falta de ese retiro fue, por ejemplo, para tu
  pareja) u ocultar (no se gastó): una corrección o una marca con su id. Un
  retiro oculto no alimenta Efectivo.
- Efectivo no sale en *Cuentas* ni en *Patrimonio neto*: lo que no anotas se
  da por gastado, así que no lleva saldo.

## Inversiones y activos

Pensado para el certificado y las acciones; aún no hay importador ni tablas de
posiciones, pero la clasificación ya los contempla.

**Cuentas.** Un certificado (`certificate`) guarda moneda, tasa vigente,
próximo vencimiento, si se renueva solo y qué hace con los intereses
(capitalizarlos o pagarlos a otra cuenta), además del saldo de capital. Una
cuenta de acciones (`brokerage`) guarda posiciones: emisor, cantidad, costo
base y el último precio con su fecha (manual o del estado del puesto de bolsa);
su valor es cantidad × precio.

**Movimientos.**

| Movimiento | Clasificación |
| --- | --- |
| Aporte: abrir o aumentar un certificado, comprar acciones (`deposit`) | Transferencia, Aporte a inversión; se empareja con el débito de tu cuenta |
| Retiro: cancelar o vencer, vender (`withdrawal`) | Transferencia, Retiro de inversión |
| Intereses y dividendos (`interest_earned`, `dividend`) | Ingreso, Rendimientos (Intereses o Dividendos), en bruto, aunque se reinviertan |
| Retención DGII, 10 % de intereses y dividendos (`withholding`) | Gasto, Impuestos → Retenciones (DGII) |
| Ganancia al vender, cuando hay costo base | Ingreso, Ganancias realizadas |

Lo que **no** es un movimiento: la renovación del certificado (monto 0: solo
actualiza tasa y vencimiento), los dividendos pagados en acciones (suben la
cantidad) y los cambios de precio o de tasa de cambio, que salen de fotos del
valor de cada cuenta por fecha. La reinversión tampoco agrega nada: el interés
y la retención se asientan en el certificado y su saldo sube.

El estado del certificado del Popular ("Depósito a Plazo") trae un código por
movimiento: 87 DEPOSITO (`deposit`), 20 INTERES AGREGADO (`interest_earned`),
06 RETENCION DGII (`withholding`) y 15 RENOVACION DE CD (renovación, sin
movimiento).

## Activos que ningún estado muestra

Un apartamento comprado en plano, que se paga en cuotas a un fideicomiso,
acciones compradas de una vez, una deuda fuera de tus estados, el fondo de
pensiones o un vehículo (`internal/assets`, tablas `assets` y `asset_links`,
endpoints `/ledger/assets`). Cada uno tiene un nombre, una moneda y:

- **Inmueble** (`property`): el precio y el plan de pagos (reserva, inicial,
  cuotas de un monto cada *n* meses entre dos fechas, y la entrega: lo que
  falte del precio se paga ahí). Vale lo que ya se pagó.
- **Acciones** (`shares`): la cantidad y, si se conoce, el precio de una
  (con su fecha). Sin precio valen lo que costaron.
- **Deuda** (`debt`): dinero que alguien te prestó fuera de un banco (un
  familiar). Lo que entra vinculado es Desembolso de préstamo, lo que le
  devuelves Pago a préstamo, los dos transferencias, y se debe la diferencia.
  En `GET /accounts` sale como un préstamo más. Una deuda puede llevar en
  cambio un **plan de cuotas** (`schedule`: saldo a una fecha, tasa anual,
  primera y última cuota): lo que se debe sale de cuotas iguales de capital
  e interés, hacia adelante y hacia atrás desde ese saldo. Es para un
  préstamo que otro paga por ti (el carro que paga tu empleador), cuyas
  cuotas nunca pasan por tus cuentas: no es ingreso ni gasto, y su saldo baja
  solo en Patrimonio neto.
- **Vehículo** (`vehicle`): lo que costó, cuándo lo compraste y cuánto de su
  valor pierde cada año (`rate`, 0.1 es 10%). Vale su precio menos esa
  depreciación, compuesta, hasta hoy.
- **Fondo de pensiones** (`pension`, la AFP): los saldos que dan sus estados,
  cada uno con su fecha. Vale el del estado más reciente, y entre un estado
  y otro, el último conocido. Lo que la nómina le aporta no pasa por tus
  cuentas, así que no es ingreso ni gasto: solo suma a Patrimonio neto.

Los pagos son **movimientos vinculados**: cada uno se convierte a la moneda
del activo a la tasa del BCRD de su fecha (el promedio de compra y venta) y
se clasifica como Aporte a inversión (o Retiro de inversión si el dinero
vuelve), no como gasto. Se vinculan a mano (`PUT /ledger/assets/links`) o
solos: un activo puede tener textos (`fideicomiso torre`) y cada
movimiento cuya descripción tenga alguno se le vincula al guardarlo, al
importar estados y al pedir la lista. Uno que desvinculas a mano no se
vuelve a vincular solo.

En `GET /accounts` cada activo sale como una cuenta más (`asset:<id>`, tipo
`real_estate`, `brokerage`, `loan`, `pension` o `vehicle`) con su valor al
final de cada mes y el de hoy; antes del primer pago (del primer estado del
fondo, de la compra o del préstamo) no tiene balance.

## Presupuesto: gastos fijos

Lo que pagas todos los meses pase lo que pase (alquiler, servicios, cuotas,
suscripciones). La app encuentra en el libro los pagos que se repiten y los
sugiere; el usuario agrega los que son fijos, descarta los que no y puede
fijar el ingreso con que planea el mes (sin él, la app usa su salario). La
API guarda solo eso, en `settings` (`budget`):

| Campo | Qué es |
| --- | --- |
| `items` | Los gastos fijos: `id`, `name`, `amount` (centavos al mes) y `currency`; además `match` (a quién va el pago, como la app lo agrupa: `PAG CLARO`; vacío en uno agregado a mano), `categoryId`, `accountId` (la cuenta de la que sale) y `day` (el día del mes en que se paga). |
| `dismissed` | Los `match` de las sugerencias que el usuario descartó. |
| `income` | `{amount, currency}`: el ingreso con que se planea el mes, si el usuario lo fijó. |

Cómo detecta la app un pago que se repite está en `app/docs/desarrollo.md`
(*Presupuesto*).

## Préstamos: cuándo terminas

El historial de un préstamo no imprime la tasa ni el plazo. El usuario le
pone la tasa anual y la cuota, y con eso la app calcula cuándo termina y
cuánto falta de capital e intereses. Si su empleador u otra persona paga una
parte de la cuota (un préstamo subsidiado), también lo dice. La API guarda
solo eso, en `settings` (`loans`): `{"plans": {"<id de la cuenta>": {"rate",
"installment", "subsidy"?}}}`.

| Campo | Qué es |
| --- | --- |
| `rate` | La tasa anual: 0.125 es 12.5%. De 0 a menos de 1. |
| `installment` | La cuota de cada mes, capital e intereses, en centavos de la moneda del préstamo. |
| `subsidy` | Cuánto de cada cuota paga otra persona, en centavos; nunca más que la cuota. |

La llave es el id de la cuenta del préstamo (`popular:loan:2468:DOP`) o
`asset:<id>` para una deuda fuera del banco. Una deuda con plan de cuotas no
necesita uno: su tasa y su cuota salen de su `schedule`, y toda la cuota la
paga otra persona.

La app cuenta los meses desde el saldo del último historial: cada cuota paga
primero el interés del mes (la tasa entre 12) y el resto va a capital. Lo
que ya se pagó de intereses sale de los movimientos: cada pago de un
préstamo trae `principal`, lo que fue a capital, y el resto fueron
intereses y cargos.

## Sueldo: volantes, salario de Navidad y otros pagos

Los volantes de pago (ver *Volantes de pago del Banco Popular* en
[estados-de-cuenta.md](estados-de-cuenta.md)) quedan en `payslips` (la
empresa, la fecha de la nómina, el neto) y `payslip_lines` (cada concepto,
su tipo, si es deducción, el monto y lo acumulado en el año). No son
movimientos: el neto de cada uno es un `CREDITO NOMINA` que ya está en el
libro.

Lo que el usuario dice de su sueldo va en `settings` (`salary`):

| Campo | Qué es |
| --- | --- |
| `entries` | Sueldos brutos puestos a mano: `{since: "2026-07", amount, currency}`, del más viejo al más nuevo, para quien no tiene volantes que Domfin lea. Cuentan desde su mes hasta que un volante diga otra cosa. Pueden traer lo que dice su volante: `isr`, `afp`, `sfs` y `other`, en centavos al mes; los que falten, la app los calcula por ley. |
| `hiredOn` | El día en que empezó a trabajar ahí, para los pagos que van por antigüedad. |
| `extras` | Los pagos que le hace su trabajo además del sueldo, como él los describe (ver abajo). |

Cada pago extra (`extras`) es `{id, name, month, kind, tax}` más lo que use:

| Campo | Qué es |
| --- | --- |
| `month` | El mes en que se paga, de 1 a 12. |
| `kind` | Cuánto es: `days` (días de sueldo, a 23.83 días el mes), `salaries` (sueldos) o `fixed` (un monto). |
| `value` | Los días o los sueldos. |
| `seniority` | Con `days`: los días son los de la bonificación de ley, 45 antes de tres años en el trabajo y 60 después (necesita `hiredOn`). |
| `amount` | Con `fixed`: el monto, en centavos de pesos. |
| `base` | Sobre qué sueldo van los días y los sueldos: `average` (el promedio del año) o `month` (el del mes en que se paga). |
| `tax` | El ISR: `scale` (lo que agrega al ingreso del año, con la escala de la DGII de 2026), `rate` (un porcentaje fijo, en `rate`: 0.25 es 25%) o `none`. |

Antes de los pagos extra, la bonificación de ley se guardaba como
`bonusMonth`: al leerlo, se vuelve un pago extra.

La app arma el sueldo bruto de cada mes con eso (`features/salary`): el de
los volantes en un mes que cubren entero, si no el puesto a mano, si no el
del mes conocido más cercano. Con eso estima:

- **Salario de Navidad** (Código de Trabajo, art. 219), para todos: la
  doceava parte del sueldo del año. No paga ISR hasta ese monto (art. 222)
  ni TSS.
- **Los pagos extra**, cada uno como dice, en el orden en que se pagan: el
  ISR de uno por escala cuenta lo que se pagó antes en el año.
- **Los descuentos de un sueldo puesto a mano** que no se dijeron: AFP
  2.87%, SFS 3.04% y la doceava parte del ISR de un año con ese sueldo
  menos la TSS, como lo hacen las nóminas.

## Cómo lo usan las pantallas

- **Montos en otra moneda:** ingresos, gastos, inversiones y préstamos se
  suman con `amounts`, a la tasa del día de cada movimiento; así un mes
  cerrado no cambia cuando cambia la tasa. Los saldos (Cuentas, Patrimonio
  neto) sí van a la tasa de hoy, que es lo que valen hoy.
- **Flujo de caja:** ingresos = movimientos `income`; gastos = `expense` (con
  las devoluciones restando); ahorro = ingresos − gastos. Las transferencias
  no cuentan. El ahorro se puede dividir en lo que fue **a inversiones**
  (aportes netos más rendimientos reinvertidos) y lo que quedó **en cuentas**.
  Si salió más de lo que entró, la diferencia la cubren primero los
  **préstamos** recibidos en el periodo (desembolsos que entran a tus
  cuentas, que no son ingreso) y el resto sale **de tus cuentas** (lo que ya
  tenías, o tus tarjetas).
- **Gastos:** solo `expense`, por grupo y categoría, con el efectivo que no
  detallaste en Efectivo sin detallar.
- **Patrimonio neto:** saldos de las cuentas; Inversiones suma el capital de
  los certificados y el valor de mercado de las acciones, en dólares
  convertidos con la tasa del BCRD.
- **Transacciones:** todos los movimientos, con su flujo, categoría y la marca
  de revisar; los ocultos, en *Ocultas*.
- **Ocultos:** ninguna otra pantalla los suma ni los lista.

## Endpoints

Solo responden a esta computadora y a páginas servidas desde localhost, como
los de estados de cuenta.

| Método y ruta | Qué hace |
| --- | --- |
| `GET /ledger/movements?from=&to=` | Cuentas (con las de efectivo) y movimientos del rango (por defecto, el año en curso), ya clasificados, del más nuevo al más viejo, con el efectivo sin detallar. |
| `GET /ledger/categories` | Grupos y categorías, incluidas las archivadas. |
| `POST /ledger/categories` | Crea una: `{"name", "flow", "group"}`. |
| `PATCH /ledger/categories/{id}` | Renombra, mueve de grupo o archiva: `{"name", "group", "archived"}`. |
| `GET /ledger/rules`, `PUT /ledger/rules` | Tus reglas; el `PUT` las reemplaza todas, en orden: `{"rules": [...]}`. |
| `GET /ledger/payroll`, `PUT /ledger/payroll` | La configuración de nómina. |
| `PUT /ledger/classifications` | Corrige un movimiento: `{"movementId", "categoryId"}`; con `categoryId: null` la quita. |
| `POST /ledger/movements` | Agrega uno a mano: `{"accountId", "date", "description", "amount", "categoryId"?, "notes"?}`, en centavos de la moneda de la cuenta. Responde `{"id"}` (ver *Movimientos agregados a mano*). |
| `DELETE /ledger/movements/{id}` | Borra uno agregado a mano, con su categoría, marcas y vínculo. |
| `PUT /ledger/marks` | Marca movimientos: `{"movementIds", "reviewed"?, "hidden"?}`; lo que no viene se queda como estaba. |
| `GET /ledger/assets` | Los activos con lo pagado, su valor y sus pagos (antes vincula lo que sus textos encuentren). |
| `POST /ledger/assets`, `PUT /ledger/assets/{id}` | Crea o cambia uno: `{"kind", "name", "currency", "match", "property" \| "shares" \| "pension" \| "vehicle" \| "schedule"}`. |
| `DELETE /ledger/assets/{id}` | Lo borra, con sus vínculos. |
| `POST /ledger/groups` | Crea un grupo de ingresos o gastos: `{"name", "flow"}`. |
| `PATCH /ledger/groups/{id}` | Le cambia el nombre: `{"name"}`. El id y lo que tiene adentro no cambian. |
| `PUT /ledger/assets/links` | Vincula movimientos a un activo: `{"movementIds", "assetId"}`; con `assetId: null` los desvincula. |
| `GET /ledger/budget` | El presupuesto: `{"items", "dismissed", "income"?}` (ver *Presupuesto*). |
| `PUT /ledger/budget` | Lo reemplaza entero; a los gastos fijos nuevos les pone `id` a partir del nombre. Responde lo guardado. |
| `GET /ledger/loans` | La tasa, la cuota y lo que paga otra persona de cada préstamo: `{"plans"}` (ver *Préstamos: cuándo terminas*). |
| `PUT /ledger/loans` | Los reemplaza todos. Responde lo guardado. |
| `GET /ledger/payslips` | Los volantes de pago importados, del más viejo al más nuevo: `{"payslips": [{"id", "employer", "paidOn", "net", "status", "issues"?, "lines": [{"concept", "kind", "deduction"?, "amount", "yearToDate"}]}]}`. |
| `GET /ledger/salary` | Lo que dijiste de tu sueldo: `{"entries", "hiredOn"?, "extras"}` (ver *Sueldo*). |
| `PUT /ledger/salary` | Lo reemplaza; ordena los sueldos por mes y a los pagos extra nuevos les pone `id` a partir del nombre. Responde lo guardado. |

Cada movimiento de `GET /ledger/movements` trae, además de sus campos y de
`amounts` (su valor en pesos y dólares a la tasa de su fecha), `flow`,
`categoryId` (`null` si es Sin categoría), `by` (qué lo decidió: `manual`,
`asset`, `cash`, `rule`, `payroll`, `transfer`, `bank`, `merchant` o `default`), `ruleId`, `review`,
`pairId`, `assetId` (el activo al que paga) y, en los de un préstamo,
`principal` (lo que movió su saldo: de un pago, lo que fue a capital; falta
cuando el historial no lo dice). `review` ya cuenta lo que marcaste como
revisado; `hidden` viene en los ocultos, `manual` en los agregados a mano
(`missing` si su estado llegó sin ellos) y `notes` con lo que escribiste,
también en el movimiento del estado que tomó su lugar.
