#!/usr/bin/env python3
"""Génère un catalogue HTML autonome de tous les fichiers du projet.

Chaque fichier est présenté avec son chemin exact dans le dépôt et son contenu
complet, prêt à être copié-collé un par un (bouton « Copier »).
    python3 documentation/fiche_catalogue.py  ->  documentation/CATALOGUE_FICHIERS.html
"""
from __future__ import annotations

import html
import os
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "documentation" / "CATALOGUE_FICHIERS.html"

IGNORER_DOSSIERS = {
    "node_modules", ".next", "dist", ".git", "var", "__pycache__",
    ".venv", "build", "coverage", ".expo", ".turbo",
}
IGNORER_FICHIERS = {
    "CATALOGUE_FICHIERS.html", "fiche_catalogue.py",
    "MEMO_CAMPUS_fiche_presentation.pdf",
}
# Tout fichier de configuration locale (.env, .env.local, .env.production…) est un
# secret : jamais dans le catalogue, jamais dans le dépôt.
IGNORER_SECRETS = {
    ".env", ".env.local", ".env.production", ".env.development",
    ".env.test", ".env.e2e", ".env.partage",
}
IGNORER_SUFFIXES = (".tar.gz", ".zip", ".log", ".png", ".jpg", ".jpeg", ".ico", ".pdf")
TEXTE_MAX = 400_000  # au-delà : on affiche un renvoi vers le fichier téléchargeable


def fichiers() -> list[Path]:
    trouves: list[Path] = []
    for chemin in sorted(RACINE.rglob("*")):
        if not chemin.is_file():
            continue
        rel = chemin.relative_to(RACINE)
        if any(part in IGNORER_DOSSIERS for part in rel.parts):
            continue
        if rel.name in IGNORER_FICHIERS:
            continue
        if rel.name.startswith(".env") and rel.name != ".env.example":
            continue
        if rel.name in IGNORER_SECRETS:
            continue
        if rel.name.endswith(IGNORER_SUFFIXES):
            continue
        if rel.name.endswith(".tar.gz"):
            continue
        trouves.append(rel)
    return trouves


def langage(nom: str) -> str:
    return {
        ".ts": "TypeScript", ".tsx": "TypeScript (React)", ".js": "JavaScript",
        ".json": "JSON", ".prisma": "Prisma", ".sql": "SQL", ".yml": "YAML",
        ".yaml": "YAML", ".md": "Markdown", ".py": "Python", ".sh": "Shell",
        ".css": "CSS", ".html": "HTML", ".example": "Modèle de configuration",
    }.get(Path(nom).suffix, "Texte")


def bloc(rel: Path) -> str:
    chemin = RACINE / rel
    poids = chemin.stat().st_size
    try:
        contenu = chemin.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        contenu = f"[fichier binaire ou illisible — {poids} octets : voir l'archive]"
    trop_gros = len(contenu) > TEXTE_MAX
    if trop_gros:
        contenu = contenu[:TEXTE_MAX] + "\n… [contenu tronqué : utilisez l'archive pour ce fichier]"

    ident = html.escape(str(rel).replace(os.sep, "/"))
    reel = rel.as_posix()
    eclate = reel.split("/")
    dossier = "/".join(eclate[:-1]) or "racine du dépôt"
    nom = eclate[-1]

    lignes = contenu.count("\n") + 1
    return f"""
<section class="fichier" data-chemin="{html.escape(reel)}">
  <div class="entete">
    <div>
      <div class="dossier">{html.escape(dossier)}/</div>
      <h3>{html.escape(nom)}</h3>
    </div>
    <div class="droite">
      <span class="tag">{html.escape(langage(nom))}</span>
      <span class="poids">{poids:,} o · {lignes} lignes</span>
      <button class="copier" data-cible="{ident}">Copier</button>
    </div>
  </div>
  <details>
    <summary>Voir le contenu</summary>
    <pre id="{ident}">{html.escape(contenu)}</pre>
  </details>
</section>"""


def arborescence(rels: list[Path]) -> str:
    vus: dict[str, dict] = {}
    for rel in rels:
        noeud = vus
        for part in rel.parts[:-1]:
            noeud = noeud.setdefault(part + "/", {})
        noeud[rel.parts[-1]] = {}

    def rendre(noeud: dict, profondeur: int = 0) -> str:
        sortie = ""
        for nom, enfants in noeud.items():
            est_dossier = nom.endswith("/")
            sortie += (
                f'<div class="arbre-ligne" style="padding-left:{profondeur * 18}px">'
                f'{"📁" if est_dossier else "📄"} {html.escape(nom[:-1] if est_dossier else nom)}</div>'
            )
            if enfants:
                sortie += rendre(enfants, profondeur + 1)
        return sortie

    return rendre(vus)


def main() -> None:
    rels = fichiers()
    total_octets = sum((RACINE / r).stat().st_size for r in rels)
    dossier_count = len({p for r in rels for p in r.parts[:-1]})
    corps = "".join(bloc(r) for r in rels)

    doc = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MÉMO CAMPUS — tous les fichiers à déposer sur GitHub</title>
<style>
  :root {{
    --fond:#0b1020; --carte:#141b31; --carte2:#0f1628; --texte:#e8ecf8;
    --doux:#9aa7c7; --accent:#5b8cff; --vert:#37d399; --bord:#23304f;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--fond); color:var(--texte);
         font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height:1.55; }}
  header {{ padding:34px 22px 26px; background:linear-gradient(135deg,#16224a,#0b1020 60%); border-bottom:1px solid var(--bord); }}
  header h1 {{ margin:0 0 6px; font-size:26px; letter-spacing:-.4px; }}
  header p {{ margin:0; color:var(--doux); font-size:15px; }}
  .stats {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }}
  .stat {{ background:var(--carte); border:1px solid var(--bord); border-radius:10px; padding:8px 13px; font-size:13px; }}
  .stat b {{ color:var(--accent); }}
  main {{ padding:22px; max-width:1000px; margin:0 auto; }}
  .mode {{ background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--vert);
           border-radius:12px; padding:16px 18px; margin-bottom:22px; }}
  .mode h2 {{ margin:0 0 10px; font-size:17px; color:var(--vert); }}
  .mode ol {{ margin:0; padding-left:20px; color:var(--texte); font-size:14.5px; }}
  .mode li {{ margin-bottom:7px; }}
  .mode code {{ background:#0a1022; border:1px solid var(--bord); border-radius:5px; padding:1px 6px; font-size:13px; }}
  .alerte {{ background:#2a1a12; border-left-color:#ff9c5b; }}
  .alerte h2 {{ color:#ffb178; }}
  .arbre {{ background:var(--carte2); border:1px solid var(--bord); border-radius:12px;
            padding:16px 18px; margin-bottom:24px; font-family:ui-monospace,Consolas,monospace; font-size:13px; }}
  .arbre-ligne {{ color:#c7d2ec; padding:1px 0; }}
  .fichier {{ background:var(--carte); border:1px solid var(--bord); border-radius:12px;
              padding:14px 16px; margin-bottom:12px; }}
  .entete {{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }}
  .dossier {{ color:var(--accent); font-size:12px; font-family:ui-monospace,Consolas,monospace; }}
  .fichier h3 {{ margin:2px 0 0; font-size:15.5px; font-family:ui-monospace,Consolas,monospace; }}
  .droite {{ display:flex; align-items:center; gap:9px; flex-wrap:wrap; }}
  .tag {{ background:#1d2a4d; color:#a9c0ff; border-radius:999px; padding:2px 10px; font-size:11.5px; }}
  .poids {{ color:var(--doux); font-size:12px; }}
  .copier {{ background:var(--accent); color:#fff; border:0; border-radius:8px;
             padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }}
  .copier:active {{ transform:scale(.97); }}
  .copier.fait {{ background:var(--vert); }}
  details {{ margin-top:10px; }}
  summary {{ cursor:pointer; color:var(--doux); font-size:13px; }}
  pre {{ background:#080d1a; border:1px solid var(--bord); border-radius:9px; padding:14px;
         overflow:auto; max-height:460px; font-size:12.5px; line-height:1.5;
         font-family:ui-monospace,Consolas,monospace; color:#cfe0ff; white-space:pre; }}
  footer {{ text-align:center; color:var(--doux); font-size:13px; padding:26px 20px 40px; }}
</style>
</head>
<body>
<header>
  <h1>MÉMO CAMPUS — tous les fichiers du dépôt</h1>
  <p>Un fichier par carte, avec son <b>chemin exact</b> dans le dépôt et son contenu complet.</p>
  <div class="stats">
    <div class="stat"><b>{len(rels)}</b> fichiers</div>
    <div class="stat"><b>{dossier_count}</b> dossiers</div>
    <div class="stat"><b>{total_octets / 1024 / 1024:.1f} Mo</b> de texte</div>
    <div class="stat">aucun <b>.env</b> · aucun secret</div>
  </div>
</header>
<main>
  <div class="mode alerte">
    <h2>⚠️ À lire d'abord : 192 fichiers à la main, ce n'est pas raisonnable</h2>
    <p style="margin:0;font-size:14.5px">
      Cette page existe pour que vous ne perdiez plus aucun fichier. Mais déposer 192 fichiers un par un
      dans l'interface GitHub prendrait plus de 3 heures et une seule erreur de nom casse le projet.
      Deux méthodes font le même travail en <b>10 minutes</b>, sans rien compresser :
    </p>
    <ol style="margin-top:12px">
      <li><b>GitHub Desktop</b> (recommandé) : installez-le, <i>File → Add local repository</i> → choisissez le dossier
          <code>memo-campus</code> extrait sur votre Bureau → <i>Publish repository</i>. Il envoie les 192 fichiers
          <b>avec leur arborescence</b>. C'est un seul bouton.</li>
      <li><b>Les 10 dossiers + 5 fichiers</b> : sur GitHub, bouton <i>Add file → Upload files</i>, puis glissez
          <code>apps</code>, <code>packages</code>, <code>documentation</code>, <code>infrastructure</code>,
          <code>scripts</code>, <code>.github</code> et les 5 fichiers de la racine. Un glisser-déposer de
          <b>dossiers</b> conserve l'arborescence ; c'est le <code>Ctrl+A</code> qui l'aplatit.</li>
    </ol>
  </div>

  <div class="mode">
    <h2>Méthode « un fichier à la fois » (si vous y tenez)</h2>
    <ol>
      <li>Sur la page du dépôt : <b>Add file → Create new file</b>.</li>
      <li>Dans le champ du nom, tapez le <b>chemin complet</b> de la carte, par exemple
          <code>apps/api/src/main.ts</code> : GitHub crée les dossiers automatiquement (la barre <code>/</code> crée un dossier).</li>
      <li>Cliquez <b>Copier</b> ci-dessous, collez dans la zone de texte, puis <b>Commit changes</b>.</li>
      <li>Ordre conseillé : la racine d'abord (<code>package.json</code>, <code>render.yaml</code>,
          <code>.env.example</code>, <code>README.md</code>, <code>package-lock.json</code>), puis
          <code>packages/</code>, <code>apps/api/</code>, <code>apps/web/</code>, <code>apps/mobile/</code>,
          <code>infrastructure/</code>, <code>documentation/</code>, <code>scripts/</code>.</li>
    </ol>
  </div>

  <h2 style="font-size:17px;margin:0 0 10px">Arborescence attendue</h2>
  <div class="arbre">{arborescence(rels)}</div>

  <h2 style="font-size:17px;margin:0 0 10px">Les {len(rels)} fichiers</h2>
  {corps}
</main>
<footer>Généré automatiquement depuis le projet — chemins conformes au dépôt Git.</footer>
<script>
document.addEventListener('click', function (e) {{
  var b = e.target.closest('.copier');
  if (!b) return;
  var bloc = document.getElementById(b.dataset.cible);
  if (!bloc) return;
  var texte = bloc.textContent;
  var fini = function () {{
    b.textContent = 'Copié ✔'; b.classList.add('fait');
    setTimeout(function () {{ b.textContent = 'Copier'; b.classList.remove('fait'); }}, 1600);
  }};
  var selectionner = function () {{
    var plage = document.createRange();
    plage.selectNodeContents(bloc);
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(plage);
    b.textContent = 'Sélectionné → Ctrl+C'; b.classList.add('fait');
    setTimeout(function () {{ b.textContent = 'Copier'; b.classList.remove('fait'); }}, 3000);
  }};
  if (navigator.clipboard && navigator.clipboard.writeText) {{
    navigator.clipboard.writeText(texte).then(fini).catch(selectionner);
  }} else {{
    selectionner();
  }}
}});
</script>
</body>
</html>
"""
    SORTIE.write_text(doc, encoding="utf-8")
    print(f"{SORTIE.relative_to(RACINE)} — {len(rels)} fichiers, {len(doc) / 1024:.0f} Ko")


if __name__ == "__main__":
    main()
