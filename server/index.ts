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
const app = express();
app.use(express.json({ limit: "10kb" }));

const mount = (method: "get" | "post", path: string, h: H) =>
  app[method](path, (req, res) => { void h(req as unknown as VercelRequest, res as unknown as VercelResponse); });

mount("post", "/api/register", register);
mount("post", "/api/login", login);
mount("post", "/api/logout", logout);
mount("get", "/api/me", me);
mount("post", "/api/change-password", changePassword);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API ready on http://localhost:${port}`));
