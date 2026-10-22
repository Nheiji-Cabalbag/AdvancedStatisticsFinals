# ADVSTAT Workbench

Final output for ADVSTAT (Advance Statistics), Faith Colleges. TypeScript web app with:

1. **Simple linear regression**: equation `Y = a + bX`, correlation `r`, strength, animated scatter diagram.
2. **Z hypothesis testing**: H₀ / H₁, α, Z, critical values (Z-table), decision, animated normal curve.
3. **Accounts**: register, log in, log out and change password (Express + Prisma + SQLite).

## Install

1. Node.js 18 or newer (https://nodejs.org). Check with `node -v`.
2. In this folder:

```bash
npm install                          # also runs "prisma generate"
cp .env.example .env                 # Windows: copy .env.example .env  (skip if .env already exists)
npx prisma migrate dev --name init   # creates prisma/dev.db and the User table
npm run dev                          # web: http://localhost:5173  (API on :3001)
```

Edit `JWT_SECRET` in `.env` to a long random string. Generate one with:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Useful commands:

```bash
npx prisma studio      # browse the Users table in your browser
npm test               # checks the statistics formulas
npm run typecheck:server
npm run build && npm start   # production: Express serves the built site and the API on one port
```

## How accounts work

- Passwords are hashed with bcrypt (12 rounds); only the hash is stored.
- Login sets an httpOnly cookie holding a signed token (7 days). The browser JavaScript never sees it.
- Rules: email must be valid and unique; password needs 8+ characters with a letter and a number.
- Change password asks for the current password, then signs out all other devices (`tokenVersion` is bumped).
- Login, register and change-password are rate limited (10 tries per 15 minutes).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/register` | `{ name, email, password }` |
| POST | `/api/login` | `{ email, password }` |
| POST | `/api/logout` | clears the session |
| GET | `/api/me` | current user, or 401 |
| POST | `/api/change-password` | `{ currentPassword, newPassword }` |

## Deploying

Vercel hosts static files and serverless functions, so it cannot run this Express server or keep a SQLite file. Two options:

- Host the whole app on Render or Railway: build `npm install && npm run build`, start `npm start`, set `JWT_SECRET` and `NODE_ENV=production`, and use a Postgres database (change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, set `DATABASE_URL`, run `npx prisma migrate deploy`).
- Keep Vercel for the front end and convert the API to Vercel functions with a hosted Postgres (Neon or Vercel Postgres).

## Structure

`server/index.ts` API · `prisma/schema.prisma` database · `src/auth.ts` account client · `src/stats.ts` formulas · `src/charts.ts` canvas charts · `src/main.ts` interface logic
