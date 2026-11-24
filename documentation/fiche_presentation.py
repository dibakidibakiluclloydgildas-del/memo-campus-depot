#!/usr/bin/env python3
"""
Génère la fiche de présentation MÉMO CAMPUS en PDF (format A4, 2 pages).

Usage :  python3 documentation/fiche_presentation.py
Sortie : documentation/MEMO_CAMPUS_fiche_presentation.pdf

Aucune ressource externe : les polices DejaVu sont embarquées, le document est
donc identique sur toute machine. Les couleurs reprennent celles de l'interface.
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    NextPageTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# --- Polices -----------------------------------------------------------------
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DejaVu", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))

# --- Palette -----------------------------------------------------------------
MEMO = colors.HexColor("#2145ea")
MEMO_DARK = colors.HexColor("#101a44")
GREEN = colors.HexColor("#10b981")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#5a6b8c")
LINE = colors.HexColor("#e3e8f2")
SOFT = colors.HexColor("#f6f8fc")
BRAND_SOFT = colors.HexColor("#eef2ff")

AUTHOR = "Lloyd"
TITLE = "MÉMO CAMPUS"
SUBTITLE = "Plateforme de révision intelligente — application Web et application Android"

# --- Styles ------------------------------------------------------------------
SS = getSampleStyleSheet()


def style(name, **kw):
    base = dict(fontName="DejaVu", fontSize=8.5, leading=11.8, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, parent=SS["BodyText"], **base)


S = {
    "h1": style("h1", fontName="DejaVu-Bold", fontSize=24, leading=27, textColor=colors.white),
    "sub": style("sub", fontSize=9.8, leading=12.5, textColor=colors.HexColor("#eaf1ff")),
    "h2": style("h2", fontName="DejaVu-Bold", fontSize=11.5, leading=14, textColor=MEMO_DARK),
    "h3": style("h3", fontName="DejaVu-Bold", fontSize=9, leading=11.8, textColor=MEMO),
    "body": style("body"),
    "small": style("small", fontSize=7.9, leading=10.6, textColor=MUTED),
    "tiny": style("tiny", fontSize=7.4, leading=10, textColor=MUTED),
    "white": style("white", fontSize=9, leading=12.5, textColor=colors.white),
    "whitebold": style("whitebold", fontName="DejaVu-Bold", fontSize=9.5, leading=12.5, textColor=colors.white),
    "quote": style("quote", fontName="DejaVu", fontSize=9, leading=12.5, textColor=MEMO_DARK),
    "bullet": style("bullet", leftIndent=9, bulletIndent=1, spaceAfter=1.1),
}


def p(text, key="body"):
    return Paragraph(text, S[key])


def bullets(items, key="bullet"):
    return [Paragraph(f"• {item}", S[key]) for item in items]


def section(title, blocks, keep=False):
    """Titre de section + contenu, inséparables sur une page."""
    content = [p(title, "h2"), Spacer(1, 2.5 * mm)] + blocks
    return [KeepTogether(content) if keep else content]


def card(inner, width, background=SOFT, border=LINE, padding=8):
    """Encadré arrondi simulé par une table 1×1."""
    t = Table([[inner]], colWidths=[width])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.6, border),
                ("LEFTPADDING", (0, 0), (-1, -1), padding),
                ("RIGHTPADDING", (0, 0), (-1, -1), padding),
                ("TOPPADDING", (0, 0), (-1, -1), padding),
                ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
                ("ROUNDEDCORNERS", [4, 4, 4, 4]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


# --- Mise en page ------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def draw_cover(canvas, doc):
    """Bandeau de première page (dégradé bleu → vert) et pied de page."""
    canvas.saveState()
    band_h = 31 * mm
    steps = 90
    for i in range(steps):
        y = PAGE_H - band_h + (band_h * i / steps)
        ratio = i / steps
        color = colors.Color(
            MEMO.red + (GREEN.red - MEMO.red) * ratio,
            MEMO.green + (GREEN.green - MEMO.green) * ratio,
            MEMO.blue + (GREEN.blue - MEMO.blue) * ratio,
        )
        canvas.setFillColor(color)
        canvas.rect(0, y, PAGE_W, band_h / steps + 0.6, stroke=0, fill=1)
    # Titre et sous-titre dans le bandeau dégradé
    canvas.setFillColor(colors.white)
    canvas.setFont("DejaVu-Bold", 27)
    canvas.drawString(MARGIN, PAGE_H - 15 * mm, TITLE)
    canvas.setFont("DejaVu", 9.6)
    canvas.setFillColor(colors.HexColor("#eaf1ff"))
    canvas.drawString(MARGIN, PAGE_H - 21 * mm, SUBTITLE)
    canvas.drawString(MARGIN, PAGE_H - 26 * mm, f"Par {AUTHOR} — version 0.1.0 · novembre 2026")
    canvas.restoreState()
    draw_footer(canvas, doc)


def draw_body_header(canvas, doc):
    """Bandeau compact des pages 2+ (le titre complet ne sert que sur la couverture)."""
    canvas.saveState()
    canvas.setFillColor(MEMO_DARK)
    canvas.rect(0, PAGE_H - 12 * mm, PAGE_W, 12 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("DejaVu-Bold", 11)
    canvas.drawString(MARGIN, PAGE_H - 8 * mm, f"{TITLE} — comment l'utiliser")
    canvas.setFont("DejaVu", 8)
    canvas.setFillColor(colors.HexColor("#c7d5ff"))
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 8 * mm, f"Auteur : {AUTHOR}")
    canvas.restoreState()
    draw_footer(canvas, doc)


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
    canvas.setFont("DejaVu", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 9 * mm, f"{TITLE} — fiche de présentation")
    canvas.drawRightString(PAGE_W - MARGIN, 9 * mm, f"Auteur : {AUTHOR}  ·  page {doc.page}")
    canvas.restoreState()


def build(path: str) -> str:
    doc = BaseDocTemplate(
        path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=10 * mm,
        bottomMargin=15 * mm,
        title=f"{TITLE} — fiche de présentation",
        author=AUTHOR,
        subject="Présentation et guide d'utilisation de l'application MÉMO CAMPUS",
        creator=f"{TITLE} · {AUTHOR}",
    )

    frame_cover = Frame(MARGIN, 15 * mm, CONTENT_W, PAGE_H - 31 * mm - 15 * mm, id="cover", showBoundary=0)
    # Hauteur utile de la page 1 : le bandeau de titre occupe 31 mm
    frame_body = Frame(MARGIN, 15 * mm, CONTENT_W, PAGE_H - 15 * mm - 15 * mm, id="body", showBoundary=0)

    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=[frame_cover], onPage=draw_cover),
            PageTemplate(id="body", frames=[frame_body], onPage=draw_body_header),
        ]
    )

    story = []

    # ------------------------------------------------------------------ EN-TÊTE
    story += [Spacer(1, 1 * mm)]

    # ------------------------------------------------------- C'EST QUOI / À QUOI
    intro = [
        p(
            "MÉMO CAMPUS transforme un cours — un PDF, une photo de polycopié, un document Word — en outils de "
            "travail prêts à l'emploi : un résumé fidèle avec les pages sources, des fiches, des cartes de révision, "
            "des épreuves corrigées et un planning réaliste. L'étudiant ne perd plus son temps à recopier : il révise, "
            "s'entraîne et mesure ses progrès.",
            "body",
        ),
        Spacer(1, 3 * mm),
        p(
            "Deux applications, un seul compte : <b>le Web</b> (ordinateur, tablette, téléphone) et une "
            "<b>application Android</b>. Un cours importé sur le téléphone apparaît sur le Web, et inversement. "
            "Les révisions faites hors connexion sont conservées puis synchronisées automatiquement.",
            "body",
        ),
    ]
    story.append(card(intro, CONTENT_W, BRAND_SOFT, colors.HexColor("#c7d5ff"), padding=10))
    story.append(Spacer(1, 3.5 * mm))

    # Deux colonnes : à quoi ça sert / pour qui
    left = [
        p("À quoi ça sert, concrètement", "h2"),
        Spacer(1, 2 * mm),
        *bullets(
            [
                "<b>Ne plus relire passivement</b> : le cours devient un résumé structuré et des questions.",
                "<b>Retenir durablement</b> : cartes de révision programmées selon ce que vous maîtrisez vraiment.",
                "<b>S'entraîner dans les conditions de l'examen</b> : QCM et questions écrites chronométrées, corrigées avec barème.",
                "<b>Savoir quoi réviser aujourd'hui</b> : chaque carte proposée indique pourquoi elle revient.",
                "<b>Ne plus improviser</b> : un planning construit sur vos disponibilités réelles, avec des pauses.",
                "<b>Comprendre sans dépendre du professeur</b> : un assistant qui répond à partir de <i>vos</i> cours, en citant les pages.",
            ]
        ),
    ]
    right = [
        p("Pour qui", "h2"),
        Spacer(1, 2 * mm),
        *bullets(
            [
                "<b>Étudiants</b> (licence, master, prépa, BTS) : réviser efficacement avec peu de temps.",
                "<b>Élèves en classe d'examen</b> : s'entraîner sur des épreuves corrigées.",
                "<b>Enseignants</b> : préparer des questions à partir de leurs propres supports.",
                "<b>Établissements</b> : offrir un outil commun, avec des quotas et un suivi administrable.",
            ]
        ),
        Spacer(1, 3 * mm),
        card(
            p(
                "<b>Ce qui distingue MÉMO CAMPUS :</b> aucune phrase n'est inventée. Chaque notion, chaque "
                "correction renvoie à la page du document d'origine. Quand un passage est illisible, "
                "l'application le signale au lieu de le combler par une supposition.",
                "quote",
            ),
            CONTENT_W / 2 - 5 * mm,
            colors.HexColor("#fef9e7"),
            colors.HexColor("#f3dfa2"),
            padding=7,
        ),
    ]
    cols = Table([[left, right]], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    cols.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story += [cols, Spacer(1, 3.5 * mm)]

    # ------------------------------------------------------------- FONCTIONS
    features = [
        ["Importer", "PDF texte ou scanné, photo JPG/PNG, Word. Analyse automatique : texte, OCR si besoin, chapitres, pages."],
        ["Comprendre", "Résumé général et par chapitre, objectifs, notions essentielles avec page source, formules, fiche de révision."],
        ["Mémoriser", "Cartes de révision + rappel actif et répétition espacée : maîtrisée, fragile, non maîtrisée."],
        ["S'entraîner", "QCM (5 niveaux de difficulté cognitive) et questions rédigées, chronomètre, correction détaillée avec barème."],
        ["S'organiser", "Planning selon vos disponibilités et échéances, minuteur Pomodoro, vues jour / semaine / mois."],
        ["Comprendre autrement", "Assistant conversationnel sur vos cours, avec citations ; mode professeur qui pose une question à la fois."],
        ["Mesurer", "Tableau de bord et statistiques : taux de réussite, temps de travail, notions fragiles, historique des épreuves."],
        ["Sur mobile", "Consultation hors connexion des cours téléchargés, révisions hors ligne, synchronisation au retour du réseau."],
    ]
    table = Table(
        [[p(row[0], "h3"), p(row[1], "small")] for row in features],
        colWidths=[32 * mm, CONTENT_W - 32 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 2.3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.3),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story += [p("Ce que fait l'application", "h2"), Spacer(1, 1.5 * mm), table]

    # --------------------------------------------------------------- PAGE 2
    from reportlab.platypus import PageBreak

    # La page 2 utilise le bandeau compact, pas la couverture
    story += [NextPageTemplate("body"), PageBreak()]

    story += [
        p("Comment l'utiliser — de l'inscription à la première révision", "h2"),
        Spacer(1, 3 * mm),
    ]

    steps = [
        ("1", "Créer son compte", "Ouvrir l'application, « Créer un compte », saisir nom, e-mail et mot de passe (10 caractères minimum, une majuscule, un chiffre). L'offre gratuite suffit pour commencer, sans carte bancaire."),
        ("2", "Importer un cours", "Bibliothèque → « Importer un cours ». Choisir un PDF, une photo ou un Word. Sur Android : onglet « Importer », appareil photo ou fichiers. Photographier à plat, bien éclairé."),
        ("3", "Attendre l'analyse", "Le statut progresse : en file, extraction, OCR, structure, prêt. De quelques secondes à deux minutes. On peut quitter la page, le traitement continue."),
        ("4", "Lire le résumé", "Ouvrir le cours → « Générer le résumé ». Vérifier les notions essentielles et leur page source. Consulter la fiche de révision, imprimable."),
        ("5", "Réviser", "Révisions → « Démarrer la session ». Répondre de mémoire, afficher la réponse, puis juger honnêtement : oublié, difficile, bien, facile. L'application reprogramme la carte en conséquence."),
        ("6", "S'évaluer", "Évaluations → « Nouvelle épreuve » : choisir le cours, le nombre de questions et la durée. Après soumission : note, détail par question, explication, grille de correction."),
        ("7", "Planifier", "Planning : indiquer ses disponibilités et ses échéances, puis « Proposer un planning ». Chaque séance indique pourquoi elle est placée là. Utiliser le Pomodoro pour travailler par blocs."),
        ("8", "Demander de l'aide", "Assistant : poser une question sur un cours. Les réponses citent les pages. Le mode professeur interroge une question à la fois, avec des indices."),
    ]
    step_rows = [[p(n, "whitebold"), p(f"<b>{t}</b>", "body"), p(d, "small")] for n, t, d in steps]
    step_table = Table(step_rows, colWidths=[9 * mm, 42 * mm, CONTENT_W - 51 * mm])
    step_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), MEMO),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("VALIGN", (0, 0), (0, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (1, 0), (-1, -1), 6),
                ("RIGHTPADDING", (1, 0), (-1, -1), 2),
            ]
        )
    )
    story += [step_table, Spacer(1, 3.5 * mm)]

    # Bon à savoir
    good = [
        ("Sur Android, hors connexion",
         "Télécharger un cours depuis sa page (résumé + fiche). Mode avion : le contenu reste lisible et les révisions "
         "s'enregistrent sur le téléphone, puis partent automatiquement au retour du réseau."),
        ("Ce qui nécessite Internet",
         "L'import, l'analyse, la génération de contenus, l'assistant et la correction d'épreuve. "
         "L'application le signale clairement : elle ne fait jamais semblant de fonctionner hors ligne."),
        ("Mode démonstration",
         "Sans clé d'intelligence artificielle configurée, les contenus sont <b>extraits du vrai texte de vos cours</b> "
         "(phrases et définitions réelles, avec la page). L'interface l'indique. Rien n'est inventé."),
        ("Paiements",
         "Les offres et leurs quotas sont administrables (prix en francs CFA). L'activation d'un abonnement passe "
         "uniquement par une confirmation signée du prestataire : une capture d'écran ne prouve jamais un paiement."),
        ("Vos données",
         "Vos cours sont privés : aucun autre étudiant ne peut y accéder. Vous pouvez exporter toutes vos données "
         "ou supprimer votre compte à tout moment depuis votre profil."),
    ]
    story.append(p("Bon à savoir", "h2"))
    story.append(Spacer(1, 2 * mm))
    story.append(
        Table(
            [[p(t, "h3"), p(d, "small")] for t, d in good],
            colWidths=[44 * mm, CONTENT_W - 44 * mm],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
                    ("TOPPADDING", (0, 0), (-1, -1), 2.4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )
    story.append(Spacer(1, 5 * mm))

    # FAQ courte
    story.append(p("Questions fréquentes", "h2"))
    story.append(Spacer(1, 2 * mm))
    story += bullets(
        [
            "<b>Mon PDF est refusé.</b> Vérifiez qu'il s'agit d'un vrai PDF ou d'une photo, de moins de 25 Mo. Un fichier simplement renommé en .pdf est détecté et refusé.",
            "<b>L'OCR a mal lu un mot.</b> L'application signale déjà les passages douteux. Réimportez une photo plus nette si le texte est inexploitable.",
            "<b>Mes réponses faites sans réseau sont-elles perdues ?</b> Non : elles sont conservées sur le téléphone et envoyées automatiquement à la reconnexion.",
            "<b>Puis-je utiliser l'application gratuitement ?</b> Oui. L'offre gratuite est limitée en nombre de cours et de générations ; les quotas sont affichés dans votre abonnement.",
        ]
    )
    story.append(Spacer(1, 5 * mm))

    story.append(Spacer(1, 3 * mm))
    story.append(
        p(
            f"<b>{TITLE}</b> — Comprendre, mémoriser, réussir. Fiche de présentation · Auteur : <b>{AUTHOR}</b> · "
            "version 0.1.0 · novembre 2026 · application Web et application Android partageant les mêmes comptes "
            "et les mêmes données.",
            "tiny",
        )
    )

    doc.build(story)
    return path


if __name__ == "__main__":
    out = build("documentation/MEMO_CAMPUS_fiche_presentation.pdf")
    print(f"PDF généré : {out}")
