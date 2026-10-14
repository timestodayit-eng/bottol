# Creative International Ads Manager — MySQL Edition

React + Express/Node.js + Hostinger MySQL + Cloudflare R2 + authorized Meta account discovery. Designed for private GitHub repository -> Hostinger Cloud Node.js web app.

## What works / limitations
- Database-backed **login** with bcrypt password hashes and expiring signed JWTs, no open public signup.
- Admin, ads_manager, analyst roles, protected API, 10 account slots and independent account settings.
- Upload up to 1 GiB per video in multipart transfers directly from browser to private Cloudflare R2 (requires working R2 credentials and CORS).
- Save bulk campaign drafts sharing video and caption, with independent per-account settings.
- Discover Meta ad accounts with an authorized **server-side Meta access token**, then explicitly map to CI-01...CI-10.
- **NOT IMPLEMENTED:** production Meta Ads creation, actual ad publishing, Insights reporting, Meta OAuth onboarding, real targeting configuration, call attribution. No ads are launched or charged by this app.

## 1. Set up Hostinger MySQL

1. Hostinger hPanel -> Databases -> Management -> MySQL Databases. Create a database and a dedicated user. Record **database name**, **username**, **password**, **hostname**. On Hostinger, names can be prefixed.
2. Open **phpMyAdmin** for that database; import `sql/schema.sql` (MySQL 8+ or compatible). It creates `staff`, `ad_accounts`, `videos`, `campaign_drafts` and ten starting accounts.
3. Enter `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` as **server environment variables** in Hostinger. Use exactly the hostname Hostinger displays, not necessarily `localhost`. Never put secrets in GitHub.
4. Set `JWT_SECRET` to a unique random value (at least 32 chars), e.g. generated using `openssl rand -hex 32` in a trusted terminal. Do not use a sample secret.
5. Create the first admin with `npm run create-admin -- you@yourdomain.com 'A-long-unique-random-password'` in a **secure environment with temporary DB access** (such as a Hostinger SSH session if allowed). This inserts the bcrypt hash in MySQL. It does NOT register public users. Avoid placing real passwords into shared terminals, commits or support screenshots.
6. If you cannot run the admin CLI against Hostinger MySQL from your deployment environment, generate a bcrypt hash using a trusted private environment and insert the record via phpMyAdmin with a newly generated UUID; never store plaintext passwords in SQL files.

## 2. GitHub -> Hostinger deployment

1. Create a **private** GitHub repository and upload the **contents** of this folder (`package.json` at root).
2. Hostinger hPanel -> Deploy Web App / Node.js Web App -> connect GitHub -> select repository and branch.
3. Select supported Node.js >=20. `npm install`, build `npm run build`, start `npm start` (server listens to `process.env.PORT`). The build has no frontend database secrets.
4. Add the variables from `.env.example` to the Hostinger application's **server environment**. Re-deploy if required.
5. Point a subdomain like `ads.creativeinternationalbd.com` to your app through Hostinger's Connect Domain flow and enable HTTPS.
6. Check `https://YOUR-DOMAIN/api/health`. `database:true` confirms successful connectivity. Visit `/` to log in with your admin account.
7. If your Cloud hosting does not offer persistent Express/Node.js execution or a Node app cannot connect to the MySQL host, use a supported backend environment/VPS. Hosting plans differ; verify the exact hPanel options.

## 3. Cloudflare R2 (videos 500MB–1GB)

- Create a private R2 bucket and S3-compatible credentials with bucket-scoped access.
- Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` on the server.
- Configure R2 CORS to permit browser **PUT** from the exact app origin and expose `ETag`. See `r2-cors.example.json`.
- Browser uploads use presigned multipart URLs with 16 MiB parts so 1 GiB files do not traverse Hostinger Node.js. Add bucket lifecycle cleanup for incomplete multipart uploads.

## 4. Meta account mapping

- Obtain an appropriate Meta Marketing API token with permission to access the intended accounts. Set `META_ACCESS_TOKEN` only on server.
- Log in as super_admin -> Integration Settings -> Discover available accounts -> map discovered account IDs to 10 slots. This is account mapping, **not yet full OAuth Connect Facebook**.
- Employment advertising must follow applicable Meta special-ad-category and targeting requirements. Saving a draft does not publish advertising.

## 5. Security and production notes

- Login JWT stored in `sessionStorage` and sent as bearer token; production hardening should add rate-limiting to login, stricter CSP, audit logs, password reset and rotation, and optionally HttpOnly secure cookies / CSRF controls.
- Admin creation is CLI-only; no public signup. Roles are enforced server-side.
- MySQL credentials and Meta/R2 secrets MUST never go into `VITE_*`, frontend JavaScript, GitHub, or client-side storage.
- Use SSL for remote database access whenever required and restrict database remote access. `DB_SSL=true` validates trusted CA chains; consult your provider for any custom CA requirement.
- Always back up your database, protect credentials, and test on one authorized paused Meta ad before implementing real publishing for all 10 accounts.

## Local commands (only for development / private admin setup)

```bash
npm install
npm run build
npm start
# To seed first admin after MySQL schema import and env configuration:
npm run create-admin -- admin@example.com 'UniqueStrongPasswordHere'
```

### API
`POST /api/auth/login`, `GET /api/health`, `GET /api/me`, `GET/PATCH /api/accounts`, `GET /api/videos`, `POST /api/videos/start`, `POST /api/videos/:id/part-url`, `POST /api/videos/:id/complete`, `POST /api/videos/:id/abort`, `GET/POST /api/drafts`, `GET /api/meta/status`, `POST /api/meta/sync-accounts`, `POST /api/meta/map-account`.
