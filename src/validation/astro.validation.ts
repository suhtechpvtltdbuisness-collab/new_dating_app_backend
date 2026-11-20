import { AuthError } from "../errors/AuthError";
import { displaySign, parseCalendarDate, sunSignFromDate } from "../services/astro/zodiac";

const MIN_AGE = 18;
const MIN_YEAR = 1900;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * B1 + B10: parses and checks a date of birth.
 * Returns UTC midnight of the birth calendar date.
 */
export function validateDob(value: unknown, now: Date = new Date()): Date {
  const dob = parseCalendarDate(value);
  if (!dob) {
    throw new AuthError("Invalid date of birth. Use YYYY-MM-DD", 400);
  }
  if (dob.getUTCFullYear() < MIN_YEAR) {
    throw new AuthError(`Date of birth must be after ${MIN_YEAR}`, 400);
  }
  if (dob.getTime() > now.getTime()) {
    throw new AuthError("Date of birth cannot be in the future", 400);
  }
  const eighteenth = new Date(
    Date.UTC(dob.getUTCFullYear() + MIN_AGE, dob.getUTCMonth(), dob.getUTCDate()),
  );
  if (eighteenth.getTime() > now.getTime()) {
    throw new AuthError(`You must be at least ${MIN_AGE} years old`, 400);
  }
  return dob;
}

/** Fields that should always be written together with a new DOB. */
export function dobDerivedFields(dob: Date): Record<string, unknown> {
  const sign = sunSignFromDate(dob);
  return {
    dob,
    "astro.sunSign": sign,
    // Keep the existing free-text starSign (used by discovery filters) consistent with DOB.
    starSign: displaySign(sign),
  };
}

/**
 * B2 + B3 + B10: validates optional birth time / birth place fields on a profile update.
 * Returns a Mongo update fragment (dotted paths), or {} when no birth fields were sent.
 *
 * Accepted payload:
 *   birthTime: "HH:mm" | null            (null clears it)
 *   birthTimeKnown: boolean              (false clears birthTime)
 *   birthPlace: { name, latitude, longitude, timezone } | null
 */
export function validateBirthDetails(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (payload.birthTime !== undefined) {
    if (payload.birthTime === null || payload.birthTime === "") {
      updates.birthTime = null;
      updates.birthTimeKnown = false;
    } else {
      if (typeof payload.birthTime !== "string" || !TIME_REGEX.test(payload.birthTime.trim())) {
        throw new AuthError("birthTime must be in 24h HH:mm format, e.g. 14:30", 400);
      }
      updates.birthTime = payload.birthTime.trim();
      updates.birthTimeKnown = true;
    }
  }

  if (payload.birthTimeKnown !== undefined) {
    if (typeof payload.birthTimeKnown !== "boolean") {
      throw new AuthError("birthTimeKnown must be a boolean", 400);
    }
    if (payload.birthTimeKnown === false) {
      if (typeof updates.birthTime === "string") {
        throw new AuthError("birthTime was sent but birthTimeKnown is false", 400);
      }
      updates.birthTime = null;
      updates.birthTimeKnown = false;
    } else if (updates.birthTime === undefined) {
      throw new AuthError("birthTime is required when birthTimeKnown is true", 400);
    }
  }

  if (payload.birthPlace !== undefined) {
    if (payload.birthPlace === null) {
      updates.birthPlace = null;
    } else {
      if (typeof payload.birthPlace !== "object" || Array.isArray(payload.birthPlace)) {
        throw new AuthError(
          "birthPlace must be an object: { name, latitude, longitude, timezone }",
          400,
        );
      }
      const place = payload.birthPlace as Record<string, unknown>;
      const missing = ["name", "latitude", "longitude", "timezone"].filter(
        (key) => place[key] === undefined || place[key] === null || place[key] === "",
      );
      if (missing.length > 0) {
        throw new AuthError(`birthPlace is missing: ${missing.join(", ")}`, 400);
      }

      const name = String(place.name).trim();
      if (!name || name.length > 200) {
        throw new AuthError("birthPlace.name must be 1-200 characters", 400);
      }

      const latitude = Number(place.latitude);
      const longitude = Number(place.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new AuthError("birthPlace latitude/longitude must be numbers", 400);
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new AuthError("birthPlace latitude/longitude out of range", 400);
      }

      const timezone = String(place.timezone).trim();
      if (!isValidTimeZone(timezone)) {
        throw new AuthError(
          "birthPlace.timezone must be an IANA timezone, e.g. Asia/Kolkata",
          400,
        );
      }

      updates.birthPlace = { name, latitude, longitude, timezone };
    }
  }

  return updates;
}
