// Pure statistics functions (no DOM) so they can be tested and explained in the paper.

/* ---------- Parsing ---------- */
export function parseNumbers(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter((t) => t.length > 0)
    .map((t) => Number(t));
}

/* ---------- Simple Linear Regression ---------- */
export interface RegressionResult {
  n: number;
  sumX: number;
  sumY: number;
  sumXY: number;
  sumX2: number;
  sumY2: number;
  meanX: number;
  meanY: number;
  a: number; // intercept
  b: number; // slope
  r: number; // Pearson correlation coefficient
  r2: number; // coefficient of determination
  strength: string;
  direction: string;
}

export function strengthOf(r: number): string {
  const v = Math.abs(r);
  if (v >= 0.9) return "Very strong";
  if (v >= 0.7) return "Strong";
  if (v >= 0.4) return "Moderate";
  if (v >= 0.2) return "Weak";
  return "Very weak or none";
}

export function linearRegression(x: number[], y: number[]): RegressionResult {
  if (x.length !== y.length) throw new Error(`X has ${x.length} values but Y has ${y.length}. They must match.`);
  const n = x.length;
  if (n < 2) throw new Error("Enter at least 2 data points.");
  if ([...x, ...y].some((v) => !Number.isFinite(v))) throw new Error("Some values are not numbers. Use digits only, separated by commas, spaces or new lines.");

  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const sumY2 = y.reduce((s, v) => s + v * v, 0);

  const denomX = n * sumX2 - sumX * sumX;
  const denomY = n * sumY2 - sumY * sumY;
  if (denomX === 0) throw new Error("All X values are the same, so a regression line cannot be computed.");
  if (denomY === 0) throw new Error("All Y values are the same, so the correlation cannot be computed.");

  const b = (n * sumXY - sumX * sumY) / denomX;
  const meanX = sumX / n;
  const meanY = sumY / n;
  const a = meanY - b * meanX;
  const r = (n * sumXY - sumX * sumY) / Math.sqrt(denomX * denomY);

  return {
    n, sumX, sumY, sumXY, sumX2, sumY2, meanX, meanY, a, b, r,
    r2: r * r,
    strength: strengthOf(r),
    direction: Math.abs(r) < 0.2 ? "no clear direction" : r > 0 ? "positive" : "negative",
  };
}

/* ---------- Normal distribution ---------- */
export function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF (Hart's algorithm, double precision)
export function normCdf(x: number): number {
  const xa = Math.abs(x);
  let c: number;
  if (xa > 37) {
    c = 0;
  } else {
    const e = Math.exp((-xa * xa) / 2);
    if (xa < 7.07106781186547) {
      let b = 0.0352624965998911 * xa + 0.700383064443688;
      b = b * xa + 6.37396220353165;
      b = b * xa + 33.912866078383;
      b = b * xa + 112.079291497871;
      b = b * xa + 221.213596169931;
      b = b * xa + 220.206867912376;
      c = e * b;
      let d = 0.0883883476483184 * xa + 1.75566716318264;
      d = d * xa + 16.064177579207;
      d = d * xa + 86.7807322029461;
      d = d * xa + 296.564248779674;
      d = d * xa + 637.333633378831;
      d = d * xa + 793.826512519948;
      d = d * xa + 440.413735824752;
      c = c / d;
    } else {
      let b = xa + 0.65;
      b = xa + 4 / b;
      b = xa + 3 / b;
      b = xa + 2 / b;
      b = xa + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

// Inverse standard normal CDF (Acklam's approximation + one Newton refinement)
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error("p must be between 0 and 1 (exclusive).");
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/* ---------- Z hypothesis test ---------- */
export type Tail = "two" | "left" | "right";

export interface ZTestInput {
  sampleMean: number;
  mu0: number;
  sigma: number;
  n: number;
  alpha: number;
  tail: Tail;
}

export interface ZTestResult extends ZTestInput {
  standardError: number;
  z: number;
  criticalLow: number | null; // reject if z <= criticalLow
  criticalHigh: number | null; // reject if z >= criticalHigh
  pValue: number;
  reject: boolean;
}

export function zTest(input: ZTestInput): ZTestResult {
  const { sampleMean, mu0, sigma, n, alpha, tail } = input;
  if (![sampleMean, mu0, sigma, n, alpha].every(Number.isFinite)) throw new Error("Fill in every number field.");
  if (sigma <= 0) throw new Error("Population standard deviation (σ) must be greater than 0.");
  if (n < 1 || !Number.isInteger(n)) throw new Error("Sample size (n) must be a whole number of at least 1.");
  if (!(alpha > 0 && alpha < 1)) throw new Error("Alpha must be between 0 and 1.");

  const standardError = sigma / Math.sqrt(n);
  const z = (sampleMean - mu0) / standardError;

  let criticalLow: number | null = null;
  let criticalHigh: number | null = null;
  let pValue: number;
  if (tail === "two") {
    criticalHigh = normInv(1 - alpha / 2);
    criticalLow = -criticalHigh;
    pValue = 2 * (1 - normCdf(Math.abs(z)));
  } else if (tail === "right") {
    criticalHigh = normInv(1 - alpha);
    pValue = 1 - normCdf(z);
  } else {
    criticalLow = normInv(alpha);
    pValue = normCdf(z);
  }
  const reject = (criticalLow !== null && z <= criticalLow) || (criticalHigh !== null && z >= criticalHigh);
  return { ...input, standardError, z, criticalLow, criticalHigh, pValue, reject };
}

/** Reference Z-table of common alpha levels. */
export function criticalTable(alphas: number[] = [0.1, 0.05, 0.025, 0.01, 0.005, 0.001]) {
  return alphas.map((alpha) => ({
    alpha,
    oneTailed: normInv(1 - alpha),
    twoTailed: normInv(1 - alpha / 2),
  }));
}
