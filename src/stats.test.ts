import { linearRegression, normCdf, normInv, zTest, strengthOf } from "./stats";

let failed = 0;
function close(name: string, got: number, want: number, tol = 1e-4) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${want}`);
}

close("Φ(1.96)", normCdf(1.96), 0.9750021);
close("Φ(0)", normCdf(0), 0.5);
close("Φ(-1.645)", normCdf(-1.645), 0.0499849);
close("z(0.975)", normInv(0.975), 1.959964);
close("z(0.95)", normInv(0.95), 1.644854);
close("z(0.995)", normInv(0.995), 2.575829);
close("z(0.01)", normInv(0.01), -2.326348);

const reg = linearRegression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
close("slope b", reg.b, 0.6);
close("intercept a", reg.a, 2.2);
close("r", reg.r, 0.774597);

const perfect = linearRegression([1, 2, 3], [2, 4, 6]);
close("perfect r", perfect.r, 1);
console.log(strengthOf(0.55), strengthOf(-0.95), strengthOf(0.1));

const t = zTest({ sampleMean: 52, mu0: 50, sigma: 5, n: 36, alpha: 0.05, tail: "two" });
close("z stat", t.z, 2.4);
close("two-tail p", t.pValue, 0.016395);
console.log("reject:", t.reject);

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log("\nAll tests passed");
