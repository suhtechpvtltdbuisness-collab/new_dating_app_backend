/**
 * "Best Astro Matches" (B8): discovery candidates ranked by Astro Match score.
 *
 * Sun-sign scores depend only on the two signs, so for one viewer there are just
 * 12 possible scores. We compute them once, then let MongoDB attach the score to
 * each candidate and sort in a single aggregation, so pagination is exact.
 *
 * Candidates are the same people the discovery feed would show (baseFilter):
 * not swiped, not blocked either way, not banned/hidden/incognito, and matching
 * the viewer's gender, age and advanced preference filters.
 */
import { AuthError } from "../../errors/AuthError";
import { UserModel } from "../../models/User";
import { presentPublicUser } from "../../presenters";
import { type DiscoveryQuery, baseFilter, clampPage } from "../discovery.service";
import { bandFor, computeCompatibility } from "./compatibility";
import {
  SIGNS,
  SIGN_START,
  type Sign,
  displaySign,
  elementOf,
  isSign,
  modalityOf,
  sunSignFromDate,
} from "./zodiac";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface BestMatchesQuery extends DiscoveryQuery {
  minScore?: number;
}

function clampLimit(limit?: number): number {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), MAX_LIMIT);
}

function validateMinScore(value?: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new AuthError("minScore must be a number between 0 and 100", 400);
  }
  return Math.floor(value);
}

/**
 * Mongo expression: sun sign from `$dob` (UTC month/day), mirroring
 * sunSignFromDate(). Used for users created before astro.sunSign existed.
 */
function signFromDobExpression() {
  const mmdd = {
    $add: [
      { $multiply: [{ $month: { date: "$dob", timezone: "UTC" } }, 100] },
      { $dayOfMonth: { date: "$dob", timezone: "UTC" } },
    ],
  };
  // Latest start date first, so the first matching branch is the right sign.
  const branches = SIGN_START.map(([m, d], index) => ({ start: m * 100 + d, sign: SIGNS[index] }))
    .sort((a, b) => b.start - a.start)
    .map(({ start, sign }) => ({ case: { $gte: [mmdd, start] }, then: sign }));
  return {
    $cond: [
      { $eq: [{ $type: "$dob" }, "date"] },
      { $switch: { branches, default: "capricorn" } },
      null,
    ],
  };
}

function viewerSign(user: any): Sign | null {
  if (isSign(user?.astro?.sunSign)) return user.astro.sunSign;
  if (!user?.dob) return null;
  const dob = new Date(user.dob);
  return Number.isNaN(dob.getTime()) ? null : sunSignFromDate(dob);
}

/** GET /astro/best-matches */
export async function listBestAstroMatches(userId: string, query: BestMatchesQuery) {
  const limit = clampLimit(query.limit);
  const page = clampPage(query.page);
  const minScore = validateMinScore(query.minScore);

  const { currentUser, filter } = await baseFilter(userId, query);
  const mySign = viewerSign(currentUser);

  if (!mySign) {
    // Same idea as the match API: an empty state, not an error.
    return {
      items: [],
      meta: { available: false, reason: "missing_birth_data", missing: ["dob"], page, limit, hasMore: false },
    };
  }

  // The 12 possible scores for this viewer.
  const results = new Map(SIGNS.map((sign) => [sign, computeCompatibility(mySign, sign)]));
  const scoreBranches = SIGNS.map((sign) => ({
    case: { $eq: ["$_astroSign", sign] },
    then: results.get(sign)!.score,
  }));

  const pipeline: any[] = [
    { $match: filter },
    { $addFields: { _astroSign: { $ifNull: ["$astro.sunSign", signFromDobExpression()] } } },
    { $match: { _astroSign: { $in: [...SIGNS] } } },
    { $addFields: { _astroScore: { $switch: { branches: scoreBranches, default: 0 } } } },
  ];
  if (minScore !== undefined) {
    pipeline.push({ $match: { _astroScore: { $gte: minScore } } });
  }
  pipeline.push(
    // Highest score first; recently active people first within the same score.
    { $sort: { _astroScore: -1, lastActive: -1, _id: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit + 1 }, // one extra row tells us whether another page exists
  );

  const rows = await UserModel.aggregate(pipeline);
  const hasMore = rows.length > limit;

  const items = rows.slice(0, limit).map((row) => {
    const sign = row._astroSign as Sign;
    const result = results.get(sign)!;
    return {
      ...presentPublicUser(row),
      astroMatch: {
        score: result.score,
        band: bandFor(result.score),
        sunSign: sign,
        sunSignLabel: displaySign(sign),
        element: elementOf(sign),
        modality: modalityOf(sign),
        // One line for the card; the full list comes from GET /astro/match/:userId.
        topStrength: result.strengths[0] ?? null,
      },
    };
  });

  return {
    items,
    meta: {
      available: true,
      mySign,
      mySignLabel: displaySign(mySign),
      algorithmVersion: results.get(mySign)!.algorithmVersion,
      minScore: minScore ?? null,
      page,
      limit,
      hasMore,
    },
  };
}
