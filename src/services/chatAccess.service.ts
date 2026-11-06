import { Types } from "mongoose";
import { ConversationModel } from "../models/Conversation";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import { emitToUsers } from "./socket.service";

/**
 * Two people can chat only while they like each other (a match) and neither
 * has blocked the other. Unmatch, reject and block all end the chat.
 */
export async function canChat(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;

  const [likes, users] = await Promise.all([
    SwipeModel.countDocuments({
      action: "like",
      $or: [
        { swiperId: userA, targetUserId: userB },
        { swiperId: userB, targetUserId: userA },
      ],
    }),
    UserModel.find({ _id: { $in: [userA, userB] } })
      .select("blockedUsers isBanned")
      .lean(),
  ]);
  if (likes < 2 || users.length < 2) return false;

  return users.every((user) => {
    const otherId = String(user._id) === userA ? userB : userA;
    return (
      !user.isBanned &&
      !(user.blockedUsers ?? []).some((id) => String(id) === otherId)
    );
  });
}

/** Everyone the user can currently chat with (see `canChat`). */
export async function chatPartnerIds(userId: string): Promise<string[]> {
  const me = await UserModel.findById(userId).select("blockedUsers").lean();
  if (!me) return [];
  const blocked = new Set((me.blockedUsers ?? []).map(String));

  const myLikes = await SwipeModel.find({ swiperId: userId, action: "like" })
    .select("targetUserId")
    .lean();
  const candidates = myLikes
    .map((swipe) => String(swipe.targetUserId))
    .filter((id) => !blocked.has(id));
  if (candidates.length === 0) return [];

  const likedBack = await SwipeModel.find({
    swiperId: { $in: candidates },
    targetUserId: userId,
    action: "like",
  })
    .select("swiperId")
    .lean();
  const mutual = likedBack.map((swipe) => String(swipe.swiperId));
  if (mutual.length === 0) return [];

  const allowed = await UserModel.find({
    _id: { $in: mutual },
    isBanned: { $ne: true },
    blockedUsers: { $ne: new Types.ObjectId(userId) },
  })
    .select("_id")
    .lean();
  return allowed.map((user) => String(user._id));
}

/** Tells both people's apps to drop their conversation (unmatch, reject, block). */
export async function announceConversationClosed(
  userA: string,
  userB: string,
): Promise<void> {
  const conversation = await ConversationModel.findOne({
    participants: { $all: [userA, userB], $size: 2 },
  })
    .select("_id")
    .lean();
  if (!conversation) return;

  emitToUsers([userA, userB], "conversation_removed", {
    conversationId: String(conversation._id),
    userIds: [userA, userB],
  });
}
