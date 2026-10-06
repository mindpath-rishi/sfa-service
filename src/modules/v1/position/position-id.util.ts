import { ConflictException } from '@nestjs/common';
import { ClientSession, Model } from 'mongoose';

/**
 * Generate the next sequential position ID (P00001, P00002, ...)
 * using the shared `id_counters` collection.
 */
export async function generatePositionId(
  positionModel: Model<any>,
  session: ClientSession,
) {
  const latest = await positionModel
    .findOne({ positionId: /^P\d{5,}$/ })
    .select('positionId')
    .sort({ positionId: -1 })
    .session(session)
    .lean<{ positionId?: string }>();
  const latestSequence = latest?.positionId
    ? Number(latest.positionId.slice(1))
    : 0;
  const counters = positionModel.db.collection('id_counters');

  await counters.updateOne(
    { _id: 'positionId' as any },
    { $max: { sequence: latestSequence } },
    { upsert: true, session },
  );
  const counter = await counters.findOneAndUpdate(
    { _id: 'positionId' as any },
    { $inc: { sequence: 1 } },
    { returnDocument: 'after', session },
  );
  const sequence = Number(counter?.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new ConflictException('Unable to generate position ID');
  }
  return `P${String(sequence).padStart(5, '0')}`;
}
