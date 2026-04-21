# REX — webOS LG

App de streaming para LG webOS con las mismas funciones que la versión Android.

## Estructura

```
rex-webos/
├── appinfo.json          ← Manifiesto de la app
├── index.html            ← Entrada principal
├── css/style.css         ← Estilos (1920×1080, HBO Max dark)
├── js/
│   ├── api.js            ← AllCalidad scraper + TMDB (equivale a los .java)
│   ├── nav.js            ← Motor de navegación D-pad
│   ├── home.js           ← Vista inicio con secciones
│   ├── detail.js         ← Vista detalle película/serie
│   ├── player.js         ← Vista reproductor con iframe
│   └── app.js            ← Router principal + búsqueda + teclado virtual
└── assets/               ← Iconos (ver abajo)
```

## Configuración antes de instalar

### 1. Clave TMDB
En `js/api.js` línea 10, reemplaza:
```js
const TMDB_KEY = 'TU_TMDB_API_KEY_AQUI';
```
con tu API Key de https://www.themoviedb.org/settings/api

### 2. Iconos requeridos por webOS
Crea o coloca en `assets/`:
- `icon.png`       — 80×80 px
- `icon_large.png` — 130×130 px

Puedes generar iconos simples con cualquier editor o usar los de tu app Android.

---

## Instalación en LG TV

### Requisitos
- ares-cli instalado: `npm install -g @webosose/ares-cli`
- TV LG con **Developer Mode** activado

### Paso 1 — Activar Developer Mode en la TV
1. Abre el menú de la TV → Settings → General → About This TV
2. Haz clic 5 veces en **Software Version** para abrir el modo desarrollador
3. Activa "Dev Mode Status" → ON
4. Anota la **IP de tu TV** (Settings → Network → Wi-Fi Connection → Advanced)

### Paso 2 — Configurar el dispositivo en ares-cli
```bash
ares-setup-device
```
Ingresa cuando pregunte:
- **Name**: mi-lg-tv  (cualquier nombre)
- **IP**: 192.168.x.x  (la IP de tu TV)
- **Port**: 9922
- **Username**: prisoner

### Paso 3 — Obtener clave de acceso
En la TV aparecerá un PIN. Ingrésalo:
```bash
ares-novacom --device mi-lg-tv --getkey
```

### Paso 4 — Empaquetar la app
Desde la carpeta `rex-webos/`:
```bash
ares-package .
```
Genera un archivo `sv.edu.catolica.rex_1.0.0_all.ipk`

### Paso 5 — Instalar en la TV
```bash
ares-install --device mi-lg-tv sv.edu.catolica.rex_1.0.0_all.ipk
```

### Paso 6 — Lanzar
```bash
ares-launch --device mi-lg-tv sv.edu.catolica.rex
```

O desde el menú de apps de la TV busca **REX**.

---

## Desarrollo y debug

Ver logs en tiempo real:
```bash
ares-inspect --device mi-lg-tv --app sv.edu.catolica.rex
```
Abre Chrome DevTools en el navegador que indica.

Reinstalar rápido (package + install en un comando):
```bash
ares-package . && ares-install --device mi-lg-tv sv.edu.catolica.rex_1.0.0_all.ipk
```

---

## Controles D-pad

| Botón        | Acción                        |
|--------------|-------------------------------|
| ↑ ↓ ← →      | Navegar entre elementos       |
| OK / Enter   | Seleccionar / Reproducir      |
| Back / Atrás | Volver a la vista anterior    |
| Botón azul   | (reservado para búsqueda)     |

---

## Notas

- Las peticiones a `allcalidad.re` se hacen con los mismos headers que Chrome Android para evitar bloqueos.
- El scraper es idéntico en lógica a `AllCalidadScraper.java`.
- La app usa `fetch()` nativo — webOS lo soporta desde webOS 3.0+.
- El reproductor usa `<iframe>` con los mismos URLs embed que la app Android.
