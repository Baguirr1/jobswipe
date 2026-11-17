# JobSwipe

A "Tinder for jobs" mobile app. Candidates swipe on jobs ranked by AI similarity, recruiters swipe on the candidates who applied, and a mutual right-swipe opens a realtime chat.

**Stack:** Expo SDK 58 (React Native 0.88, Expo Router, TypeScript) · NativeWind 4 · Reanimated 4 + Gesture Handler 3 · Supabase (Postgres, Auth, RLS, Realtime, Edge Functions) · pgvector · Supabase's built-in `gte-small` embedding model (384-d, free, no API key).

## Using the app

### As a job seeker

1. **Sign up.** On the sign-in screen, tap **New here? Create an account**, pick **Job seeker**, and enter your name, email and a password.
2. **Set up your profile.** Onboarding walks you through four short steps:
   1. your **name** and the **job title** you are aiming for,
   2. your **skills** (some are pre-selected from your title; tap tags to change them, or type your own),
   3. your **salary range** (tap a common range, or choose **Custom** for sliders),
   4. your **resume** (optional): upload a PDF, Word (`.docx`) or `.txt` file, or paste the text. A **From your resume** card then suggests a job title, skills and a bio taken from it; untick anything you don't want and tap **Add to profile** (nothing changes until you do).

   When you tap **Start swiping**, the app turns your profile into an AI embedding. This is what the match scores are based on. Contact details (name, email, phone, address, links) are removed first, since they say nothing about fit.
3. **Swipe on jobs** in the **Discover** tab. Jobs are sorted so your best match comes first.
   - **Swipe right**, or tap the green ♥, to **apply**.
   - **Swipe left**, or tap the red ✕, to **pass**.
   - **Tap a card** to flip it over and read the full description.
   - The **"92% match"** badge shows how close the job is to your profile. The back of the card explains it: skills you have, skills to add, and whether the pay reaches your target.
   - Use the **filter** button for remote-only, a minimum salary or a location.
   - If you run out of jobs, tap **Refresh** to check for new listings.
4. **Matches.** When a recruiter also says yes to you, you get an *It's a Match!* popup. The job then shows up in the **Matches** tab.

   **Real job listings** come from public job boards and employers' own careers pages (the card says where, e.g. *Jobs by Adzuna* or *From the company's careers page*). Many are internships and entry-level roles. No recruiter on those is using JobSwipe, so swiping right **saves** the job. You'll find it in the **Saved** tab, where **Apply** opens the listing on the original site and **Mark applied** keeps track of where you've applied.
5. **Chat.** Open a match to message the recruiter in real time.
6. **Profile.** On the **Profile** tab, tap **Edit profile** to change your skills or resume (your matches are re-scored when you save), or tap **Sign out**.

### As a recruiter

1. **Sign up** and pick **Recruiter**.
2. **Post a job.** Go to **My Jobs** and tap the purple **+** button, then fill in the title, company, location or remote, salary range, required skills and description. The job is embedded automatically when you save it.
3. **Manage jobs.** On **My Jobs** you can see how many people applied to each listing, tap **Edit**, or use the switch to turn a listing off or on (turned-off listings are hidden from job seekers).
4. **Review applicants.** Tap **Review applicants** on a job to swipe through the candidates who applied. Swipe right on someone to create a match.
5. **Chat** with your matches in the **Matches** tab.

> Your role is set when you sign up and can't be changed later. To try both sides, use two accounts: for example one in Expo Go on your phone and one in a private browser window.

## How it works

```
Profile / job saved ──► embed Edge Function ──► gte-small (Supabase.ai) ──► vector(384) column
                                                                            │
Discover tab ──► rpc get_recommended_jobs_for_candidate ──► ORDER BY embedding <=> candidate
                    (excludes swiped + inactive jobs, returns match_score_percentage)

Swipe right ──► rpc swipe_job ──────┐   both sides right   ┌──► matches row ──► Realtime ──► chat
Recruiter yes ──► rpc swipe_candidate┘ ───────────────────► │
```

- **Optimistic swiping.** A card leaves the deck the moment the gesture finishes. The write happens in the background, and if it fails the card returns to the top with an error banner (`src/hooks/useSwipeQueue.ts`).
- **Matches are created atomically** inside the swipe RPCs, so the client learns about a match in the same round trip and shows the popup.
- **Match % calibration.** gte-small similarities are compressed: unrelated resume/job pairs score about 0.82 and a near-perfect fit about 0.95. `public.match_pct()` maps the 0.80–0.96 band linearly onto 0–100%. Tune those two constants once you have real data.
- **Embedding budget.** Edge Functions get about 2s of CPU per request on the free plan, and 4 or more gte-small calls in one request fail with `WORKER_RESOURCE_LIMIT`. So each call embeds at most 3 jobs, and a cron job calls `import-jobs` with `{"embed_only": true}` every minute to work through new listings (about 180 an hour).
- **Profile embeddings.** A profile is embedded as its header (title, skills, bio) plus up to two ~1,500-character slices of the resume, averaged into one vector (header weighted 50%), so more of the resume counts than a single truncated string would allow.
- **Resume suggestions** are rule-based and run on the device (`src/lib/resumeExtract.ts`): a headline or first job title, ~40 skill patterns, and the Summary / Profile / Objective section.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migration. Either paste `supabase/migrations/20261026000000_jobswipe_init.sql` into **SQL Editor → Run**, or use the CLI:
   ```bash
   npx supabase init        # once; keeps the existing migrations folder
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
3. Deploy the embedding function. It uses Supabase's built-in `gte-small` model, so no API key is needed:
   ```bash
   npx supabase functions deploy embed
   npx supabase functions deploy parse-resume   # PDF / Word resume uploads
   ```
4. Turn off **Authentication → Sign In / Providers → Email → Confirm email**. Supabase's built-in email sender only delivers to members of your Supabase organization, so other people can't confirm their sign-ups while this is on.
5. If you pasted the first migration by hand, apply the rest of `supabase/migrations/` the same way, in filename order (imported jobs, the gte-small score scale, profile privacy, filters / saved jobs / undo / insights). `npx supabase db push` applies them all.
6. (Optional) Add 15 demo jobs: paste `supabase/seed.sql` into **SQL Editor → Run**. You should see `demo_jobs = 15`. Their embeddings are generated automatically the first time a job seeker opens the Discover tab.

### Real job listings (optional)

The `import-jobs` Edge Function pulls current listings from public job APIs, scores them with the AI, and turns off listings that have been gone for 7 days.

| Source | Key | What you get |
| --- | --- | --- |
| [Adzuna](https://developer.adzuna.com) | Free App ID + key | US (or any country) jobs, searchable by keyword and city, with salaries |
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | None | A few dozen remote, English-language jobs |
| Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Personio | None | Internships, co-ops, new-grad, entry-level and part-time roles (US or remote) straight from employers' public job boards. The boards pulled are listed in `supabase/functions/_shared/ats-companies.ts` |
| [USAJOBS](https://developer.usajobs.gov/) | Free key + your registered email | Federal internships and student / recent-graduate roles |
| [freehire.me](https://freehire.me) | None | Intern and junior US data roles (analyst, engineer, scientist, BI) gathered from ~50 job platforms |

The employer boards are not part of the default run (which stays Adzuna + Arbeitnow). They're pulled in their own scheduled runs (step 4), with the bigger providers split into batches (`{"sources": ["greenhouse"], "batch": "2/3"}`) so each run stays under the Edge Function limits. For USAJOBS, run `npx supabase secrets set USAJOBS_API_KEY=xxxx USAJOBS_EMAIL=you@example.com` in your own terminal, then add a run with `{"sources": ["usajobs"]}`. For freehire, add a run with `{"sources": ["freehire"]}` (no key needed); change the search terms with `"keywords": ["data analyst", ...]` or a `FREEHIRE_KEYWORDS` secret. A listing that already exists under another source (same company, title and location) is skipped, so nothing is duplicated.

1. Sign up at developer.adzuna.com and set your keys. Run this in your own terminal so the key stays private:
   ```bash
   npx supabase secrets set ADZUNA_APP_ID=xxxx ADZUNA_APP_KEY=xxxx
   # optional defaults for the search:
   npx supabase secrets set ADZUNA_WHERE="Charlotte, NC" ADZUNA_WHAT="software engineer,data analyst,ux designer"
   ```
2. Create the import secret and deploy the function:
   ```bash
   npx supabase secrets set IMPORT_SECRET=<a long random string>
   npx supabase functions deploy import-jobs --no-verify-jwt
   ```
3. Run an import by hand:
   ```bash
   curl -X POST https://<project-ref>.supabase.co/functions/v1/import-jobs      -H "x-import-secret: <IMPORT_SECRET>" -H "content-type: application/json"      -d '{"what": ["data analyst"], "where": "Charlotte, NC"}'
   ```
   The body is optional. It returns how many jobs were fetched, saved, retired and embedded.
4. Schedule it daily in **SQL Editor**:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net with schema extensions;
   select vault.create_secret('<IMPORT_SECRET>', 'import_jobs_secret');
   select cron.schedule('import-jobs-daily', '0 10 * * *', $cron$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/import-jobs',
       headers := jsonb_build_object('Content-Type', 'application/json',
         'x-import-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'import_jobs_secret')),
       body := '{}'::jsonb, timeout_milliseconds := 150000);
   $cron$);
   ```
   Then schedule the employer-board imports and the every-minute embedding job: open `supabase/schedule-imports.sql`, replace the project URL with yours, and run it in **SQL Editor**. It creates 11 daily runs (10:05–10:55 UTC, including freehire at 10:05) plus `embed-jobs-every-minute`, and is safe to re-run. Check with `select jobname, schedule, active from cron.job;`.

Remotive's public API is deliberately not used: its terms forbid showing listings behind a sign-up.

### 2. App

```bash
git clone https://github.com/Baguirr1/jobswipe.git
cd jobswipe
npm install
cp .env.example .env   # then fill in your project URL + publishable (anon) key
npx expo start
```

Then do one of the following:

- **Web:** press `w` in the terminal.
- **Phone:** install **Expo Go**, then scan the QR code (use the Camera app on iPhone). Expo Go on iOS needs you signed in to the same Expo account on your phone and on your computer:
  ```bash
  npx expo login -u <your-expo-username>
  ```
  If the browser-based login fails on Windows, create a token at expo.dev → Settings → Access tokens and run `$env:EXPO_TOKEN="..."` in PowerShell before `npx expo start`.
- **Different networks / campus Wi-Fi:** run `npx expo start --tunnel`.

### 3. Try the full flow

1. Sign up as a **Recruiter** and post 2–3 jobs, or skip this step if you loaded the demo jobs.
2. Sign up as a **Job seeker** on another device or account, add skills and a resume, and start swiping. Swipe right on a job.
3. As the recruiter: **My Jobs → Review applicants**, then swipe right on the candidate → *It's a Match!*
4. Both users now see each other in **Matches** and can chat in real time.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Can't sign in after signing up | Turn off **Confirm email** (Setup step 4), delete the user under **Authentication → Users**, and sign up again. |
| Discover tab is empty | No active jobs exist yet. Run `supabase/seed.sql`, run an import, or post a job as a recruiter. |
| Import returns `"adzuna skipped"` | Set the `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` secrets. |
| Errors like *column jobs.source does not exist* | Apply the `20261028000000_job_imports.sql` migration. |
| No "% match" badges | Embeddings are still being generated (about 180 jobs/hour), or the cron jobs aren't scheduled. Check `select * from cron.job` and the `embed` / `import-jobs` function logs. |
| `WORKER_RESOURCE_LIMIT` (HTTP 546) from a function | The request used more than the free plan's CPU budget. Split imports into smaller batches (`"batch": "1/3"`) and keep `embed_limit` at 3 or less. |
| Resume upload says it couldn't read the file | Scanned (image-only) PDFs have no text; paste the resume instead. Make sure `parse-resume` is deployed. |
| "You need to be signed in to Expo Go" | Run `npx expo login`, and sign in to the Expo Go app with the same account. |
| Odd styling errors after config changes | Restart with `npx expo start --clear`. |

## Project layout

```
supabase/
  migrations/…_jobswipe_init.sql   schema, RLS, HNSW indexes, swipe + recommendation RPCs, realtime
  functions/_shared/embeddings.ts  gte-small embedding utility, text builders, contact stripping, resume chunking
  functions/_shared/job-sources.ts fetchers for every job source, early-career / US filters, dedupe
  functions/_shared/ats-companies.ts  verified employer boards per provider
  functions/import-jobs/index.ts   Edge Function: imports real listings, retires stale ones, embeds
  functions/embed/index.ts         Edge Function: embeds the caller's profile or job (RLS-scoped)
  functions/parse-resume/index.ts  Edge Function: text from PDF / Word resumes
  schedule-imports.sql             pg_cron jobs for the daily imports + embedding
src/
  app/                    Expo Router screens
    (tabs)/index.tsx      candidate swipe feed (vector recommendations)
    (tabs)/jobs.tsx       recruiter dashboard
    (tabs)/matches.tsx    mutual matches (live via Realtime)
    chat/[matchId].tsx    1:1 realtime chat
    review/[jobId].tsx    recruiter swipes on applicants
    job/edit.tsx          create/edit a listing
    (tabs)/saved.tsx      saved job-board listings, apply + "mark applied"
    onboarding.tsx        4-step setup: title, skills, salary, resume → embedding
  components/SwipeDeck.tsx  generic 60fps card stack (UI-thread gestures, flip on tap)
  components/ProfileForm.tsx  profile editor, resume upload + "From your resume" suggestions
  hooks/useSwipeQueue.ts    optimistic queue + prefetch + rollback
  hooks/useProfileDraft.ts  profile form state shared by onboarding and Edit profile
  lib/                      Supabase client, typed API calls, embedding client, resume upload + extraction
```

## Notes and limits

- Resume upload reads PDF and `.docx` through the `parse-resume` Edge Function. Scanned (image-only) PDFs have no text to extract, so those users need to paste their resume.
- Roles are fixed at signup (a trigger enforces this). Use a second account to test the other side.
- Swipe and match writes go only through `security definer` RPCs. RLS blocks direct inserts into `swipes`, `recruiter_swipes` and `matches`.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npx eslint src      # lint (React Compiler rules included)
npx expo-doctor     # dependency health
```
