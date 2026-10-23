# ADVSTAT Workbench

Final output for ADVSTAT (Advance Statistics), Faith Colleges.

- **Simple linear regression**: equation `Y = a + bX`, correlation `r`, strength, animated scatter diagram.
- **Z hypothesis testing**: H₀ / H₁, α, Z, critical values (Z-table), decision, animated normal curve.
- **Accounts**: register, log in, log out, change password.

Stack: Vite + TypeScript (front end), Vercel serverless functions in `api/` (back end), Prisma + Postgres (database).

## 1. Set up the database (once)

1. Create a free Postgres database. Easiest: in your Vercel project open **Storage → Create Database → Neon**, connect it to the project.
2. Copy two connection strings (Neon dashboard → Connection details):
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`. Add `&pgbouncer=true` to the end.
   - **Direct / unpooled** → `DIRECT_URL`.
   If you only see one string, use it for both.

## 2. Run it on your computer

```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
# edit .env: paste DATABASE_URL, DIRECT_URL and a new JWT_SECRET
```

If you ran the earlier SQLite version, delete the `prisma/migrations` folder and `prisma/dev.db` first.

```bash
npx prisma migrate dev --name init   # creates the User and RateLimit tables
npm run dev                          # http://localhost:5173
```

`npx prisma studio` shows the stored users. `npm test` checks the formulas.

Commit the `prisma/migrations` folder. Never commit `.env`.

## 3. Deploy to Vercel

1. In Vercel: **Project → Settings → Environment Variables**. Add for Production, Preview and Development:
   `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (use a different random secret from your local one).
2. Test on a branch first:
   ```bash
   git checkout -b accounts
   git add . && git commit -m "Add accounts"
   git push -u origin accounts
   ```
   Vercel builds a preview link for the branch. Test register, login, change password and logout there.
3. When happy, merge to `main` (or open a pull request and merge). Your existing link updates.

Changing the database later: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` locally, commit, push, then run `npx prisma migrate deploy` once against production.

## How accounts work

- Passwords are hashed with bcrypt (12 rounds); only the hash is stored.
- Login sets an httpOnly, SameSite=Lax cookie (Secure on Vercel) holding a signed token valid for 7 days.
- Register: unique valid email, name 2–60 characters, password 8+ characters with a letter and a number.
- Change password: needs the current password, then signs out every other device (`tokenVersion` is bumped).
- Login, register and change-password are limited to 10 tries per 15 minutes, counted in the database.

## API

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/register` | `{ name, email, password }` |
| POST | `/api/login` | `{ email, password }` |
| POST | `/api/logout` | none |
| GET | `/api/me` | none |
| POST | `/api/change-password` | `{ currentPassword, newPassword }` |

## Structure

`api/` serverless functions · `api/_lib/core.ts` shared helpers · `server/index.ts` local dev API (runs the same functions) · `prisma/schema.prisma` database · `src/` front end
