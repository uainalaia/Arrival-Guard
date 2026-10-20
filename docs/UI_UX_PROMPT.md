# ArrivalGuard: prompt de marca y UX/UI para Claude Code

> **Para el equipo.**
> 1. Guarda este archivo como `docs/UI_UX_PROMPT.md`, junto a `docs/BUILD_PROMPT.md`.
> 2. Este documento **reemplaza la sección 15 del BUILD_PROMPT**. En todo lo visual, de experiencia y de texto de interfaz, manda este. En dominio, datos, API y seguridad sigue mandando el BUILD_PROMPT.
> 3. Úsalo desde la Fase 0 (tokens, fuentes, logo) y sobre todo en la Fase 4. Mensaje sugerido a Claude Code: *"Lee docs/UI_UX_PROMPT.md completo. Implementa el sistema de marca de las secciones 3 a 8 y muéstrame la página /system antes de construir pantallas."*
> 4. Los textos de interfaz van en inglés. Las explicaciones de este documento, en español.
> 5. La dirección visual se contrastó con referencias profesionales de Dribbble (sección 3.5). El logotipo y el sello se renderizaron y revisaron a varios tamaños antes de fijar sus especificaciones.

---

## 1. Tu rol y el nivel esperado

Actúas como **director de diseño y a la vez ingeniero de frontend** de un estudio que entrega identidades que no se confunden con ninguna otra. El jurado (expertos de WeBank y académicos de finanzas y computación) va a ver decenas de proyectos en dos días. ArrivalGuard tiene que verse como un **producto financiero real, sobrio y confiable**, con una idea visual propia que se recuerde después de cerrar la pestaña.

Nivel de calidad: el de una app de banca digital en producción. Tipografía cuidada, números alineados, estados inequívocos, cero elementos decorativos sin función, accesibilidad AA verificada, modo claro y oscuro, y responsive real.

---

## 2. El brief

**Producto:** agente de IA que paga la matrícula internacional de una estudiante dentro de los límites que fija su familia, sigue el dinero hasta que la universidad lo confirma y nunca paga dos veces. También mueve dinero para los gastos de llegada bajo un permiso permanente y reclama devoluciones. Todo ocurre en un entorno **simulado**.

**Personas (sintéticas):** Sofía Ramos, estudiante peruana que llega a Arrival University (ficticia, en Shenzhen), y Carlos Ramos, su padre, dueño de la cuenta en USD y único que autoriza gastos. A ellos se suma el **evaluador**, que controla escenarios, reloj virtual y fallas.

**Trabajos de la interfaz, en orden de importancia:**
1. **Hacer visible la autoridad:** que siempre se sepa quién puede hacer qué, y que la aprobación de Carlos se sienta como un acto serio y vinculante, no como un botón más.
2. **Hacer legible el estado del dinero:** dónde está cada pago, qué se sabe con certeza, qué está pendiente y de dónde viene cada dato.
3. **Explicar las decisiones del agente:** por qué la ruta barata no sirve, por qué algo se bloqueó y cuál es el siguiente paso.
4. **Dejarse evaluar en 60 segundos:** un juez sin contexto entra con el código, entiende el escenario y ve un pago completo sin leer un manual.

---

## 3. Concepto de marca

### 3.1 Idea central: señalética para el dinero en tránsito
Una matrícula internacional es un viaje: sale de Lima, cruza monedas e intermediarios y tiene que **llegar** a una universidad en China. ArrivalGuard toma su lenguaje visual de la **señalética de transporte** (estaciones, líneas, tableros de llegadas, señales de alto). Es un lenguaje que existe para que alguien entienda dónde está y qué sigue, bajo presión y en otro idioma.

A eso le suma un único elemento memorable: **el sello de consentimiento**. Cuando Carlos aprueba, el documento recibe un sello cuadrado de color cinabrio, generado a partir de la huella criptográfica de la aprobación. Une tres cosas que el proyecto defiende: el consentimiento ligado a datos concretos, la huella verificable y la tradición del sello como firma, que el jurado reconoce de inmediato.

**Lema de marca:** *Tuition that arrives. Savings that stay.*

### 3.2 Pilares
| Pilar | Qué significa en la interfaz |
|---|---|
| Legible | Jerarquía clara, números tabulares, un estado por elemento, etiquetas en lenguaje del usuario |
| Vinculante | El consentimiento muestra exactamente qué cubre y deja una huella visible |
| Sereno ante la incertidumbre | "No sabemos todavía" se muestra con calma y con el siguiente paso, nunca como error ni como éxito |
| Honesto | La simulación siempre está a la vista; los límites del sistema se nombran |

### 3.3 Personalidad y voz
Precisa, tranquila y directa, como un buen jefe de estación. No vende, no exagera, no usa jerga de IA ("magic", "smart", "AI-powered"). Habla en frases cortas, en voz activa y con verbos simples.

### 3.4 Lo que evitamos (anti referencias)
- Fondo crema con serif de titular y acento terracota. Fondo casi negro con un acento neón. Estética cripto o de trading.
- Degradados decorativos, glassmorphism, brillos, íconos de "IA" con destellos, robots, escudos y candados como cliché de seguridad.
- La grilla de tarjetas idénticas con el mismo radio y la misma sombra gris para todo.
- Etiquetas en mayúsculas sostenidas sobre cada título, cadenas de metadatos separadas por puntos medios, flechas añadidas al texto de los botones y tipografía monoespaciada para etiquetas decorativas.
- Numeración 01, 02, 03 en contenido que no es una secuencia.

### 3.5 Referencias de Dribbble (revisadas el 18 de octubre de 2026)

Sirven para fijar el **nivel de acabado** y algunos patrones concretos. Toma el criterio, nunca el layout literal, los logos ni los assets. Cada referencia indica a qué parte de este documento alimenta.

| Referencia | Qué tomar | Dónde se aplica |
|---|---|---|
| [Ramotion: Letter Fintech Branding](https://dribbble.com/shots/22466149-Letter-Fintech-Branding-visual-identity-corporate-brand-design) | Sistema de marca disciplinado: logo, escalera completa de tintes por color y neutros resueltos | Tokens (5.1) y página `/system` |
| [Ramotion: Sila Fintech Branding](https://dribbble.com/shots/22977546-Fintech-Branding-visual-identity-corporate-design-for-Sila) | Brand board con especificaciones de color e íconos de trazo consistente | `/system` y kit del pitch (18) |
| [HALO LAB: Syncfine Fintech Branding](https://dribbble.com/shots/24577914-Syncfine-Fintech-Branding) | La marca aplicada igual en producto y marketing: las tarjetas del producto parecen piezas de marca | Landing (11.1) e imagen OG |
| [HALO LAB: Kony Fintech Branding](https://dribbble.com/shots/25760027-Kony-Fintech-Branding-Case-Study) | Un único acento fuerte reservado para el dato más importante; el resto, neutro | Regla de `route` (5.2) y monto de la obligación |
| [Outcrowd: Modern Fintech Website & Payment Dashboard](https://dribbble.com/shots/27011593-Modern-Fintech-Website-Payment-Dashboard) | Hero con titular muy claro y el producto real a la vista; la landing vende mostrando el producto | Landing (11.1) |
| [Arounda: Equitum Finance Web Design](https://dribbble.com/shots/20525640-Equitum-Finance-Web-Design) | Titular grande y seguro respaldado por cifras compactas | Escala Display (6.2) |
| [Shahruk Ahmed: International money transfer app](https://dribbble.com/shots/26689552-International-money-transfer-app) | Cifras grandes y respirables, lista de movimientos aireada, flujo de envío sin ruido | `MoneyFigure`, `TransferCard` |
| [finterface: finpal AI Finance Assistant](https://dribbble.com/shots/24968456-finpal-AI-Finance-Assistant-App-Smart-Money-Companion-UIUX) | Finanzas guiadas por conversación, con tarjetas estructuradas dentro del chat | `ChatThread`, `ApprovalRequestCard` |
| [Keitoto: Payments Tracking Table](https://dribbble.com/shots/25828612-Business-Payment-Saas-Web-App-Payments-Tracking-Table) | Medidores hechos de marcas verticales para saldos y topes; píldoras de estado claras en una tabla densa | `PermissionMeter` (usa marcas verticales: usadas, retenidas y libres) y `StatusPill` |
| [George: Transaction Status](https://dribbble.com/shots/25114009--Transaction-Status) | Estado "en validación" como barra segmentada y huellas presentadas en monoespaciada | Tramo incierto de `JourneyLine` y huella bajo el sello |
| [Vektora: Qiespend AI-Powered Fintech Dashboard](https://dribbble.com/shots/25900652-Qiespend-AI-Powered-Fintech-Dashboard) | Límites calculados por IA en barras segmentadas; vista oscura de operador | Consola del evaluador (11.5), sin su acento lima |
| [tubik: Fintech Dashboard Dark & Light](https://dribbble.com/shots/27171922-Fintech-Dashboard-UI-Dark-Light-Theme) | Paridad real entre tema claro y oscuro: misma jerarquía, distintos valores | Modo oscuro (5.1) |
| [Purrweb: Payment Tracking Web Platform](https://dribbble.com/shots/20227011-Payment-Tracking-Web-Platform) | Etapas del pago como pasos horizontales arriba del detalle | `JourneyLine` |

Lo que se vio en la búsqueda y **se descarta a propósito**: lima fosforescente sobre negro (la tendencia dominante en "fintech dashboard"), degradados morados, monedas y objetos 3D, fotos de stock y grillas de tarjetas idénticas.

---

## 4. Identidad visual

### 4.1 Logotipo
**Símbolo, "Threshold mark" (umbral):** una puerta en arco sobre un umbral, con un punto que ya la cruzó: el pago que llegó a destino y quedó resguardado. El arco también evoca la "A" de Arrival. Se construye en una grilla de 32 × 32 (prototipo validado a 20 px y a 112 px):
- Arco: trazado SVG `M8 28 V15 A8 8 0 0 1 24 15 V28`, sin relleno, trazo de 4 en `ink`, extremos rectos.
- Umbral: línea de x 2 a 30 en y 28, trazo de 2 en `ink`, extremos redondeados.
- Punto de llegada: círculo de radio 3.25 centrado en (16, 21), en `route`.
- Versión de un solo color (`ink`, o `paper` sobre fondos oscuros) para favicon y usos monocromos.
- No debe confundirse con un candado, un escudo ni un pin de ubicación: no agregues cerradura, contorno de escudo ni punta inferior.

**Logotipo:** "ArrivalGuard" en Overpass 700, interletrado −1%, todo en `ink` (sin bicolor). Bloque horizontal: símbolo a la izquierda, espacio igual a 0.375 veces la altura del símbolo y nombre alineado a la línea base óptica.

**Reglas:** área de resguardo igual a la mitad de la altura del símbolo. Tamaño mínimo de 20 px para el símbolo y de 96 px de ancho para el bloque horizontal. No rotar, no aplicar sombras, degradados ni contornos, y no cambiar las proporciones.

**Archivos a generar** (`public/brand/`): `mark.svg`, `mark-mono.svg`, `logo-horizontal.svg`, `logo-horizontal-dark.svg`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180), `og-image.png` (1200 × 630, ver 11.1) y `app-icon-512.png`.

### 4.2 Sello de consentimiento (el elemento memorable)
Componente `ConsentSeal` en SVG, determinista a partir de la huella SHA-256 de la aprobación:
- Lienzo de 96 × 96. Borde exterior cuadrado de radio 6 y trazo 4 en `seal`. Margen interno de 12.
- Grilla interna de 4 × 4 celdas de 16 px con separación de 2 px: la celda `i` tiene origen `x = 12 + (i % 4) × 18`, `y = 12 + floor(i / 4) × 18` y centro en `(x + 8, y + 8)`. Los primeros 16 dígitos hexadecimales de la huella definen las 16 celdas. Para cada dígito `d`: `d >> 2` elige el glifo y `d & 3` la rotación alrededor del centro (0, 90, 180 o 270 grados). Glifos, con trazo de 3.5 y extremos redondeados en `seal`:
  - 0, barra: línea de `(x+3, y+8)` a `(x+13, y+8)`.
  - 1, esquina: polilínea `(x+3, y+3)`, `(x+3, y+13)`, `(x+13, y+13)`.
  - 2, punto doble: círculos rellenos de radio 1.8 en `(x+5, y+8)` y `(x+11, y+8)`.
  - 3, cruz corta: líneas de `(x+8, y+4)` a `(x+8, y+12)` y de `(x+4, y+8)` a `(x+12, y+8)`.
- Prototipo validado: con tres huellas distintas produce sellos claramente diferentes y legibles a 96 px y a 144 px.
- Textura de tinta muy sutil: filtro SVG `feTurbulence` con desplazamiento mínimo, que se desactiva al imprimir.
- Debajo, en Overpass Mono: `Consent fingerprint 3F9A 21C7` (los primeros 8 caracteres en dos grupos).
- Accesible: `role="img"` y `aria-label="Consent seal, fingerprint 3F9A21C7"`.
- **Aclaración obligatoria en los documentos técnicos:** el sello es una representación visual de la huella. La seguridad la da la verificación en el servidor, no el dibujo.

Dónde aparece: en el documento de aprobación una vez aprobado, en el nodo "Approved" de la línea del pago, en la bandeja del pagador y en el expediente de evidencia. Antes de aprobar se muestra un marcador vacío con borde punteado y el texto *"The seal appears when Carlos approves."*

### 4.3 La banda de simulación
Una franja fina y fija bajo la barra superior: a la izquierda, un bloque con rayado diagonal en `ink` y `paper` (como la señalización de obra o de pruebas) y, al lado, el texto en `ink-2`: *"Simulated funds and a fictional university. No real money moves."* No se puede cerrar. En móvil se acorta a *"Simulated funds. No real money moves."*

---

## 5. Color

### 5.1 Tokens (contraste verificado con la fórmula WCAG 2.x)

**Modo claro**

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `paper` | `#F1F3F2` | Fondo de la app (mineral, frío, no crema) | base |
| `surface` | `#FFFFFF` | Paneles, documentos, campos | base |
| `ink` | `#172231` | Texto principal, logotipo | 16.0 sobre `surface`, 14.4 sobre `paper` |
| `ink-2` | `#4A5566` | Texto secundario | 7.6 sobre `surface`, 6.8 sobre `paper` |
| `muted` | `#646D79` | Texto terciario, ayudas | 5.2 sobre `surface`, 4.7 sobre `paper` |
| `line` | `#D5DAD7` | Divisores no esenciales | decorativo |
| `line-strong` | `#7D8794` | Bordes de campos y controles | 3.6 sobre `surface`, 3.3 sobre `paper` |
| `route` | `#2346C8` | Marca, interacción, línea de ruta, foco | 7.6 sobre `surface`; texto blanco sobre `route` 7.6 |
| `route-tint` | `#E8EDFB` | Fondos de selección | `route` sobre él 6.5 |
| `arrive` | `#12734F` | Acreditado, entregado, devuelto | 5.9 sobre `surface`; blanco sobre él 5.9 |
| `arrive-tint` | `#E3F2EB` | Fondo de estados de llegada | `arrive` sobre él 5.1 |
| `wait` | `#9A5B00` | Esperando, incierto, pendiente | 5.4 sobre `surface` |
| `wait-tint` | `#FBF0DC` | Fondo de estados en espera | `wait` sobre él 4.8 |
| `stop` | `#A8172B` | Bloqueado, rechazado | 7.4 sobre `surface`; blanco sobre él 7.4 |
| `stop-tint` | `#FBE7EA` | Fondo de bloqueos | `stop` sobre él 6.3 |
| `seal` | `#D2412B` | **Solo** el sello de consentimiento | 4.6 sobre `surface` |

**Modo oscuro**

| Token | Hex | Contraste |
|---|---|---|
| `paper` | `#0E1521` | base |
| `surface` | `#162030` | base |
| `ink` | `#E9EDF2` | 13.9 sobre `surface` |
| `ink-2` | `#AAB4C2` | 7.8 |
| `muted` | `#8692A3` | 5.2 |
| `line` | `#2A3648` | decorativo |
| `line-strong` | `#6B788A` | 3.7 |
| `route` | `#8FA8FF` | 7.2; texto `paper` sobre `route` 8.0 |
| `arrive` | `#5FCB9C` | 8.2 |
| `wait` | `#F0B44C` | 8.8 |
| `stop` | `#FF8A92` | 7.3 |
| `seal` | `#F06A52` | 5.4 |

Los tintes del modo oscuro se derivan mezclando el color de estado al 14% sobre `surface`. Verifica que el texto de estado sobre su tinte siga en 4.5 o más; ajusta si no.

### 5.2 Reglas de uso
- `route` es el único color de marca y de interacción. Si algo es azul, se puede tocar o es la ruta del dinero.
- Los colores de estado (`arrive`, `wait`, `stop`) **nunca** se usan como decoración. Siempre van con ícono y texto (el color nunca es la única señal).
- `seal` aparece solo en el sello. Nunca en botones, alertas ni gráficos.
- Fondos: `paper` para la app y `surface` para lo que contiene información. Nada de grises intermedios inventados.
- Sombras: casi ninguna. La jerarquía se da con borde, fondo y espacio. Solo los elementos flotantes (menús, diálogos, panel lateral) llevan sombra: `0 8px 24px rgba(23,34,49,.12)` en claro y `0 8px 24px rgba(0,0,0,.45)` en oscuro.

### 5.3 Paleta de datos (fondos familiares y proyección de caja)
- Saldo disponible: `route`.
- Reserva de llegada: `route` al 35% con rayado fino a 45 grados (se lee como "apartado").
- Retenciones de pagos en curso: `wait`.
- Gastado o debitado: `ink-2` al 40%.
- Ingreso condicionado (beca no recibida): solo contorno punteado en `muted`, sin relleno. Nunca se suma visualmente a las barras de dinero real.
- Rótulos directos sobre o junto a cada segmento. Sin leyendas separadas cuando caben los rótulos.

---

## 6. Tipografía

### 6.1 Familias
- **Overpass** (Google Fonts, licencia OFL), derivada de la tipografía de señalización vial Highway Gothic. Es la voz de la marca y de toda la interfaz: titulares, texto, controles y números.
- **Source Serif 4** (OFL), **solo** dentro del documento de aprobación, para las cláusulas. Le da al consentimiento la voz de un instrumento formal. No se usa en ningún otro lugar.
- **Overpass Mono** (OFL), solo en tres casos funcionales: la huella del sello, la bitácora de eventos de la consola y los identificadores técnicos del expediente.

Carga con `next/font/google`, subconjunto `latin`, `display: swap` y variables CSS `--font-sans`, `--font-serif`, `--font-mono`.

### 6.2 Escala (base de 16 px, proporción cercana a una cuarta en titulares)

| Rol | Tamaño / interlineado | Peso | Interletrado | Uso |
|---|---|---|---|---|
| Display | 56 / 60 (40 / 44 en móvil) | 700 | −2% | Solo el titular de la landing |
| H1 | 36 / 42 | 700 | −1.5% | Título de página |
| H2 | 26 / 32 | 650 | −1% | Secciones |
| H3 | 20 / 26 | 650 | −0.5% | Paneles |
| Amount XL | 40 / 44 | 650 | −1% | Monto de la obligación |
| Amount L | 24 / 30 | 600 | −0.5% | Montos de rutas y fondos |
| Body | 16 / 26 | 400 | 0 | Texto general |
| Body S | 14 / 22 | 400 | 0 | Texto secundario y tablas |
| Label | 13 / 18 | 600 | +0.5% | Rótulos de campos y columnas, en minúscula inicial |
| Caption | 12 / 16 | 500 | +1% | Ayudas, procedencia de datos |
| Serif clause | 17 / 28 | 400 | 0 | Cláusulas del documento de aprobación |

Longitud de línea: entre 45 y 75 caracteres para texto corrido. En el chat, como máximo 68 caracteres por línea.

### 6.3 Números y dinero
- Siempre `font-variant-numeric: tabular-nums lining-nums`. **Verificado el 18 de octubre:** con esa propiedad, `1,111.11` y `8,888.88` en Overpass miden exactamente lo mismo, así que Overpass tiene cifras tabulares reales y no hace falta Overpass Mono para montos. Repite la prueba en la Fase 0 con la versión de la fuente que cargue `next/font`.
- Formato: código ISO antes del monto, en `muted` y con un tamaño menos (`USD 2,860.00`, `CNY 20,000.00`). Siempre dos decimales y separador de miles con coma.
- Columnas de montos alineadas a la derecha. Diferencias con signo y color solo si son dinero que se mueve (débito con signo menos en `ink`, nunca en rojo; el rojo es para bloqueos).
- **Formateo sin punto flotante:** el DTO trae `minor` como string. Divide con `BigInt` en parte entera y centavos, agrupa la parte entera con `BigInt.prototype.toLocaleString('en-US')` y concatena los centavos con dos dígitos.
- Hora virtual: `Tue 20 Oct, 09:00` seguida del rótulo *virtual time* en `muted`. Duraciones: `24 h`, `2 h`, `in 48 h`.

---

## 7. Espacio, grilla, forma e íconos

- **Espaciado** en base 4: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Grilla:** 12 columnas, máximo 1,280 px de contenido, gutter de 24 px (16 px en móvil), márgenes laterales de 32 px (16 px en móvil). Contenido alineado a la izquierda; solo el documento de aprobación va centrado (columna de 640 px).
- **Radios por jerarquía** (no uno para todo): 2 px en documentos, tablas y celdas de datos; 8 px en controles (botones, campos, chips); 14 px en paneles grandes y hojas laterales; píldoras de estado totalmente redondeadas.
- **Bordes:** 1 px `line` para divisores; 1 px `line-strong` en campos; 2 px `route` en la selección.
- **Íconos:** Lucide, trazo de 1.75 y 20 px en interfaz, 16 px en línea con texto. Íconos propios: el símbolo, el octágono de alto para bloqueos (como señal vial, con trazo y no relleno en contextos pequeños) y el sello. Ningún ícono sin texto salvo con `aria-label` y tooltip.
- **Foco:** anillo de 2 px en `route` con separación de 2 px, visible siempre con teclado (`:focus-visible`).

---

## 8. Movimiento

Tokens: `fast 120ms`, `base 180ms`, `slow 320ms`; curvas `standard cubic-bezier(.2,0,0,1)` y `exit cubic-bezier(.4,0,1,1)`.

Solo dos momentos de firma:
1. **El pago avanza:** cuando cambia el estado, el tramo de la línea del pago se rellena desde la estación anterior hasta la nueva (400 ms, `standard`) y la nueva estación aparece. Al llegar a *Credited*, la estación final se llena de `arrive` y aparece el check. Nada de confeti.
2. **El sello:** al aprobar, el sello baja con una escala de 1.06 a 1 y una rotación de −2 a 0 grados en 320 ms, y la tinta pasa de 0 a 100% de opacidad. Ocurre una sola vez por aprobación.

Todo lo demás: transiciones de estado de 120 a 180 ms (apertura de paneles, cambios de pestaña, aparición de mensajes). Sin entradas animadas por sección, sin animaciones al pasar el cursor por tarjetas y sin efectos continuos, salvo el indicador de "checking" del estado incierto: un tramo punteado en `wait` cuyo desplazamiento se mueve lento (2 s por ciclo).

Con `prefers-reduced-motion: reduce`, todo cambia sin animación y el tramo incierto queda punteado y quieto.

---

## 9. Voz y textos de interfaz

### 9.1 Reglas
- Inglés, en minúscula inicial (sentence case), voz activa y verbos simples. Sin signos de exclamación ni disculpas.
- Cada acción conserva su nombre en todo el flujo: el botón que dice **Approve this payment** produce el aviso **Payment approved**.
- Los nombres vienen del usuario, no del sistema: *permission*, no *mandate*; *arrival reserve*, no *earmark*; *virtual time*, no *scenario clock*.
- Los errores dicen qué pasó y cómo seguir. Los vacíos invitan a actuar.
- Toda cifra con su procedencia cuando importa: *"From the university, 09:42 virtual time."*

### 9.2 Glosario de interfaz

| Concepto del sistema | Texto de interfaz |
|---|---|
| Tuition obligation | Tuition invoice |
| Payment plan | Payment plan |
| Approval | Carlos's approval (en genérico: *payer approval*) |
| Payer policy max | Tuition limit |
| Earmark ARRIVAL_EXPENSES | Arrival reserve |
| Standing mandate | Standing permission for arrival transfers |
| Remittance | Transfer to Sofía's local account |
| Refund claim | Refund request |
| Evidence pack | Evidence |
| Virtual clock | Virtual time |

### 9.3 Acciones y su resultado

| Botón | Aviso o resultado |
|---|---|
| Plan my payment | Plan ready |
| Request approval | Approval requested from Carlos |
| Approve this payment | Payment approved (aparece el sello) |
| Review or revoke | Abre el detalle con la opción **Revoke approval**, que produce *Approval revoked* |
| Send payment | Payment sent |
| Check this payment | Status updated, o *Still waiting for the university* |
| Send transfer | Transfer sent |
| Approve this transfer | Transfer approved |
| Submit refund request | Refund request submitted |
| Save limit | Tuition limit updated |
| Revoke permission | Permission revoked |
| Download evidence | Descarga el archivo |
| Advance 6 hours (consola) | Virtual time moved to Tue 20 Oct, 15:00 |
| Start new workspace (consola) | New workspace ready |

### 9.4 Estados

| Estado | Texto | Color e ícono (Lucide) |
|---|---|---|
| Datos por confirmar | Details needed | `ink-2`, `CircleDashed` |
| Plan listo | Plan ready | `route`, `Route` |
| Esperando aprobación | Waiting for Carlos | `wait`, `Hourglass` |
| Aprobado | Approved | `route`, sello miniatura |
| Enviando | Sending | `route`, `Send` |
| Incierto | Checking with the provider | `wait`, `RefreshCw` (estático con movimiento reducido) |
| Aceptado por el proveedor | Accepted by provider | `route`, `CheckCheck` |
| Esperando a la universidad | Waiting for the university | `wait`, `Landmark` |
| Acreditado | Credited by the university | `arrive`, `BadgeCheck` |
| Entregado (transferencia) | Delivered | `arrive`, `BadgeCheck` |
| Bloqueado | Blocked | `stop`, octágono propio |
| Falló sin débito | Failed, no money left the account | `ink-2`, `CircleSlash` |
| Devolución enviada / en revisión / devuelta / rechazada | Refund requested / Under review / Refunded / Refund declined | `route` / `wait` / `arrive` / `stop` |

### 9.5 Razones (cada `ReasonCode` del BUILD_PROMPT con su texto)

| Código | Título | Detalle (con datos reales) |
|---|---|---|
| `DEADLINE_MISSED` | Arrives too late | Takes 72 h. You need it within 48 h. |
| `NET_INSUFFICIENT` | University would receive less | Delivers CNY 19,800.00. The invoice is CNY 20,000.00. |
| `RECEIVER_NOT_ALLOWED` | Not the university's registered account | Payments go only to the account on the invoice. |
| `CHANNEL_NOT_ALLOWED` | Channel not accepted | Arrival University does not accept this payment channel. |
| `QUOTE_EXPIRED` | Price expired | Getting a fresh price for the same route. |
| `EXCEEDS_PAYER_MAX` | Above the tuition limit | Carlos set a limit of USD 2,900.00 for this tuition. |
| `BREAKS_RESERVE` | Would use the arrival reserve | USD 1,800.00 stays aside for the first weeks. |
| `INSUFFICIENT_FUNDS` | Not enough available funds | Available now: USD 340.00. |
| `APPROVAL_MISSING` | Needs Carlos's approval | Send the request. Carlos approves on his own screen. |
| `APPROVAL_INVALID` | Approval no longer matches | The plan changed. Carlos needs to approve the new one. |
| `APPROVAL_EXPIRED` | Approval expired | Request a new approval to continue. |
| `APPROVAL_REVOKED` | Approval revoked | Carlos revoked this approval. |
| `EXCEEDS_MANDATE_PERIOD_LIMIT` | Over this month's transfer limit | USD 288.00 of USD 600.00 used. Carlos needs to approve this one. |
| `RECIPIENT_NOT_VERIFIED` | Recipient not verified | Only accounts Carlos has verified can receive transfers. |
| `RECIPIENT_ACCOUNT_NOT_OPEN` | Local account not open yet | Transfers start once Sofía's account in China is open. |
| `CONDITIONAL_FUNDS_NOT_AVAILABLE` | Scholarship not received yet | It is shown apart and not counted as available money. |
| `REFUND_EXCEEDS_VERIFIED_EXCESS` | More than the overpayment | The verified overpayment is CNY 500.00. |
| `REFUND_DESTINATION_FIXED` | Refunds return to the paying account | They cannot be sent to another account. |
| `ACTIVE_ATTEMPT_EXISTS` | A payment is already on its way | Check that payment instead of sending another. |
| `ROLE_NOT_ALLOWED` | Only Carlos can do this | Ask Carlos to do it from his view. |
| `OUT_OF_SCOPE` | Outside what ArrivalGuard does | It can plan and send education payments, transfers for arrival costs and refund requests. |

Los textos con cifras se construyen con los datos del caso, nunca con valores fijos.

### 9.6 Vacíos, errores y sugerencias
- Sin pagos: *"No payments yet. Ask ArrivalGuard to plan your tuition, or use Plan my payment."*
- Sesión vencida: *"This workspace session has ended. Open a new workspace with the evaluation code."*
- IA no disponible: *"The assistant is unavailable right now. You can continue with the controls below. Nothing has been lost."*
- Error de red: *"Couldn't reach ArrivalGuard. Your payment state is saved. Try again."*
- **Sugerencias del chat.** Estudiante: *Pay my tuition without touching the arrival reserve*; *Has the university received my payment?*; *Will my money cover the first month?*; *Send CNY 2,000 to my local account for rent*. Pagador: *What needs my approval?*; *Lower the tuition limit to USD 2,500*; *What did Sofía transfer this month?*

---

## 10. Arquitectura de la información y flujos

**Rutas:**
- `/`: landing.
- `/w/[id]?as=student|payer|evaluator`: espacio de trabajo.
- `/w/[id]/approve/[planId]`: documento de aprobación.
- `/w/[id]/payer/changes/[changeId]`: confirmación de cambios.
- `/system`: guía viva del sistema de diseño (P1, con `noindex`).

**Selector de rol:** control segmentado en la barra superior con avatar de iniciales, nombre y rol: *Sofía, student*, *Carlos, payer* y *Evaluator*. Cambiar de rol conserva el espacio y la posición. El rol activo también se refleja en el color del borde superior de la barra (neutro para Sofía, `route` para Carlos, `ink` para el evaluador).

**Flujos clave:**
1. **Matrícula (T1):** Sofía pide en el chat → el agente pregunta lo que falta en un solo mensaje → aparece el tablero de rutas con la elegida y las descartadas → *Request approval* → en la vista de Carlos aparece la solicitud con un punto en su pestaña → Carlos abre el documento, revisa y aprueba → sello → Sofía (o el agente) envía → la línea del pago avanza → *Credited*.
2. **Corrección:** *"Actually, within 6 hours"* → el tablero se recalcula, la ruta D queda elegida y la aprobación anterior aparece tachada con el motivo *Approval no longer matches* → nueva solicitud.
3. **Estado incierto:** la línea muestra el tramo punteado en `wait` con *Checking with the provider* → el botón de enviar se reemplaza por *Check this payment* → se resuelve sin duplicar.
4. **Transferencia bajo permiso (T3):** el chat confirma *Transfer sent under your standing permission* → el medidor del permiso sube → Carlos ve la notificación en su panel. Si pasa el tope, aparece *Approve this transfer* en la vista de Carlos.
5. **Bloqueo:** un aviso de bloqueo dentro del chat con el octágono, el título de la razón, el detalle y el siguiente paso. Nunca una pared de texto.
6. **Evaluador:** cambia de escenario, avanza el reloj, activa fallas y mira la bitácora en vivo.

---

## 11. Pantallas

### 11.1 Landing (`/`)
El primer impacto es **el tablero de llegadas**: un componente vivo, guionizado en el cliente (sin llamadas a la API), que muestra el viaje de la matrícula de Sofía estación por estación.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [mark] ArrivalGuard                                  How it works   For judges │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▨▨ Simulated funds and a fictional university. No real money moves.          │
├───────────────────────────────────┬──────────────────────────────────────────┤
│ Tuition that arrives.             │  ARRIVALS BOARD (componente, no texto)    │
│ Savings that stay.                │  Ref           To                Amount   │
│                                   │  AG-STUDENT-01 Arrival University CNY 20,000.00│
│ An AI agent that pays a student's │  Status: Waiting for Carlos → Approved →  │
│ international tuition inside the  │          Sent → Credited                  │
│ limits their family sets, follows │  ●━━━━●━━━━●━━━━○━━━━○  Lima → Shenzhen     │
│ the money until the university    │                                          │
│ confirms it, and never pays twice.│                                          │
│ [Open the demo]  Watch the video  │                                          │
└───────────────────────────────────┴──────────────────────────────────────────┘
```

Secciones siguientes, en este orden:
1. **How a payment travels:** cuatro pasos numerados porque son una secuencia real: *Plan*, *Approve*, *Send*, *Arrive*. Cada uno con una captura recortada del producto, no con ilustraciones.
2. **Who can do what:** dos columnas. *ArrivalGuard can, on its own:* compare routes, refresh an expired price within Carlos's limit, check status, send arrival transfers under the standing permission, file refund requests. *Only Carlos can:* approve tuition, change limits, verify recipients, revoke permissions.
3. **Blocked on the server:** las cuatro categorías oficiales con un ejemplo real cada una (por ejemplo, *"Urgent, send it to this new account"* seguido de *Blocked: recipient not verified*) y el octágono.
4. **For judges:** formulario de acceso (código y escenario con descripciones de una línea), enlaces a la guía de demo, el repositorio y el video.
5. Pie: equipo, FinTechathon 2026 International Track y aviso de simulación.

**Imagen OG (1200 × 630):** fondo `paper`, el símbolo, el lema en Display y una fila del tablero de llegadas con el sello al costado.

### 11.2 Espacio del estudiante (`/w/[id]?as=student`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [mark] ArrivalGuard  Base scenario   Tue 20 Oct, 09:00 virtual time          │
│                         [Sofía, student][Carlos, payer][Evaluator]  Evidence │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▨▨ Simulated funds and a fictional university. No real money moves.          │
├────────────────────────────┬─────────────────────────────────────────────────┤
│ CONVERSATION (5 col)       │ TUITION INVOICE (7 col)                         │
│                            │ Arrival University   Ref AG-STUDENT-01          │
│ [mark] I have the amount   │ CNY 20,000.00                    Due in 48 h    │
│ and the university. When   │─────────────────────────────────────────────────│
│ must it arrive?            │ PAYMENT JOURNEY                                 │
│              Within 48 h ▸ │ ●──────●──────○──────○──────○──────○            │
│ ◦ Checking quotes          │ Planned Approved Sent Accepted University Credited│
│ [Route board card]         │─────────────────────────────────────────────────│
│ [Approval request card]    │ ROUTES          Arrives  Receives      Costs     │
│                            │ B  Selected      24 h  CNY 20,000.00 USD 2,860.00│
│                            │ D  Viable         2 h  CNY 20,000.00 USD 2,880.00│
│                            │ A  Arrives too late 72 h …                       │
│                            │ C  University would receive less …               │
│                            │ E  Not the registered account …                  │
│                            │─────────────────────────────────────────────────│
│ [suggestion chips]         │ FAMILY FUNDS  ▇▇▇▇▇▇▇▇▇▇▇▨▨▨▨▨  USD 5,000.00     │
│ [ Message ArrivalGuard   ] │ Arrival reserve USD 1,800.00   Limit USD 2,900.00│
└────────────────────────────┴─────────────────────────────────────────────────┘
```
(Los rótulos en mayúsculas del boceto son solo referencias de zona; en la interfaz los títulos de panel van en minúscula inicial.)

- El panel derecho es el **estado verdadero** (viene del servidor). El chat narra y propone, pero lo que vale está a la derecha.
- Debajo de los fondos: transferencias, solicitudes de devolución y beca (contorno punteado con *Not counted until received*).
- Móvil: pestañas *Chat*, *Payment*, *Funds*, con un indicador de cambios en la pestaña que no se está viendo.

### 11.3 Vista del pagador (`/w/[id]?as=payer`)
- Izquierda: **Requests** (aprobaciones de matrícula y de transferencias fuera del tope, con antigüedad en hora virtual) y **Activity** (transferencias ejecutadas bajo el permiso, bloqueos de seguridad relevantes para él).
- Derecha: **Permissions**: límite de matrícula, reserva de llegada y permiso permanente con su medidor (*USD 288.00 of USD 600.00 used this period*), cada uno con *Edit*, que lleva a la confirmación fija, y *Revoke permission*.
- Chat del pagador debajo o en una hoja lateral, con sus sugerencias.

### 11.4 Documento de aprobación (`/w/[id]/approve/[planId]`)
Es la pantalla más importante de la marca. Columna centrada de 640 px sobre `paper`, el documento en `surface` con radio de 2 px y borde `line`.

```
            Payment approval
            Arrival University tuition, requested by Sofía Ramos

  Source serif clause: "I approve a single tuition payment from my account
  ending 4821 to Arrival University's registered account, under the terms
  below. If the price expires, ArrivalGuard may refresh it for the same
  route only while the debit stays within my limit and the arrival reserve
  is kept."

  Purpose                 Tuition, reference AG-STUDENT-01
  Pays to                 Arrival University, account ending 0098
  University receives     CNY 20,000.00
  Proposed debit          USD 2,860.00
  Your limit              USD 2,900.00
  Left after payment      at least USD 1,800.00 (arrival reserve)
  Route                   B, Edu Pay Partner, arrives in about 24 h
  Valid until             Wed 21 Oct, 09:00 virtual time

  [ dashed seal placeholder ]   The seal appears when Carlos approves.

  [ Approve this payment ]   Review or revoke
```

- Los campos fijos se leen del servidor. El texto del modelo **nunca** aparece aquí.
- Al aprobar: el botón pasa a estado de carga, luego aparece el sello con su movimiento, el aviso *Payment approved* y la fecha y hora de aprobación.
- Si el plan cambió mientras estaba abierto: banda `wait` arriba con *This plan changed. Review the new version.* y botón deshabilitado.
- Imprimible: `@media print` limpio, con sello y huella.

### 11.5 Consola del evaluador (`?as=evaluator`)
Tema oscuro siempre, para que se distinga de las vistas de usuarios.
- **Scenario:** escenario actual, selector con descripciones y *Start new workspace*.
- **Virtual time:** hora grande en Overpass 650 y botones *Advance 1 hour*, *6 hours*, *24 hours*, *72 hours* y personalizado.
- **Faults:** interruptores con nombre claro y consecuencia en una línea (*Lose the next provider response: the payment will show as uncertain until checked*). Se ve cuáles están activas.
- **Event log:** flujo en vivo en Overpass Mono, con hora virtual, actor, evento y un resumen; filtros por tipo; los `SECURITY_BLOCK` resaltados con el octágono y su categoría.
- **AI usage:** medidor del presupuesto del espacio y del día.
- **Scripted tasks:** botón *Run T1 to T8* con resultados por tarea.

### 11.6 Modo estructurado
Cuando la IA no está disponible, el compositor del chat se reemplaza por un panel de acciones: *Plan my payment*, *Compare routes*, *Request approval*, *Send payment*, *Check this payment*, *Project my funds*, *Send transfer*, *Submit refund request*, cada una con su formulario mínimo. Banda superior en `wait-tint`: *Assistant unavailable. Structured controls are active.*

### 11.7 Expediente de evidencia (hoja lateral)
Línea de tiempo de eventos con hora virtual y real, actor, título en lenguaje humano y un detalle expandible con el JSON redactado. Filtros (*Payments*, *Approvals*, *Security*, *Clock and faults*). Botones *Download evidence (JSON)* y *Download summary (Markdown)*. El sello aparece junto a cada aprobación.

---

## 12. Componentes

Cada componente define anatomía, variantes, estados (normal, hover, focus, active, disabled, loading, error) y accesibilidad. Ubicación en `src/ui/`.

| Componente | Especificación |
|---|---|
| `Logo`, `ThresholdMark` | SVG de la sección 4.1, tamaños `sm 20`, `md 28`, `lg 40` |
| `ConsentSeal` | Sección 4.2. Props: `fingerprint`, `size`, `state` (`placeholder`, `stamped`), `animate` |
| `SimulationBand` | Sección 4.3 |
| `RoleSwitcher` | Control segmentado accesible (`role="tablist"`), teclas de flecha, indicador de notificaciones por rol |
| `VirtualClock` | Hora virtual con rótulo y diferencia respecto al inicio (*+6 h*) |
| `MoneyFigure` | Props: `money` (DTO), `size` (`xl`, `l`, `m`, `s`), `emphasis`. Código de moneda en `muted`. Cifras tabulares |
| `StatusPill` | Tabla 9.4. Ícono, texto y tinte. `aria-label` completo |
| `RouteBoard` | Tabla con aspecto de tablero de llegadas: columnas *Route*, *Arrives in*, *University receives*, *Costs*, *Status*. Fila elegida con barra izquierda de 3 px en `route` y píldora *Selected*. Descartadas en `ink-2` con la razón visible (no oculta en tooltip). Ordenada: elegida, viables y descartadas. En móvil se convierte en lista de filas apiladas |
| `JourneyLine` | Estaciones unidas por una línea, estilo mapa de metro: hecho (relleno `route`), actual (anillo), incierto (tramo punteado `wait`), bloqueado (octágono en la estación), acreditado (relleno `arrive` y check). Bajo cada estación: hora virtual y procedencia (*Provider*, *University*). Horizontal en escritorio y vertical en móvil |
| `ApprovalDocument` | Sección 11.4 |
| `ApprovalRequestCard` | Tarjeta compacta para el chat y la bandeja: monto, ruta, estado y acción principal según el rol |
| `FundsBar` | Barra apilada de la sección 5.3 con rótulos directos y el ingreso condicionado aparte |
| `CashProjection` | Por moneda: filas con concepto y monto, barra y veredicto (*Covered, USD 340.00 to spare* o *Short by USD 360.00*) |
| `PermissionMeter` | Usado frente al tope del período, con días restantes y estado. Se dibuja como una fila de 60 marcas verticales: usadas en `route`, retenidas en `wait` y libres en `line`, con el texto *USD 288.00 of USD 600.00 used this period* |
| `TransferCard`, `RefundRequestCard` | Monto, destino enmascarado, estado y procedencia |
| `ChatThread` | Mensajes del agente sin burbuja, con el símbolo a la izquierda. Mensajes del usuario a la derecha sobre `route-tint`. Tarjetas del servidor a todo el ancho dentro del hilo. Región `aria-live="polite"` |
| `ActivityChip` | Texto pequeño en `muted` con indicador de progreso: *Checking quotes*, *Validating limits*, *Checking with the university*. Los genera el servidor según la herramienta usada |
| `BlockedNotice` | Octágono, título de la razón, detalle, siguiente paso y, si aplica, categoría de seguridad (*Blocked: possible induced transfer*) |
| `SuggestionChips` | Pedidos sugeridos por rol (9.6). Desaparecen tras el primer mensaje y vuelven con el estado vacío |
| `EvidenceDrawer` | Sección 11.7 |
| `FaultToggle`, `EventLog`, `UsageMeter` | Consola del evaluador |
| Primitivas | `Button` (`primary` en `route`, `secondary` con borde, `quiet` de texto, `danger` solo para revocar), `Input`, `Select`, `Switch`, `Tabs`, `Dialog`, `Sheet`, `Tooltip`, `Toast` (sonner), `Skeleton`. Basadas en shadcn/ui y reestilizadas con los tokens; nada con el aspecto por defecto |

**Botones:** altura 40 px (44 px en táctil), padding horizontal de 16 px, Overpass 600 a 15 px y sin flechas en el texto. Solo un botón primario por zona.

---

## 13. Accesibilidad (WCAG 2.2 AA, verificada)
- Contraste de texto de 4.5:1 o más y de 3:1 en componentes; los tokens ya cumplen, y cualquier color nuevo se verifica antes de usarse.
- Todo se usa con teclado, con orden lógico y foco visible. Atajos: `Ctrl/Cmd + Enter` envía en el chat.
- Estados con texto y forma además del color. Regiones `aria-live` para cambios de estado de pago y mensajes del agente.
- Objetivos táctiles de 44 × 44 px como mínimo.
- `lang="en"`, títulos de página únicos y landmarks (`header`, `nav`, `main`, `aside`).
- Movimiento reducido respetado (sección 8).
- Pruebas: `@axe-core/playwright` en las pantallas principales, sin violaciones serias o críticas.

---

## 14. Responsive
- Escritorio desde 1,280 px: chat y estado lado a lado (5 y 7 columnas).
- Portátil desde 1,024 px: igual, con el panel derecho en scroll propio.
- Tableta desde 768 px: chat arriba y estado abajo, o pestañas si no cabe.
- Móvil desde 360 px: pestañas *Chat*, *Payment*, *Funds*. El documento de aprobación ocupa todo el ancho con márgenes de 16 px. Sin scroll horizontal en ninguna pantalla.

---

## 15. Implementación técnica
- Tokens como variables CSS (`--ag-paper`, `--ag-ink`, …) en `src/ui/theme/tokens.css`, con modo oscuro por `[data-theme="dark"]` y respeto de `prefers-color-scheme` en la primera visita. Si el proyecto usa Tailwind v4, se exponen con `@theme`; con v3, en `tailwind.config.ts`. Ningún hex suelto fuera de los tokens.
- Selector de tema en la barra superior (claro, oscuro, sistema), guardado en `localStorage` dentro de `try/catch`.
- Fuentes con `next/font/google` (sección 6.1).
- Componentes de shadcn/ui copiados a `src/ui/primitives/` y reestilizados.
- Gráficos en SVG propio (barras y línea del pago). No hace falta una librería de gráficos.
- Íconos con `lucide-react`. Los propios (símbolo, octágono, sello) en `src/ui/brand/`.
- Estructura: `src/ui/brand`, `src/ui/primitives`, `src/ui/finance`, `src/ui/chat`, `src/ui/console`, `src/ui/layout`, `src/ui/theme`.
- **Guía viva `/system`** (P1, `noindex`): tokens con su contraste, tipografía, botones, píldoras de estado, `MoneyFigure`, `RouteBoard` con datos del escenario, `JourneyLine` en todos sus estados, el sello con tres huellas de ejemplo y el documento de aprobación. Sirve para revisar la calidad antes de armar pantallas y como material para el pitch.

---

## 16. Proceso de calidad
1. **Plan:** antes de escribir componentes, resume en `docs/design/DESIGN_PLAN.md` los tokens, la tipografía y la estructura de cada pantalla. Revísalo contra la sección 3.4: si algo se parece a lo que harías para cualquier fintech, cámbialo y anota por qué.
2. **Construye** primero `/system` y después las pantallas.
3. **Critica con capturas:** con Playwright, captura cada pantalla principal a 1440 × 900, 1024 × 768 y 390 × 844, en claro y oscuro, en `docs/design/screens/`. Revísalas y corrige alineaciones, saltos de línea en montos, contrastes, densidad y jerarquía. Las mejores capturas se reutilizan en el README, el documento técnico y el pitch.
4. **Quita un accesorio:** antes de cerrar cada pantalla, elimina un elemento que no ayude a entender o actuar.
5. **Checklist por pantalla:** un solo primario; estados con ícono y texto; montos tabulares y alineados; procedencia visible donde importa; simulación visible; foco visible; sin errores de axe; móvil sin scroll horizontal; modo oscuro correcto.

---

## 17. Prioridades (encajan con las fases del BUILD_PROMPT)
- **P0 (Fase 4):** tokens, fuentes, `Logo`, `SimulationBand`, barra superior con `RoleSwitcher` y `VirtualClock`, vista del estudiante con `RouteBoard`, `JourneyLine`, `MoneyFigure`, `StatusPill`, `BlockedNotice`, chat básico, documento de aprobación con `ConsentSeal`, vista del pagador con solicitudes y permisos, consola del evaluador funcional, modo estructurado y landing con el formulario de acceso.
- **P1:** landing completa con el tablero de llegadas, `FundsBar`, `CashProjection`, `PermissionMeter`, `EvidenceDrawer`, modo oscuro, `/system`, imagen OG, favicons, capturas en `docs/design/screens/`, movimiento de firma y axe sin violaciones.
- **P2:** efecto de paneles giratorios del tablero al pasar a *Credited* (cada celda gira con 30 ms de desfase, solo una vez), pictogramas propios para T1 a T8 y versión imprimible del expediente.

---

## 18. Kit para el pitch y el video
- Fondo `paper`, una captura por slide sobre `surface` con radio de 14 px, como máximo 8 palabras por slide en Overpass 700 y el sello como motivo recurrente en las slides de consentimiento y seguridad.
- Colores solo de los tokens. Sin plantillas genéricas ni íconos de stock.
- En el video: cursor visible, zoom suave en el sello y en la línea del pago, y la banda de simulación siempre en cuadro.

---

## 19. Lo que no debes hacer
- No uses colores, radios ni sombras fuera de los tokens.
- No pongas texto del modelo en el documento de aprobación ni en componentes financieros.
- No uses rojo para débitos normales; el rojo es solo para bloqueos.
- No ocultes las razones de descarte en tooltips.
- No uses mayúsculas sostenidas en etiquetas, puntos medios como separadores de metadatos ni flechas en los botones.
- No agregues ilustraciones genéricas, fotos de stock, mascotas ni íconos de "IA".
- No animes por animar: solo los dos momentos de firma y las transiciones de estado.
- No declares la interfaz "accesible" sin haber corrido axe y revisado el teclado.

**Empieza por:** tokens, fuentes, `Logo`, `ConsentSeal` y la página `/system`. Muéstrala a los humanos con capturas en claro y oscuro antes de construir las pantallas.
