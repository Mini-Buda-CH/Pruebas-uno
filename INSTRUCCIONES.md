# Cómo publicar UNO No Mercy en tu repo público

Este ZIP contiene **solo lo que el sitio necesita**: `index.html`, `css/`, `js/` (con PeerJS incluido) y `assets/` (79 imágenes de cartas). No lleva las fotos originales ni las herramientas de generación.

## 1. Prepara los archivos
1. Descomprime el ZIP en tu computadora.
2. Verás: `index.html`, `css/`, `js/`, `assets/` y este archivo. **Este archivo no hace falta subirlo.**

## 2. Súbelos al repositorio público
1. Abre tu repo (por ejemplo `https://github.com/Mini-Buda-CH/Pruebas-uno`).
2. Pulsa **Add file → Upload files**.
3. Arrastra a la ventana **`index.html` y las carpetas `css`, `js` y `assets`** (los archivos de dentro del ZIP, no el ZIP).
   - GitHub permite hasta 100 archivos por subida y aquí hay 85, así que caben en una sola.
4. Escribe un mensaje (por ejemplo "Sube el sitio") y pulsa **Commit changes** (rama `main`).
5. Si el repo ya tiene archivos de una copia anterior, los del mismo nombre se reemplazan. Borra a mano lo que no sea del sitio (por ejemplo archivos `.whl` o `__pycache__`): abre el archivo, icono de papelera, **Commit changes**.

## 3. Crea el archivo `.nojekyll`
Evita que GitHub procese el sitio con Jekyll. Los archivos que empiezan con punto no se suben bien arrastrando, así que:
1. **Add file → Create new file**.
2. En el nombre escribe exactamente `.nojekyll` (déjalo vacío) y pulsa **Commit changes**.

## 4. Activa GitHub Pages
1. Ve a **Settings → Pages** de tu repo.
2. En **Build and deployment → Source** elige **Deploy from a branch**.
3. En **Branch** elige `main` y la carpeta `/ (root)`. Pulsa **Save**.
4. Espera uno o dos minutos. En la pestaña **Actions** aparece una ejecución "pages build and deployment"; cuando termina en verde, la URL sale arriba en la página de Pages:
   `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`

## 5. Pruébalo
1. Abre la URL, escribe tu nombre y pulsa **Crear partida**.
2. En otro dispositivo (mejor con datos móviles) abre la misma URL, escribe el código de 5 caracteres y pulsa **Unirme**.
3. Inicia la partida desde el anfitrión y juega unas jugadas.

## Si algo falla
- **Error 404:** espera un par de minutos y recarga; revisa que Source sea `main` y `/ (root)`, y que `index.html` esté en la raíz del repo (no dentro de otra carpeta).
- **Página sin estilo o sin cartas:** las carpetas `css`, `js` y `assets` deben estar en la raíz, junto a `index.html`.
- **"No existe esa sala" o no conecta:** el juego usa el servidor público gratuito de PeerJS y conexión directa entre navegadores. Redes con restricciones (empresa, algunos datos móviles) pueden bloquearla; prueba con otra red.
- **Para actualizar el sitio** después: sube de nuevo los archivos cambiados con **Upload files**.
