/** Filter subscription / refill economics. All inputs are your assumptions; nothing here is market data. */
export interface SubscriptionAssumptions {
  annualPriceInr: number; // what the customer pays per year (incl. GST)
  gstPct: number;
  filterCostInr: number; // filters and consumables you ship per year
  deliveryCostInr: number; // freight and packing per year
  serviceCostInr: number; // technician visits per year
  paymentFeePct: number; // gateway / collection fee on revenue
  churnPctPerYear: number; // share of subscribers who leave each year
  acquisitionCostInr: number; // cost to win one subscriber (CAC)
  hardwareMarginInr: number; // one-off margin on the device, credited at signup
}
export interface SubscriptionResult {
  annualRevenueExGst: number;
  annualCost: number;
  annualContribution: number;
  contributionMarginPct: number;
  expectedLifetimeYears: number | null;
  lifetimeValue: number | null;
  ltvToCac: number | null;
  paybackMonths: number | null;
}

export function subscriptionEconomics(a: SubscriptionAssumptions): SubscriptionResult {
  const rev = a.annualPriceInr / (1 + a.gstPct / 100);
  const cost =
    a.filterCostInr + a.deliveryCostInr + a.serviceCostInr + (a.paymentFeePct / 100) * rev;
  const contribution = rev - cost;
  const churn = a.churnPctPerYear / 100;
  const life = churn > 0 ? Math.min(1 / churn, 20) : null; // cap: nobody stays 20+ years
  const ltv = life == null ? null : contribution * life + a.hardwareMarginInr;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const upfront = a.hardwareMarginInr - a.acquisitionCostInr;
  const payback =
    contribution > 0
      ? Math.max(0, ((a.acquisitionCostInr - a.hardwareMarginInr) / contribution) * 12)
      : null;
  return {
    annualRevenueExGst: r2(rev),
    annualCost: r2(cost),
    annualContribution: r2(contribution),
    contributionMarginPct: rev > 0 ? r2((contribution / rev) * 100) : 0,
    expectedLifetimeYears: life == null ? null : r2(life),
    lifetimeValue: ltv == null ? null : r2(ltv),
    ltvToCac: ltv != null && a.acquisitionCostInr > 0 ? r2(ltv / a.acquisitionCostInr) : null,
    paybackMonths: upfront >= 0 ? 0 : payback == null ? null : r2(payback),
  };
}

export function defaultSubscription(): SubscriptionAssumptions {
  return {
    annualPriceInr: 2400,
    gstPct: 18,
    filterCostInr: 700,
    deliveryCostInr: 120,
    serviceCostInr: 300,
    paymentFeePct: 2,
    churnPctPerYear: 30,
    acquisitionCostInr: 600,
    hardwareMarginInr: 0,
  };
}
