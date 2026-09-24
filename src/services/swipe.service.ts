import { AuthError } from "../errors/AuthError";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import { presentMatch, presentUser } from "../presenters";
import {
  findMutualLike,
  getUserDislikes,
  getUserLikes,
  getUserMatches,
  upsertSwipe,
} from "../repository/swipe.repository";
import {
  validateSwipeAction,
  validateSwipeUserId,
} from "../validation/swipe.validation";
import { validateObjectId } from "../validation/chat.validation";

async function resolveUserSummary(userId: string) {
  const user = await UserModel.findById(userId).lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return user;
}

export async function swipeUser(
  swiperId: string,
  targetUserId: string,
  action: string,
) {
  const validatedSwiperId = validateObjectId(swiperId, "swiperId");
  const validatedTargetUserId = validateSwipeUserId(
    targetUserId,
    "targetUserId",
  );
  const validatedAction = validateSwipeAction(action);

  if (validatedSwiperId === validatedTargetUserId) {
    throw new AuthError("You cannot swipe on yourself", 400);
  }

  const targetUser = await UserModel.findById(validatedTargetUserId).lean();
  if (!targetUser || targetUser.isHidden) {
    throw new AuthError("Target user not found", 404);
  }

  let matchedAt: Date | undefined;
  if (validatedAction === "like") {
    const reciprocalLike = await findMutualLike(
      validatedSwiperId,
      validatedTargetUserId,
    );
    if (reciprocalLike && reciprocalLike.action === "like") {
      matchedAt = new Date();
      await upsertSwipe({
        swiperId: validatedTargetUserId,
        targetUserId: validatedSwiperId,
        action: "like",
        matchedAt,
      });
    }
  }

  const swipe = await upsertSwipe({
    swiperId: validatedSwiperId,
    targetUserId: validatedTargetUserId,
    action: validatedAction,
    matchedAt,
  });

  return {
    isMatch: Boolean(matchedAt),
    match: matchedAt
      ? presentMatch(swipe, validatedSwiperId, targetUser)
      : null,
  };
}

export async function getLikes(userId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const likes = await getUserLikes(validatedUserId);

  return Promise.all(
    likes.map(async (like) => ({
      ...presentUser(await resolveUserSummary(like.targetUserId.toString())),
      swipeId: String(like._id),
      likedAt: like.createdAt,
      matchedAt: like.matchedAt ?? null,
    })),
  );
}

export async function getDislikes(userId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const dislikes = await getUserDislikes(validatedUserId);

  return Promise.all(
    dislikes.map(async (dislike) => ({
      ...presentUser(await resolveUserSummary(dislike.targetUserId.toString())),
      swipeId: String(dislike._id),
      dislikedAt: dislike.createdAt,
    })),
  );
}

function distanceKm(
  from: { coordinates?: number[] } | null | undefined,
  to: { coordinates?: number[] } | null | undefined,
): number | null {
  const a = from?.coordinates;
  const b = to?.coordinates;
  if (!a || !b || a.length < 2 || b.length < 2) return null;
  const [lng1, lat1] = a.map(Number);
  const [lng2, lat2] = b.map(Number);
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return null;
  if ((lat1 === 0 && lng1 === 0) || (lat2 === 0 && lng2 === 0)) return null;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function matchScore(current: any, other: any, km: number | null): number {
  const mine = new Set(
    (current?.interests ?? []).map((item: string) => item.toLowerCase()),
  );
  const theirs = (other?.interests ?? []) as string[];
  const shared = theirs.filter((item) => mine.has(String(item).toLowerCase())).length;
  let score = 40;
  if (mine.size && theirs.length) {
    score += Math.round((shared / Math.max(theirs.length, 1)) * 35);
  }
  if (
    current?.city &&
    other?.city &&
    String(current.city).toLowerCase() === String(other.city).toLowerCase()
  ) {
    score += 15;
  }
  if (km != null && km <= 25) score += 10;
  if (Array.isArray(other?.photos) && other.photos.length > 0) score += 5;
  return Math.min(99, score);
}

/// Users who liked the current user but have not been swiped back yet
/// (powers the "Liked you" tab).
export async function getIncomingLikes(userId: string, filter = "all") {
  const validatedUserId = validateObjectId(userId, "userId");
  const me = await UserModel.findById(validatedUserId).lean();

  const [incoming, outgoing] = await Promise.all([
    SwipeModel.find({ targetUserId: validatedUserId, action: "like" })
      .sort({ createdAt: -1 })
      .lean(),
    SwipeModel.find({ swiperId: validatedUserId }).select("targetUserId").lean(),
  ]);

  const swipedBack = new Set(
    outgoing.map((swipe) => swipe.targetUserId.toString()),
  );
  const freshAfter = Date.now() - 48 * 60 * 60 * 1000;

  const likes = (
    await Promise.all(
      incoming
        .filter((like) => !swipedBack.has(like.swiperId.toString()))
        .map(async (like) => {
          const user = await UserModel.findById(like.swiperId).lean();
          if (!user || user.active === false || user.isHidden) return null;
          const likedAt = like.createdAt ? new Date(like.createdAt) : null;
          const km = distanceKm(me?.location, user.location);
          return {
            ...presentUser(user),
            swipeId: String(like._id),
            likedAt,
            distanceKm: km,
            matchScore: matchScore(me, user, km),
            isNew: Boolean(likedAt && likedAt.getTime() >= freshAfter),
          };
        }),
    )
  ).filter((item): item is NonNullable<typeof item> => item != null);

  const nearby = likes.filter(
    (item) => item.distanceKm != null && item.distanceKm <= 50,
  );
  const newest = likes.filter((item) => item.isNew);
  const selected =
    filter === "new" ? newest : filter === "nearby" ? nearby : likes;

  return {
    likes: selected,
    counts: {
      all: likes.length,
      new: newest.length,
      nearby: nearby.length,
    },
  };
}

export async function getMatches(userId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const matches = await getUserMatches(validatedUserId);

  return Promise.all(
    matches.map(async (match) =>
      presentMatch(
        match,
        validatedUserId,
        await resolveUserSummary(match.targetUserId.toString()),
      ),
    ),
  );
}

export async function getTopMatches(userId: string, limit = 10) {
  const matches = await getMatches(userId);
  return matches
    .slice(0, Math.min(Math.max(1, limit), 50))
    .map((match) => match.matchedUser);
}

async function findOwnedSwipe(userId: string, matchId: string) {
  const swipe = await SwipeModel.findOne({
    _id: validateObjectId(matchId, "matchId"),
    swiperId: userId,
  });

  if (!swipe) {
    throw new AuthError("Match not found", 404);
  }

  return swipe;
}

export async function getMatchDetail(userId: string, matchId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const swipe = await findOwnedSwipe(validatedUserId, matchId);

  return presentMatch(
    swipe,
    validatedUserId,
    await resolveUserSummary(swipe.targetUserId.toString()),
  );
}

export async function acceptMatch(userId: string, matchId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const swipe = await findOwnedSwipe(validatedUserId, matchId);

  const reciprocal = await SwipeModel.findOne({
    swiperId: swipe.targetUserId,
    targetUserId: validatedUserId,
    action: "like",
  });

  if (!reciprocal) {
    throw new AuthError("The other user has not liked you back yet", 409);
  }

  const matchedAt = swipe.matchedAt ?? new Date();
  swipe.action = "like";
  swipe.matchedAt = matchedAt;
  await swipe.save();

  reciprocal.matchedAt = matchedAt;
  await reciprocal.save();

  return presentMatch(
    swipe,
    validatedUserId,
    await resolveUserSummary(swipe.targetUserId.toString()),
  );
}

export async function rejectMatch(userId: string, matchId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const swipe = await findOwnedSwipe(validatedUserId, matchId);

  swipe.action = "dislike";
  swipe.matchedAt = undefined;
  await swipe.save();

  await SwipeModel.updateOne(
    { swiperId: swipe.targetUserId, targetUserId: validatedUserId },
    { $unset: { matchedAt: "" } },
  );

  return { rejected: true, matchId: String(swipe._id) };
}

export async function unmatch(userId: string, matchId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const swipe = await findOwnedSwipe(validatedUserId, matchId);

  await Promise.all([
    SwipeModel.deleteOne({ _id: swipe._id }),
    SwipeModel.deleteOne({
      swiperId: swipe.targetUserId,
      targetUserId: validatedUserId,
    }),
  ]);

  return { unmatched: true, matchId: String(swipe._id) };
}
