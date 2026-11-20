/**
 * Astro Match Phase 1 unit tests (no database needed).
 * Run: npm run test:astro
 */
import { computeCompatibility } from "../services/astro/compatibility";
import { SIGNS, parseCalendarDate, sunSignFromDate } from "../services/astro/zodiac";
import { validateBirthDetails, validateDob } from "../validation/astro.validation";
import { validateUpdateProfileInput } from "../validation/profile.validation";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ FAIL: ${name}${detail ? `\n   ${detail}` : ""}`);
  }
}

function throws(fn: () => unknown, name: string, messagePart?: string) {
  try {
    fn();
    assert(false, name, "expected an error, none thrown");
  } catch (error) {
    const message = (error as Error).message;
    assert(!messagePart || message.includes(messagePart), name, `got: ${message}`);
  }
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// ── 1. Sun sign boundaries (first and last day of each sign) ──
const boundaries: Array<[number, number, string]> = [
  [1, 1, "capricorn"], [1, 19, "capricorn"], [1, 20, "aquarius"],
  [2, 18, "aquarius"], [2, 19, "pisces"], [3, 20, "pisces"],
  [3, 21, "aries"], [4, 19, "aries"], [4, 20, "taurus"],
  [5, 20, "taurus"], [5, 21, "gemini"], [6, 20, "gemini"],
  [6, 21, "cancer"], [7, 22, "cancer"], [7, 23, "leo"],
  [8, 22, "leo"], [8, 23, "virgo"], [9, 22, "virgo"],
  [9, 23, "libra"], [10, 22, "libra"], [10, 23, "scorpio"],
  [11, 21, "scorpio"], [11, 22, "sagittarius"], [12, 21, "sagittarius"],
  [12, 22, "capricorn"], [12, 31, "capricorn"], [2, 29, "pisces"],
];
for (const [m, d, expected] of boundaries) {
  const year = m === 2 && d === 29 ? 2000 : 1995;
  const actual = sunSignFromDate(utc(year, m, d));
  assert(actual === expected, `sun sign ${m}/${d}`, `expected ${expected}, got ${actual}`);
}

// ── 2. DOB parsing must not shift the calendar day ──
const dobInputs = [
  "2000-03-21",
  "2000-03-21T00:00:00.000",
  "2000-03-21T00:00:00.000Z",
  "2000-03-21T00:00:00.000+05:30",
  "2000-03-21T23:59:59.000-08:00",
];
for (const input of dobInputs) {
  const parsed = parseCalendarDate(input);
  assert(
    parsed?.toISOString() === "2000-03-21T00:00:00.000Z",
    `parseCalendarDate(${input})`,
    `got ${parsed?.toISOString()}`,
  );
}
assert(parseCalendarDate("2001-02-30") === null, "rejects 2001-02-30");
assert(parseCalendarDate("not-a-date") === null, "rejects garbage");
assert(parseCalendarDate("") === null, "rejects empty string");

// ── 3. All 144 sign combinations (QA 1 + QA 4) ──
const matrix: Record<string, number> = {};
for (const a of SIGNS) {
  for (const b of SIGNS) {
    const ab = computeCompatibility(a, b);
    const ba = computeCompatibility(b, a);
    const again = computeCompatibility(a, b);
    const tag = `${a}+${b}`;
    matrix[tag] = ab.score;

    assert(Number.isInteger(ab.score) && ab.score >= 0 && ab.score <= 100, `${tag} score in 0-100`);
    assert(ab.score === ba.score, `${tag} symmetric`, `${ab.score} vs ${ba.score}`);
    assert(JSON.stringify(ab) === JSON.stringify(ba), `${tag} full result symmetric`);
    assert(JSON.stringify(ab) === JSON.stringify(again), `${tag} deterministic`);
    assert(ab.strengths.length >= 1, `${tag} has a strength`);
    assert(ab.challenges.length >= 1, `${tag} has a challenge`);
    assert(ab.strengths.every((t) => t.label !== t.key), `${tag} strength labels exist`);
    assert(ab.challenges.every((t) => t.label !== t.key), `${tag} challenge labels exist`);
  }
}
// Sanity on the ordering astrology would expect.
assert(matrix["aries+leo"] > matrix["aries+cancer"], "trine beats square");
assert(matrix["aries+gemini"] > matrix["aries+virgo"], "sextile beats quincunx");

// ── 4. DOB validation (B1, B10) ──
const now = utc(2026, 11, 20);
assert(validateDob("2000-03-21", now).toISOString() === "2000-03-21T00:00:00.000Z", "valid DOB");
assert(validateDob("2008-11-20", now).getUTCFullYear() === 2008, "exactly 18 today is allowed");
throws(() => validateDob("2008-11-21", now), "one day under 18 rejected", "18");
throws(() => validateDob("2030-01-01", now), "future DOB rejected", "future");
throws(() => validateDob("1899-12-31", now), "pre-1900 DOB rejected", "1900");
throws(() => validateDob("31/12/1999", now), "wrong format rejected", "YYYY-MM-DD");
throws(() => validateDob(undefined, now), "missing DOB rejected");

// ── 5. Birth time / place validation (B2, B3, B10) ──
const t = validateBirthDetails({ birthTime: "14:30" });
assert(t.birthTime === "14:30" && t.birthTimeKnown === true, "valid birthTime sets known=true");
const cleared = validateBirthDetails({ birthTimeKnown: false });
assert(cleared.birthTime === null && cleared.birthTimeKnown === false, "known=false clears time");
const nullTime = validateBirthDetails({ birthTime: null });
assert(nullTime.birthTime === null && nullTime.birthTimeKnown === false, "null birthTime clears");
throws(() => validateBirthDetails({ birthTime: "25:00" }), "25:00 rejected", "HH:mm");
throws(() => validateBirthDetails({ birthTime: "2:30" }), "2:30 rejected", "HH:mm");
throws(() => validateBirthDetails({ birthTime: "14:30", birthTimeKnown: false }), "contradiction rejected");
throws(() => validateBirthDetails({ birthTimeKnown: true }), "known=true without time rejected");

const place = validateBirthDetails({
  birthPlace: { name: "Mumbai, India", latitude: 19.076, longitude: 72.8777, timezone: "Asia/Kolkata" },
});
assert(
  JSON.stringify(place.birthPlace) ===
    JSON.stringify({ name: "Mumbai, India", latitude: 19.076, longitude: 72.8777, timezone: "Asia/Kolkata" }),
  "valid birthPlace stored",
);
assert(validateBirthDetails({ birthPlace: null }).birthPlace === null, "null birthPlace clears");
throws(() => validateBirthDetails({ birthPlace: { name: "X", latitude: 95, longitude: 0, timezone: "UTC" } }), "lat 95 rejected", "range");
throws(() => validateBirthDetails({ birthPlace: { name: "X", latitude: 1, longitude: 1, timezone: "Mars/Base" } }), "bad timezone rejected", "IANA");
throws(() => validateBirthDetails({ birthPlace: { name: "X" } }), "incomplete birthPlace rejected", "missing");
throws(() => validateBirthDetails({ birthPlace: "Mumbai" }), "string birthPlace rejected");
assert(Object.keys(validateBirthDetails({ name: "x" })).length === 0, "no birth fields -> no updates");

// ── 6. Profile update wiring ──
const withDob = validateUpdateProfileInput({ dob: "1995-08-01", starSign: "Pisces" });
assert(withDob["astro.sunSign"] === "leo", "profile DOB derives sunSign");
assert(withDob.starSign === "Leo", "profile DOB overrides hand-picked starSign");
const starOnly = validateUpdateProfileInput({ bio: "hi", starSign: "Pisces" });
assert(starOnly.starSign === undefined, "starSign without DOB is ignored");

// ── Report ──
console.log("\nScore matrix (rows x columns):");
const short = SIGNS.map((s) => s.slice(0, 3));
console.log("     " + short.map((s) => s.padStart(4)).join(""));
for (const a of SIGNS) {
  console.log(a.slice(0, 3).padEnd(5) + SIGNS.map((b) => String(matrix[`${a}+${b}`]).padStart(4)).join(""));
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
