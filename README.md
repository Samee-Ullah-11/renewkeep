# RenewKeep

Track licenses, permits, insurance certificates and employee documents — and get
email reminders long before anything expires. MERN stack, free-tier services only.

## Stack

- **client/** — React + Vite, react-router-dom, axios (cookie auth). Dev server proxies `/api` to the API.
- **server/** — Node (ESM) + Express + Mongoose. JWT in an httpOnly cookie, bcrypt passwords,
  Nodemailer (Gmail), node-cron, Multer to local disk.
- MongoDB Atlas free tier.

## Setup

1. **Install**

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. **Configure** — copy `server/.env.example` to `server/.env` and fill it in:

   | Variable | Purpose |
   |---|---|
   | `PORT` | API port (default 5000) |
   | `CLIENT_URL` | Frontend origin used in email links, e.g. `http://localhost:5173` |
   | `MONGODB_URI` | Atlas connection string, ending in `/renewkeep` |
   | `JWT_SECRET` | Any long random string |
   | `EMAIL_USER` / `EMAIL_PASS` | Gmail address + **app password** (Google Account → Security → App passwords) |
   | `INTERNAL_SECRET` | Random string guarding `POST /api/internal/run-reminders`; unset = endpoint disabled |

3. **Run** (two terminals)

   ```bash
   cd server && npm run dev
   ```

   ```bash
   cd client && npm run dev
   ```

   Open http://localhost:5173.

## Daily reminders

A cron job inside the server runs every day at **08:00 server time**. Reminders go out at
60, 30, 7 and 0 days before expiry, and 1, 7 and 14 days after (then stop). One digest
email per company; recipients are the item's `notifyEmails`, else the company's
Settings-page reminder list, else the admins. The `ReminderLog` unique index makes every
reminder exactly-once per expiry cycle — renewing an item starts a fresh cycle.

**Run manually** (e.g. from an external scheduler, or for testing):

```bash
curl -X POST -H "x-internal-secret: $INTERNAL_SECRET" "http://localhost:5000/api/internal/run-reminders"
```

Add `?dryRun=1` to log what would be sent without sending anything.

**Seed sample items** on every reminder offset:

```bash
cd server && node scripts/seedSampleItems.js you@example.com
```

## Other scripts

```bash
cd server && npm test                    # node:test — unit + integration (uses the renewkeep_test database)
cd server && npm run migrate:companies   # one-off: give pre-multi-tenancy users a company
```

## API sketch

- `POST /api/auth/signup | login | logout`, `GET /api/auth/me`, verification + invite accept flows
- `GET/POST /api/items`, `GET/PUT/DELETE /api/items/:id`, `POST /api/items/:id/renew`
- `POST/GET/DELETE /api/items/:id/file` (private, streamed after the tenant check)
- `GET /api/items/export.csv`, `GET /api/items/import/template`, `POST /api/items/import[/preview]`
- `GET /api/dashboard`
- `GET /api/team`, `POST/DELETE /api/team/invites[/:id]`, `PATCH/DELETE /api/team/members/:id` (admin)
- `PUT /api/company` (admin), `GET /api/account/export`, `DELETE /api/account`

Every item/file/reminder/team query is scoped by the logged-in user's `companyId`
through `middleware/tenant.js` — cross-tenant ids return 404.

## How to upgrade later

Each external service sits behind exactly one file — swap the file, touch nothing else:

| Swap | Change this file only | Notes |
|---|---|---|
| Local disk → **S3 / Cloudinary** | `server/utils/storage.js` | Keep the same three exports: `save(buffer, ext) -> key`, `getStream(key)`, `remove(key)`. Routes and models never see paths, only keys. |
| Gmail → **Resend / Brevo** | `server/utils/sendEmail.js` | Keep the `sendEmail({ to, subject, html })` signature (and the `EMAIL_DRIVER=test` outbox used by the tests). |
| node-cron → **hosted scheduler** (GitHub Actions cron, cron-job.org, Render cron…) | `server/index.js` | Delete the `cron.schedule(...)` block and point the scheduler at `POST /api/internal/run-reminders` with the `x-internal-secret` header. The endpoint already exists and is idempotent, so overlap with the in-process cron is harmless during the transition. |
