#!/bin/sh
# Container start-up for the local preview: create tables, add demo data the first time, start the app.
set -e
echo "Preparing the database…"
for i in $(seq 1 30); do
  node -e "require('postgres')(process.env.DATABASE_URL)\`select 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))" && break
  sleep 1
done
node_modules/.bin/tsx scripts/migrate.ts
node_modules/.bin/tsx scripts/seed.ts --if-empty
echo ""
echo "Print Amplified Finance is ready: open http://localhost:3000"
exec node_modules/.bin/next start -p 3000 -H 0.0.0.0
