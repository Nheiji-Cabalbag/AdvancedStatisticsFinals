import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, type User } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const PROD = process.env.NODE_ENV === "production";
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
if (PROD) app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.post("/api/register", wrap(async (req, res) => {
  if (tooMany(`reg:${req.ip}`)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = req.body?.password;
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Name must be 2 to 60 characters." });
  if (!emailOk(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
  const user = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password as string, BCRYPT_ROUNDS) } });
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));


app.post("/api/login", wrap(async (req, res) => {
  if (tooMany(`login:${req.ip}`)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: "Incorrect email or password." });
  attempts.delete(`login:${req.ip}`);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
}));


app.post("/api/logout", (_req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: PROD });
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (_req, res) => res.json({ user: publicUser(res.locals.user as User) }));

app.post("/api/change-password", requireAuth, wrap(async (req, res) => {
  const user = res.locals.user as User;
  if (tooMany(`pw:${user.id}`)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const current = String(req.body?.currentPassword ?? "");
  const next = req.body?.newPassword;
  if (!(await bcrypt.compare(current, user.passwordHash))) return res.status(401).json({ error: "Current password is incorrect." });
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });
  if (next === current) return res.status(400).json({ error: "New password must be different from the current one." });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next as string, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
  });
  attempts.delete(`pw:${user.id}`);
  issueSession(res, updated); // this browser stays signed in; every other session is signed out
  res.json({ ok: true });
}));


// Serve the built front end in production (npm run build && npm start).
const dist = path.resolve(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
