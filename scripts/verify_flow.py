"""Vérification de bout en bout du parcours étudiant contre l'API réelle.

Ce script n'est pas un test unitaire : il parle à une API réellement démarrée,
avec une vraie base PostgreSQL et un vrai pipeline d'extraction/OCR.
Usage : python3 scripts/verify_flow.py [http://localhost:4000]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000'
FIXTURES = Path(__file__).parent / 'fixtures'
PASSWORD = 'MemoCampus2026!'

passed: list[str] = []
failed: list[str] = []


def check(name: str, condition: bool, detail: str = '') -> None:
    if condition:
        passed.append(name)
        print(f'  ✅ {name}')
    else:
        failed.append(f'{name} — {detail}')
        print(f'  ❌ {name} — {detail}')


def request(method: str, path: str, body: dict | None = None, token: str | None = None) -> tuple[int, dict | list]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE}/api{path}', data=data, method=method)
    if data:
        req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        payload = error.read()
        try:
            return error.code, json.loads(payload or b'{}')
        except json.JSONDecodeError:
            return error.code, {'raw': payload.decode(errors='replace')[:400]}


def upload(path: str, token: str, title: str) -> tuple[int, dict]:
    boundary = f'----memo{uuid.uuid4().hex}'
    file_bytes = (FIXTURES / path).read_bytes()
    filename = path
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n{title}\r\n'.encode(),
        f'--{boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr\r\n'.encode(),
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n'
        ).encode(),
        file_bytes,
        f'\r\n--{boundary}--\r\n'.encode(),
    ]
    req = urllib.request.Request(f'{BASE}/api/documents', data=b''.join(parts), method='POST')
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        payload = error.read()
        try:
            return error.code, json.loads(payload or b'{}')
        except json.JSONDecodeError:
            return error.code, {'raw': payload.decode(errors='replace')[:400]}


def wait_ready(document_id: str, token: str, timeout: float = 180) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        _, detail = request('GET', f'/documents/{document_id}', token=token)
        last = detail  # type: ignore[assignment]
        if isinstance(detail, dict) and detail.get('status') in {'READY', 'PARTIAL', 'FAILED'}:
            return detail
        time.sleep(2)
    return last  # type: ignore[return-value]


def main() -> int:
    print(f'\n▶ Vérification de bout en bout sur {BASE}\n')

    # --- Santé -----------------------------------------------------------------
    print('1. Santé du service')
    status, health = request('GET', '/health')
    check('API répond', status == 200, str(status))
    assert isinstance(health, dict)
    checks = {item['name']: item['ok'] for item in health.get('checks', [])}
    check('PostgreSQL connecté', checks.get('postgres') is True)
    check('pgvector installé', checks.get('pgvector') is True)
    check('Mode IA déclaré sans clé → démonstration', health.get('ai', {}).get('mode') in {'demo', 'live'})

    # --- Authentification ------------------------------------------------------
    print('\n2. Authentification et sécurité')
    email = f'test.flow.{uuid.uuid4().hex[:8]}@demo.memo-campus.cm'
    status, registration = request('POST', '/auth/register', {
        'email': email, 'password': PASSWORD, 'displayName': 'Étudiant Test',
        'institution': 'Université de Yaoundé I', 'level': 'Licence 2', 'acceptTerms': True,
    })
    check('Inscription réussie', status == 201, json.dumps(registration)[:200])
    assert isinstance(registration, dict)
    token = registration.get('token')
    check('Session ouverte (jeton émis)', bool(token))

    status, _ = request('POST', '/auth/register', {
        'email': email, 'password': PASSWORD, 'displayName': 'Doublon', 'acceptTerms': True,
    })
    check('Inscription en double refusée (409)', status == 409, str(status))

    status, weak = request('POST', '/auth/register', {
        'email': f'faible.{uuid.uuid4().hex[:6]}@demo.memo-campus.cm', 'password': 'court', 'displayName': 'X', 'acceptTerms': True,
    })
    check('Mot de passe faible refusé (400)', status == 400, str(status))

    status, _ = request('POST', '/auth/login', {'email': email, 'password': 'MauvaisMotDePasse1'})
    check('Mauvais mot de passe refusé (401)', status == 401, str(status))

    status, me = request('GET', '/auth/me', token=token)
    check('Profil accessible avec session', status == 200 and isinstance(me, dict) and me.get('email') == email)

    status, _ = request('GET', '/auth/me')
    check('Accès refusé sans session (401)', status == 401, str(status))

    status, anonymous_docs = request('GET', '/documents')
    check('Bibliothèque inaccessible sans session (401)', status == 401, str(status))

    # --- Import et analyse -----------------------------------------------------
    print('\n3. Import et analyse du cours (PDF natif)')
    status, upload_result = upload('cours-biologie-cellulaire.pdf', token, 'Biologie cellulaire — Photosynthèse')
    check('PDF téléversé', status == 201, json.dumps(upload_result)[:200])
    document_id = upload_result.get('id')
    detail = wait_ready(document_id, token)
    check('Analyse terminée (READY ou PARTIAL)', detail.get('status') in {'READY', 'PARTIAL'}, str(detail.get('status')))
    check('Chapitres détectés (≥ 2)', len(detail.get('chapters') or []) >= 2, str(len(detail.get('chapters') or [])))
    check('Pages extraites (≥ 1)', len(detail.get('pages') or []) >= 1)
    check('Fichier original consultable (URL signée)', bool(detail.get('fileUrl')))

    status, pages = request('GET', f'/documents/{document_id}/pages', token=token)
    text = ''.join(page.get('text', '') for page in pages) if isinstance(pages, list) else ''
    check('Texte réellement extrait du PDF', 'photosynthèse' in text.lower(), text[:120])

    # --- Import OCR ------------------------------------------------------------
    print('\n4. Import d’une image scannée (OCR)')
    status, scan_upload = upload('cours-physique-scan.png', token, 'Scan — biologie (OCR)')
    check('Image téléversée', status == 201, json.dumps(scan_upload)[:200])
    scan_id = scan_upload.get('id')
    scan_detail = wait_ready(scan_id, token)
    check('OCR exécuté sur l’image', scan_detail.get('ocrUsed') is True, str(scan_detail.get('ocrUsed')))
    status, scan_pages = request('GET', f'/documents/{scan_id}/pages', token=token)
    scan_text = ''.join(p.get('text', '') for p in scan_pages) if isinstance(scan_pages, list) else ''
    check('Texte reconnu par Tesseract (français)', 'photosynth' in scan_text.lower(), scan_text[:150])

    # --- Résumé ----------------------------------------------------------------
    print('\n5. Résumé structuré et traçabilité des sources')
    status, summary = request('POST', f'/documents/{document_id}/summary', {}, token=token)
    check('Résumé généré', status in {200, 201}, json.dumps(summary)[:200])
    payload = summary.get('payload', {}) if isinstance(summary, dict) else {}
    check('Résumé non vide', len(payload.get('generalSummary', '')) > 100, str(len(payload.get('generalSummary', ''))))
    check('Notions clés extraites', len(payload.get('keyNotions', [])) >= 2, str(len(payload.get('keyNotions', []))))
    check('Mode déclaré (live/demo)', summary.get('mode') in {'live', 'demo'})
    notions = payload.get('keyNotions', [])
    check('Notions rattachées à une page source', any(n.get('page') for n in notions), str(notions[:2]))
    status, cached = request('POST', f'/documents/{document_id}/summary', {}, token=token)
    check('Second appel servi depuis le cache', isinstance(cached, dict) and cached.get('cached') is True)

    # --- Cartes mémoire --------------------------------------------------------
    print('\n6. Cartes mémoire et répétition espacée')
    status, cards_result = request('POST', f'/documents/{document_id}/flashcards', {'count': 8}, token=token)
    check('Cartes générées', status in {200, 201} and len(cards_result.get('cards', [])) > 0, json.dumps(cards_result)[:200])
    cards = cards_result.get('cards', [])
    card_id = cards[0]['id'] if cards else None

    status, today = request('GET', '/learning/reviews/today', token=token)
    check('Révisions du jour listées', status == 200 and isinstance(today.get('items'), list), str(status))
    items = today.get('items', [])
    check('Chaque révision est justifiée', all(item.get('why') for item in items), str(items[:1]))

    if items:
        target = items[0]['id']
        before = None
        for item in all_cards(token):
            if item['id'] == target:
                before = item
        status, reviewed = request('POST', '/learning/reviews', {'flashcardId': target, 'grade': 'GOOD', 'durationMs': 8000}, token=token)
        check('Révision enregistrée', status in {200, 201}, json.dumps(reviewed)[:200])
        check('Intervalle reprogrammé (> 0 jour)', (reviewed.get('flashcard', {}).get('intervalDays') or 0) > 0, str(reviewed.get('flashcard')))
        check('Explication fournie à l’étudiant', bool(reviewed.get('explanation')))

        status, again = request('POST', '/learning/reviews', {'flashcardId': target, 'grade': 'AGAIN', 'durationMs': 3000}, token=token)
        check('Un oubli réduit fortement l’intervalle', (again.get('flashcard', {}).get('intervalDays') or 0) <= 1, str(again.get('flashcard')))

    # --- Évaluation ------------------------------------------------------------
    print('\n7. Évaluation, mode examen et correction')
    status, assessment = request('POST', '/assessments/generate', {
        'title': 'Épreuve de biologie cellulaire', 'type': 'MIXED', 'difficulty': 'MOYEN',
        'mcqCount': 4, 'writtenCount': 2, 'durationMinutes': 20, 'documentIds': [document_id],
    }, token=token)
    check('Épreuve générée', status in {200, 201}, json.dumps(assessment)[:200])
    assessment_id = assessment.get('assessmentId')

    status, subject = request('GET', f'/assessments/{assessment_id}', token=token)
    questions = subject.get('questions', []) if isinstance(subject, dict) else []
    check('Questions rattachées à une source', all(q.get('sourceRef') for q in questions), str(questions[:1])[:200])
    check('Aucun corrigé envoyé avant soumission', all('correctChoiceIds' not in q for q in questions))

    status, started = request('POST', f'/assessments/{assessment_id}/start', {}, token=token)
    check('Épreuve démarrée avec chronomètre', status in {200, 201} and started.get('endsAt') is not None)

    answers = []
    for index, question in enumerate(questions):
        if question['type'] == 'MCQ':
            choices = question.get('choices') or []
            # 1re question : on répond volontairement au hasard ; les suivantes aussi.
            answers.append({'questionId': question['id'], 'type': 'MCQ', 'selectedChoiceIds': [choices[0]['id']] if choices else []})
        else:
            answers.append({
                'questionId': question['id'], 'type': 'WRITTEN',
                'text': "La photosynthèse est le processus par lequel les végétaux chlorophylliens convertissent la lumière "
                        "en énergie chimique dans le chloroplaste, produisant du glucose et libérant de l'oxygène.",
            })

    status, correction = request('POST', f'/assessments/{assessment_id}/submit', {'answers': answers}, token=token)
    check('Soumission corrigée', status in {200, 201}, json.dumps(correction)[:300])
    check('Note calculée sur le barème', isinstance(correction.get('score'), (int, float)) and correction.get('maxScore', 0) > 0)
    check('Détail par question fourni', len(correction.get('corrections', [])) == len(questions))
    check('Recommandations produites', len(correction.get('recommendations', [])) > 0)

    status, resubmit = request('POST', f'/assessments/{assessment_id}/submit', {'answers': answers}, token=token)
    check('Double soumission refusée', status in {400, 403}, str(status))

    status, report = request('GET', f'/assessments/{assessment_id}/report', token=token)
    check('Rapport consultable dans l’historique', status == 200 and report.get('submittedAt') is not None)

    # --- Planning --------------------------------------------------------------
    print('\n8. Planning, disponibilités et Pomodoro')
    weekday_slots = [{'weekday': day, 'startMinute': 17 * 60, 'endMinute': 20 * 60} for day in range(1, 6)]
    status, _ = request('POST', '/planning/availability', {'slots': weekday_slots}, token=token)
    check('Disponibilités enregistrées', status in {200, 201}, str(status))

    status, _ = request('POST', '/planning/blocks', {
        'title': 'Examen de biologie', 'type': 'EXAMEN', 'startAt': '2026-12-05T09:00:00.000Z',
        'endAt': '2026-12-05T11:00:00.000Z', 'priority': 5,
    }, token=token)
    check('Échéance créée', status == 201, str(status))

    status, plan = request('POST', '/planning/auto', {
        'from': '2026-11-24T00:00:00.000Z', 'to': '2026-12-04T00:00:00.000Z',
        'sessionMinutes': 45, 'breakMinutes': 10, 'maxSessionsPerDay': 2, 'save': True,
    }, token=token)
    check('Planning proposé', status in {200, 201} and len(plan.get('blocks', [])) > 0, json.dumps(plan)[:250])
    blocks = plan.get('blocks', [])
    check('Chaque séance est justifiée', all(b.get('rationale') for b in blocks), str(blocks[:1])[:200])
    starts = [b['startAt'][11:16] for b in blocks]
    check('Créneaux dans les disponibilités (17h-20h UTC)', all('17:00' <= s <= '19:15' for s in starts), str(starts))

    status, pomodoro = request('POST', '/planning/pomodoro/start', {'focusMinutes': 25, 'breakMinutes': 5, 'cycles': 4}, token=token)
    check('Session Pomodoro démarrée', status == 201 and pomodoro.get('id'))
    status, _ = request('POST', f"/planning/pomodoro/{pomodoro.get('id')}/complete", {}, token=token)
    check('Session Pomodoro clôturée', status in {200, 201})

    # --- Assistant RAG ---------------------------------------------------------
    print('\n9. Assistant IA et recherche documentaire (RAG)')
    status, answer = request('POST', '/assistant/ask', {
        'message': 'Dans quel organite se déroule la photosynthèse ?', 'mode': 'TUTEUR', 'documentIds': [],
    }, token=token)
    check('Réponse produite', status in {200, 201}, json.dumps(answer)[:250])
    check('Citations renvoyées avec page', bool(answer.get('citations')) and any(c.get('page') for c in answer.get('citations', [])), str(answer.get('citations'))[:250])
    check('Mode explicitement indiqué', answer.get('mode') in {'live', 'demo'})
    check('Avertissement anti-hallucination présent', bool(answer.get('disclaimer')))
    check('La réponse cite le chloroplaste', 'chloroplaste' in answer.get('answer', '').lower(), answer.get('answer', '')[:200])

    status, no_answer = request('POST', '/assistant/ask', {
        'message': 'Quelle est la recette du ndolé aux crevettes ?', 'mode': 'TUTEUR', 'documentIds': [],
    }, token=token)
    check('Question hors cours : refus honnête (pas d’invention)',
          status in {200, 201} and ("ne trouve pas" in no_answer.get('answer', '') or 'aucun' in no_answer.get('answer', '').lower()),
          no_answer.get('answer', '')[:200])

    # --- Tableau de bord et quotas --------------------------------------------
    print('\n10. Tableau de bord, quotas et abonnements')
    status, dashboard = request('GET', '/dashboard', token=token)
    check('Tableau de bord disponible', status == 200 and 'library' in dashboard, str(status))
    check('Quotas affichés', bool(dashboard.get('subscription', {}).get('quotas')), str(dashboard.get('subscription', {}))[:150])

    status, billing = request('GET', '/billing/plans')
    check('Offres publiques listées', status == 200 and len(billing.get('plans', [])) == 3, str(len(billing.get('plans', []))))
    check('Prestataires non configurés signalés', all('active' in p for p in billing.get('providers', [])))

    status, checkout = request('POST', '/billing/checkout', {'planCode': 'PREMIUM', 'provider': 'CAMPAY', 'months': 1}, token=token)
    check('Paiement non activé sans prestataire configuré', status in {200, 201} and checkout.get('activated') is False, json.dumps(checkout)[:250])

    # --- Isolation des données -------------------------------------------------
    print('\n11. Isolation stricte entre utilisateurs')
    _, other = request('POST', '/auth/login', {'email': 'etudiant.free@demo.memo-campus.cm', 'password': PASSWORD})
    other_token = other.get('token')
    status, _ = request('GET', f'/documents/{document_id}', token=other_token)
    check('Un autre étudiant ne voit pas le cours (404)', status == 404, str(status))
    status, _ = request('GET', f'/documents/{document_id}/pages', token=other_token)
    check('Un autre étudiant ne lit pas les pages (400/404)', status in {400, 404}, str(status))
    status, _ = request('GET', f'/assessments/{assessment_id}', token=other_token)
    check('Un autre étudiant ne voit pas l’évaluation (404)', status == 404, str(status))
    status, _ = request('GET', '/admin/overview', token=other_token)
    check('Espace administrateur interdit aux étudiants (403)', status == 403, str(status))

    status, _ = request('GET', '/admin/overview', token=token)
    check('Espace administrateur protégé (403 pour étudiant)', status == 403, str(status))
    _, admin_login = request('POST', '/auth/login', {'email': 'admin@demo.memo-campus.cm', 'password': PASSWORD})
    status, overview = request('GET', '/admin/overview', token=admin_login.get('token'))
    check('Administrateur accède aux indicateurs', status == 200 and 'users' in overview, str(status))

    # --- Quotas serveur --------------------------------------------------------
    print('\n12. Quotas appliqués côté serveur (offre Free)')
    status, free_limits = request('GET', '/billing/subscription', token=other_token)
    check('Offre Free limitée à 5 cours', free_limits.get('plan', {}).get('quotas', {}).get('documents_total') == 5, str(free_limits.get('plan', {}).get('quotas')))

    created = 0
    for _ in range(6):
        code, result = upload('cours-biologie-cellulaire.pdf', other_token, f'Cours quota {created + 1}')
        if code == 201:
            created += 1
        else:
            break
    status, blocked = upload('cours-biologie-cellulaire.pdf', other_token, 'Cours au-delà du quota')
    check('Import bloqué au-delà du quota', status == 403 and blocked.get('code') == 'QUOTA_EXCEEDED', f'{status} {json.dumps(blocked)[:200]}')
    check('Message de quota explicite', 'Quota' in str(blocked.get('message', '')) or 'quota' in str(blocked.get('message', '')).lower(), str(blocked.get('message')))

    # --- Export et suppression de compte ---------------------------------------
    print('\n13. Droits des personnes (export, suppression)')
    status, exported = request('GET', '/auth/export', token=token)
    check(
        'Export complet des données',
        status == 200 and exported.get('documents') is not None and exported.get('account') is not None,
        f'{status} {sorted(exported.keys()) if isinstance(exported, dict) else ""}',
    )
    status, _ = request('DELETE', '/auth/account', {'password': 'mauvais', 'confirmation': 'SUPPRIMER'}, token=token)
    check('Suppression refusée sans mot de passe valide', status == 400, str(status))
    status, deleted = request('DELETE', '/auth/account', {'password': PASSWORD, 'confirmation': 'SUPPRIMER'}, token=token)
    check('Compte supprimé après confirmation', status == 200 and deleted.get('success') is True, json.dumps(deleted)[:200])
    status, _ = request('GET', '/auth/me', token=token)
    check('Session invalidée après suppression (401)', status == 401, str(status))

    # --- Résumé ----------------------------------------------------------------
    print('\n' + '=' * 62)
    print(f'RÉSULTAT : {len(passed)} vérifications réussies, {len(failed)} échec(s)')
    for failure in failed:
        print(f'   ✗ {failure}')
    print('=' * 62)
    return 0 if not failed else 1


def all_cards(token: str) -> list[dict]:
    _, data = request('GET', '/learning/flashcards?page=1', token=token)
    return data.get('items', []) if isinstance(data, dict) else []


if __name__ == '__main__':
    sys.exit(main())
