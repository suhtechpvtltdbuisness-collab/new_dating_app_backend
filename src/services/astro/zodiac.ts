/**
 * Pure zodiac helpers (B5). No database access, so they're easy to unit-test.
 *
 * All date math uses UTC getters: `dob` is stored as UTC midnight of the birth
 * calendar date, so local-time getters would shift the day on servers that are
 * not running in UTC.
 */

export const SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

export type Sign = (typeof SIGNS)[number];
export type Element = "fire" | "earth" | "air" | "water";
export type Modality = "cardinal" | "fixed" | "mutable";

const ELEMENTS: Element[] = ["fire", "earth", "air", "water"];
const MODALITIES: Modality[] = ["cardinal", "fixed", "mutable"];

/**
 * Tropical sun-sign start dates as [month (1-12), day].
 * Index matches SIGNS. Day-level cusp ambiguity (sun moves sign at a specific
 * time on these days) is accepted for sun-sign-only scoring.
 */
export const SIGN_START: ReadonlyArray<readonly [number, number]> = [
  [3, 21], // aries
  [4, 20], // taurus
  [5, 21], // gemini
  [6, 21], // cancer
  [7, 23], // leo
  [8, 23], // virgo
  [9, 23], // libra
  [10, 23], // scorpio
  [11, 22], // sagittarius
  [12, 22], // capricorn
  [1, 20], // aquarius
  [2, 19], // pisces
];

export function signIndex(sign: Sign): number {
  return SIGNS.indexOf(sign);
}

export function elementOf(sign: Sign): Element {
  return ELEMENTS[signIndex(sign) % 4];
}

export function modalityOf(sign: Sign): Modality {
  return MODALITIES[signIndex(sign) % 3];
}

/** "aries" -> "Aries" (the format the app's starSign picker uses). */
export function displaySign(sign: Sign): string {
  return sign.charAt(0).toUpperCase() + sign.slice(1);
}

export function isSign(value: unknown): value is Sign {
  return typeof value === "string" && (SIGNS as readonly string[]).includes(value);
}

/** Sun sign for a birth date (read with UTC getters). */
export function sunSignFromDate(date: Date): Sign {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const mmdd = month * 100 + day;

  // Walk the signs from the latest start date in the calendar year backwards.
  // Capricorn (Dec 22) wraps the year end, so it's also the fallback for early January.
  let result: Sign = "capricorn";
  let best = -1;
  SIGN_START.forEach(([m, d], index) => {
    const start = m * 100 + d;
    if (start <= mmdd && start > best) {
      best = start;
      result = SIGNS[index];
    }
  });
  return result;
}

/**
 * Parses a birth date into UTC midnight of the intended calendar date.
 *
 * Clients send DOB in several shapes ("2000-03-21", "2000-03-21T00:00:00.000",
 * "2000-03-21T00:00:00.000+05:30"). `new Date()` reads the timezone-less form as
 * server-local time, which can move the date by a day. When the string starts with
 * YYYY-MM-DD we trust that calendar date as written.
 */
export function parseCalendarDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  if (typeof value !== "string" && typeof value !== "number") return null;

  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    // Reject rollovers such as 2001-02-30 -> 2001-03-02.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}
