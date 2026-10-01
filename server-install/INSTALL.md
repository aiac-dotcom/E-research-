# Install the E-Research platform (research repository + ranking dashboard) on your server

## What is included

- Editable application source, dependency lockfile, and database schema.
- The QS ranking workbooks are **not** in the Git repository (they are licensed QS data). Copy your `Data/` folder (`Data/Rankings Result/...`, `Data/Qs Analytical data/...`) next to `package.json` before starting; the ranking service needs it.
- A configuration template, setup runner, Nginx example, and systemd service.

No passwords, API keys, sessions, dependency folders, or Replit account configuration are included. This is a source installation package, not an offline installer. Internet access is required to install dependencies and use Clerk and Anthropic.

**The live PostgreSQL database and Clerk users are NOT included.** Ranking records can be rebuilt from the included spreadsheets. Existing QA records, sync history, and any other database-only changes require a separate database backup/restore. This package does not export, delete, or migrate the existing database or login accounts.

## Requirements

This guide targets Ubuntu/Debian **x86_64 Linux (glibc)** with administrative access:

- Node.js **24 LTS**, pnpm **10.26.1**, PostgreSQL 14+ and Nginx.
- A domain pointed at the server and an HTTPS certificate.
- Your own Clerk instance configured for the target HTTPS domain.
- Optional: your own Anthropic API account for the AI ranking analysis service.
- Optional: free API keys for OpenAlex / ORCID / Semantic Scholar, and Scopus / Web of Science keys if the university subscribes (see `.env.example`).

The current lockfile excludes several ARM/musl binaries; this guide does not support ARM servers, Alpine, Windows, or PHP-only/cPanel shared hosting. Use a full Linux server or VPS with Node support. The app is served at the domain root, not a subdirectory.

## 1. Extract and install dependencies

Install the prerequisites using their official instructions. With Node 24 installed:

```sh
npm install --global pnpm@10.26.1
```

Extract the ZIP so that `package.json` is at `/opt/qa-dashboard/package.json`. If you extract elsewhere, update the systemd and Nginx paths.

As an installation user with write access to this directory:

```sh
cd /opt/qa-dashboard
node server-install/manage.mjs install
cp server-install/.env.example .env
chmod 600 .env
nano .env
```

The installer uses the pinned dependency lockfile and installs build-time dependencies too.

## 2. Configure database, login and AI

Create a new empty PostgreSQL database and a non-superuser role that owns it. For a local PostgreSQL installation, run:

```sh
sudo -u postgres psql
```

In the PostgreSQL prompt:

```sql
CREATE ROLE qa_app LOGIN;
\password qa_app
CREATE DATABASE qa_dashboard OWNER qa_app;
\q
```

Put the connection URL in `.env`. Percent-encode any special characters in the database password in the URL. Do not expose PostgreSQL port 5432 publicly. For remote databases, follow your provider's TLS requirements.

The existing app uses Replit-managed Clerk. That configuration is not bundled or automatically transferred. Arrange a Clerk instance that you control for this server, configure its production domain and DNS, and enter its matching backend and frontend keys in `.env`. A separate instance has separate login accounts; do not expect old users to transfer automatically. Leave `VITE_CLERK_PROXY_URL` empty so that authentication connects directly to your configured Clerk instance.

Set `ADMIN_EMAILS` to the email(s) of the first system administrator(s); they become admins when they first sign in. Set `ALLOWED_EMAIL_DOMAINS` (e.g. `unizwa.edu.om`) so staff with a verified university email get a profile automatically; other users must be added by an administrator.

AI ranking analysis is optional: enter your own Anthropic key in `AI_INTEGRATIONS_ANTHROPIC_API_KEY` to enable it. The server starts without it and the AI service then reports that it is not configured.

Never send your `.env` file to anyone. Never put a secret in a variable beginning with `VITE_`: these are public browser build settings. Only the Clerk publishable key belongs there.

## 3. Build and create the database tables

```sh
cd /opt/qa-dashboard
node server-install/manage.mjs build
node server-install/manage.mjs database
```

The database command targets the database in `.env`. Use it for a **new empty database**; do not point it at an existing production database without a backup and schema review. It can propose destructive schema changes; do not accept those blindly.

The build runner builds only the dashboard and API, not the unused design sandbox. These are bundler builds, not a claim that the project's full strict TypeScript check passes; existing strict-check issues remain in the source.

Whenever the domain or public Clerk key changes, rebuild the frontend. Runtime changes in `.env` require an API restart.

## 4. Run as a service

Create a dedicated service account (skip creation if it already exists):

```sh
sudo useradd --system --user-group --home-dir /opt/qa-dashboard --shell /usr/sbin/nologin qa-app
sudo chown root:qa-app /opt/qa-dashboard/.env
sudo chmod 640 /opt/qa-dashboard/.env
sudo chown -R qa-app:qa-app /opt/qa-dashboard/Data
command -v node
```

Ensure the service account can read the source/build files and traverse the parent directories. Nginx also needs read/traverse access to `artifacts/qa-dashboard/dist/public`; do not grant Nginx access to `.env`. Never use the project root as the Nginx document root.

Edit `server-install/qa-dashboard.service` if the Node binary is not `/usr/bin/node`. Use a system-wide Node 24 binary accessible to the service account, not one inside a private home directory.

```sh
sudo cp server-install/qa-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now qa-dashboard
sudo systemctl status qa-dashboard
```

The runner sets the API's working directory correctly, which is required for Excel uploads and imports. Do not move `Data/` or rename the supplied analytical workbooks. The first startup imports ranking spreadsheets into an empty ranking database; allow time for this to finish.

For a foreground diagnostic run instead of systemd:

```sh
node server-install/manage.mjs start
```

Do not run a foreground copy while the service is already using port 3000. Use **one API process**; the ranking cache is in-memory and invalidation is not coordinated between replicas.

## 5. Configure Nginx and HTTPS

Change `ranking.example.com` in `server-install/nginx.conf` to your domain.

```sh
sudo cp server-install/nginx.conf /etc/nginx/sites-available/qa-dashboard
sudo ln -s /etc/nginx/sites-available/qa-dashboard /etc/nginx/sites-enabled/qa-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

Use your normal certificate process (for example Certbot's Nginx integration) to enable HTTPS and redirect HTTP to HTTPS **before using sign-in**. Only expose ports 80/443 publicly (and your secured administration/SSH port); block public access to 3000 and 5432. The supplied API binds to all interfaces, so the firewall is required.

Nginx preserves `/api`, supports streaming AI responses, and falls back to `index.html` for dashboard routes. The supplied configuration blocks the legacy Replit-specific Clerk proxy, which is not needed for this installation.

## 6. Check the installation

```sh
curl --fail https://YOUR_DOMAIN/api/healthz
sudo journalctl -u qa-dashboard -n 100 --no-pager
```

Then open your HTTPS domain, sign in, and confirm the dashboard, Arab/World rankings, upload screen, and AI analysis. A health response only confirms the server is responding, not that external authentication, data import, and AI are configured correctly.

For production access, review who may sign up in your Clerk instance. Research data is protected by platform roles (administrator, staff, and approvers derived from positions); the ranking dashboard is available to any signed-in user. After the first sign-in, use **Administration → Organisation** to create the university, colleges, departments and units, **People & roles** to import staff, and **Services** to switch features on or off. See `README.md` and `docs/`.

## Backups, updates and troubleshooting

- Back up PostgreSQL and the complete writable `Data/` directory regularly. Back up `.env` separately in secure storage.
- Ranking synchronization rebuilds ranking tables from Excel. Keep the complete workbook set available; do not sync with missing files.
- For an update: back up first, stop the service, replace code (preserve `.env` and `Data/`), install dependencies, build, review schema changes, then restart.
- Logs: `sudo journalctl -u qa-dashboard -f`.
- Database errors: check the connection URL and that tables were initialized.
- Login errors: verify matching Clerk keys, production domain/DNS, HTTPS, and a rebuilt frontend.
- Startup AI errors: configure your own Anthropic endpoint/key as above.
- Missing spreadsheet errors: preserve the directory layout and start with the supplied runner.

The archive was checked for completeness and the production bundles were built in the development environment. Installation, HTTPS, external login, and AI on your own server still need the configuration above; they cannot be verified without access to that server.