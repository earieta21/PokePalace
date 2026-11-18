import { REWARDS } from "../config/rewardsCatalog.js";
import RewardVisit from "../models/RewardVisit.js";
import Redemption from "../models/Redemption.js";
import { dateKeyInTimeZone } from "./timeZone.js";

const cheapestReward = Math.min(...REWARDS.map((reward) => reward.cost));

export async function recordRewardVisit(user, balance, selectedCost) {
  if (!Number.isFinite(balance) || balance < cheapestReward) return;
  const now = new Date();
  const month = dateKeyInTimeZone(now).slice(0, 7);
  const dates = { firstVisitAt: now };
  if (Number.isFinite(selectedCost) && balance >= selectedCost) dates.firstSelectionAt = now;
  try {
    await RewardVisit.updateOne({ user, month }, { $min: dates }, { upsert: true });
  } catch (err) {
    // Metrics are auxiliary. A failed write must not block the customer's
    // balance or the confirmation dialog.
    console.error("Could not record reward visit:", err.code || err.name);
  }
}

export function summarizeRewardVisits(visits, redemptions, end) {
  const members = new Map(visits.map((visit) => [String(visit.user), visit]));
  const issued = new Set();
  const used = new Set();
  for (const reward of redemptions) {
    const member = String(reward.user);
    const visit = members.get(member);
    if (!visit || reward.createdAt < visit.firstVisitAt) continue;
    issued.add(member);
    const sale = reward.order;
    if (reward.status === "used" && reward.usedAt >= reward.createdAt && reward.usedAt < end && sale
      && sale.source === "pos" && sale.paymentStatus === "paid" && sale.status !== "cancelled"
      && String(sale.rewardRedemption) === String(reward._id)) {
      used.add(member);
    }
  }
  return {
    eligible: members.size,
    selected: visits.filter((visit) => visit.firstSelectionAt && visit.firstSelectionAt < end).length,
    issued: issued.size,
    used: used.size,
  };
}

// Cohort is selected by month of first eligible visit that month. All stages
// take place within the same calendar month; the current month is provisional.
export async function rewardConversionForMonth(start, end) {
  const month = dateKeyInTimeZone(start).slice(0, 7);
  const visits = await RewardVisit.find({ month, firstVisitAt: { $lt: end } })
    .select("user firstVisitAt firstSelectionAt -_id").lean();
  if (!visits.length) return summarizeRewardVisits([], [], end);
  const rewards = await Redemption.find({
    user: { $in: visits.map((visit) => visit.user) },
    pointsCost: { $gt: 0 },
    source: { $ne: "social_story" },
    createdAt: { $gte: start, $lt: end },
  }).select("user createdAt status usedAt order")
    .populate({ path: "order", select: "source paymentStatus status rewardRedemption" }).lean();
  return summarizeRewardVisits(visits, rewards, end);
}
