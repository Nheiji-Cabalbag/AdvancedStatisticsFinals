// Development only: runs the same api/*.ts handlers that Vercel runs in production.
import "dotenv/config";
import express from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import register from "../api/register.js";
import login from "../api/login.js";
import logout from "../api/logout.js";
import me from "../api/me.js";
import changePassword from "../api/change-password.js";

type H = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, type User } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const PROD = process.env.NODE_ENV === "production";
const ON_VERCEL = Boolean(process.env.VERCEL);
const PORT = Number(process.env.PORT ?? 3001);

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (PROD) throw new Error("JWT_SECRET must be set in production.");
  console.warn("JWT_SECRET is not set. Using an insecure development secret.");
  SECRET = "dev-only-insecure-secret";
}

const COOKIE = "advstat_session";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS); // keeps login timing the same for unknown emails

/* ---------- helpers ---------- */
const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email });

function issueSession(res: Response, user: User) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, SECRET!, { expiresIn: "7d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: PROD, maxAge: WEEK_MS });
}

function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string") return "Password is required.";
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (Buffer.byteLength(pw) > 72) return "Password is too long (72 bytes maximum).";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password needs at least one letter and one number.";
  return null;
}
const emailOk = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Simple in-memory rate limit: 10 attempts per 15 minutes per IP and action.
// Note: on Vercel each serverless instance keeps its own counter, so this is best-effort only.
const attempts = new Map<string, { n: number; reset: number }>();
function tooMany(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.reset < now) { attempts.set(key, { n: 1, reset: now + 15 * 60 * 1000 }); return false; }
  rec.n += 1;
  return rec.n > 10;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: "Please log in." });
    const payload = jwt.verify(token, SECRET!) as { sub: number; v: number };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.v) return res.status(401).json({ error: "Your session has ended. Please log in again." });
    res.locals.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Your session has ended. Please log in again." });
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;
// Express 4 does not catch rejected promises, so forward them to the error handler.
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: "10kb" }));

const mount = (method: "get" | "post", path: string, h: H) =>
  app[method](path, (req, res) => { void h(req as unknown as VercelRequest, res as unknown as VercelResponse); });
// Serve the built front end when running your own server (npm run build && npm start).
// On Vercel the static files are served by Vercel itself, so skip this there.
const dist = path.resolve(process.cwd(), "dist");
if (!ON_VERCEL && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

mount("post", "/api/register", register);
mount("post", "/api/login", login);
mount("post", "/api/logout", logout);
mount("get", "/api/me", me);
mount("post", "/api/change-password", changePassword);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API ready on http://localhost:${port}`));
// Only start a listening server locally. On Vercel the exported app is used as the function.
if (!ON_VERCEL) {
  app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
}

export default app;
