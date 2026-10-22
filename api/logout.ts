import { clearSession, route } from "./_lib/core.js";

export default route("POST", async (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});
