import { linearRegression, parseNumbers, zTest, criticalTable, type Tail, type RegressionResult, type ZTestResult } from "./stats";
import { drawScatter, drawNormal, hits, geom } from "./charts";
import { getMe, login, register, logout, changePassword, passwordProblem, passwordScore, type User } from "./auth";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const num = (v: number, d = 4) => String(+v.toFixed(d));
const sign = (v: number, d = 4) => (v < 0 ? `− ${num(-v, d)}` : `+ ${num(v, d)}`);
const val = (id: string) => $<HTMLInputElement>(id).value.trim();

/* ---------------- Tabs ---------------- */
const tabs = [["tab-reg", "panel-reg"], ["tab-hyp", "panel-hyp"]];
tabs.forEach(([t]) => $(t).addEventListener("click", () => {
  tabs.forEach(([tt, pp]) => { $(tt).setAttribute("aria-selected", String(tt === t)); $(pp).hidden = tt !== t; });
  redraw(); setTimeout(moveInk, 0);
}));

/* ---------------- Linear regression ---------------- */
let lastReg: { x: number[]; y: number[]; r: RegressionResult } | null = null;
let lastZ: ZTestResult | null = null;

function showError(id: string, msg: string | null) {
  const el = $(id);
  el.hidden = msg === null;
  el.textContent = msg ?? "";
}

$("reg-form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const x = parseNumbers($<HTMLTextAreaElement>("x-input").value);
    const y = parseNumbers($<HTMLTextAreaElement>("y-input").value);
    const r = linearRegression(x, y);
    showError("reg-error", null);
    lastReg = { x, y, r };
    renderRegression(x, y, r);
  } catch (err) {
    showError("reg-error", live ? null : (err as Error).message);
    $("reg-out").hidden = true;
    lastReg = null;
  }
});

$("reg-sample").addEventListener("click", () => {
  $<HTMLTextAreaElement>("x-input").value = "2, 3, 5, 7, 9, 10, 12, 14";
  $<HTMLTextAreaElement>("y-input").value = "65, 70, 74, 80, 85, 88, 93, 98";
  $<HTMLInputElement>("predict-x").value = "11";
});
$("reg-clear").addEventListener("click", () => {
  ["x-input", "y-input", "predict-x"].forEach((id) => ($<HTMLInputElement>(id).value = ""));
  $("reg-out").hidden = true; showError("reg-error", null); lastReg = null;
});

function renderRegression(x: number[], y: number[], r: RegressionResult) {
  const first = Boolean($("reg-out").hidden); $("reg-out").hidden = false;
  $("reg-eq").textContent = `Y = ${num(r.a)} ${sign(r.b)}X`;
  countTo("reg-r", r.r, 4);
  countTo("reg-r2", r.r2, 4);
  $("reg-strength").textContent = r.strength; pop("reg-strength"); pop("reg-eq");
  $("reg-meter").style.width = "0%"; requestAnimationFrame(() => setTimeout(() => ($("reg-meter").style.width = `${Math.abs(r.r) * 100}%`), 60));

  const px = val("predict-x");
  $("reg-predict").textContent = px !== "" && Number.isFinite(Number(px)) ? `For X = ${px}, predicted Y = ${num(r.a + r.b * Number(px))}` : "";

  const dirText = r.direction === "no clear direction" ? "no clear linear direction" : `a ${r.direction} relationship`;
  $("reg-interp").textContent =
    `r = ${num(r.r)} shows ${r.strength.toLowerCase()} ${dirText} between X and Y. ` +
    `About ${num(r.r2 * 100, 2)}% of the variation in Y is explained by X (R² = ${num(r.r2)}). ` +
    (r.b !== 0 ? `Each 1-unit increase in X is associated with a ${num(Math.abs(r.b))}-unit ${r.b > 0 ? "increase" : "decrease"} in Y.` : "");

  const rows = x.map((xv, i) => `<tr><td>${i + 1}</td><td>${xv}</td><td>${y[i]}</td><td>${num(xv * y[i], 4)}</td><td>${num(xv * xv, 4)}</td><td>${num(y[i] * y[i], 4)}</td></tr>`).join("");
  $("reg-table").innerHTML =
    `<thead><tr><th>#</th><th>X</th><th>Y</th><th>XY</th><th>X²</th><th>Y²</th></tr></thead><tbody>${rows}` +
    `<tr class="total"><td>Σ</td><td>${num(r.sumX)}</td><td>${num(r.sumY)}</td><td>${num(r.sumXY)}</td><td>${num(r.sumX2)}</td><td>${num(r.sumY2)}</td></tr></tbody>`;

  const n = r.n;
  $("reg-steps").innerHTML = [
    `<b>Slope:</b> <code>b = [nΣXY − ΣXΣY] / [nΣX² − (ΣX)²] = [${n}(${num(r.sumXY)}) − (${num(r.sumX)})(${num(r.sumY)})] / [${n}(${num(r.sumX2)}) − (${num(r.sumX)})²] = ${num(r.b)}</code>`,
    `<b>Intercept:</b> <code>a = Ȳ − bX̄ = ${num(r.meanY)} − (${num(r.b)})(${num(r.meanX)}) = ${num(r.a)}</code>`,
    `<b>Equation:</b> <code>Y = a + bX = ${num(r.a)} ${sign(r.b)}X</code>`,
    `<b>Correlation:</b> <code>r = [nΣXY − ΣXΣY] / √{[nΣX² − (ΣX)²][nΣY² − (ΣY)²]} = ${num(r.r)}</code>`,
    `<b>Strength:</b> |r| = ${num(Math.abs(r.r))} → <b>${r.strength}</b> (0.90–1.00 very strong, 0.70–0.89 strong, 0.40–0.69 moderate, 0.20–0.39 weak, below 0.20 very weak or none)`,
  ].map((s) => `<p>${s}</p>`).join("");

  animate("reg-canvas", (p) => drawScatter($<HTMLCanvasElement>("reg-canvas"), x, y, r.a, r.b, p));
  afterRender("reg-out", first);
}

/* ---------------- Hypothesis testing ---------------- */
const alphaSel = $<HTMLSelectElement>("alpha");
alphaSel.addEventListener("change", () => ($("alpha-custom-wrap").hidden = alphaSel.value !== "custom"));

$("hyp-form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const alpha = alphaSel.value === "custom" ? Number(val("alpha-custom")) : Number(alphaSel.value);
    if (val("mu0") === "" || val("xbar") === "" || val("sigma") === "" || val("n") === "") throw new Error("Fill in μ₀, x̄, σ and n.");
    const result = zTest({
      sampleMean: Number(val("xbar")), mu0: Number(val("mu0")), sigma: Number(val("sigma")), n: Number(val("n")),
      alpha, tail: $<HTMLSelectElement>("tail").value as Tail,
    });
    showError("hyp-error", null);
    lastZ = result;
    renderTest(result);
  } catch (err) {
    showError("hyp-error", live ? null : (err as Error).message);
    $("hyp-out").hidden = true; lastZ = null;
  }
});

$("hyp-sample").addEventListener("click", () => {
  $<HTMLInputElement>("h0").value = "The average battery life is 50 hours (μ = 50)";
  $<HTMLInputElement>("h1").value = "The average battery life is not 50 hours (μ ≠ 50)";
  $<HTMLSelectElement>("tail").value = "two";
  alphaSel.value = "0.05"; $("alpha-custom-wrap").hidden = true;
  $<HTMLInputElement>("mu0").value = "50"; $<HTMLInputElement>("xbar").value = "52";
  $<HTMLInputElement>("sigma").value = "5"; $<HTMLInputElement>("n").value = "36";
});
$("hyp-clear").addEventListener("click", () => {
  ["h0", "h1", "mu0", "xbar", "sigma", "n", "alpha-custom"].forEach((id) => ($<HTMLInputElement>(id).value = ""));
  $("hyp-out").hidden = true; showError("hyp-error", null); lastZ = null;
});

function renderTest(r: ZTestResult) {
  const first = Boolean($("hyp-out").hidden); $("hyp-out").hidden = false;
  const h0 = val("h0") || "H₀ (not entered)";
  const h1 = val("h1") || "H₁ (not entered)";
  const tailName = { two: "two-tailed", left: "left-tailed", right: "right-tailed" }[r.tail];

  const dec = $("hyp-decision");
  dec.className = `card decision ${r.reject ? "reject" : "keep"}`;
  dec.innerHTML =
    `<h2>${r.reject ? "Reject H₀" : "Fail to reject H₀"}</h2>` +
    `<p>${r.reject
      ? `At α = ${r.alpha}, the sample gives enough evidence to support H₁: ${esc(h1)}.`
      : `At α = ${r.alpha}, the sample does not give enough evidence to support H₁: ${esc(h1)}.`}</p>` +
    `<p class="hint">H₀: ${esc(h0)}</p>`;

  countTo("hyp-z", r.z, 4);
  countTo("hyp-crit", (r.criticalHigh ?? r.criticalLow)!, 4, r.tail === "two" ? "±" : "");
  if (r.pValue < 0.0001) $("hyp-p").textContent = "< 0.0001"; else countTo("hyp-p", r.pValue, 4);

  const rule = r.tail === "two" ? `Reject H₀ if Z ≤ ${num(r.criticalLow!, 3)} or Z ≥ ${num(r.criticalHigh!, 3)}`
    : r.tail === "right" ? `Reject H₀ if Z ≥ ${num(r.criticalHigh!, 3)}` : `Reject H₀ if Z ≤ ${num(r.criticalLow!, 3)}`;
  $("hyp-steps").innerHTML = [
    `<b>1. Hypotheses:</b> H₀: ${esc(h0)} &nbsp;|&nbsp; H₁: ${esc(h1)} (${tailName})`,
    `<b>2. Level of significance:</b> <code>α = ${r.alpha}</code>`,
    `<b>3. Standard error:</b> <code>σ/√n = ${num(r.sigma)}/√${r.n} = ${num(r.standardError)}</code>`,
    `<b>4. Test statistic:</b> <code>Z = (x̄ − μ₀) / (σ/√n) = (${num(r.sampleMean)} − ${num(r.mu0)}) / ${num(r.standardError)} = ${num(r.z)}</code>`,
    `<b>5. Critical value:</b> <code>${rule}</code>`,
    `<b>6. p-value:</b> <code>${r.pValue < 0.0001 ? "< 0.0001" : num(r.pValue, 4)}</code> ${r.pValue <= r.alpha ? "≤" : ">"} α`,
    `<b>7. Decision:</b> Z = ${num(r.z, 3)} falls in the <b>${r.reject ? "rejection" : "acceptance"} region</b> → <b>${r.reject ? "reject" : "fail to reject"} H₀</b>.`,
  ].map((s) => `<p>${s}</p>`).join("");

  const alphas = [0.1, 0.05, 0.025, 0.01, 0.005, 0.001];
  if (!alphas.some((a) => Math.abs(a - r.alpha) < 1e-12)) alphas.push(r.alpha);
  alphas.sort((a, b) => b - a);
  $("z-table").innerHTML =
    `<thead><tr><th>α</th><th>One-tailed Z</th><th>Two-tailed Z (±)</th></tr></thead><tbody>` +
    criticalTable(alphas).map((row) => `<tr class="${Math.abs(row.alpha - r.alpha) < 1e-12 ? "hl" : ""}"><td>${row.alpha}</td><td>${num(row.oneTailed, 4)}</td><td>±${num(row.twoTailed, 4)}</td></tr>`).join("") + `</tbody>`;

  animate("hyp-canvas", (p) => drawNormal($<HTMLCanvasElement>("hyp-canvas"), r, p));
  afterRender("hyp-out", first);
}

/* ---------------- Resize ---------------- */
function redraw() {
  requestAnimationFrame(() => {
    if (lastReg && !$("panel-reg").hidden) drawScatter($<HTMLCanvasElement>("reg-canvas"), lastReg.x, lastReg.y, lastReg.r.a, lastReg.r.b, 1, regHover);
    if (lastZ && !$("panel-hyp").hidden) drawNormal($<HTMLCanvasElement>("hyp-canvas"), lastZ, 1, zHover);
  });
}
window.addEventListener("resize", redraw);

/* ================= Interactivity & animation ================= */
let live = false, regHover = -1, zHover: number | null = null;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function countTo(id: string, value: number, d = 4, prefix = "") {
  const el = $(id);
  if (reduce) { el.textContent = prefix + num(value, d); return; }
  const t0 = performance.now(), dur = 900;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = prefix + num(value * e, d);
    if (k < 1) requestAnimationFrame(step); else el.textContent = prefix + num(value, d);
  };
  requestAnimationFrame(step);
}
function pop(id: string) { const el = $(id); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }

let animId = 0;
function animate(canvasId: string, draw: (p: number) => void, dur = 1100) {
  const my = ++animId;
  if (reduce) { requestAnimationFrame(() => draw(1)); return; }
  const t0 = performance.now() + 250; // wait for the card to slide in
  const step = (t: number) => {
    if (my !== animId) return;
    const p = Math.max(0, Math.min(1, (t - t0) / dur));
    draw(p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* scroll-reveal for result cards */
const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.12 });
function afterRender(outId: string, first: boolean) {
  const out = $(outId);
  const cards = Array.from(out.querySelectorAll<HTMLElement>(".card"));
  out.querySelectorAll<HTMLElement>(".steps p").forEach((p, i) => p.style.setProperty("--k", String(i)));
  cards.forEach((c, i) => {
    if (first) { c.classList.remove("in"); c.style.transitionDelay = `${i * 70}ms`; io.observe(c); }
    else c.classList.add("in");
  });
  if (first && !live && window.innerWidth <= 860) out.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* hover on charts */
const sc = $<HTMLCanvasElement>("reg-canvas");
sc.addEventListener("pointermove", (e) => {
  if (!lastReg) return;
  const rc = sc.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
  let best = -1, bd = 18;
  (hits.get(sc) ?? []).forEach((pt, i) => { const d = Math.hypot(pt.px - mx, pt.py - my); if (d < bd) { bd = d; best = i; } });
  if (best !== regHover) { regHover = best; animId++; drawScatter(sc, lastReg.x, lastReg.y, lastReg.r.a, lastReg.r.b, 1, regHover); }
});
sc.addEventListener("pointerleave", () => { regHover = -1; if (lastReg) drawScatter(sc, lastReg.x, lastReg.y, lastReg.r.a, lastReg.r.b, 1, -1); });
const nc = $<HTMLCanvasElement>("hyp-canvas");
nc.addEventListener("pointermove", (e) => {
  const g = geom.get(nc); if (!lastZ || !g) return;
  zHover = ((e.clientX - nc.getBoundingClientRect().left - g.left) / g.width) * 2 * g.L - g.L; animId++;
  drawNormal(nc, lastZ, 1, zHover);
});
nc.addEventListener("pointerleave", () => { zHover = null; if (lastZ) drawNormal(nc, lastZ, 1, null); });

/* live mode: results update while typing */
function debounce(fn: () => void, ms: number) { let t = 0; return () => { clearTimeout(t); t = window.setTimeout(fn, ms); }; }
const liveReg = debounce(() => {
  if (!val("x-input") || !val("y-input")) return;
  live = true; $<HTMLFormElement>("reg-form").requestSubmit(); live = false;
}, 450);
["x-input", "y-input", "predict-x"].forEach((id) => $(id).addEventListener("input", liveReg));
const liveHyp = debounce(() => {
  if (["mu0", "xbar", "sigma", "n"].some((id) => !val(id))) return;
  live = true; $<HTMLFormElement>("hyp-form").requestSubmit(); live = false;
}, 450);
["h0", "h1", "tail", "alpha", "alpha-custom", "mu0", "xbar", "sigma", "n"].forEach((id) => { $(id).addEventListener("input", liveHyp); $(id).addEventListener("change", liveHyp); });

/* sample buttons run the analysis straight away */
$("reg-sample").addEventListener("click", () => $<HTMLFormElement>("reg-form").requestSubmit());
$("hyp-sample").addEventListener("click", () => $<HTMLFormElement>("hyp-form").requestSubmit());

/* tab indicator, theme, progress bar, back-to-top, ripple, card spotlight */
function moveInk() {
  const t = document.querySelector<HTMLElement>('.tabs [aria-selected="true"]')!;
  const ink = $("ink"); ink.style.width = `${t.offsetWidth}px`; ink.style.transform = `translateX(${t.offsetLeft}px)`;
}
window.addEventListener("resize", moveInk); moveInk();

const root = document.documentElement;
try { const saved = localStorage.getItem("advstat-theme"); if (saved) root.dataset.theme = saved; } catch { /* storage unavailable */ }
const themeBtn = $("theme");
const syncTheme = () => (themeBtn.textContent = root.dataset.theme === "dark" ? "Light mode" : "Dark mode");
syncTheme();
themeBtn.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("advstat-theme", root.dataset.theme); } catch { /* ignore */ }
  syncTheme(); redraw();
});

const bar = $("progress"), topBtn = $("top");
window.addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  bar.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
  topBtn.classList.toggle("show", window.scrollY > 500);
}, { passive: true });
topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const rc = b.getBoundingClientRect(), size = Math.max(rc.width, rc.height), dot = document.createElement("span");
  dot.className = "ripple"; dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rc.left - size / 2}px;top:${e.clientY - rc.top - size / 2}px`;
  b.appendChild(dot); setTimeout(() => dot.remove(), 650);
});
document.addEventListener("pointermove", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>(".card"); if (!c) return;
  const rc = c.getBoundingClientRect(); c.style.setProperty("--mx", `${e.clientX - rc.left}px`); c.style.setProperty("--my", `${e.clientY - rc.top}px`);
});

/* ================= Start screen ================= */
const startEl = $("start"), appEl = $("app");
let started = false;
function enterApp() {
  if (started) return;
  started = true;
  appEl.hidden = false; appEl.classList.add("entering");
  startEl.classList.add("leaving");
  window.scrollTo({ top: 0 });
  moveInk(); redraw();
  setTimeout(() => { startEl.hidden = true; appEl.classList.remove("entering"); moveInk(); }, reduce ? 0 : 950);
}
function goHome() {
  started = false;
  startEl.hidden = false; void startEl.offsetWidth;
  startEl.classList.remove("leaving");
  window.scrollTo({ top: 0 });
  setTimeout(() => { if (!started) appEl.hidden = true; }, reduce ? 0 : 950);
  $("start-btn").focus();
}
$("home").addEventListener("click", goHome);
$("start-btn").focus();

/* ================= Accounts ================= */
const authEl = $("auth"), pwModal = $("pw-modal");
let currentUser: User | null = null;

function setWho() { $("who").textContent = currentUser ? `Hi, ${currentUser.name.split(" ")[0]}` : ""; }
function fail(id: string, msg: string | null) { const el = $(id); el.hidden = msg === null; el.textContent = msg ?? ""; }
async function busy(btn: HTMLButtonElement, work: () => Promise<void>) {
  btn.disabled = true; btn.style.opacity = ".7";
  try { await work(); } finally { btn.disabled = false; btn.style.opacity = ""; }
}

async function onStart() {
  if (started || !authEl.hidden) return;
  const me = await getMe();
  if (me) { currentUser = me; setWho(); enterApp(); } else openAuth("login");
}
function openAuth(mode: "login" | "register") {
  authEl.hidden = false; authEl.style.animation = "none"; void authEl.offsetWidth; authEl.style.animation = "";
  showMode(mode);
  $(mode === "login" ? "li-email" : "rg-name").focus();
}
function showMode(mode: "login" | "register") {
  const login = mode === "login";
  $("login-form").hidden = !login; $("register-form").hidden = login;
  $("at-login").setAttribute("aria-selected", String(login)); $("at-reg").setAttribute("aria-selected", String(!login));
  $("auth-title").textContent = login ? "Welcome back" : "Create your account";
  $("auth-sub").textContent = login ? "Log in to open the workbench." : "It takes a few seconds.";
  fail("li-error", null); fail("rg-error", null);
  const ink = $("auth-ink"), t = $(login ? "at-login" : "at-reg");
  ink.style.width = `${t.offsetWidth}px`; ink.style.transform = `translateX(${t.offsetLeft}px)`;
}
function finishAuth(user: User) {
  currentUser = user; setWho();
  ["li-pw", "rg-pw", "rg-pw2"].forEach((id) => ($<HTMLInputElement>(id).value = ""));
  authEl.hidden = true; enterApp();
}

$("start-btn").addEventListener("click", onStart);
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !started && authEl.hidden && !startEl.hidden) { e.preventDefault(); onStart(); } });
$("at-login").addEventListener("click", () => showMode("login"));
$("at-reg").addEventListener("click", () => showMode("register"));
$("auth-back").addEventListener("click", () => { authEl.hidden = true; $("start-btn").focus(); });

$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = val("li-email"), pw = $<HTMLInputElement>("li-pw").value;
  if (!email || !pw) return fail("li-error", "Enter your email and password.");
  fail("li-error", null);
  busy(e.submitter as HTMLButtonElement, async () => {
    try { finishAuth(await login(email, pw)); } catch (err) { fail("li-error", (err as Error).message); }
  });
});

$("register-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = val("rg-name"), email = val("rg-email"), pw = $<HTMLInputElement>("rg-pw").value, pw2 = $<HTMLInputElement>("rg-pw2").value;
  if (name.length < 2) return fail("rg-error", "Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("rg-error", "Enter a valid email address.");
  const problem = passwordProblem(pw);
  if (problem) return fail("rg-error", problem);
  if (pw !== pw2) return fail("rg-error", "The two passwords do not match.");
  fail("rg-error", null);
  busy(e.submitter as HTMLButtonElement, async () => {
    try { finishAuth(await register(name, email, pw)); } catch (err) { fail("rg-error", (err as Error).message); }
  });
});

const meter = (inputId: string, barId: string) => $(inputId).addEventListener("input", () => ($(barId).style.width = `${passwordScore($<HTMLInputElement>(inputId).value) * 100}%`));
meter("rg-pw", "rg-meter"); meter("pw-new", "pw-meter");

document.querySelectorAll<HTMLInputElement>("input[data-show]").forEach((box) =>
  box.addEventListener("change", () => $(box.dataset.show!).querySelectorAll<HTMLInputElement>("input.pw, input[autocomplete$='password']").forEach((i) => (i.type = box.checked ? "text" : "password"))));

/* change password */
function closePw() { pwModal.hidden = true; $<HTMLFormElement>("pw-form").reset(); $("pw-meter").style.width = "0"; fail("pw-error", null); $("pw-ok").hidden = true; }
$("pw-open").addEventListener("click", () => { closePw(); pwModal.hidden = false; $("pw-cur").focus(); });
$("pw-cancel").addEventListener("click", closePw);
pwModal.addEventListener("click", (e) => { if (e.target === pwModal) closePw(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pwModal.hidden) closePw(); });

$("pw-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const cur = $<HTMLInputElement>("pw-cur").value, n1 = $<HTMLInputElement>("pw-new").value, n2 = $<HTMLInputElement>("pw-new2").value;
  $("pw-ok").hidden = true;
  if (!cur) return fail("pw-error", "Enter your current password.");
  const problem = passwordProblem(n1);
  if (problem) return fail("pw-error", problem);
  if (n1 === cur) return fail("pw-error", "New password must be different from the current one.");
  if (n1 !== n2) return fail("pw-error", "The new passwords do not match.");
  fail("pw-error", null);
  busy(e.submitter as HTMLButtonElement, async () => {
    try {
      await changePassword(cur, n1);
      $<HTMLFormElement>("pw-form").reset(); $("pw-meter").style.width = "0";
      const ok = $("pw-ok"); ok.textContent = "Password updated. Other devices have been signed out."; ok.hidden = false;
      setTimeout(() => { if (!ok.hidden) closePw(); }, 1800);
    } catch (err) { fail("pw-error", (err as Error).message); }
  });
});

/* log out */
$("logout").addEventListener("click", async () => {
  try { await logout(); } catch { /* cookie will expire on its own */ }
  currentUser = null; setWho(); closePw();
  $("reg-clear").click(); $("hyp-clear").click();
  goHome();
});
