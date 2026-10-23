// Shared helpers for the serverless functions. Files starting with "_" are not turned into routes by Vercel.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Reuse one Prisma client per warm function instance.
const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = (g.__prisma ??= new PrismaClient());

export const COOKIE = "advstat_session";
export const BCRYPT_ROUNDS = 12;
const WEEK_S = 7 * 24 * 60 * 60;
const SECURE = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (SECURE) throw new Error("JWT_SECRET is not set.");
  return "dev-only-insecure-secret";
}

export const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email });

/* ---------- route wrapper ---------- */
type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
export const route = (method: "GET" | "POST", fn: Handler) => async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== method) {
    res.setHeader("Allow", method);
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    await fn(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong on the server." });
  }
};
export const bodyOf = (req: VercelRequest): Record<string, unknown> =>
  req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

/* ---------- cookies and sessions ---------- */
function readCookie(req: VercelRequest, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const cookie = (value: string, maxAge: number) =>
  `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE ? "; Secure" : ""}`;

export function issueSession(res: VercelResponse, user: User) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, secret(), { expiresIn: "7d" });
  res.setHeader("Set-Cookie", cookie(token, WEEK_S));
}
export const clearSession = (res: VercelResponse) => res.setHeader("Set-Cookie", cookie("", 0));

/** Returns the signed-in user, or null. */
export async function currentUser(req: VercelRequest): Promise<User | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  try {
    const p = jwt.verify(token, secret()) as { sub: number; v: number };
    const user = await prisma.user.findUnique({ where: { id: p.sub } });
    return user && user.tokenVersion === p.v ? user : null;
  } catch {
    return null;
  }
}

/* ---------- validation ---------- */
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string") return "Password is required.";
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (Buffer.byteLength(pw) > 72) return "Password is too long (72 bytes maximum).";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password needs at least one letter and one number.";
  return null;
}
export const emailOk = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Compare against a fixed hash when the email is unknown, so timing does not reveal which emails exist. */
let dummy: Promise<string> | null = null;
export async function comparePassword(password: string, hash: string | undefined): Promise<boolean> {
  dummy ??= bcrypt.hash("not-a-real-password", BCRYPT_ROUNDS);
  const ok = await bcrypt.compare(password, hash ?? (await dummy));
  return hash !== undefined && ok;
}

/* ---------- rate limiting (stored in Postgres) ---------- */
export function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}
export async function tooMany(key: string, max = 10, windowMs = 15 * 60 * 1000): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rec = await prisma.rateLimit.findUnique({ where: { key } });
  if (!rec || rec.resetAt < now) {
    await prisma.rateLimit.upsert({ where: { key }, create: { key, count: 1, resetAt }, update: { count: 1, resetAt } });
    return false;
  }
  const updated = await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return updated.count > max;
}
export const clearLimit = (key: string) => prisma.rateLimit.deleteMany({ where: { key } });
