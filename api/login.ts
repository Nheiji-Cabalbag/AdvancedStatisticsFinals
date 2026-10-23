import { bodyOf, clearLimit, clientIp, comparePassword, issueSession, prisma, publicUser, route, tooMany } from "./_lib/core.js";

export default route("POST", async (req, res) => {
  const key = `login:${clientIp(req)}`;
  if (await tooMany(key)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  const body = bodyOf(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await comparePassword(password, user?.passwordHash);
  if (!user || !ok) return res.status(401).json({ error: "Incorrect email or password." });
  await clearLimit(key);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});
