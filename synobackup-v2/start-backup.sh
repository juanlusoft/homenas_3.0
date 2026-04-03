#!/usr/bin/env bash
set -euo pipefail
DEVICE_ID="${1:-}"
if [ -z "$DEVICE_ID" ]; then
  echo "missing device id" >&2
  exit 2
fi

export URB_API_URL="${URBACKUP_API_URL:-http://127.0.0.1:55414}"
export URB_USER="${URBACKUP_API_USER:-admin}"
export URB_PASS="${URBACKUP_API_PASSWORD:-HomeNAS-UrB-2026!}"
export URB_START_TYPE="${URBACKUP_START_TYPE:-incr_file}"
export URB_STATE_FILE="${URBACKUP_CORE_STATE_FILE:-/home/juanlu/synobackup-v2/core/data/state.json}"
export URB_CLIENT_ID="${URBACKUP_CLIENT_ID:-}"
export DEVICE_ID

python3 - <<'PY'
import json, os, sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

api = os.environ['URB_API_URL'].rstrip('/')
user = os.environ['URB_USER']
password = os.environ['URB_PASS']
start_type = os.environ['URB_START_TYPE']
state_file = os.environ['URB_STATE_FILE']
device_id = os.environ.get('DEVICE_ID') or ""
client_id_env = os.environ.get('URB_CLIENT_ID','').strip()

if not device_id:
    print('missing device id', file=sys.stderr)
    sys.exit(2)


def post(action: str, data: dict[str, str]) -> dict:
    body = urlencode(data).encode('utf-8')
    req = Request(f"{api}/x?a={action}", data=body, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urlopen(req, timeout=20) as resp:
        raw = resp.read().decode('utf-8', errors='replace')
    return json.loads(raw)

login = post('login', {'username': user, 'password': password, 'plainpw': '1'})
if not login.get('success') or not login.get('session'):
    print('urbackup login failed', file=sys.stderr)
    sys.exit(3)
ses = str(login['session'])

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
    print(f'no urbackup client found for device={device_id} hostname={hostname}', file=sys.stderr)
    sys.exit(4)

cid = str(selected.get('id'))
res = post('start_backup', {'ses': ses, 'start_type': start_type, 'start_client': cid})
items = res.get('result') or []
for it in items:
    if str(it.get('clientid')) == cid:
        if it.get('start_ok'):
            print(json.dumps({'ok': True, 'clientId': cid, 'clientName': selected.get('name'), 'startType': start_type}))
            sys.exit(0)
        print(f"start failed for client {cid}", file=sys.stderr)
        sys.exit(5)

print('unexpected start_backup response', file=sys.stderr)
sys.exit(6)
PY
