#!/usr/bin/env python3
"""Yerel demo veritabanından (simülasyon) app/demo.json üretir.
Kullanım: python3 tools/demo_export.py  (PGHOST/PGPORT/PGUSER/PGDATABASE ortamdan; varsayılan yerel demo)
Dışa aktarılan: demo müşteriler (id >= ILK) ve onlara bağlı her şey + demo ekip (yönetici hariç).
Şifre, oturum, karar bağlantısı jetonu dışa aktarılmaz; e-postalar demo alanına çevrilir."""
import json, os, subprocess, re, datetime
ENV = dict(os.environ, PGHOST=os.environ.get('PGHOST', 'localhost'), PGPORT=os.environ.get('PGPORT', '55432'), PGUSER=os.environ.get('PGUSER', 'arv'), PGDATABASE=os.environ.get('PGDATABASE', 'demo'))
ILK = int(os.environ.get('DEMO_FIRST_CLIENT', '26')); ADMIN = 1
def sql(s): return subprocess.run(['psql', '-At', '-c', s], capture_output=True, text=True, env=ENV, check=True).stdout.strip()
def rows(t, where): return json.loads(sql(f"SELECT COALESCE(json_agg(x ORDER BY x.id), '[]') FROM {t} x WHERE {where}") or '[]')
C = f"SELECT id FROM clients WHERE id >= {ILK}"
U = f"SELECT id FROM users WHERE id <> {ADMIN} AND (role <> 'client' OR client_id IN ({C}))"
P = f"SELECT id FROM projects WHERE client_id IN ({C})"
T = f"SELECT id FROM tasks WHERE project_id IN ({P})"
J = f"SELECT id FROM ai_jobs WHERE task_id IN ({T}) OR project_id IN ({P})"
W = f"SELECT id FROM work_packages WHERE project_id IN ({P}) OR freelancer_id IN ({U})"
PLAN = [
 ('clients', f"id IN ({C})"), ('users', f"id IN ({U})"), ('client_notes', f"client_id IN ({C})"), ('client_services', f"client_id IN ({C})"),
 ('quotes', f"client_id IN ({C})"), ('quote_items', f"quote_id IN (SELECT id FROM quotes WHERE client_id IN ({C}))"),
 ('invoices', f"client_id IN ({C})"), ('invoice_items', f"invoice_id IN (SELECT id FROM invoices WHERE client_id IN ({C}))"),
 ('projects', f"id IN ({P})"), ('approvals', f"client_id IN ({C})"), ('approval_files', f"approval_id IN (SELECT id FROM approvals WHERE client_id IN ({C}))"),
 ('tasks', f"id IN ({T})"), ('task_comments', f"task_id IN ({T})"), ('task_checklist', f"task_id IN ({T})"),
 ('ai_jobs', f"id IN ({J})"), ('ai_suggestions', f"job_id IN ({J}) OR task_id IN ({T})"), ('reminders', f"task_id IN ({T})"),
 ('work_packages', f"id IN ({W})"), ('time_entries', f"package_id IN ({W})"),
 ('notifications', f"user_id IN ({U}) OR user_id = {ADMIN}"),
]
DROP = {'users': ['pass_hash', 'last_login'], 'clients': ['is_demo'], 'notifications': ['read_at']}
fks = {}
for line in sql("""SELECT tc.table_name, kcu.column_name, ccu.table_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name WHERE tc.constraint_type='FOREIGN KEY'""").splitlines():
    t, c, r = line.split('|'); fks.setdefault(t, {})[c] = r
types = {}
for line in sql("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public'").splitlines():
    t, c, d = line.split('|'); types.setdefault(t, {})[c] = d
out = {'version': 1, 'ref_time': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tables': [], 'fks': {}, 'types': {}, 'services': {}}
dom = lambda e: re.sub(r'@.*$', '@demo.arvela.test', e) if e else e
inv_no = 0
for t, w in PLAN:
    rs = rows(t, w)
    for r in rs:
        for k in DROP.get(t, []): r.pop(k, None)
        if t in ('users', 'clients') and r.get('email'): r['email'] = dom(r['email'])
        if t == 'invoices': inv_no += 1; r['number'] = f"DEMO-{str(r['number'])[4:8]}-{inv_no:04d}"
    out['tables'].append({'name': t, 'rows': rs})
    out['fks'][t] = fks.get(t, {}); out['types'][t] = {k: v for k, v in types[t].items() if v in ('timestamp with time zone', 'date', 'jsonb', 'bytea')}
ids = sorted({r[c] for tb in out['tables'] for r in tb['rows'] for c, ref in out['fks'][tb['name']].items() if ref == 'services' and r.get(c)})
if ids: out['services'] = dict(l.split('|') for l in sql(f"SELECT id, code FROM services WHERE id IN ({','.join(map(str, ids))})").splitlines())
p = os.path.join(os.path.dirname(__file__), '..', 'app', 'demo.json')
json.dump(out, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print({tb['name']: len(tb['rows']) for tb in out['tables']}, os.path.getsize(p), 'bayt')
