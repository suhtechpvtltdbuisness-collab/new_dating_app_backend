import { AuthError } from "../errors/AuthError";

const STRING_FIELDS = [
  "name",
  "gender",
  "interestedIn",
  "profile",
  "bio",
  "city",
  "country",
  "hometown",
  "work",
  "education",
  "educationLevel",
  "height",
  "exercise",
  "starSign",
  "drinking",
  "smoking",
  "lookingFor",
  "kids",
  "haveKids",
  "religion",
  "politics",
  "pronouns",
  "relationshipStatus",
] as const;

const OPTIONAL_STRING_FIELDS = [
  "bio",
  "city",
  "country",
  "hometown",
  "work",
  "education",
  "educationLevel",
  "height",
  "exercise",
  "starSign",
  "drinking",
  "smoking",
  "lookingFor",
  "kids",
  "haveKids",
  "religion",
  "politics",
  "pronouns",
] as const;

const BOOLEAN_FIELDS = ["active", "isOnline", "isHidden"] as const;
const STRING_LIST_FIELDS = [
  "interests",
  "photos",
  "languages",
  "courses",
  "qualities",
  "openingMoves",
] as const;

export type UpdateProfileInput = Record<string, unknown>;

function asStringList(field: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AuthError(`${field} must be an array of strings`, 400);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

/// Maps the Flutter client's profile payload (which splits `name` into
/// `firstName`/`lastName` and calls `photos` `photoUrls`) onto the stored
/// user document shape.
export function validateUpdateProfileInput(
  payload: UpdateProfileInput,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new AuthError("Invalid profile payload", 400);
  }

  const updates: Record<string, unknown> = {};

  for (const field of STRING_FIELDS) {
    const value = payload[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new AuthError(`${field} must be a string`, 400);
    }
    const trimmed = value.trim();
    const optional = (OPTIONAL_STRING_FIELDS as readonly string[]).includes(
      field,
    );
    if (!trimmed && !optional) {
      throw new AuthError(`${field} must be a non-empty string`, 400);
    }
    updates[field] = trimmed;
  }

  for (const field of BOOLEAN_FIELDS) {
    const value = payload[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw new AuthError(`${field} must be a boolean`, 400);
    }
    updates[field] = value;
  }

  for (const field of STRING_LIST_FIELDS) {
    const value = payload[field];
    if (value === undefined) continue;
    updates[field] = asStringList(field, value);
  }

  if (payload.photoUrls !== undefined && updates.photos === undefined) {
    updates.photos = asStringList("photoUrls", payload.photoUrls);
  }

  if (updates.name === undefined) {
    const firstName =
      typeof payload.firstName === "string" ? payload.firstName.trim() : "";
    const lastName =
      typeof payload.lastName === "string" ? payload.lastName.trim() : "";
    const combined = `${firstName} ${lastName}`.trim();
    if (combined) {
      updates.name = combined;
    }
  }

  const dob = payload.dob ?? payload.dateOfBirth;
  if (dob !== undefined) {
    const parsed = new Date(String(dob));
    if (Number.isNaN(parsed.getTime())) {
      throw new AuthError("Invalid date of birth", 400);
    }
    updates.dob = parsed;
  }

  const coordinates =
    (payload.location as { coordinates?: unknown } | undefined)?.coordinates ??
    (payload.latitude !== undefined && payload.longitude !== undefined
      ? [payload.longitude, payload.latitude]
      : undefined);

  if (coordinates !== undefined) {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      throw new AuthError(
        "location.coordinates must be [longitude, latitude]",
        400,
      );
    }
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new AuthError("location.coordinates must be numeric", 400);
    }
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new AuthError("location.coordinates out of range", 400);
    }
    updates.location = { type: "Point", coordinates: [longitude, latitude] };
  }

  if (Object.keys(updates).length === 0) {
    throw new AuthError("No updatable profile fields were provided", 400);
  }

  updates.lastActive = new Date();

  return updates;
}

const LOOKING_FOR = ["dating", "relationship", "friendship", "networking"];
const GENDERS = ["male", "female", "other"];

export function validateUpdatePreferencesInput(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new AuthError("Invalid preferences payload", 400);
  }

  const updates: Record<string, unknown> = {};

  for (const field of ["minAge", "maxAge", "maxDistance"] as const) {
    const value = payload[field];
    if (value === undefined) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new AuthError(`${field} must be a positive number`, 400);
    }
    updates[field] = Math.floor(parsed);
  }

  if (
    typeof updates.minAge === "number" &&
    typeof updates.maxAge === "number" &&
    updates.minAge > updates.maxAge
  ) {
    throw new AuthError("minAge cannot be greater than maxAge", 400);
  }

  for (const field of ["lookingFor", "interests", "preferredGenders"] as const) {
    const value = payload[field];
    if (value === undefined) continue;
    const list = asStringList(field, value).map((item) => item.toLowerCase());

    if (field === "lookingFor") {
      const invalid = list.find((item) => !LOOKING_FOR.includes(item));
      if (invalid) {
        throw new AuthError(
          `lookingFor must be one of: ${LOOKING_FOR.join(", ")}`,
          400,
        );
      }
    }

    if (field === "preferredGenders") {
      const invalid = list.find((item) => !GENDERS.includes(item));
      if (invalid) {
        throw new AuthError(
          `preferredGenders must be one of: ${GENDERS.join(", ")}`,
          400,
        );
      }
    }

    updates[field] = list;
  }

  for (const field of [
    "locationEnabled",
    "showOnline",
    "notificationsEnabled",
  ] as const) {
    const value = payload[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw new AuthError(`${field} must be a boolean`, 400);
    }
    updates[field] = value;
  }

  if (Object.keys(updates).length === 0) {
    throw new AuthError("No updatable preference fields were provided", 400);
  }

  updates.lastUpdated = new Date();

  return updates;
}
