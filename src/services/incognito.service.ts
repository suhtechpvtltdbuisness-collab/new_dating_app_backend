import { ConversationModel } from "../models/Conversation";
import { SwipeModel } from "../models/Swipe";

function pairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

/**
 * Incognito hibernates a profile. The only people who can still see it are
 * mutual matches and anyone who already has a conversation with them.
 */
export async function canSeeIncognitoUser(
  viewerId: string,
  targetUserId: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true;

  const [match, conversation] = await Promise.all([
    SwipeModel.exists({
      swiperId: viewerId,
      targetUserId,
      action: "like",
      matchedAt: { $ne: null },
    }),
    ConversationModel.exists({
      $or: [
        { pairKey: pairKey(viewerId, targetUserId) },
        {
          participants: { $all: [viewerId, targetUserId], $size: 2 },
        },
      ],
    }),
  ]);

  return Boolean(match || conversation);
}
