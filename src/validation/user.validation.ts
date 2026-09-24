import { AuthError } from "../errors/AuthError";
import { isValidPhoneNumber, normalizePhoneNumber } from "../utils/phone";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterInput {
  phoneNumber: string;
  name: string;
  dob: string;
  gender: string;
  interestedIn: string;
  profile: string;
  location: {
    coordinates: [number, number];
  };
  active?: boolean;
  ipAddress?: string;
  email: string;
  password?: string;
  googleSignupToken?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface PhoneOtpLoginInput {
  phoneNumber: string;
  otp: string;
}

export type LoginRequestInput = LoginInput | PhoneOtpLoginInput;

export function validateRegisterInput(
  payload: RegisterInput,
): RegisterInput & { phoneNumber: string; email: string } {
  const {
    phoneNumber,
    name,
    dob,
    gender,
    interestedIn,
    profile,
    location,
    email,
    password,
    googleSignupToken,
  } = payload;

  const missingFields: string[] = [];

  if (!phoneNumber?.trim()) missingFields.push("phoneNumber");
  if (!name?.trim()) missingFields.push("name");
  if (!dob?.trim()) missingFields.push("dob");
  if (!gender?.trim()) missingFields.push("gender");
  if (!interestedIn?.trim()) missingFields.push("interestedIn");
  if (!profile?.trim()) missingFields.push("profile");
  if (!email?.trim()) missingFields.push("email");
  if (!password && !googleSignupToken) missingFields.push("password");
  if (!location?.coordinates) missingFields.push("location.coordinates");

  if (missingFields.length > 0) {
    throw new AuthError(
      `Missing required fields: ${missingFields.join(", ")}`,
      400,
    );
  }

  if (Number.isNaN(new Date(dob).getTime())) {
    throw new AuthError("Invalid date of birth", 400);
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!isValidPhoneNumber(normalizedPhone)) {
    throw new AuthError(
      "Invalid phoneNumber format. Use E.164 format, e.g. +919999999999",
      400,
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new AuthError("Invalid email format", 400);
  }

  if (password && password.length < 6) {
    throw new AuthError("Password must be at least 6 characters", 400);
  }

  if (location.coordinates.length !== 2) {
    throw new AuthError(
      "location.coordinates must be [longitude, latitude]",
      400,
    );
  }

  const rawLongitude = location.coordinates[0];
  const rawLatitude = location.coordinates[1];
  const longitude = Number(rawLongitude);
  const latitude = Number(rawLatitude);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new AuthError(
      "location.coordinates must contain valid numeric values [longitude, latitude]",
      400,
    );
  }

  if (longitude < -180 || longitude > 180) {
    throw new AuthError(
      "Invalid longitude. It must be between -180 and 180",
      400,
    );
  }

  if (latitude < -90 || latitude > 90) {
    throw new AuthError("Invalid latitude. It must be between -90 and 90", 400);
  }

  return {
    ...payload,
    phoneNumber: normalizedPhone,
    email: normalizedEmail,
    location: {
      ...payload.location,
      coordinates: [longitude, latitude],
    },
  };
}

export function validateLoginInput(payload: LoginInput): LoginInput {
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password;

  if (!email || !password) {
    throw new AuthError("email and password are required", 400);
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new AuthError("Invalid email format", 400);
  }

  return { email, password };
}

export function validateLoginRequestInput(
  payload: Partial<LoginInput & PhoneOtpLoginInput>,
): LoginRequestInput {
  const hasEmailFields = Boolean(payload.email || payload.password);
  const hasPhoneFields = Boolean(payload.phoneNumber || payload.otp);

  if (hasEmailFields && hasPhoneFields) {
    throw new AuthError(
      "Provide either email/password or phoneNumber/otp, not both",
      400,
    );
  }

  if (hasEmailFields) {
    return validateLoginInput({
      email: payload.email ?? "",
      password: payload.password ?? "",
    });
  }

  if (hasPhoneFields) {
    const normalized = validateOtpInput(payload.phoneNumber ?? "", payload.otp);
    return { phoneNumber: normalized.number, otp: normalized.otp };
  }

  throw new AuthError("Login requires email/password or phoneNumber/otp", 400);
}

export function validateOtpInput(
  number: string,
  otp?: string,
): { number: string; otp: string } {
  const normalizedNumber = normalizePhoneNumber(number);
  if (!isValidPhoneNumber(normalizedNumber)) {
    throw new AuthError(
      "Invalid phone number. Use E.164 format, e.g. +919999999999",
      400,
    );
  }

  if (!otp || !/^\d{4}$/.test(otp)) {
    throw new AuthError("Invalid otp. It must be exactly 4 digits", 400);
  }

  return { number: normalizedNumber, otp };
}

export function validateOtpNumber(number: string): string {
  const normalizedNumber = normalizePhoneNumber(number);
  if (!isValidPhoneNumber(normalizedNumber)) {
    throw new AuthError(
      "Invalid phone number. Use E.164 format, e.g. +919999999999",
      400,
    );
  }

  return normalizedNumber;
}

export function validateOtpEmail(email: string): string {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    throw new AuthError("Invalid email format", 400);
  }

  return normalizedEmail;
}

export function validateEmailOtpInput(
  email: string,
  otp?: string,
): { email: string; otp: string } {
  const normalizedEmail = validateOtpEmail(email);

  if (!otp || !/^\d{4}$/.test(otp)) {
    throw new AuthError("Invalid otp. It must be exactly 4 digits", 400);
  }

  return { email: normalizedEmail, otp };
}
