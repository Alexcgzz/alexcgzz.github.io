# alexcgzz.github.io

Portafolio de una sola pantalla (sin scroll) + panel de administración. 100% estático, sin build, hosteado gratis en GitHub Pages.

```
index.html          sitio público
css/site.css
js/site.js          renderiza el sitio y trae los repos de la API pública de GitHub
js/shared.js        helpers compartidos (sanitización de URLs, DOM seguro)
data/config.json    TODO el contenido editable (textos, estatus, links, stack, proyectos)
admin/              panel para editar config.json desde el navegador
assets/cv.pdf       (agrégalo tú)
```

## Publicar en https://alexcgzz.github.io

Ya existe el repo `alexcgzz.github.io` con una versión vieja. Para reemplazarla con esta:

```bash
git init -b main
git add .
git commit -m "New portfolio"
git remote add origin https://github.com/alexcgzz/alexcgzz.github.io.git
git push -f origin main   # ⚠ reemplaza el contenido actual del repo
```

Luego en GitHub → repo → **Settings → Pages** → *Source: Deploy from a branch* → `main` / `(root)`.
En ~1 minuto queda en `https://alexcgzz.github.io`.

> Si prefieres conservar el repo viejo, renómbralo primero (p. ej. `old-portfolio`) y crea uno nuevo llamado `alexcgzz.github.io`.

## Editar el contenido (panel admin)

1. Crea un **fine-grained token**: <https://github.com/settings/personal-access-tokens/new>
   - *Repository access*: **Only select repositories** → `alexcgzz.github.io`
   - *Permissions → Repository → Contents*: **Read and write** (nada más)
   - Expiración: la que quieras (90 días es razonable)
2. Abre `https://alexcgzz.github.io/admin/`, pega el token y conecta.
3. Edita estatus de trabajo, textos, links, stack y qué repos mostrar (y su orden, estatus `passed / running / failed`, título, descripción y tags).
4. **Guardar y publicar** hace un commit a `data/config.json`; GitHub Pages lo publica en ~1 minuto.

También puedes editar `data/config.json` a mano. Campos vacíos de un proyecto (`title`, `description`, `tags`) usan los datos del repo en GitHub (nombre, descripción, topics/lenguaje). Si `projects` está vacío, se muestran tus 3 repos más recientes.

## Seguridad

- Sin backend ni secretos en el código. El panel `/admin/` es público pero no puede hacer nada sin tu token.
- El token se guarda solo en tu navegador (`sessionStorage`, o `localStorage` si marcas "recordar") y solo se envía a `api.github.com`. Con un fine-grained token su alcance se limita a escribir en este repo.
- Content-Security-Policy estricta: solo scripts propios, sin scripts inline, conexiones únicamente a `api.github.com`.
- Todo el contenido se inserta con `textContent` (nunca `innerHTML`) y los links se validan (`https:`, `mailto:` o rutas relativas), así que un texto o descripción de repo no puede inyectar código.
- `/admin/` tiene `noindex` y está bloqueado en `robots.txt`.

## Probar localmente

```bash
python -m http.server 8000
# http://localhost:8000  y  http://localhost:8000/admin/ ("Editar sin conectar")
```
