import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";

export function upsertSwipe(input: {
  swiperId: string;
  targetUserId: string;
  action: "like" | "dislike";
  matchedAt?: Date;
  /** Omit to keep the stored value. */
  isSuperLike?: boolean;
}) {
  return SwipeModel.findOneAndUpdate(
    { swiperId: input.swiperId, targetUserId: input.targetUserId },
    {
      swiperId: input.swiperId,
      targetUserId: input.targetUserId,
      action: input.action,
      matchedAt: input.matchedAt,
      ...(input.isSuperLike === undefined
        ? {}
        : { isSuperLike: input.isSuperLike }),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

export function findSwipePair(swiperId: string, targetUserId: string) {
  return SwipeModel.findOne({ swiperId, targetUserId }).lean();
}

export function findMutualLike(swiperId: string, targetUserId: string) {
  return SwipeModel.findOne({
    swiperId: targetUserId,
    targetUserId: swiperId,
    action: "like",
  }).lean();
}

export function getUserLikes(userId: string) {
  return SwipeModel.find({ swiperId: userId, action: "like" })
    .sort({ createdAt: -1 })
    .lean();
}

export function getUserDislikes(userId: string) {
  return SwipeModel.find({ swiperId: userId, action: "dislike" })
    .sort({ createdAt: -1 })
    .lean();
}

export function getUserMatches(userId: string) {
  return SwipeModel.find({
    swiperId: userId,
    action: "like",
    matchedAt: { $exists: true },
  })
    .sort({ matchedAt: -1, createdAt: -1 })
    .lean();
}

export function getUsersByIds(userIds: string[]) {
  return UserModel.find({ _id: { $in: userIds } }).lean();
}
