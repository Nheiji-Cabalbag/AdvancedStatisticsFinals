import { normPdf, normCdf, type ZTestResult } from "./stats";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export interface Pt { px: number; py: number; x: number; y: number; fit: number }
export const hits = new WeakMap<HTMLCanvasElement, Pt[]>();
export const geom = new WeakMap<HTMLCanvasElement, { L: number; left: number; width: number }>();

function setup(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600, h = canvas.clientHeight || 360;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "12px system-ui, sans-serif";
  return { ctx, w, h };
}

function niceTicks(min: number, max: number, target = 6): number[] {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const t: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return t;
}
const fmt = (v: number) => (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(+v.toPrecision(6)));

function tip(ctx: CanvasRenderingContext2D, w: number, x: number, y: number, lines: string[]) {
  const wd = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20, ht = lines.length * 18 + 12;
  const tx = clamp(x - wd / 2, 4, w - wd - 4), ty = Math.max(4, y - ht - 14);
  const g = ctx.createLinearGradient(tx, ty, tx + wd, ty + ht);
  g.addColorStop(0, "#6674f0"); g.addColorStop(1, "#e879b9");
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(tx, ty, wd, ht, 10); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, tx + 10, ty + 15 + i * 18));
}

export function drawScatter(canvas: HTMLCanvasElement, x: number[], y: number[], a: number, b: number, p = 1, hover = -1) {
  const { ctx, w, h } = setup(canvas);
  const INK = css("--ink"), MUTED = css("--muted"), GRID = css("--line");
  const pad = { l: 52, r: 18, t: 14, b: 40 };
  const xmin = Math.min(...x), xmax = Math.max(...x), ymin = Math.min(...y), ymax = Math.max(...y);
  const xs = (xmax - xmin || 1) * 0.08, ys = (ymax - ymin || 1) * 0.12;
  const X0 = xmin - xs, X1 = xmax + xs;
  const Y0 = Math.min(ymin, a + b * xmin, a + b * xmax) - ys, Y1 = Math.max(ymax, a + b * xmin, a + b * xmax) + ys;
  const sx = (v: number) => pad.l + ((v - X0) / (X1 - X0)) * (w - pad.l - pad.r);
  const sy = (v: number) => h - pad.b - ((v - Y0) / (Y1 - Y0)) * (h - pad.t - pad.b);

  ctx.strokeStyle = GRID; ctx.fillStyle = MUTED; ctx.lineWidth = 1;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const t of niceTicks(X0, X1)) { ctx.beginPath(); ctx.moveTo(sx(t), pad.t); ctx.lineTo(sx(t), h - pad.b); ctx.stroke(); ctx.fillText(fmt(t), sx(t), h - pad.b + 6); }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const t of niceTicks(Y0, Y1)) { ctx.beginPath(); ctx.moveTo(pad.l, sy(t)); ctx.lineTo(w - pad.r, sy(t)); ctx.stroke(); ctx.fillText(fmt(t), pad.l - 8, sy(t)); }
  ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText("X", pad.l + (w - pad.l - pad.r) / 2, h - 6);
  ctx.save(); ctx.translate(14, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Y", 0, 0); ctx.restore();

  // regression line draws in from the left, with a gradient stroke
  const e = ease(p), xe = X0 + (X1 - X0) * e;
  const lg = ctx.createLinearGradient(sx(X0), 0, sx(X1), 0);
  lg.addColorStop(0, "#06b6d4"); lg.addColorStop(0.5, "#a855f7"); lg.addColorStop(1, "#ec4899");
  ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); ctx.clip();
  ctx.strokeStyle = lg; ctx.lineWidth = 3.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(sx(X0), sy(a + b * X0)); ctx.lineTo(sx(xe), sy(a + b * xe)); ctx.stroke();
  ctx.restore();

  const pts: Pt[] = x.map((xv, i) => ({ px: sx(xv), py: sy(y[i]), x: xv, y: y[i], fit: a + b * xv }));
  hits.set(canvas, pts);
  pts.forEach((pt, i) => {
    const r = 6.5 * ease(p * 1.6 - (i / pts.length) * 0.6) * (i === hover ? 1.6 : 1);
    if (r <= 0) return;
    ctx.save();
    if (i === hover) { ctx.shadowColor = "#a855f7"; ctx.shadowBlur = 18; ctx.strokeStyle = "#ec4899"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(pt.px, pt.py); ctx.lineTo(pt.px, sy(pt.fit)); ctx.stroke(); ctx.setLineDash([]); }
    const g = ctx.createRadialGradient(pt.px - 2, pt.py - 2, 1, pt.px, pt.py, r);
    g.addColorStop(0, "#c7d2fe"); g.addColorStop(1, "#6f7df5");
    ctx.fillStyle = g; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pt.px, pt.py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  if (hover >= 0 && pts[hover]) { const q = pts[hover]; tip(ctx, w, q.px, q.py - 8, [`X = ${fmt(q.x)}, Y = ${fmt(q.y)}`, `Line predicts ${fmt(+q.fit.toFixed(4))}`, `Residual ${fmt(+(q.y - q.fit).toFixed(4))}`]); }
}

export function drawNormal(canvas: HTMLCanvasElement, r: ZTestResult, p = 1, hoverZ: number | null = null) {
  const { ctx, w, h } = setup(canvas);
  const INK = css("--ink"), MUTED = css("--muted");
  const pad = { l: 16, r: 16, t: 34, b: 44 };
  const L = Math.min(8, Math.max(4, Math.ceil(Math.abs(r.z) + 0.5), Math.ceil(Math.max(Math.abs(r.criticalLow ?? 0), Math.abs(r.criticalHigh ?? 0)) + 1)));
  geom.set(canvas, { L, left: pad.l, width: w - pad.l - pad.r });
  const sx = (v: number) => pad.l + ((v + L) / (2 * L)) * (w - pad.l - pad.r);
  const sy = (v: number) => h - pad.b - (v / 0.42) * (h - pad.t - pad.b);
  const lo = r.criticalLow, hi = r.criticalHigh;

  const area = (from: number, to: number, c0: string, c1: string) => {
    const g = ctx.createLinearGradient(0, sy(0.4), 0, sy(0));
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.beginPath(); ctx.moveTo(sx(from), sy(0));
    for (let i = 0; i <= 160; i++) { const z = from + ((to - from) * i) / 160; ctx.lineTo(sx(z), sy(normPdf(z))); }
    ctx.lineTo(sx(to), sy(0)); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx(-L) + (sx(L) - sx(-L)) * ease(p), h); ctx.clip();
  area(lo ?? -L, hi ?? L, "rgba(16,185,129,.7)", "rgba(6,182,212,.15)");
  if (lo !== null) area(-L, lo, "rgba(244,63,94,.85)", "rgba(249,115,22,.25)");
  if (hi !== null) area(hi, L, "rgba(244,63,94,.85)", "rgba(249,115,22,.25)");
  const cg = ctx.createLinearGradient(sx(-L), 0, sx(L), 0);
  cg.addColorStop(0, "#06b6d4"); cg.addColorStop(0.5, "#a855f7"); cg.addColorStop(1, "#ec4899");
  ctx.strokeStyle = cg; ctx.lineWidth = 3; ctx.beginPath();
  for (let i = 0; i <= 300; i++) { const z = -L + (2 * L * i) / 300; i ? ctx.lineTo(sx(z), sy(normPdf(z))) : ctx.moveTo(sx(z), sy(normPdf(z))); }
  ctx.stroke(); ctx.restore();

  ctx.strokeStyle = MUTED; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx(-L), sy(0)); ctx.lineTo(sx(L), sy(0)); ctx.stroke();
  ctx.fillStyle = MUTED; ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let t = -L; t <= L; t++) { ctx.beginPath(); ctx.moveTo(sx(t), sy(0)); ctx.lineTo(sx(t), sy(0) + 5); ctx.stroke(); ctx.fillText(String(t), sx(t), sy(0) + 8); }

  ctx.globalAlpha = clamp((p - 0.6) / 0.4);
  const mark = (z: number, text: string, color: string, lw: number, up: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(lw > 2 ? [] : [5, 4]);
    ctx.beginPath(); ctx.moveTo(sx(z), sy(0)); ctx.lineTo(sx(z), sy(0.4)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
    ctx.fillText(text, sx(z), sy(0.4) - 5 - up);
  };
  if (lo !== null) mark(lo, lo.toFixed(3), "#f43f5e", 1.5, 0);
  if (hi !== null) mark(hi, "+" + hi.toFixed(3), "#f43f5e", 1.5, 0);
  mark(clamp(r.z, -L, L), `Z = ${r.z.toFixed(3)}`, INK, 3, 16);
  ctx.globalAlpha = 1;

  if (hoverZ !== null) {
    const hz = clamp(hoverZ, -L, L);
    ctx.strokeStyle = "#a855f7"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx(hz), sy(0)); ctx.lineTo(sx(hz), sy(normPdf(hz))); ctx.stroke();
    ctx.fillStyle = "#a855f7"; ctx.beginPath(); ctx.arc(sx(hz), sy(normPdf(hz)), 5, 0, Math.PI * 2); ctx.fill();
    tip(ctx, w, sx(hz), sy(normPdf(hz)), [`z = ${hz.toFixed(2)}`, `Area to the left = ${normCdf(hz).toFixed(4)}`]);
  }
}
