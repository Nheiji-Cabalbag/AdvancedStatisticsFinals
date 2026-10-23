import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS, bodyOf, clientIp, emailOk, issueSession, passwordProblem, prisma, publicUser, route, tooMany } from "./_lib/core.js";

export default route("POST", async (req, res) => {
  if (await tooMany(`reg:${clientIp(req)}`)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const body = bodyOf(req);
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = body.password;
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Name must be 2 to 60 characters." });
  if (!emailOk(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists. Log in instead." });

  const user = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password as string, BCRYPT_ROUNDS) } });
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});
