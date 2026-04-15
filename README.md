# 🔔 Zabbix Sound Alerts

Tampermonkey userscript que añade **alertas sonoras persistentes** a Zabbix para problemas **Unacknowledged** en todos los niveles de severidad.

## ✨ Features

- 🚨 **Alarma sonora continua** que NO para hasta pulsar el botón
- 🔴🟠🟤🟡🔵🔘 **Soporte para las 6 severidades** de Zabbix (Critical, High, Average, Warning, Information, Not Classified)
- 🔛 **Activar/Desactivar cada severidad** de forma independiente
- ⏱ **Umbrales de tiempo independientes** por severidad (ej: Critical 5min, High 15min, Average 30min...)
- 🔍 **Filtros por nombre** (separados por comas) para cada severidad — solo alerta si el nombre del problema contiene alguno de los términos
- 🚫 **Excepciones por nombre** (separadas por comas) para cada severidad — NUNCA alerta si el nombre contiene alguno de los términos
- 💥 **Detección de alertas masivas** — si el número total de alertas en pantalla ("Displaying X to Y of **N** found") supera un umbral configurable, se dispara una alarma especial
- 🔊 **Audio auto-unlock** en la primera interacción del usuario (política de autoplay del navegador)
- 💾 **Configuración persistente** guardada en `localStorage`
- 📡 Usa la **Zabbix JSON-RPC API** (`problem.get`) con `acknowledged: false`

## 🎵 Tipos de alarma

| Tipo | Severidades | Sonido |
|---|---|---|
| 💥 **Masiva** | Umbral de alertas totales superado | Doble sirena (sawtooth + square), la más agresiva |
| 🚨 **Critical** | Disaster (5) | Sirena larga 2.5s + 8 beeps |
| ⚠️ **High** | High (4) | Sirena media 1.5s + 5 beeps |
| 🟤 **Medium** | Average (3) | Tono triangular oscilante + 3 beeps |
| 🔔 **Low** | Warning (2), Information (1), Not Classified (0) | Tonos sinusoidales suaves |

## 📦 Instalación

1. Instala [Tampermonkey](https://www.tampermonkey.net/) en tu navegador
2. Crea un nuevo script
3. Copia y pega el contenido de `zabbix-sound-alerts.user.js`
4. Actualiza la línea `@match` con la URL de tu Zabbix
5. Guarda y recarga Zabbix

## ⚙️ Configuración

Haz click en el botón flotante 🔔 (esquina inferior derecha) para abrir el panel de configuración:

### 💥 Alerta Masiva

| Ajuste | Descripción |
|---|---|
| Umbral alertas totales | Si "Displaying X of **N** found" supera este número → alarma masiva. Default: 100 |

### Por cada severidad (🔴 Critical, 🟠 High, 🟤 Average, 🟡 Warning, 🔵 Information, 🔘 Not Classified)

| Ajuste | Descripción |
|---|---|
| ✅ Activado | Checkbox para activar/desactivar la monitorización de esa severidad |
| ⏱ Umbral (minutos) | Tiempo mínimo que un problema debe llevar activo para disparar la alarma |
| 🔍 Filtro (comas) | Solo alerta si el nombre del problema contiene alguno de estos términos. Vacío = todas |
| 🚫 Excepciones (comas) | NUNCA alerta si el nombre del problema contiene alguno de estos términos |

### Valores por defecto

| Severidad | Activada | Umbral |
|---|---|---|
| 🔴 Critical | ✅ Sí | 5 min |
| 🟠 High | ✅ Sí | 15 min |
| 🟤 Average | ❌ No | 15 min |
| 🟡 Warning | ❌ No | 15 min |
| 🔵 Information | ❌ No | 15 min |
| 🔘 Not Classified | ❌ No | 15 min |

## 🧪 Botones del panel

| Botón | Acción |
|---|---|
| 💾 Guardar | Guarda toda la configuración y reinicia el loop de comprobación |
| ✅ ON / ❌ OFF | Activa/desactiva todo el sistema de alertas |
| 💥 Test Masiva | Simula una alarma masiva |
| 🔴 Test Crit | Simula una alarma Critical |
| 🟠 Test High | Simula una alarma High |
| 🟤 Test Avg | Simula una alarma Average |
| 🟡 Test Low | Simula una alarma Warning/Info |
| 🗑 Reset | Limpia los IDs ya alertados y el estado de alerta masiva |

## 📋 Changelog

### v9.0
- Soporte para las **6 severidades** de Zabbix (Not Classified, Information, Warning, Average, High, Critical)
- Cada severidad se puede **activar/desactivar** con un checkbox
- Cada severidad tiene su propio **umbral, filtro y excepciones**
- **Detección de alertas masivas** leyendo "Displaying X to Y of N found" del DOM
- Alarma masiva con sonido especial (doble sirena agresiva)
- 4 tipos de sonido distintos según severidad (massive, critical, high, medium, low)
- Panel de configuración rediseñado con secciones colapsables por severidad
- Botones de test para cada tipo de alarma

### v8.0
- Umbrales separados para HIGH y CRITICAL
- Lista de excepciones (separadas por comas) para excluir problemas específicos
- Excepciones independientes para HIGH y CRITICAL

### v7.0
- Sistema de audio unlock para política autoplay del navegador
- Filtros por nombre separados por comas para HIGH y CRITICAL
- Sistema de alarma pendiente cuando el audio está bloqueado

### v6.0
- Filtro `acknowledged: false` (solo problemas Unacknowledged)
- Nombres de problemas mostrados en el overlay de alarma

### v5.0
- Detección dual: API + fallback HTML table
- Overlay de alarma a pantalla completa

### v4.0
- Inyección en `document.documentElement` para máxima compatibilidad
- Múltiples reintentos de inyección

### v3.0
- Botón flotante (position:fixed) independiente del DOM de Zabbix

### v1.0-v2.0
- Versiones iniciales con intentos de inyección en sidebar

## 📄 License

MIT