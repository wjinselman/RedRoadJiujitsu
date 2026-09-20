export const PENDING_RANK = 'Rank pending';

export function signupRank(reported = '') {
  return {rank: PENDING_RANK, stripes: 0,
    selfReportedRank: String(reported).trim().slice(0, 80),
    rankVerifiedBy: '', rankVerifiedAt: '', rankHistory: []};
}

export function rankMetadata(member = {}) {
  member = member || {};
  return {
    selfReportedRank: String(member.selfReportedRank || '').slice(0, 80),
    rankVerifiedBy: String(member.rankVerifiedBy || ''),
    rankVerifiedAt: String(member.rankVerifiedAt || ''),
    rankHistory: Array.isArray(member.rankHistory) ? member.rankHistory : []
  };
}

export function assignRank(previous, rank, stripes, actor, now = new Date().toISOString()) {
  const metadata = rankMetadata(previous);
  const oldRank = previous?.rank || PENDING_RANK;
  const oldStripes = Number(previous?.stripes || 0);
  if (oldRank === rank && oldStripes === stripes) return metadata;
  if (!actor) throw new Error('Please sign in again before changing a rank.');
  return {...metadata,
    rankVerifiedBy: rank === PENDING_RANK ? '' : actor,
    rankVerifiedAt: rank === PENDING_RANK ? '' : now,
    rankHistory: [...metadata.rankHistory, {from: oldRank, fromStripes: oldStripes,
      to: rank, stripes, by: actor, at: now}]
  };
}
