export interface User { id: number; name: string; email: string }

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Cannot reach the server. Start it with npm run dev.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong. Try again.");
  return data as T;
}

export async function getMe(): Promise<User | null> {
  try { return (await api<{ user: User }>("/api/me")).user; } catch { return null; }
}
export const register = (name: string, email: string, password: string) => api<{ user: User }>("/api/register", "POST", { name, email, password }).then((r) => r.user);
export const login = (email: string, password: string) => api<{ user: User }>("/api/login", "POST", { email, password }).then((r) => r.user);
export const logout = () => api<{ ok: true }>("/api/logout", "POST", {});
export const changePassword = (currentPassword: string, newPassword: string) => api<{ ok: true }>("/api/change-password", "POST", { currentPassword, newPassword });

/** Mirrors the server rules so people get instant feedback. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  return null;
}
/** 0 to 1 strength score for the meter. */
export function passwordScore(pw: string): number {
  let s = Math.min(pw.length, 14) / 14 * 0.5;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 0.15;
  if (/\d/.test(pw)) s += 0.15;
  if (/[^A-Za-z0-9]/.test(pw)) s += 0.2;
  return Math.min(1, s);
}
