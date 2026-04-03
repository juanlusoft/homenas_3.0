#!/usr/bin/env bash
set -euo pipefail
DEVICE_ID="${1:-}"
if [ -z "$DEVICE_ID" ]; then
  echo '{"phase":"unknown","bytes":0,"files":0}'
  exit 0
fi

export DEVICE_ID
export URB_API_URL="${URBACKUP_API_URL:-http://127.0.0.1:55414}"
export URB_USER="${URBACKUP_API_USER:-admin}"
export URB_PASS="${URBACKUP_API_PASSWORD:-HomeNAS-UrB-2026!}"
export URB_STATE_FILE="${URBACKUP_CORE_STATE_FILE:-/home/juanlu/synobackup-v2/core/data/state.json}"
export URB_CLIENT_ID="${URBACKUP_CLIENT_ID:-}"

python3 - <<'PY'
import json, os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

api = os.environ['URB_API_URL'].rstrip('/')
user = os.environ['URB_USER']
password = os.environ['URB_PASS']
state_file = os.environ['URB_STATE_FILE']
device_id = os.environ['DEVICE_ID']
client_id_env = os.environ.get('URB_CLIENT_ID','').strip()

def post(action: str, data: dict[str, str]) -> dict:
    body = urlencode(data).encode('utf-8')
    req = Request(f"{api}/x?a={action}", data=body, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urlopen(req, timeout=20) as resp:
        raw = resp.read().decode('utf-8', errors='replace')
    return json.loads(raw)

try:
    login = post('login', {'username': user, 'password': password, 'plainpw': '1'})
    ses = str(login.get('session', ''))
    if not ses:
        raise RuntimeError('login failed')

    hostname = ''
    try:
        with open(state_file, 'r', encoding='utf-8') as f:
            st = json.load(f)
        for did, dobj in st.get('devices', []):
            if did == device_id:
                hostname = str(dobj.get('hostname', '')).strip()
                break
    except Exception:
        pass

    status = post('status', {'ses': ses})
    clients = status.get('status', []) or []
    selected = None

    if client_id_env:
        for c in clients:
            if str(c.get('id')) == client_id_env:
                selected = c
                break

    if selected is None and hostname:
        for c in clients:
            if str(c.get('name', '')).lower() == hostname.lower():
                selected = c
                break

    if selected is None:
        for c in clients:
            if str(c.get('name', '')).lower() == device_id.lower():
                selected = c
                break

    if selected is None and len(clients) == 1:
        selected = clients[0]

    if selected is None:
        print(json.dumps({'phase': 'idle', 'bytes': 0, 'files': 0}))
        raise SystemExit(0)

    cid = str(selected.get('id'))
    p = post('progress', {'ses': ses})
    items = p.get('progress', []) or []
    for it in items:
        if str(it.get('clientid')) == cid:
            done = int(it.get('done_bytes') or 0)
            total = int(it.get('total_bytes') or 0)
            phase = 'running'
            if total > 0 and done >= total:
                phase = 'finalizing'
            print(json.dumps({'phase': phase, 'bytes': done, 'files': 0, 'percent': int(it.get('pcdone') or 0)}))
            raise SystemExit(0)

    print(json.dumps({'phase': 'idle', 'bytes': 0, 'files': 0}))
except Exception:
    print(json.dumps({'phase': 'unknown', 'bytes': 0, 'files': 0}))
PY
