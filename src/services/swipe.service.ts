import { AuthError } from "../errors/AuthError";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import { presentActor, presentMatch, presentUser } from "../presenters";
import {
  findMutualLike,
  findSwipePair,
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
import { canSeeIncognitoUser } from "./incognito.service";
import { notifyUser } from "./notification.service";
import { emitToUser } from "./socket.service";

async function resolveUserSummary(userId: string) {
  const user = await UserModel.findById(userId).lean();

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  return user;
}

type MatchSide = { userId: string; swipeId: string; other: any };

/**
 * Tells both people about a new match; each gets their own match id. The
 * first side made the swipe that matched and already sees the match screen.
 */
function announceMatch(sides: [MatchSide, MatchSide], matchedAt: Date): void {
  for (const [index, side] of sides.entries()) {
    const actor = presentActor(side.other);
    const name = actor?.name || "Someone";
    void notifyUser(side.userId, {
      type: "match",
      title: "It's a match! 🎉",
      body: `You and ${name} liked each other. Say hi!`,
      metadata: {
        matchId: side.swipeId,
        userId: actor?.userId ?? "",
        name,
        photo: actor?.photo ?? "",
        matchedAt: matchedAt.toISOString(),
        initiatedByYou: index === 0,
      },
    });
  }
}

/** Live update for the other person when a match disappears. */
function announceMatchRemoved(recipientId: string, removedById: string): void {
  emitToUser(recipientId, "match_removed", { userId: removedById });
}

export async function swipeUser(
  swiperId: string,
  targetUserId: string,
  action: string,
  options: { superLike?: boolean } = {},
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
  if (!targetUser || targetUser.isHidden || targetUser.isBanned) {
    throw new AuthError("Target user not found", 404);
  }
  if (
    targetUser.isIncognito &&
    !(await canSeeIncognitoUser(validatedSwiperId, validatedTargetUserId))
  ) {
    throw new AuthError("Target user not found", 404);
  }

  const isLike = validatedAction === "like";
  const superLike = isLike && options.superLike === true;
  const previous = await findSwipePair(validatedSwiperId, validatedTargetUserId);

  let matchedAt: Date | undefined;
  let reciprocalSwipeId = "";
  if (isLike) {
    const reciprocalLike = await findMutualLike(
      validatedSwiperId,
      validatedTargetUserId,
    );
    if (reciprocalLike && reciprocalLike.action === "like") {
      matchedAt = new Date();
      const reciprocal = await upsertSwipe({
        swiperId: validatedTargetUserId,
        targetUserId: validatedSwiperId,
        action: "like",
        matchedAt,
      });
      reciprocalSwipeId = String(reciprocal?._id ?? "");
    }
  }

  const swipe = await upsertSwipe({
    swiperId: validatedSwiperId,
    targetUserId: validatedTargetUserId,
    action: validatedAction,
    matchedAt,
    // A later plain like keeps an earlier Super Like; a pass clears it.
    isSuperLike: isLike ? (superLike || previous?.isSuperLike === true) : false,
  });

  const wasMatched = Boolean(previous?.matchedAt);
  const isNewLike = isLike && previous?.action !== "like";
  const isNewSuperLike = superLike && previous?.isSuperLike !== true;

  if (matchedAt && !wasMatched) {
    const swiper = await UserModel.findById(validatedSwiperId)
      .select("name photos")
      .lean();
    announceMatch(
      [
        { userId: validatedSwiperId, swipeId: String(swipe?._id ?? ""), other: targetUser },
        { userId: validatedTargetUserId, swipeId: reciprocalSwipeId, other: swiper },
      ],
      matchedAt,
    );
  } else if (!matchedAt && (isNewLike || isNewSuperLike)) {
    const swiper = await UserModel.findById(validatedSwiperId)
      .select("name photos isHidden isIncognito isBanned")
      .lean();
    // Hidden and incognito profiles are left out of "Liked you", so their
    // likes stay silent too.
    if (swiper && !swiper.isHidden && !swiper.isIncognito && !swiper.isBanned) {
      const actor = presentActor(swiper);
      const name = actor?.name || "Someone";
      void notifyUser(validatedTargetUserId, {
        type: superLike ? "super_like" : "like",
        title: superLike ? "⭐ Super Like!" : "New like ❤️",
        body: superLike
          ? `${name} super liked you. See them in Liked You.`
          : `${name} liked your profile. Like them back to match!`,
        metadata: {
          userId: actor?.userId ?? "",
          name,
          photo: actor?.photo ?? "",
          swipeId: String(swipe?._id ?? ""),
        },
      });
    }
  }

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

  const presented = await Promise.all(
    likes.map(async (like) => {
      const user = await resolveUserSummary(like.targetUserId.toString());
      if (
        user.isIncognito &&
        !(await canSeeIncognitoUser(validatedUserId, String(user._id)))
      ) {
        return null;
      }
      return {
        ...presentUser(user),
        swipeId: String(like._id),
        likedAt: like.createdAt,
        matchedAt: like.matchedAt ?? null,
      };
    }),
  );

  return presented.filter((item) => item != null);
}

export async function getDislikes(userId: string) {
  const validatedUserId = validateObjectId(userId, "userId");
  const dislikes = await getUserDislikes(validatedUserId);

  const presented = await Promise.all(
    dislikes.map(async (dislike) => {
      const user = await resolveUserSummary(dislike.targetUserId.toString());
      if (
        user.isIncognito &&
        !(await canSeeIncognitoUser(validatedUserId, String(user._id)))
      ) {
        return null;
      }
      return {
        ...presentUser(user),
        swipeId: String(dislike._id),
        dislikedAt: dislike.createdAt,
      };
    }),
  );

  return presented.filter((item) => item != null);
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
          if (
            !user ||
            user.active === false ||
            user.isHidden ||
            user.isBanned ||
            user.isIncognito
          ) {
            return null;
          }
          const likedAt = like.createdAt ? new Date(like.createdAt) : null;
          const km = distanceKm(me?.location, user.location);
          return {
            ...presentUser(user),
            swipeId: String(like._id),
            likedAt,
            isSuperLike: like.isSuperLike === true,
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

  const wasMatched = Boolean(swipe.matchedAt);
  const matchedAt = swipe.matchedAt ?? new Date();
  swipe.action = "like";
  swipe.matchedAt = matchedAt;
  await swipe.save();

  reciprocal.matchedAt = matchedAt;
  await reciprocal.save();

  const [other, me] = await Promise.all([
    resolveUserSummary(swipe.targetUserId.toString()),
    resolveUserSummary(validatedUserId),
  ]);
  if (!wasMatched) {
    announceMatch(
      [
        { userId: validatedUserId, swipeId: String(swipe._id), other },
        { userId: String(other._id), swipeId: String(reciprocal._id), other: me },
      ],
      matchedAt,
    );
  }

  return presentMatch(swipe, validatedUserId, other);
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
  announceMatchRemoved(String(swipe.targetUserId), validatedUserId);

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
  announceMatchRemoved(String(swipe.targetUserId), validatedUserId);

  return { unmatched: true, matchId: String(swipe._id) };
}
