import { Types } from "mongoose";
import { ChatModel } from "../models/Chat";
import { ConversationModel } from "../models/Conversation";
import { DeviceTokenModel } from "../models/DeviceToken";
import { MediaModel } from "../models/Media";
import { NotificationModel } from "../models/Notification";
import { OtpCodeModel } from "../models/OtpCode";
import { RefreshTokenModel } from "../models/RefreshToken";
import { SwipeModel } from "../models/Swipe";
import { UserModel } from "../models/User";
import { deleteBlobIfPresent } from "./media.service";
import { CloseCode, disconnectUser } from "./socket.service";

/**
 * Permanently deletes a user and the personal data tied to them, as promised in the
 * Privacy Policy: profile, photos, likes/matches, conversations and messages (with their
 * attachments), notifications, sessions and pending one-time codes.
 *
 * Kept on purpose: safety reports and support tickets, which the policy retains for a
 * limited time for safety and follow-up.
 *
 * Returns false if the user does not exist.
 */
export async function purgeUser(userId: string): Promise<boolean> {
  const user = await UserModel.findById(userId).select("email phoneNumber photos").lean();
  if (!user) return false;

  const id = new Types.ObjectId(userId);
  disconnectUser(userId, CloseCode.suspended, "account deleted");

  // Every conversation they were part of goes, for both sides, with all its messages.
  const conversations = await ConversationModel.find({ participants: id }).select("_id").lean();
  const conversationIds = conversations.map((c) => c._id);
  const chatFilter = {
    $or: [
      { senderId: id },
      { recipientId: id },
      ...(conversationIds.length ? [{ conversationId: { $in: conversationIds } }] : []),
    ],
  };

  // Stored files first, while we still know their references. Failures are logged by the
  // helper and don't stop the rest of the deletion.
  const attachments = await ChatModel.find({ ...chatFilter, attachmentUrl: { $nin: [null, ""] } })
    .select("attachmentUrl")
    .lean();
  const fileRefs = [
    ...(user.photos ?? []),
    ...attachments.map((c) => c.attachmentUrl).filter((u): u is string => Boolean(u)),
  ];
  await Promise.allSettled(fileRefs.map((ref) => deleteBlobIfPresent(ref)));

  const otpFilter = [
    ...(user.email ? [{ email: user.email }] : []),
    ...(user.phoneNumber ? [{ phoneNumber: user.phoneNumber }] : []),
  ];

  await Promise.all([
    ChatModel.deleteMany(chatFilter),
    ConversationModel.deleteMany({ _id: { $in: conversationIds } }),
    SwipeModel.deleteMany({ $or: [{ swiperId: id }, { targetUserId: id }] }),
    NotificationModel.deleteMany({ userId: id }),
    MediaModel.deleteMany({ ownerId: id }),
    RefreshTokenModel.deleteMany({ userId: id }),
    DeviceTokenModel.deleteMany({ userId: id }),
    otpFilter.length ? OtpCodeModel.deleteMany({ $or: otpFilter }) : Promise.resolve(),
    UserModel.updateMany({ blockedUsers: id }, { $pull: { blockedUsers: id } }),
  ]);

  // The account itself last, so a failure above can be retried with the same request.
  await UserModel.deleteOne({ _id: id });
  return true;
}
