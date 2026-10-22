import { currentUser, publicUser, route } from "./_lib/core.js";

export default route("GET", async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Please log in." });
  res.json({ user: publicUser(user) });
});
