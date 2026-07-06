# Guía para desarrolladores

Instrucciones para trabajar en [drz-academy.github.io](https://drz-academy.github.io): sitio estático con la página principal, aplicaciones Next.js y hojas de curso generadas desde Markdown.

## Requisitos

- **Python 3.10+** (generador de cursos)
- **Node.js 20+** (apps en `apps/`)
- **Git**

## Configuración del entorno

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Dependencias Python (`requirements.txt`):

| Paquete | Uso |
|---------|-----|
| `pyyaml` | Frontmatter YAML de `curso.md` |
| `markdown` | Conversión Markdown → HTML |
| `qrcode[pil]` | Código QR de inscripción para afiches |

## Probar el sitio en local

```bash
make build    # compila apps Next.js y ensambla _site/
make start    # sirve _site/ en http://127.0.0.1:8000
make stop     # detiene el servidor
```

El sitio local replica lo que publica GitHub Pages: página principal, cursos en `/pages/<id>/` y apps en `/apps/...`.

---

## Cursos: modelo de archivos

Cada curso vive en `pages/<id>/`:

```
pages/mi-curso/
├── curso.md              ← fuente de verdad (editar aquí)
├── index.html            ← generado; no editar a mano
└── images/
    ├── header.png        ← banner del curso (~2048×952 px)
    ├── qr-curso.png        ← afiche → hoja del curso (generado, con logo)
    ├── qr-inscripcion.png  ← página → URL de inscripción (generado)
    ├── foto1.jpg         ← opcional
    └── foto2.jpg         ← opcional
```

El índice de la página principal lee `pages/courses.json`, también generado por el script.

---

## Publicar un curso nuevo

### 1. Crear el esqueleto

```bash
python3 pages/build_course.py --new mi-curso
```

Esto crea `pages/mi-curso/` desde la plantilla en `pages/template/curso.md`, actualiza el `id` y genera el **QR de afiche** (`qr-curso.png`) apuntando a la hoja del curso.

### 2. Completar metadatos y contenido

Edita `pages/mi-curso/curso.md`:

- **Frontmatter** (bloque YAML entre `---`): título, tagline, instructor, horarios, URL de inscripción, etc.
- **Cuerpo**: secciones con `## Título`. Usa `<!-- fotos -->` donde quieras la cuadrícula de fotos.

Campos importantes:

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único (= nombre del directorio) |
| `inscripcion_url` | Enlace de inscripción; codifica `qr-inscripcion.png` |
| `imagen_header` | Banner (`images/header.png`, ~2048×952 px) |
| `imagen_og` | Previsualización en redes (`images/og-preview.jpg`, generado) |
| `imagen_qr_curso` | QR de afiche → hoja del curso (generado) |
| `imagen_qr` | QR de inscripción en la página (generado) |
| `activo` | `true` para mostrar en el índice y mostrar bloque de inscripción |

### 3. Añadir imágenes

Copia el banner y fotos a `pages/mi-curso/images/`:

- **header.png** — banner horizontal para la cabecera (~2048×952 px)
- **og-preview.jpg** — se genera solo; versión liviana del banner para WhatsApp/Twitter
- **foto1.jpg**, **foto2.jpg** — opcionales, referenciadas en `fotos:` del frontmatter

### 4. Generar la página y actualizar el índice

```bash
python3 pages/build_course.py pages/mi-curso/curso.md
```

Este comando:

1. **Regenera ambos QR** (`qr-curso.png` con logo → hoja del curso; `qr-inscripcion.png` → `inscripcion_url`)
2. Genera `pages/mi-curso/index.html`
3. Actualiza `pages/courses.json` para la tarjeta del índice

### 5. Revisar en local y publicar

```bash
make build && make start
# Abre http://127.0.0.1:8000/pages/mi-curso/
```

Cuando esté listo, haz commit y push a `main`. GitHub Actions despliega automáticamente en unos minutos.

---

## Actualizar un curso existente

1. Edita `pages/<id>/curso.md` (texto, metadatos o URL de inscripción).
2. Si cambiaste imágenes, reemplaza archivos en `pages/<id>/images/`.
3. Regenera:

```bash
python3 pages/build_course.py pages/<id>/curso.md
```

4. Commit de `curso.md`, `index.html`, `courses.json` e imágenes (incluidos `qr-curso.png` y `qr-inscripcion.png` si cambiaron).
5. Push a `main`.

> **Nota:** En CI, cada deploy vuelve a generar todas las páginas desde `curso.md` con `--no-update-json`. El `courses.json` del repo debe estar commiteado tras un build local.

### Opciones del generador

```bash
# Sin tocar courses.json (útil en CI; ya lo hace el workflow)
python3 pages/build_course.py pages/mi-curso/curso.md --no-update-json

# Sin regenerar el QR
python3 pages/build_course.py pages/mi-curso/curso.md --no-qr
```

---

## Códigos QR

El script genera **dos QR** de 512×512 px cada vez que corres `build_course.py`:

| Archivo | Destino | Uso | Logo |
|---------|---------|-----|------|
| `images/qr-curso.png` | `https://drz-academy.github.io/pages/<id>/` | Afiches, flyers, material impreso | Sí |
| `images/qr-inscripcion.png` | `inscripcion_url` del frontmatter | Bloque «Inscríbete ya» en la página web | Sí |

El QR de inscripción solo se genera si `inscripcion_url` tiene una URL real (no el placeholder `https://drz.academy`).

Regenera ambos al cambiar URLs o al crear el curso:

```bash
python3 pages/build_course.py pages/mi-curso/curso.md
```

### Previsualización en WhatsApp / redes

WhatsApp no acepta banners pesados (>300 KB). El script genera **`images/og-preview.jpg`** (≈1200 px, JPEG) a partir de `header.png` y lo usa en `og:image`.

Tras desplegar, si WhatsApp sigue mostrando la imagen vieja, borra la caché en el [Depurador de contenido compartido de Meta](https://developers.facebook.com/tools/debug/) (pega la URL del curso y pulsa «Scrape Again»).

---

## Despliegue en producción

El workflow `.github/workflows/deploy.yml` se ejecuta en cada push a `main`:

1. Instala dependencias Python (`requirements.txt`) y Node.js
2. Compila las apps Next.js
3. Regenera HTML de todos los cursos desde `pages/*/curso.md`
4. Ensambla `_site/` y publica en GitHub Pages

URL pública: **https://drz-academy.github.io**

También puedes lanzar el deploy manualmente desde la pestaña **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

---

## Referencia rápida

| Tarea | Comando |
|-------|---------|
| Nuevo curso | `python3 pages/build_course.py --new <id>` |
| Generar / actualizar curso | `python3 pages/build_course.py pages/<id>/curso.md` |
| Sitio local | `make build && make start` |
| Plantilla de curso | `pages/template/curso.md` |
| Generador | `pages/build_course.py` |

## Estructura del repositorio

```
index.html              Página principal
assets/                 Logos, favicons
pages/
  build_course.py       Generador de cursos + QR
  courses.json          Índice de cursos (generado)
  template/curso.md     Plantilla para cursos nuevos
  <id>/                 Un directorio por curso
apps/
  cloud_academy/        Cámara de burbujas (Next.js)
  lighting-black-holes/ Simulación agujeros negros (Next.js)
.github/workflows/      CI/CD GitHub Pages
Makefile                Build y servidor local
requirements.txt        Dependencias Python
```
