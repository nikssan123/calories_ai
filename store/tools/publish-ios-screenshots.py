"""Replaces the App Store version's screenshots with the sets in `store/`.

  python store/tools/publish-ios-screenshots.py <appStoreVersionId>            # show what would change
  python store/tools/publish-ios-screenshots.py <appStoreVersionId> --commit   # delete and upload

  store/screenshots-ios/0*.png   → APP_IPHONE_65          (1284 × 2778)
  store/screenshots-ipad/0*.png  → APP_IPAD_PRO_3GEN_129  (2064 × 2752)

Only the en-US localization carries screenshots; every other locale falls back
to it. The version must be editable — screenshots are locked while it is waiting
for or in review, so cancel the review submission first.

An upload is three calls, and the screenshot is not usable until the last one:
reserve (`POST /v1/appScreenshots` with the size and name, which answers with
upload operations), PUT each slice to the URL it names, then PATCH the reserved
screenshot with `uploaded: true` and the file's MD5. Apple then processes it;
the script waits until every screenshot says `COMPLETE`.

Needs `pyjwt`, `cryptography` and `requests`.
"""
import hashlib, json, pathlib, sys, time
import jwt, requests

STORE = pathlib.Path(__file__).resolve().parents[1]
MOBILE = STORE.parent / 'apps' / 'mobile'
EAS = json.loads((MOBILE / 'eas.json').read_text())['submit']['production']['ios']
API = 'https://api.appstoreconnect.apple.com'
SETS = {
    'APP_IPHONE_65': STORE / 'screenshots-ios',
    'APP_IPAD_PRO_3GEN_129': STORE / 'screenshots-ipad',
}

if len(sys.argv) < 2:
    sys.exit(__doc__)
VERSION = sys.argv[1]
COMMIT = '--commit' in sys.argv
KEY = (MOBILE / EAS['ascApiKeyPath']).read_text()


def headers():
    now = int(time.time())
    token = jwt.encode(
        {'iss': EAS['ascApiKeyIssuerId'], 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
        KEY, algorithm='ES256', headers={'kid': EAS['ascApiKeyId']})
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


def call(method, path, body=None, ok=(200, 201, 204)):
    r = requests.request(method, API + path, headers=headers(), data=json.dumps(body) if body else None)
    if r.status_code not in ok:
        sys.exit(f'{method} {path} → {r.status_code}\n{r.text[:800]}')
    return r.json() if r.content else {}


state = call('GET', f'/v1/appStoreVersions/{VERSION}')['data']['attributes']
print('version', state['versionString'], state['appStoreState'])
locs = call('GET', f'/v1/appStoreVersions/{VERSION}/appStoreVersionLocalizations')['data']
loc = next(l for l in locs if l['attributes']['locale'] == 'en-US')
sets = {s['attributes']['screenshotDisplayType']: s['id']
        for s in call('GET', f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")['data']}

for display, folder in SETS.items():
    files = sorted(folder.glob('0*.png'))
    if not 1 <= len(files) <= 10:
        sys.exit(f'{display}: {len(files)} files in {folder} — App Store takes 1 to 10')
    set_id = sets.get(display)
    existing = call('GET', f'/v1/appScreenshotSets/{set_id}/appScreenshots')['data'] if set_id else []
    print(f'{display}: {len(existing)} on the store → {len(files)} from {folder.name}/')
    if not COMMIT:
        continue

    if not set_id:
        set_id = call('POST', '/v1/appScreenshotSets', {'data': {
            'type': 'appScreenshotSets',
            'attributes': {'screenshotDisplayType': display},
            'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': loc['id']}}},
        }})['data']['id']
    for old in existing:
        call('DELETE', f"/v1/appScreenshots/{old['id']}")

    ids = []
    for file in files:
        data = file.read_bytes()
        reserved = call('POST', '/v1/appScreenshots', {'data': {
            'type': 'appScreenshots',
            'attributes': {'fileName': file.name, 'fileSize': len(data)},
            'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}},
        }})['data']
        for op in reserved['attributes']['uploadOperations']:
            chunk = data[op['offset']:op['offset'] + op['length']]
            put = requests.request(op['method'], op['url'], data=chunk,
                                   headers={h['name']: h['value'] for h in op['requestHeaders']})
            if put.status_code >= 300:
                sys.exit(f'upload slice for {file.name} → {put.status_code}')
        call('PATCH', f"/v1/appScreenshots/{reserved['id']}", {'data': {
            'type': 'appScreenshots', 'id': reserved['id'],
            'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()},
        }})
        ids.append(reserved['id'])
        print(f'  uploaded {file.name}')

    # In file order, whatever order Apple finished processing them in.
    call('PATCH', f'/v1/appScreenshotSets/{set_id}/relationships/appScreenshots',
         {'data': [{'type': 'appScreenshots', 'id': i} for i in ids]})

    for _ in range(60):
        states = [call('GET', f'/v1/appScreenshots/{i}')['data']['attributes']['assetDeliveryState']['state'] for i in ids]
        if all(s == 'COMPLETE' for s in states):
            print(f'  {display}: all {len(ids)} processed')
            break
        if any(s == 'FAILED' for s in states):
            sys.exit(f'{display}: processing failed — {states}')
        time.sleep(5)
    else:
        sys.exit(f'{display}: still processing after five minutes — {states}')

if not COMMIT:
    print('dry run — nothing changed')
