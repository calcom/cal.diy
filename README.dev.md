# Lokální vývoj: podpůrné služby pro SSO

Docker spouští PostgreSQL, Redis (pro Cal.diy), Authentik (server + worker) a Mailpit.
Cal.diy samotné běží na hostiteli přes `yarn dev`.

| Služba | Adresa (jen localhost) |
|---|---|
| PostgreSQL | `127.0.0.1:5432` (DB `calendiy` a `authentik`) |
| Redis | `127.0.0.1:6379` |
| Authentik | http://localhost:9000 |
| Mailpit UI / SMTP | http://localhost:8025 / `127.0.0.1:1025` |

## Spuštění

```bash
cp .env.dev.example .env.dev      # vyplň hesla a AUTHENTIK_SECRET_KEY
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d
docker compose -f docker-compose.dev.yml --env-file .env.dev ps   # všechny služby mají být "healthy"
```

První start Authentiku trvá cca minutu (migrace). Přihlášení: `akadmin` s heslem
`AUTHENTIK_BOOTSTRAP_PASSWORD` na http://localhost:9000.

## Konfigurace Cal.diy (`.env` v repozitáři Cal.diy)

Názvy proměnných ověř proti `.env.example` v repozitáři Cal.diy.

```env
DATABASE_URL=postgresql://calendiy:<CALDIY_DB_PASSWORD>@localhost:5432/calendiy
DATABASE_DIRECT_URL=postgresql://calendiy:<CALDIY_DB_PASSWORD>@localhost:5432/calendiy
REDIS_URL=redis://:<REDIS_PASSWORD>@localhost:6379
EMAIL_FROM=noreply@calendiy.localhost
EMAIL_SERVER_HOST=127.0.0.1
EMAIL_SERVER_PORT=1025
```

## Migrace

- **Authentik**: migruje se sám při startu serveru. Nic dalšího se nespouští.
- **Cal.diy** (Prisma), z kořene repozitáře Cal.diy:
  ```bash
  yarn                                        # závislosti
  yarn workspace @calcom/prisma db-deploy     # aplikuje existující migrace
  yarn dev
  ```
  Přesný název skriptu zkontroluj v `packages/prisma/package.json`. `yarn db-studio` otevře Prisma Studio.

## Běžné operace

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev logs -f authentik-server
docker compose -f docker-compose.dev.yml --env-file .env.dev down        # zastaví, data zůstanou
docker compose -f docker-compose.dev.yml --env-file .env.dev down -v    # SMAŽE všechna data (volumes)
```

Init skript `docker/postgres/init/01-create-databases.sh` se spouští jen při prvním vytvoření
volume. Pokud změníš hesla účtů `calendiy`/`authentik` v `.env.dev` později, spusť `down -v`
(ztráta dat) nebo změň heslo ručně přes `ALTER ROLE`.

## Upgrade Authentiku

Verze je připnutá v `docker-compose.dev.yml` (`ghcr.io/goauthentik/server:2026.8.3`, server i worker
stejná). Při upgradu porovnej oficiální `compose.yml` dané verze (závislosti, verze Postgresu)
a přečti si release notes.
