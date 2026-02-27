import type { RewardPricing } from '../config';

/** صافي المكافأة لصف ملخص (نفس معادلة Rewards: إجمالي − صندوق الدعم) — لاختيار الفرع الأعلى صافي للموظف المتكرر */
export function computeNetForRewardRow(
  row: {
    branch: string;
    receptionMorning: number;
    receptionEvening: number;
    receptionNight: number;
    bookingRegular: number;
    vipBySource: Record<string, { reception: number; booking: number }>;
  },
  pricing: RewardPricing
): number {
  const pct = (pricing.supportFundPercent ?? 15) / 100;
  let gross = 0;
  gross += (row.receptionMorning || 0) * (pricing.rateMorning || 0);
  gross += (row.receptionEvening || 0) * (pricing.rateEvening || 0);
  gross += (row.receptionNight || 0) * (pricing.rateNight || 0);
  gross += (row.bookingRegular || 0) * (pricing.rateBooking || 0);
  const vipDefault = pricing.rateVipDefault ?? { reception: 0, booking: 0 };
  const branchVip = (pricing.rateVipByBranch && row.branch) ? (pricing.rateVipByBranch[row.branch] ?? {}) : {};
  for (const roomNum of Object.keys(row.vipBySource || {})) {
    const src = row.vipBySource[roomNum];
    const rates = branchVip[String(roomNum)] ?? vipDefault;
    gross += (src.reception || 0) * (rates.reception ?? 0);
    gross += (src.booking || 0) * (rates.booking ?? 0);
  }
  return gross * (1 - pct);
}
