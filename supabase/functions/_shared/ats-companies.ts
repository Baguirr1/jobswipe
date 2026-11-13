// Employer job boards pulled by import-jobs, per applicant-tracking system.
//
// Board identifiers are provider-specific (Stripe is "stripe" on Greenhouse,
// Bosch is "BoschGroup" on SmartRecruiters), so each list only contains tokens
// that were checked against that provider's public API and returned listings
// (verified 2026-11-12; picked for having internship / early-career roles).
// A board that later 404s only logs an error; the other boards still import.
//
// These are the public job-board APIs each provider offers so employers' jobs
// can be shown elsewhere. JobSwipe only links out: users apply on the
// employer's own posting (apply_url).

import type { JobSource } from './job-sources.ts';

export type AtsSource = Extract<
  JobSource,
  'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'recruitee' | 'personio'
>;

export const ATS_SOURCES: AtsSource[] = [
  'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'personio',
];

export const ATS_COMPANIES: Record<AtsSource, string[]> = {
  greenhouse: [
    'stripe', 'airbnb', 'robinhood', 'databricks', 'figma', 'cloudflare', 'datadog',
    'duolingo', 'pinterest', 'lyft', 'roblox', 'affirm', 'brex', 'scaleai', 'spacex',
    'coinbase', 'twitch', 'samsara', 'mongodb', 'elastic', 'hubspotjobs', 'point72',
    'sofi', 'nuro', 'waymo', 'janestreet', 'imc', 'akunacapital', 'virtu',
    'jumptrading', 'gusto', 'verkada', 'flexport',
  ],
  lever: ['palantir', 'zoox', 'shieldai', 'matchgroup', 'veeva', 'ro'],
  ashby: [
    // Not "cursor": its board answers, but every jobs.ashbyhq.com posting link 404s.
    'ramp', 'notion', 'perplexity', 'snowflake', 'harvey', 'sierra', 'cohere',
    'modal', 'hex',
  ],
  smartrecruiters: [
    'BoschGroup', 'ServiceNow', 'Ubisoft2', 'Equinox', 'LinkedIn3', 'WesternDigital',
    'Experian', 'NBCUniversal3', 'AECOM2', 'CERN',
  ],
  recruitee: ['bunq', 'channable'],
  personio: ['1komma5grad', 'ottonova', 'tado'],
};
