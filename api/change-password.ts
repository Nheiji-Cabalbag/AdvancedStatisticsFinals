import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS, bodyOf, clearLimit, comparePassword, currentUser, issueSession, passwordProblem, prisma, route, tooMany } from "./_lib/core.js";

export default route("POST", async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Your session has ended. Please log in again." });
  const key = `pw:${user.id}`;
  if (await tooMany(key)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });

  const body = bodyOf(req);
  const current = String(body.currentPassword ?? "");
  const next = body.newPassword;
  if (!(await comparePassword(current, user.passwordHash))) return res.status(401).json({ error: "Current password is incorrect." });
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });
  if (next === current) return res.status(400).json({ error: "New password must be different from the current one." });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next as string, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
  });
  await clearLimit(key);
  issueSession(res, updated); // this browser stays signed in; every other session is signed out
  res.json({ ok: true });
});
