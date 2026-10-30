#!/bin/sh
# Spustí se JEN při prvním vytvoření volume postgres_data.
# Vytvoří dvě oddělené databáze a dva účty; každý účet vidí jen svou databázi.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v calendiy_pw="$CALDIY_DB_PASSWORD" \
  -v authentik_pw="$AUTHENTIK_DB_PASSWORD" <<'SQL'
-- CREATEDB je potřeba kvůli shadow databázi u `prisma migrate dev`
CREATE ROLE calendiy LOGIN CREATEDB PASSWORD :'calendiy_pw';
CREATE ROLE authentik LOGIN PASSWORD :'authentik_pw';

CREATE DATABASE calendiy OWNER calendiy;
CREATE DATABASE authentik OWNER authentik;

REVOKE ALL ON DATABASE calendiy FROM PUBLIC;
REVOKE ALL ON DATABASE authentik FROM PUBLIC;
SQL
