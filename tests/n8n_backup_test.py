import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'deploy'))
from n8n_backup import plan, strip
C = "services:\n  db17:\n    image: postgres:17-alpine\n    healthcheck:\n      test: x\n  n8n:\n    image: n8nio/n8n\n    environment:\n      DB_POSTGRESDB_HOST: db17\nvolumes:\n  n8n_pg:\n"
E = "N8N_ENCRYPTION_KEY=a\nN8N_DB_PASSWORD=b\nBACKUP_REPO=old\n"
c, e = plan(C, E, 'install', 'a'*40, {'BACKUP_PASSPHRASE':'p','BACKUP_GITHUB_TOKEN':'t','BACKUP_REPO':'r/x'})
assert c.count('n8nyedek:') == 1 and 'N8N_DB_HOST: db17' in c and '      db17:\n        condition: service_healthy' in c and c.endswith('volumes:\n  n8n_pg:\n'), c
assert e.count('BACKUP_REPO=') == 1 and 'BACKUP_REPO=r/x' in e and 'N8N_DB_PASSWORD=b' in e
c2, e2 = plan(c, e, 'install', 'b'*40, {'BACKUP_PASSPHRASE':'p','BACKUP_GITHUB_TOKEN':'t','BACKUP_REPO':'r/x'})
assert c2.count('n8nyedek:') == 1 and 'b'*40 in c2 and 'a'*40 not in c2, 'yeniden kurulum tek servis'
c3, e3 = plan(c, e, 'remove', '', {})
assert c3 == C and 'BACKUP_' not in e3, (c3, e3)
import yaml; yaml.safe_load(c)
print('n8n_backup plan ok', len(c))
