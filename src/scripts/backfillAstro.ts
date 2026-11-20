/**
 * One-time backfill: sets astro.sunSign for users created before Astro Match.
 *
 *   npm run backfill:astro -- --dry-run           # report only, writes nothing
 *   npm run backfill:astro                        # set astro.sunSign
 *   npm run backfill:astro -- --sync-star-sign    # also overwrite starSign to match DOB
 *
 * Safe to run more than once. Users who already have astro.sunSign are skipped
 * unless --sync-star-sign is passed.
 */
import mongoose from "mongoose";
import { connectDatabase } from "../config/db";
import { env } from "../config/env";
import { UserModel } from "../models/User";
import { displaySign, sunSignFromDate } from "../services/astro/zodiac";

const BATCH_SIZE = 500;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const syncStarSign = process.argv.includes("--sync-star-sign");

  await connectDatabase(env.mongoUri);

  const filter: Record<string, unknown> = { dob: { $ne: null } };
  if (!syncStarSign) filter["astro.sunSign"] = { $in: [null, ""] };

  const cursor = UserModel.find(filter).select("dob starSign astro").lean().cursor();

  let scanned = 0;
  let updated = 0;
  let starSignMismatches = 0;
  let invalidDob = 0;
  let ops: any[] = [];

  const flush = async () => {
    if (ops.length === 0) return;
    if (!dryRun) await UserModel.bulkWrite(ops, { ordered: false });
    updated += ops.length;
    ops = [];
  };

  for await (const user of cursor as AsyncIterable<any>) {
    scanned++;
    const dob = new Date(user.dob);
    if (Number.isNaN(dob.getTime())) {
      invalidDob++;
      continue;
    }
    const sign = sunSignFromDate(dob);
    const label = displaySign(sign);
    const mismatch = Boolean(user.starSign) && String(user.starSign).toLowerCase() !== sign;
    if (mismatch) starSignMismatches++;

    const set: Record<string, unknown> = { "astro.sunSign": sign };
    if (syncStarSign || !user.starSign) set.starSign = label;

    if (user.astro?.sunSign === sign && (!set.starSign || user.starSign === label)) continue;

    ops.push({ updateOne: { filter: { _id: user._id }, update: { $set: set } } });
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(
    JSON.stringify(
      { dryRun, syncStarSign, scanned, updated, starSignMismatches, invalidDob },
      null,
      2,
    ),
  );
  if (starSignMismatches > 0 && !syncStarSign) {
    console.log(
      `${starSignMismatches} users have a starSign that contradicts their DOB. ` +
        "Re-run with --sync-star-sign to correct them.",
    );
  }
}

main()
  .catch((error) => {
    console.error("Backfill failed", error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
