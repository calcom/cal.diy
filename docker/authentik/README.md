# Authentik ve vzhledu Werk|0

`werko-brand.css` je vlastní CSS výchozího brandu Authentiku (přihlášení, registrace, ověření e-mailu).

Nastavení v Authentiku: **System → Brands → authentik-default → Edit**

| Pole | Hodnota |
|---|---|
| Title | `Werk\|0` |
| Logo | `<URL portálu>/werko/logo.svg` (bílé logo z `apps/web/public/werko/`) |
| Favicon | `<URL portálu>/werko/icon.svg` |
| Default flow background | `<URL portálu>/werko/background.svg` (jednobarevná deep-blue) |
| Custom CSS | obsah `werko-brand.css` |
| Attributes | `{"settings": {"theme": {"base": "dark"}, "locale": "cs"}}` |

Dále: titulek přihlašovacího flow `default-authentication-flow` = „Přihlášení do rezervací Werk|0“, název aplikace `werko` = „Werk|0“.

Lokálně je `<URL portálu>` `http://localhost:3000`.

## Registrace

1. `docker exec calendiy-dev-authentik-server-1 ak apply_blueprint example/flows-enrollment-email-verification.yaml` vytvoří flow `default-enrollment-flow` (uživatelské jméno, heslo, jméno, e-mail, ověření e-mailem).
2. Flows → `default-enrollment-flow`: titulek „Registrace do rezervací Werk|0“.
3. Stages → `default-authentication-identification` → Enrollment flow = `default-enrollment-flow` (na přihlášení se objeví „Potřebujete účet? Zaregistrovat se.“).
4. Stages → Prompts `default-enrollment-field-*`: české popisky (Uživatelské jméno, Heslo, Heslo znovu, Jméno a příjmení, E-mail).
5. Stages → `default-enrollment-email-verification`: předmět „Potvrďte svůj e-mail – Werk|0“.
