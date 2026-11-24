"""Génère les fichiers de test réels utilisés par les tests de bout en bout.

- cours-biologie-cellulaire.pdf : PDF natif (texte sélectionnable, 3 chapitres, 1 tableau)
- cours-physique-scan.png      : image « scannée » (pour valider le chemin OCR)

Exécution : python3 scripts/fixtures/make_fixtures.py
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).parent

styles = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=styles['Heading1'], fontSize=16, spaceAfter=10)
H2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=13, spaceAfter=8)
BODY = ParagraphStyle('body', parent=styles['BodyText'], fontSize=10.5, leading=15, spaceAfter=8)


def make_pdf() -> Path:
    path = OUT / 'cours-biologie-cellulaire.pdf'
    doc = SimpleDocTemplate(str(path), pagesize=A4, title='Biologie cellulaire')
    story = [Paragraph('La photosynthèse et le métabolisme cellulaire', H1)]
    story.append(Paragraph('Cours de biologie cellulaire - Licence 2, semestre 1', BODY))
    story.append(Spacer(1, 10))

    story.append(Paragraph('Chapitre 1 - La photosynthèse', H2))
    story.append(Paragraph(
        "La photosynthèse est le processus biologique par lequel les végétaux chlorophylliens "
        "convertissent l'énergie lumineuse du soleil en énergie chimique stockée sous forme de glucose. "
        "Cette réaction se déroule dans le chloroplaste, un organite cellulaire contenant la chlorophylle, "
        "le pigment vert responsable de l'absorption de la lumière.", BODY))
    story.append(Paragraph(
        "Le chloroplaste : organite cellulaire spécialisé dans lequel se déroule la photosynthèse. "
        "Il contient des empilements de thylakoïdes appelés grana, immergés dans le stroma.", BODY))
    story.append(Paragraph(
        "L'équation bilan de la photosynthèse s'écrit : 6 CO2 + 6 H2O + lumière = C6H12O6 + 6 O2. "
        "Le dioxyde de carbone est fixé, l'eau est décomposée et l'oxygène est libéré dans l'atmosphère.", BODY))
    story.append(Paragraph(
        "La phase photochimique se déroule dans les thylakoïdes et produit de l'ATP ainsi que du NADPH. "
        "La phase chimique, appelée cycle de Calvin, se déroule dans le stroma et fixe le dioxyde de carbone "
        "pour synthétiser le glucose.", BODY))

    story.append(Paragraph('Chapitre 2 - La respiration cellulaire', H2))
    story.append(Paragraph(
        "La respiration cellulaire est le processus inverse de la photosynthèse et se déroule dans la mitochondrie. "
        "Elle consiste à dégrader le glucose en présence d'oxygène pour produire de l'ATP, du dioxyde de carbone "
        "et de l'eau.", BODY))
    story.append(Paragraph(
        "La mitochondrie : organite cellulaire responsable de la respiration et de la production d'ATP. "
        "Sa membrane interne forme des replis appelés crêtes mitochondriales.", BODY))
    story.append(Paragraph(
        "Le rendement énergétique d'une réaction correspond au rapport entre l'énergie utile produite et "
        "l'énergie totale consommée. Une respiration cellulaire complète produit environ trente-huit "
        "molécules d'ATP par molécule de glucose.", BODY))
    story.append(Paragraph(
        "L'ATP désigne la molécule qui transporte l'énergie dans la cellule. Elle est produite par "
        "phosphorylation et libère de l'énergie lors de l'hydrolyse de sa liaison phosphate.", BODY))

    story.append(Paragraph('Chapitre 3 - Comparaison des deux métabolismes', H2))
    data = [
        ['Critère', 'Photosynthèse', 'Respiration cellulaire'],
        ['Localisation', 'Chloroplaste', 'Mitochondrie'],
        ["Source d'énergie", 'Lumière', 'Glucose'],
        ['Gaz échangé', 'Absorbe CO2, libère O2', 'Absorbe O2, libère CO2'],
        ['Produit principal', 'Glucose', 'ATP'],
    ]
    table = Table(data, colWidths=[110, 190, 190])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(table)
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "A retenir : les deux métabolismes sont complémentaires. Les produits de la photosynthèse servent "
        "de substrats à la respiration cellulaire, et les produits de la respiration servent de substrats "
        "à la photosynthèse.", BODY))

    doc.build(story)
    return path


def make_scan() -> Path | None:
    """Rend la 1re page du PDF en PNG « photo » : valide le chemin OCR."""
    from subprocess import run

    pdf = OUT / 'cours-biologie-cellulaire.pdf'
    target = OUT / 'cours-physique-scan.png'
    result = run(
        ['pdftoppm', '-r', '200', '-f', '1', '-l', '1', '-png', '-singlefile', str(pdf), str(target.with_suffix(''))],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print('pdftoppm indisponible :', result.stderr)
        return None
    return target


if __name__ == '__main__':
    print('PDF :', make_pdf())
    print('Scan :', make_scan())
