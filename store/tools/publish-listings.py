"""Pushes the twelve localised listings and their screenshots to Play in one edit.

  python store/tools/publish-listings.py            # stage, validate, change nothing
  python store/tools/publish-listings.py --commit   # ...and commit, which sends them for review

Never run while another Play upload is in flight: one edit per app, and a second
one deletes the first (see the play-edits-are-exclusive note).
"""
import json, sys, warnings, pathlib
warnings.filterwarnings('ignore')
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

STORE = pathlib.Path(__file__).resolve().parents[1]   # store/
REPO = STORE.parent
M = str(REPO / 'apps' / 'mobile') + '/'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.daysofar.app'
UP = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/com.daysofar.app'
COMMIT = '--commit' in sys.argv
EN_NOTES = (
    "Day So Far now speaks thirteen languages. Romanian, Ukrainian, Serbian, Croatian, Czech, "
    "Hungarian, Greek and Slovak join English, Bulgarian, German, Spanish and French — the whole "
    "app, the weekly review and every email. The app starts in your phone's language; change it "
    "any time under Settings."
)
CODES = ['bg', 'ro', 'uk', 'sr', 'hr', 'cs-CZ', 'sk', 'hu-HU', 'el-GR', 'de-DE', 'es-ES', 'fr-FR']

creds = service_account.Credentials.from_service_account_file(
    M + 'play-service-account.json', scopes=['https://www.googleapis.com/auth/androidpublisher'])
s = AuthorizedSession(creds)

edit = s.post(f'{BASE}/edits').json()['id']
print('edit', edit)
try:
    for code in CODES:
        pack = json.loads((STORE / 'listings' / f'{code}.json').read_text())
        body = {'language': code, 'title': pack['title'],
                'shortDescription': pack['shortDescription'], 'fullDescription': pack['fullDescription']}
        r = s.put(f'{BASE}/edits/{edit}/listings/{code}', json=body)
        print(f'  listing {code:6} {r.status_code} title={pack["title"]!r}')
        r.raise_for_status()

        shots = sorted((STORE / 'screenshots-localised' / code).glob('0*.png'))
        if len(shots) != 3:
            print(f'  !! {code}: {len(shots)} screenshots, expected 3 — skipping images')
            continue
        s.delete(f'{BASE}/edits/{edit}/listings/{code}/phoneScreenshots')
        for shot in shots:
            r = s.post(f'{UP}/edits/{edit}/listings/{code}/phoneScreenshots?uploadType=media',
                       data=shot.read_bytes(), headers={'Content-Type': 'image/png'})
            print(f'  image   {code:6} {r.status_code} {shot.name}')
            r.raise_for_status()

    # The alpha draft carries version 41 already; give it release notes in every
    # language, so promoting it to production in the Console brings them along
    # rather than asking for twelve pastes into the release form.
    notes = [{'language': 'en-GB', 'text': EN_NOTES}]
    for code in CODES:
        pack = json.loads((STORE / 'listings' / f'{code}.json').read_text())
        notes.append({'language': code, 'text': pack['releaseNotes']})
    track = {'track': 'alpha', 'releases': [
        {'versionCodes': ['41'], 'status': 'draft', 'releaseNotes': notes}]}
    r = s.put(f'{BASE}/edits/{edit}/tracks/alpha', json=track)
    print('alpha draft notes', r.status_code, '' if r.ok else r.text[:200])
    r.raise_for_status()

    v = s.post(f'{BASE}/edits/{edit}:validate')
    print('validate', v.status_code, '' if v.ok else v.text[:300])
    v.raise_for_status()
    if COMMIT:
        c = s.post(f'{BASE}/edits/{edit}:commit')
        print('commit', c.status_code, '' if c.ok else c.text[:300])
        c.raise_for_status()
        print('committed — listing changes are with Google')
    else:
        s.delete(f'{BASE}/edits/{edit}')
        print('dry run — edit deleted, nothing changed')
except Exception as exc:
    s.delete(f'{BASE}/edits/{edit}')
    print('aborted, edit deleted:', exc)
    raise
