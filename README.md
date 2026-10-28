# JobSwipe

A "Tinder for jobs" mobile app. Candidates swipe on jobs ranked by AI similarity, recruiters swipe on the candidates who applied, and a mutual right-swipe opens a realtime chat.

**Stack:** Expo SDK 58 (React Native 0.88, Expo Router, TypeScript) · NativeWind 4 · Reanimated 4 + Gesture Handler 3 · Supabase (Postgres, Auth, RLS, Realtime, Edge Functions) · pgvector · `sentence-transformers/all-MiniLM-L6-v2` (384-d) via Hugging Face.

## Using the app

### As a job seeker

1. **Sign up.** On the sign-in screen, tap **New here? Create an account**, pick **Job seeker**, and enter your name, email and a password.
2. **Set up your profile.** Onboarding asks for:
   - your **skills** (tap tags to select them, or type your own),
   - the **job title** you are aiming for,
   - your **salary range** (two sliders),
   - your **resume**: paste the text, or upload a `.txt` / `.md` file.

   When you tap **Start swiping**, the app turns your profile into an AI embedding. This is what the match scores are based on.
3. **Swipe on jobs** in the **Discover** tab. Jobs are sorted so your best match comes first.
   - **Swipe right**, or tap the green ♥, to **apply**.
   - **Swipe left**, or tap the red ✕, to **pass**.
   - **Tap a card** to flip it over and read the full description.
   - The purple **"92% Match"** badge shows how close the job is to your profile.
   - If you run out of jobs, tap **Refresh** to check for new listings.
4. **Matches.** When a recruiter also says yes to you, you get an *It's a Match!* popup. The job then shows up in the **Matches** tab.

   **Real job listings** (marked *Jobs by Adzuna* or *via Arbeitnow* on the card) come from public job boards. No recruiter on those is using JobSwipe, so swiping right **saves** the job. You'll find it under **Matches → Saved jobs**, where the **Apply** button opens the listing on the original site.
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
Profile / job saved ──► embed Edge Function ──► Hugging Face MiniLM ──► vector(384) column
                                                                            │
Discover tab ──► rpc get_recommended_jobs_for_candidate ──► ORDER BY embedding <=> candidate
                    (excludes swiped + inactive jobs, returns match_score_percentage)

Swipe right ──► rpc swipe_job ──────┐   both sides right   ┌──► matches row ──► Realtime ──► chat
Recruiter yes ──► rpc swipe_candidate┘ ───────────────────► │
```

- **Optimistic swiping.** A card leaves the deck the moment the gesture finishes. The write happens in the background, and if it fails the card returns to the top with an error banner (`src/hooks/useSwipeQueue.ts`).
- **Matches are created atomically** inside the swipe RPCs, so the client learns about a match in the same round trip and shows the popup.
- **Match % calibration.** Raw MiniLM cosine similarity for a strong resume↔job fit is usually around 0.5–0.75. `public.match_pct()` maps the 0.10–0.75 similarity band linearly onto 0–100%. Tune those two constants once you have real data.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migration. Either paste `supabase/migrations/20261026000000_jobswipe_init.sql` into **SQL Editor → Run**, or use the CLI:
   ```bash
   npx supabase init        # once; keeps the existing migrations folder
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
3. Create a Hugging Face token with the **"Make calls to Inference Providers"** permission and deploy the embedding function:
   ```bash
   npx supabase secrets set HF_TOKEN=hf_xxx
   npx supabase functions deploy embed
   ```
4. Turn off **Authentication → Sign In / Providers → Email → Confirm email**. Supabase's built-in email sender only delivers to members of your Supabase organization, so other people can't confirm their sign-ups while this is on.
5. Apply `supabase/migrations/20261028000000_job_imports.sql` the same way as step 2. It adds support for imported jobs.
6. (Optional) Add 15 demo jobs: paste `supabase/seed.sql` into **SQL Editor → Run**. You should see `demo_jobs = 15`. Their embeddings are generated automatically the first time a job seeker opens the Discover tab.

### Real job listings (optional)

The `import-jobs` Edge Function pulls current listings from public job APIs, scores them with the AI, and turns off listings that have been gone for 7 days.

| Source | Key | What you get |
| --- | --- | --- |
| [Adzuna](https://developer.adzuna.com) | Free App ID + key | US (or any country) jobs, searchable by keyword and city, with salaries |
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | None | A few dozen remote, English-language jobs |

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
| No "% Match" badges | Embeddings are missing. Check that the `HF_TOKEN` secret is set, then open the `embed` function logs in the Supabase dashboard. |
| "You need to be signed in to Expo Go" | Run `npx expo login`, and sign in to the Expo Go app with the same account. |
| Odd styling errors after config changes | Restart with `npx expo start --clear`. |

## Project layout

```
supabase/
  migrations/…_jobswipe_init.sql   schema, RLS, HNSW indexes, swipe + recommendation RPCs, realtime
  functions/_shared/embeddings.ts  Hugging Face embedding utility (fetch-only, runtime-agnostic)
  functions/_shared/job-sources.ts Adzuna + Arbeitnow fetchers, HTML cleanup, skill extraction
  functions/import-jobs/index.ts   Edge Function: daily import of real listings
  functions/embed/index.ts         Edge Function: embeds the caller's profile or job (RLS-scoped)
src/
  app/                    Expo Router screens
    (tabs)/index.tsx      candidate swipe feed (vector recommendations)
    (tabs)/jobs.tsx       recruiter dashboard
    (tabs)/matches.tsx    mutual matches (live via Realtime)
    chat/[matchId].tsx    1:1 realtime chat
    review/[jobId].tsx    recruiter swipes on applicants
    job/edit.tsx          create/edit a listing
    onboarding.tsx        skills, salary range, resume → embedding
  components/SwipeDeck.tsx  generic 60fps card stack (UI-thread gestures, flip on tap)
  hooks/useSwipeQueue.ts    optimistic queue + prefetch + rollback
  lib/                      Supabase client, typed API calls, embedding client
```

## Notes and limits

- Resume upload accepts `.txt` / `.md`. For PDFs, paste the text. Server-side PDF extraction would be a good next step.
- Roles are fixed at signup (a trigger enforces this). Use a second account to test the other side.
- Swipe and match writes go only through `security definer` RPCs. RLS blocks direct inserts into `swipes`, `recruiter_swipes` and `matches`.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npx eslint src      # lint (React Compiler rules included)
npx expo-doctor     # dependency health
```
