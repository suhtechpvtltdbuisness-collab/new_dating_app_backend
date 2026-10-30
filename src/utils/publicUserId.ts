import { CounterModel } from "../models/Counter";
import { UserModel } from "../models/User";

const COUNTER_ID = "publicUserId";
const PREFIX = "USR-";
const PAD = 5;

function formatPublicUserId(seq: number): string {
  return `${PREFIX}${String(seq).padStart(PAD, "0")}`;
}

function parseSeq(value: unknown): number {
  const text = String(value ?? "");
  if (!text.startsWith(PREFIX)) return 0;
  const n = Number.parseInt(text.slice(PREFIX.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Raise the counter so the next allocate() is above any existing USR-* id. */
export async function syncPublicUserIdCounter(): Promise<void> {
  const latest = await UserModel.findOne({
    publicUserId: { $exists: true, $nin: [null, ""] },
  })
    .sort({ publicUserId: -1 })
    .select("publicUserId")
    .lean();
  const floor = parseSeq(latest?.publicUserId);
  const existing = await CounterModel.findById(COUNTER_ID).lean();
  if (!existing) {
    await CounterModel.create({ _id: COUNTER_ID, seq: floor });
    return;
  }
  if (existing.seq < floor) {
    await CounterModel.updateOne({ _id: COUNTER_ID }, { $set: { seq: floor } });
  }
}

export async function allocatePublicUserId(): Promise<string> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return formatPublicUserId(counter?.seq ?? 1);
}

const MISSING_PUBLIC_ID = {
  $or: [
    { publicUserId: { $exists: false } },
    { publicUserId: null },
    { publicUserId: "" },
  ],
};

/** Assign USR-* ids to every user that does not have one yet. */
export async function backfillPublicUserIds(): Promise<number> {
  await syncPublicUserIdCounter();
  const users = await UserModel.find(MISSING_PUBLIC_ID).select("_id").lean();
  let assigned = 0;
  for (const user of users) {
    const publicUserId = await allocatePublicUserId();
    const result = await UserModel.updateOne(
      { _id: user._id, ...MISSING_PUBLIC_ID },
      { $set: { publicUserId } },
    );
    if (result.modifiedCount > 0) assigned += 1;
  }
  return assigned;
}

/** Ensure one user has a public id; returns the assigned value. */
export async function ensureUserPublicUserId(
  userId: string,
  current?: string | null,
): Promise<string> {
  if (current && String(current).trim()) return String(current).trim();
  await syncPublicUserIdCounter();
  const publicUserId = await allocatePublicUserId();
  const result = await UserModel.findOneAndUpdate(
    { _id: userId, ...MISSING_PUBLIC_ID },
    { $set: { publicUserId } },
    { new: true },
  )
    .select("publicUserId")
    .lean();
  if (result?.publicUserId) return String(result.publicUserId);
  const existing = await UserModel.findById(userId).select("publicUserId").lean();
  return String(existing?.publicUserId ?? publicUserId);
}
