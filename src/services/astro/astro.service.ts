/**
 * Astrology service (B4). The only place that turns users into signs and scores.
 * Today it is sun-sign only; a full birth chart can later replace `chartFor`
 * without changing the API response shape.
 */
import { Types } from "mongoose";
import { AuthError } from "../../errors/AuthError";
import { UserModel } from "../../models/User";
import { validateObjectId } from "../../validation/chat.validation";
import { canSeeIncognitoUser } from "../incognito.service";
import { computeCompatibility } from "./compatibility";
import {
  type Element,
  type Modality,
  type Sign,
  displaySign,
  elementOf,
  isSign,
  modalityOf,
  sunSignFromDate,
} from "./zodiac";

const ASTRO_FIELDS =
  "name dob birthTime birthTimeKnown birthPlace astro active isBanned isHidden isIncognito blockedUsers";

interface Chart {
  sunSign: Sign;
  sunSignLabel: string;
  element: Element;
  modality: Modality;
}

/** Sign from the stored value, or from DOB for users created before Astro Match. */
function chartFor(user: any): Chart | null {
  let sign: Sign | null = isSign(user?.astro?.sunSign) ? user.astro.sunSign : null;

  if (!sign && user?.dob) {
    const dob = new Date(user.dob);
    if (!Number.isNaN(dob.getTime())) {
      sign = sunSignFromDate(dob);
      // Self-healing backfill: store it so B8 queries can use the index later.
      UserModel.updateOne(
        { _id: user._id },
        { $set: { "astro.sunSign": sign } },
      ).catch(() => {});
    }
  }

  if (!sign) return null;
  return {
    sunSign: sign,
    sunSignLabel: displaySign(sign),
    element: elementOf(sign),
    modality: modalityOf(sign),
  };
}

function missingBirthData(user: any): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];
  if (!user?.dob) required.push("dob");
  if (!user?.birthTimeKnown || !user?.birthTime) optional.push("birthTime");
  if (!user?.birthPlace) optional.push("birthPlace");
  return { required, optional };
}

function includesId(list: unknown, id: string): boolean {
  return Array.isArray(list) && list.some((item) => String(item) === id);
}

/** GET /astro/me */
export async function getMyAstro(userId: string) {
  const user = await UserModel.findById(validateObjectId(userId, "userId"))
    .select(ASTRO_FIELDS)
    .lean();
  if (!user) throw new AuthError("User not found", 404);

  const chart = chartFor(user);
  const missing = missingBirthData(user);

  return {
    available: Boolean(chart),
    chart,
    birthDetails: {
      dob: user.dob ?? null,
      birthTime: user.birthTime ?? null,
      birthTimeKnown: Boolean(user.birthTimeKnown),
      birthPlace: user.birthPlace ?? null,
    },
    missing,
    // Sun-sign scoring only needs DOB. Time + place unlock full-chart scoring later.
    completeness: missing.required.length > 0 ? "incomplete" : missing.optional.length > 0 ? "basic" : "full",
  };
}

/** GET /astro/match/:userId (B7) */
export async function getAstroMatch(viewerId: string, otherUserId: string) {
  const otherId = validateObjectId(otherUserId, "userId");
  if (otherId === viewerId) {
    throw new AuthError("Cannot calculate Astro Match with yourself", 400);
  }

  const [viewer, other] = await Promise.all([
    UserModel.findById(viewerId).select(ASTRO_FIELDS).lean(),
    UserModel.findById(new Types.ObjectId(otherId)).select(ASTRO_FIELDS).lean(),
  ]);
  if (!viewer) throw new AuthError("User not found", 404);

  // Same "not found" for every reason the viewer may not see this person.
  const notVisible =
    !other ||
    other.isBanned === true ||
    other.active === false ||
    includesId(viewer.blockedUsers, otherId) ||
    includesId(other.blockedUsers, viewerId);
  if (notVisible) throw new AuthError("User not found", 404);

  if ((other.isIncognito || other.isHidden) && !(await canSeeIncognitoUser(viewerId, otherId))) {
    throw new AuthError("User not found", 404);
  }

  const myChart = chartFor(viewer);
  const theirChart = chartFor(other);

  if (!myChart || !theirChart) {
    // 200 with available:false so the app can show an empty state (F8), not an error.
    return {
      available: false,
      reason: "missing_birth_data",
      missing: {
        me: missingBirthData(viewer).required,
        other: theirChart ? [] : ["dob"],
      },
      me: myChart,
      other: { userId: otherId, name: other.name, chart: theirChart },
    };
  }

  const result = computeCompatibility(myChart.sunSign, theirChart.sunSign);

  return {
    available: true,
    score: result.score,
    band: result.band,
    method: result.method,
    algorithmVersion: result.algorithmVersion,
    me: myChart,
    other: { userId: otherId, name: other.name, chart: theirChart },
    breakdown: result.breakdown,
    strengths: result.strengths,
    challenges: result.challenges,
    // Filled by the AI layer in Phase 3. The score above never comes from AI.
    explanation: null,
  };
}
