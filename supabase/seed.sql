-- =============================================================================
-- JobSwipe demo data: one demo recruiter + 15 active job listings.
-- Safe to re-run (fixed ids + ON CONFLICT DO NOTHING).
-- Embeddings are filled in automatically: the Discover feed calls the `embed`
-- function's backfill mode when it sees jobs without a match score.
-- =============================================================================

-- Demo recruiter. No password, so nobody can sign in as this account.
-- The on_auth_user_created trigger creates the matching profiles row.
insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  'de000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo-recruiter@jobswipe.invalid',
  '{"provider":"email","providers":["email"]}',
  '{"role":"recruiter","full_name":"JobSwipe Demo Recruiting"}',
  now(), now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

update public.profiles
set onboarded = true, bio = 'Demo listings to explore JobSwipe.'
where id = 'de000000-0000-4000-8000-000000000001';

insert into public.jobs (
  id, recruiter_id, title, company_name, description, location, is_remote,
  salary_min, salary_max, required_skills
) values
('de000000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000001',
 'Senior React Native Engineer', 'Pocketful',
 'Own our consumer finance app end to end. You will build smooth, animated interfaces with Reanimated, ship weekly over-the-air updates with Expo, and work closely with design on a component library used by 2M users. Responsibilities: lead feature development, mentor two mid-level engineers, improve app start-up time and crash-free rate.',
 'Charlotte, NC', false, 140000, 175000, '{React Native,TypeScript,React,Expo,GraphQL}'),

('de000000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000001',
 'Frontend Engineer (React)', 'Brightloop',
 'Build the dashboard our customers use every day. Next.js App Router, TypeScript, Tailwind, and a strong focus on accessibility and performance. You will turn Figma designs into polished, tested components and help shape our design system.',
 null, true, 110000, 140000, '{React,TypeScript,Next.js,JavaScript,UI/UX}'),

('de000000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000001',
 'Backend Engineer, Node.js', 'Relaykit',
 'Design and run the APIs behind our messaging platform. Node.js and TypeScript services on AWS, PostgreSQL, queues and event-driven workflows. You will own reliability for services handling 50k requests per second and participate in a light on-call rotation.',
 'Raleigh, NC', false, 125000, 160000, '{Node.js,TypeScript,PostgreSQL,AWS,Docker}'),

('de000000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000001',
 'Machine Learning Engineer', 'Northwind Health',
 'Train and deploy models that predict patient readmission risk. Python, PyTorch, scikit-learn, feature pipelines in SQL, and model monitoring in production. Partner with clinicians to define metrics and evaluate fairness.',
 null, true, 150000, 190000, '{Python,Machine Learning,SQL,Data Analysis,AWS}'),

('de000000-0000-4000-8000-000000000105', 'de000000-0000-4000-8000-000000000001',
 'Data Analyst', 'Carolina Grocers',
 'Turn store and supply-chain data into decisions. Write SQL against our warehouse, build dashboards, run A/B test analyses for promotions, and present findings to regional managers. Python is a plus.',
 'Charlotte, NC', false, 70000, 90000, '{SQL,Data Analysis,Python}'),

('de000000-0000-4000-8000-000000000106', 'de000000-0000-4000-8000-000000000001',
 'Product Designer', 'Hatchery Labs',
 'Lead design for our mobile onboarding and growth experiments. Research with users, prototype in Figma, and work hand in hand with engineers to ship. Portfolio showing end-to-end product work required.',
 null, true, 105000, 135000, '{Figma,UI/UX,Product Management}'),

('de000000-0000-4000-8000-000000000107', 'de000000-0000-4000-8000-000000000001',
 'DevOps / Platform Engineer', 'Stackbridge',
 'Run the Kubernetes platform our 40 product teams deploy to. Terraform, AWS, CI/CD pipelines, observability, and cost optimisation. Help teams ship safely with golden paths and good defaults.',
 'Atlanta, GA', false, 135000, 170000, '{Kubernetes,Docker,AWS,DevOps,Go}'),

('de000000-0000-4000-8000-000000000108', 'de000000-0000-4000-8000-000000000001',
 'iOS Engineer (Swift)', 'Tidewater',
 'Build our native iOS app for boaters: maps, offline sync, and real-time weather. SwiftUI, Combine, and Core Data. You care about craft, battery life, and accessibility.',
 null, true, 130000, 160000, '{Swift,UI/UX}'),

('de000000-0000-4000-8000-000000000109', 'de000000-0000-4000-8000-000000000001',
 'Android Engineer (Kotlin)', 'Tidewater',
 'Bring our Android app to parity with iOS. Jetpack Compose, Kotlin coroutines, offline-first architecture, and Play Store release management.',
 null, true, 125000, 155000, '{Kotlin,Java}'),

('de000000-0000-4000-8000-000000000110', 'de000000-0000-4000-8000-000000000001',
 'Full-Stack Engineer (TypeScript)', 'Fieldnote',
 'Small team, big scope. React on the front end, Node.js and PostgreSQL on the back end, deployed on Vercel and Supabase. You will talk to customers, ship features end to end, and help decide what we build next.',
 'Durham, NC', false, 115000, 150000, '{React,Node.js,TypeScript,PostgreSQL,Next.js}'),

('de000000-0000-4000-8000-000000000111', 'de000000-0000-4000-8000-000000000001',
 'Junior Software Developer', 'Queen City Software',
 'A great first role. Pair with senior engineers on web applications in JavaScript and Python, write tests, fix bugs, and learn how production software is built and supported. Mentorship and a learning budget included.',
 'Charlotte, NC', false, 65000, 80000, '{JavaScript,Python,SQL}'),

('de000000-0000-4000-8000-000000000112', 'de000000-0000-4000-8000-000000000001',
 'Product Manager, Mobile', 'Pocketful',
 'Own the roadmap for our mobile app. Define problems with data and user research, write clear specs, and work with design and engineering to ship. Experience with consumer mobile products and experimentation required.',
 'Charlotte, NC', false, 130000, 165000, '{Product Management,Data Analysis,UI/UX}'),

('de000000-0000-4000-8000-000000000113', 'de000000-0000-4000-8000-000000000001',
 'Go Backend Engineer', 'Ledgerline',
 'Build high-throughput payment services in Go with PostgreSQL and gRPC. Strong focus on correctness, idempotency and observability. Experience with distributed systems is a plus.',
 null, true, 145000, 185000, '{Go,PostgreSQL,Docker,Kubernetes}'),

('de000000-0000-4000-8000-000000000114', 'de000000-0000-4000-8000-000000000001',
 'Rust Systems Engineer', 'Ferrous Data',
 'Work on our columnar query engine written in Rust. Performance profiling, memory layout, SIMD and concurrency. You enjoy reading flame graphs and writing benchmarks.',
 null, true, 160000, 210000, '{Rust,SQL}'),

('de000000-0000-4000-8000-000000000115', 'de000000-0000-4000-8000-000000000001',
 'GraphQL API Engineer', 'Brightloop',
 'Own our public GraphQL API: schema design, performance, caching and developer experience. Node.js, TypeScript and PostgreSQL. You will write docs that developers actually enjoy.',
 null, true, 120000, 150000, '{GraphQL,Node.js,TypeScript,PostgreSQL}')
on conflict (id) do nothing;

select count(*) as demo_jobs from public.jobs
where recruiter_id = 'de000000-0000-4000-8000-000000000001';
