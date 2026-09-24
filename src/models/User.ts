import { Schema, model, type InferSchemaType } from "mongoose";

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: (value: string) => E164_PHONE_REGEX.test(value),
        message:
          "Invalid phoneNumber format. Use E.164 format, e.g. +919999999999",
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value: string) => EMAIL_REGEX.test(value),
        message: "Invalid email format",
      },
    },
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    authProvider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },
    name: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true, trim: true },
    interestedIn: { type: String, required: true, trim: true },
    profile: { type: String, required: true, trim: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (value: number[]) => value.length === 2,
          message: "Location coordinates must be [longitude, latitude]",
        },
      },
    },
    photos: { type: [String], default: [] },
    bio: { type: String, trim: true, maxlength: 500 },
    interests: { type: [String], default: [] },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    hometown: { type: String, trim: true },
    work: { type: String, trim: true },
    education: { type: String, trim: true },
    educationLevel: { type: String, trim: true },
    height: { type: String, trim: true },
    exercise: { type: String, trim: true },
    starSign: { type: String, trim: true },
    drinking: { type: String, trim: true },
    smoking: { type: String, trim: true },
    lookingFor: { type: String, trim: true },
    kids: { type: String, trim: true },
    haveKids: { type: String, trim: true },
    religion: { type: String, trim: true },
    politics: { type: String, trim: true },
    pronouns: { type: String, trim: true },
    languages: { type: [String], default: [] },
    courses: { type: [String], default: [] },
    qualities: { type: [String], default: [] },
    openingMoves: { type: [String], default: [] },
    relationshipStatus: { type: String, trim: true, default: "single" },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isVerified: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    preferences: {
      minAge: { type: Number, default: 18 },
      maxAge: { type: Number, default: 70 },
      maxDistance: { type: Number, default: 50 },
      lookingFor: { type: [String], default: ["dating"] },
      interests: { type: [String], default: [] },
      preferredGenders: { type: [String], default: [] },
      locationEnabled: { type: Boolean, default: true },
      showOnline: { type: Boolean, default: true },
      notificationsEnabled: { type: Boolean, default: true },
      lastUpdated: { type: Date, default: Date.now },
    },
    active: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: false },
    ipAddress: { type: String, required: true },
  },
  { timestamps: true },
);

userSchema.index({ location: "2dsphere" });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };

export const UserModel = model("User", userSchema);
