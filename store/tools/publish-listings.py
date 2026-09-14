"""Pushes the store listings' screenshots and localised copy to Play in one edit.

  python store/tools/publish-listings.py            # stage, validate, change nothing
  python store/tools/publish-listings.py --commit   # ...and commit, which sends them for review
  python store/tools/publish-listings.py --only el-GR,hr,sr --commit   # just those three

What it writes:

- **en-GB, the default listing** — its phone screenshots from `store/screenshots/`,
  and the same frames into the 7" and 10" tablet slots, which is what those slots
  have always held. Its title and descriptions are edited in the Console and are
  not touched.
- **the twelve localised listings** — title, short and full description from
  `store/listings/<code>.json`, and their three phone screenshots from
  `store/screenshots-localised/<code>/`.

Release notes are not written here. They belong to a release, and production
releases can only be made in the Console — the service account is 403 on a
production edit (see the play-service-account-cannot-touch-production note).
The `releaseNotes` in each listing file are the text to paste there.

Never run while another Play upload is in flight: one edit per app, and a second
one deletes the first (see the play-edits-are-exclusive note).

Committing is not a quiet save. Managed publishing is off, so a commit puts the
listings straight into review, and if a review is already running it cancels and
restarts that one. Use --only to keep a re-push small.
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
LOCALISED = ['bg', 'ro', 'uk', 'sr', 'hr', 'cs-CZ', 'sk', 'hu-HU', 'el-GR', 'de-DE', 'es-ES', 'fr-FR']
ALL_CODES = ['en-GB'] + LOCALISED
CODES = list(ALL_CODES)
if '--only' in sys.argv:
    want = sys.argv[sys.argv.index('--only') + 1].split(',')
    unknown = [c for c in want if c not in ALL_CODES]
    if unknown:
        sys.exit(f'--only: not a listing language: {", ".join(unknown)}')
    CODES = [c for c in ALL_CODES if c in want]

creds = service_account.Credentials.from_service_account_file(
    M + 'play-service-account.json', scopes=['https://www.googleapis.com/auth/androidpublisher'])
s = AuthorizedSession(creds)


def replace_images(edit, code, kind, shots):
    r = s.delete(f'{BASE}/edits/{edit}/listings/{code}/{kind}')
    r.raise_for_status()
    for shot in shots:
        r = s.post(f'{UP}/edits/{edit}/listings/{code}/{kind}?uploadType=media',
                   data=shot.read_bytes(), headers={'Content-Type': 'image/png'})
        print(f'  image   {code:6} {kind:22} {r.status_code} {shot.name}')
        r.raise_for_status()


edit = s.post(f'{BASE}/edits').json()['id']
print('edit', edit)
try:
    for code in CODES:
        if code == 'en-GB':
            shots = sorted((STORE / 'screenshots').glob('0*.png'))
            if not 2 <= len(shots) <= 8:
                sys.exit(f'en-GB: {len(shots)} screenshots — Play takes 2 to 8')
            for kind in ('phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'):
                replace_images(edit, code, kind, shots)
            continue

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
        replace_images(edit, code, 'phoneScreenshots', shots)

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
except BaseException as exc:
    s.delete(f'{BASE}/edits/{edit}')
    print('aborted, edit deleted:', exc)
    raise
