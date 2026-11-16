import { resolveCity, type City } from './cities';

/**
 * Cost-of-living math. Everything here is an estimate meant for comparing
 * offers between cities, and the UI says so.
 */

/** Non-rent essentials for one adult in an average-cost US city, per month
 *  (food, utilities, transport, health care, phone, other basics). */
export const US_NON_RENT_ESSENTIALS = 1_750;
/** Typical one-bedroom rent in an average-cost US city, per month. */
export const US_RENT = 1_400;
/** Rough share of gross pay that goes to federal/state/payroll taxes. */
export const EST_TAX_RATE = 0.25;

export interface CostOfLiving {
  city: City | null;
  /** US average = 100. Falls back to 100 for remote / unknown locations. */
  index: number;
  rent: number;
  /** Rent + non-rent essentials, per month. */
  monthly: number;
  /** True when we're using the national average because the place is unknown. */
  estimated: boolean;
}

export function costOfLiving(location: string | null | undefined): CostOfLiving {
  const city = resolveCity(location);
  if (!city) {
    return {
      city: null,
      index: 100,
      rent: US_RENT,
      monthly: US_RENT + US_NON_RENT_ESSENTIALS,
      estimated: true,
    };
  }
  // Rent is measured directly; the rest scales with the index, damped because
  // housing drives most of the spread between cities.
  const nonRent = Math.round(US_NON_RENT_ESSENTIALS * (0.6 + 0.4 * (city.costIndex / 100)));
  return { city, index: city.costIndex, rent: city.rent, monthly: city.rent + nonRent, estimated: false };
}

/** Midpoint of a salary range, or whichever end is listed. */
export function salaryMid(min: number | null, max: number | null): number | null {
  if (min != null && max != null) return (min + max) / 2;
  return min ?? max ?? null;
}

/** What a salary is "worth" in an average-cost US city. */
export function adjustedSalary(salary: number, col: Pick<CostOfLiving, 'index'>): number {
  return (salary * 100) / col.index;
}

/** Rough monthly money left after taxes and typical essentials. */
export function monthlyLeftover(salary: number, col: Pick<CostOfLiving, 'monthly'>): number {
  return (salary * (1 - EST_TAX_RATE)) / 12 - col.monthly;
}

export interface PayPicture {
  mid: number;
  col: CostOfLiving;
  adjusted: number;
  leftover: number;
}

/** Everything the card / insights need about pay vs. cost, or null without a salary. */
export function payPicture(job: {
  salary_min: number | null;
  salary_max: number | null;
  location: string | null;
}): PayPicture | null {
  const mid = salaryMid(job.salary_min, job.salary_max);
  if (mid == null) return null;
  const col = costOfLiving(job.location);
  return { mid, col, adjusted: adjustedSalary(mid, col), leftover: monthlyLeftover(mid, col) };
}

/** Index as a difference from the US average: 130 → "+30%", 90 → "−10%", 100 → "US avg". */
export function vsUs(index: number): string {
  const d = Math.round(index - 100);
  if (d === 0) return 'US avg';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}%`;
}

/** The same, as a phrase: "30% above the US average". */
export function vsUsPhrase(index: number): string {
  const d = Math.round(index - 100);
  if (d === 0) return 'about the same as the US average';
  return `${Math.abs(d)}% ${d > 0 ? 'above' : 'below'} the US average`;
}

export function costLabel(index: number): string {
  if (index >= 140) return 'Very high cost';
  if (index >= 115) return 'High cost';
  if (index >= 95) return 'About average';
  return 'Lower cost';
}
