import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'deploy'))
import yaml
from n8n_pg17 import migrate, tidy, finalize, rollback
OLD = """services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: n8n
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
  n8n:
    image: n8nio/n8n:latest
    environment:
      DB_POSTGRESDB_HOST: db
    depends_on:
      db:
        condition: service_healthy
volumes:
  n8n_pg:
"""
m = migrate(OLD); yaml.safe_load(m)
assert 'pgmove:' in m and 'DB_POSTGRESDB_HOST: db17' in m
t = tidy(m); y = yaml.safe_load(t)
assert 'pgmove' not in y['services'] and 'db' in y['services'] and list(y['services']['n8n']['depends_on']) == ['db17'], t
f = finalize(m); y = yaml.safe_load(f)
assert set(y['services']) == {'db17', 'n8n'} and 'n8n_pg' in y['volumes'] and 'n8n_pg17' in y['volumes'], f
assert finalize(f) == f, 'ikinci kez çalıştırmak bir şey değiştirmez'
r = rollback(t); assert 'DB_POSTGRESDB_HOST: db\n' in r and 'db17:' not in r.split('volumes:')[0]
print('n8n_pg17 tidy/finalize ok')
