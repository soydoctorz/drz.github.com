#!/usr/bin/env python3
"""
build_course.py – Convierte una hoja de curso en Markdown a una página HTML
estilizada con el diseño de Dr. Z Academy y actualiza pages/courses.json.

Uso:
    # Crear nuevo curso desde la plantilla
    python3 pages/build_course.py --new mi-curso

    # Generar/regenerar la página HTML de un curso
    python3 pages/build_course.py pages/mi-curso/curso.md

    # Opciones adicionales
    python3 pages/build_course.py pages/mi-curso/curso.md --no-update-json

Dependencias:
    pip install pyyaml markdown
"""

import re
import sys
import json
import shutil
import argparse
from pathlib import Path

# ── Dependencias opcionales ──────────────────────────────────────────────────
try:
    import yaml
except ImportError:
    sys.exit("❌  Falta pyyaml.  Instala con:  pip install pyyaml")

try:
    import markdown as md_lib
    _md = md_lib.Markdown(extensions=["extra", "nl2br"])
    HAS_MARKDOWN = True
except ImportError:
    HAS_MARKDOWN = False
    print("⚠️  markdown no instalado. Usando conversión básica.  pip install markdown")

# ── Rutas base ───────────────────────────────────────────────────────────────
REPO_ROOT   = Path(__file__).resolve().parent.parent   # drz.github.com/
PAGES_DIR   = REPO_ROOT / "pages"
TEMPLATE_MD = PAGES_DIR / "template" / "curso.md"
COURSES_JSON= PAGES_DIR / "courses.json"


# ─────────────────────────────────────────────────────────────────────────────
# MARKDOWN → HTML
# ─────────────────────────────────────────────────────────────────────────────

def md_to_html(text: str) -> str:
    """Convierte markdown a HTML. Usa la librería markdown si está disponible."""
    if HAS_MARKDOWN:
        _md.reset()
        return _md.convert(text)
    # Fallback básico: solo párrafos y negritas
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*",     r"<em>\1</em>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    paragraphs = [f"<p>{p.strip()}</p>" for p in text.split("\n\n") if p.strip()]
    return "\n".join(paragraphs)


def parse_frontmatter(source: str) -> tuple[dict, str]:
    """Separa el YAML frontmatter del cuerpo markdown. Devuelve (meta, cuerpo)."""
    if not source.startswith("---"):
        return {}, source
    parts = source.split("---", 2)
    if len(parts) < 3:
        return {}, source
    meta = yaml.safe_load(parts[1]) or {}
    body = parts[2].lstrip("\n")
    return meta, body


def split_sections(body: str) -> list[tuple[str, str]]:
    """
    Divide el cuerpo en secciones: [(heading, contenido), ...].
    La primera sección sin heading se llama '' (cadena vacía).
    """
    sections: list[tuple[str, str]] = []
    current_heading = ""
    current_lines: list[str] = []

    for line in body.splitlines():
        m = re.match(r"^##\s+(.+)$", line)
        if m:
            if current_lines:
                sections.append((current_heading, "\n".join(current_lines).strip()))
            current_heading = m.group(1).strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_heading, "\n".join(current_lines).strip()))

    return sections


def render_blockquote_as_topics(html: str) -> str:
    """Envuelve cada <blockquote> con la clase topics-list."""
    return re.sub(
        r"<blockquote>(.*?)</blockquote>",
        r'<div class="topics-list">\1</div>',
        html, flags=re.DOTALL
    )


def render_ul_as_checklist(html: str) -> str:
    """Convierte <ul> en listas con clase checklist."""
    return html.replace("<ul>", '<ul class="checklist">')


def photo_grid_html(fotos: list[str]) -> str:
    """Genera el HTML de la cuadrícula de fotos."""
    if not fotos:
        return ""
    imgs = "\n".join(
        f'      <img src="{f}" alt="Foto del curso" loading="lazy">'
        for f in fotos
    )
    return f'<div class="photo-grid">\n{imgs}\n    </div>'


def render_section_content(content: str, fotos: list[str]) -> str:
    """
    Convierte el contenido de una sección markdown a HTML limpio,
    reemplazando el marcador <!-- fotos --> con la cuadrícula de imágenes.
    """
    # Reemplazar marcador antes de convertir
    photo_placeholder = "FOTOS_PLACEHOLDER_XYZ"
    has_fotos = "<!-- fotos -->" in content
    content = content.replace("<!-- fotos -->", photo_placeholder)

    html = md_to_html(content)
    html = render_blockquote_as_topics(html)
    html = render_ul_as_checklist(html)

    if has_fotos:
        html = html.replace(photo_placeholder, photo_grid_html(fotos))
    else:
        html = html.replace(photo_placeholder, "")

    return html


# ─────────────────────────────────────────────────────────────────────────────
# PLANTILLA HTML
# ─────────────────────────────────────────────────────────────────────────────

def cta_block(meta: dict) -> str:
    """Genera el bloque de inscripción al final del contenido."""
    url    = meta.get("inscripcion_url", "#")
    qr     = meta.get("imagen_qr", "")
    email  = meta.get("email_contacto", "soydoctorz@gmail.com")
    wa     = meta.get("whatsapp", "")

    qr_html = ""
    if qr:
        qr_html = f'''
      <div class="qr-wrap">
        <img src="{qr}" alt="Código QR para inscripción">
        <span>Escanea para inscribirte</span>
      </div>'''

    wa_html = ""
    if wa:
        wa_html = f'<a href="{wa}" target="_blank" rel="noopener">WhatsApp</a>'

    return f'''
    <div class="enroll-section">
      <p>¡Inscríbete ya!</p>
      <a class="enroll-btn" href="{url}" target="_blank" rel="noopener">
        Inscribirme ahora →
      </a>{qr_html}
      <div class="contact-links" style="margin-top:1.5rem;">
        <a href="mailto:{email}">{email}</a>
        {wa_html}
        <a href="https://drz.academy" target="_blank" rel="noopener">drz.academy</a>
      </div>
    </div>
    <p class="closing">¡Nos vemos!</p>'''


def render_html(meta: dict, sections: list[tuple[str, str]]) -> str:
    """Genera la página HTML completa a partir de los metadatos y secciones."""
    titulo      = meta.get("titulo", "Curso Dr. Z Academy")
    tagline     = meta.get("tagline", "")
    instructor  = meta.get("instructor", "")
    header_img  = meta.get("imagen_header", "images/header.png")
    fotos       = meta.get("fotos", [])
    activo      = meta.get("activo", False)

    # Construir el cuerpo de secciones
    body_html_parts: list[str] = []
    first = True
    for heading, content in sections:
        if not content and not heading:
            continue
        html_content = render_section_content(content, fotos)
        if heading:
            tag = "h1" if first else "h2"
            body_html_parts.append(
                f'    <{tag} class="section-title">{heading}</{tag}>\n'
                f'    <div class="section-body">{html_content}</div>'
            )
            first = False
        else:
            body_html_parts.append(f'    <div class="section-body">{html_content}</div>')

    if activo:
        body_html_parts.append(cta_block(meta))

    body_html = "\n\n".join(body_html_parts)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{titulo} – Dr. Z Academy</title>
  <meta name="description" content="{tagline}">
  <link rel="icon" href="https://drz.academy/wp-content/uploads/2024/11/Dr_Z_Logo_Logo_fondo_sin_fondo-150x150.png" sizes="32x32">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Roboto:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --gold: #F3D361;
      --teal: #0d7693;
      --link: #1155cc;
      --text: #1a1a1a;
      --text-light: #444;
      --bg: #ffffff;
      --bg-alt: #f8f9fa;
      --border: #e0e0e0;
      --gap: 2.5rem;
      --width: 740px;
      --r: 10px;
    }}
    html {{ scroll-behavior: smooth; }}
    body {{
      background: var(--bg); color: var(--text);
      font-family: 'Nunito', sans-serif; font-size: 1.0625rem; line-height: 1.8;
    }}
    a {{ color: var(--link); }} a:hover {{ text-decoration: underline; }}

    /* Header banner */
    .page-header {{ width: 100%; line-height: 0; background: #000; }}
    .page-header img {{ width: 100%; height: auto; display: block; }}

    /* Breadcrumb */
    .topbar {{
      background: #fff; border-bottom: 1px solid var(--border);
      padding: 0.6rem 1.5rem; display: flex; align-items: center;
      gap: 0.5rem; font-size: 0.8rem; color: #888;
    }}
    .topbar a {{ color: #555; text-decoration: none; }}
    .topbar a:hover {{ color: var(--teal); }}
    .topbar .sep::before {{ content: "›"; margin: 0 0.3rem; }}

    /* Content */
    main {{ max-width: var(--width); margin: 0 auto; padding: 3rem 1.5rem 5rem; }}

    /* Section titles (Pacifico) */
    h1.section-title, h2.section-title {{
      font-family: 'Pacifico', cursive; font-weight: 400;
      font-size: clamp(1.6rem, 5vw, 2.25rem); line-height: 1.2;
      color: var(--text); margin-top: var(--gap); margin-bottom: 1.25rem;
    }}
    h1.section-title {{ margin-top: 0; }}

    /* Section body */
    .section-body p {{
      font-family: 'Roboto', sans-serif; margin-bottom: 1.1rem;
      text-align: justify; color: var(--text-light);
    }}
    .section-body p:last-child {{ margin-bottom: 0; }}
    .section-body p strong, .section-body b {{ color: var(--text); font-weight: 700; }}

    /* Topics list (blockquote) */
    .topics-list {{
      background: var(--bg-alt); border-left: 4px solid var(--teal);
      border-radius: 0 var(--r) var(--r) 0; padding: 1.25rem 1.5rem; margin: 1.25rem 0;
    }}
    .topics-list p {{
      color: #1a4fa8; font-size: 1rem; font-weight: 600;
      text-align: center; margin: 0; line-height: 1.9;
    }}

    /* Photo grid */
    .photo-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0; }}
    .photo-grid img {{ width: 100%; height: auto; border-radius: var(--r); display: block; object-fit: cover; }}

    /* Checklist */
    ul.checklist {{ list-style: none; padding: 0; margin: 1rem 0; }}
    ul.checklist li {{
      font-family: 'Nunito', sans-serif; font-size: 1rem; color: var(--text-light);
      padding: 0.6rem 0 0.6rem 2rem; position: relative;
      border-bottom: 1px solid var(--border); line-height: 1.6;
    }}
    ul.checklist li:last-child {{ border-bottom: none; }}
    ul.checklist li::before {{
      content: "●"; position: absolute; left: 0.4rem;
      color: var(--gold); font-size: 0.55rem; top: 0.9rem;
    }}

    /* CTA / Enroll */
    .enroll-section {{
      background: var(--bg-alt); border: 2px solid var(--teal);
      border-radius: var(--r); padding: 2rem; margin-top: var(--gap); text-align: center;
    }}
    .enroll-section p {{ text-align: center; font-family: 'Nunito', sans-serif; font-size: 1.1rem; color: var(--text); margin-bottom: 1.25rem; }}
    .enroll-btn {{
      display: inline-block; background: var(--teal); color: #fff;
      font-family: 'Nunito', sans-serif; font-size: 1.1rem; font-weight: 800;
      padding: 0.8rem 2.2rem; border-radius: 100px; text-decoration: none;
      transition: background 0.2s; margin-bottom: 1.5rem;
    }}
    .enroll-btn:hover {{ background: #0a5f77; text-decoration: none; color: #fff; }}
    .qr-wrap {{ display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }}
    .qr-wrap img {{ width: 140px; height: 140px; border: 1px solid var(--border); border-radius: var(--r); }}
    .qr-wrap span {{ font-size: 0.8rem; color: #888; }}
    .contact-links {{ display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }}
    .contact-links a {{ color: var(--teal); font-weight: 700; font-size: 0.9rem; }}

    /* Closing */
    .closing {{
      text-align: center; font-family: 'Nunito', sans-serif;
      font-size: 1.5rem; font-weight: 800; color: var(--teal);
      margin-top: 2.5rem; padding-top: 2rem; border-top: 2px solid var(--border);
    }}

    /* Footer */
    footer {{ background: var(--bg-alt); border-top: 1px solid var(--border); padding: 1.5rem; text-align: center; font-size: 0.8rem; color: #888; }}
    footer a {{ color: #555; }}

    /* Print */
    @media print {{
      .topbar, .enroll-section, footer {{ display: none; }}
      body {{ font-size: 11pt; }}
      .section-body p {{ text-align: left; color: #000; }}
      h1.section-title, h2.section-title {{ color: #000; }}
    }}

    /* Mobile */
    @media (max-width: 600px) {{
      main {{ padding: 2rem 1rem 4rem; }}
      .photo-grid {{ grid-template-columns: 1fr; }}
      .enroll-section {{ padding: 1.25rem 1rem; }}
    }}
  </style>
</head>
<body>

  <div class="page-header">
    <img src="{header_img}" alt="{titulo} – Dr. Z Academy" width="2048" height="952">
  </div>

  <nav class="topbar" aria-label="Breadcrumb">
    <a href="https://drz.academy">Dr. Z Academy</a>
    <span class="sep">Cursos</span>
    <span class="sep" aria-current="page">{titulo}</span>
  </nav>

  <main>
{body_html}
  </main>

  <footer>
    <p>© 2026 <a href="https://drz.academy" target="_blank" rel="noopener">Dr. Z Academy</a>
    · Medellín, Colombia
    · <a href="mailto:{meta.get('email_contacto', 'soydoctorz@gmail.com')}">{meta.get('email_contacto', 'soydoctorz@gmail.com')}</a></p>
  </footer>

</body>
</html>
"""


# ─────────────────────────────────────────────────────────────────────────────
# COURSES.JSON
# ─────────────────────────────────────────────────────────────────────────────

def update_courses_json(meta: dict, course_dir: Path) -> None:
    """Inserta o actualiza la entrada del curso en pages/courses.json."""
    cid = meta.get("id", course_dir.name)

    # Ruta relativa del directorio del curso desde la raíz del repo
    rel_dir = course_dir.relative_to(REPO_ROOT).as_posix() + "/"

    # Imagen de cabecera para la tarjeta
    header = meta.get("imagen_header", "images/header.png")
    if not header.startswith("http"):
        header = rel_dir + header

    entry = {
        "id":          cid,
        "titulo":      meta.get("titulo", ""),
        "tagline":     meta.get("tagline", ""),
        "descripcion": meta.get("descripcion", ""),
        "url":         rel_dir,
        "imagen":      header,
        "etiquetas":   meta.get("etiquetas", []),
        "instructor":  meta.get("instructor", ""),
        "sesiones":    meta.get("sesiones", 0),
        "activo":      meta.get("activo", False),
    }

    data: dict = {"cursos": []}
    if COURSES_JSON.exists():
        with open(COURSES_JSON, encoding="utf-8") as f:
            data = json.load(f)

    cursos = data.get("cursos", [])
    # Reemplazar si ya existe, insertar al principio si es nuevo
    idx = next((i for i, c in enumerate(cursos) if c.get("id") == cid), None)
    if idx is not None:
        cursos[idx] = entry
    else:
        cursos.insert(0, entry)

    data["cursos"] = cursos
    with open(COURSES_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✅  courses.json actualizado  →  {COURSES_JSON.relative_to(REPO_ROOT)}")


# ─────────────────────────────────────────────────────────────────────────────
# COMANDOS
# ─────────────────────────────────────────────────────────────────────────────

def cmd_new(course_id: str) -> None:
    """Crea un nuevo directorio de curso copiando la plantilla."""
    dest_dir = PAGES_DIR / course_id
    dest_md  = dest_dir / "curso.md"
    dest_img = dest_dir / "images"

    if dest_dir.exists():
        sys.exit(f"❌  Ya existe el directorio  {dest_dir.relative_to(REPO_ROOT)}")

    dest_dir.mkdir(parents=True)
    dest_img.mkdir()
    shutil.copy(TEMPLATE_MD, dest_md)

    # Actualizar el id en el frontmatter
    text = dest_md.read_text(encoding="utf-8")
    text = re.sub(r'^id:\s*"[^"]*"', f'id: "{course_id}"', text, flags=re.MULTILINE)
    dest_md.write_text(text, encoding="utf-8")

    print(f"✅  Nuevo curso creado en:  {dest_dir.relative_to(REPO_ROOT)}/")
    print(f"   1. Edita el frontmatter y el contenido en:  {dest_md.relative_to(REPO_ROOT)}")
    print(f"   2. Copia las imágenes a:  {dest_img.relative_to(REPO_ROOT)}/")
    print(f"   3. Genera la página con:  python3 pages/build_course.py {dest_md.relative_to(REPO_ROOT)}")


def cmd_build(md_path: Path, update_json: bool = True) -> None:
    """Genera el index.html del curso a partir del markdown."""
    md_path = md_path.resolve()
    if not md_path.exists():
        sys.exit(f"❌  No se encuentra el archivo:  {md_path}")

    source    = md_path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(source)

    if not meta.get("id"):
        meta["id"] = md_path.parent.name

    sections  = split_sections(body)
    html      = render_html(meta, sections)

    out_file  = md_path.parent / "index.html"
    out_file.write_text(html, encoding="utf-8")
    print(f"✅  Página generada  →  {out_file.relative_to(REPO_ROOT)}")

    if update_json:
        update_courses_json(meta, md_path.parent)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dr. Z Academy – generador de páginas de curso",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python3 pages/build_course.py --new cuantica-para-curiosos
  python3 pages/build_course.py pages/cuantica-para-curiosos/curso.md
  python3 pages/build_course.py pages/extraterrestres/curso.md --no-update-json
""",
    )
    parser.add_argument(
        "markdown", nargs="?", type=Path,
        help="Ruta al archivo curso.md (ej: pages/mi-curso/curso.md)",
    )
    parser.add_argument(
        "--new", metavar="ID",
        help="Crear nuevo directorio de curso desde la plantilla",
    )
    parser.add_argument(
        "--no-update-json", action="store_true",
        help="No actualizar pages/courses.json",
    )
    args = parser.parse_args()

    if args.new:
        cmd_new(args.new)
    elif args.markdown:
        cmd_build(args.markdown, update_json=not args.no_update_json)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
