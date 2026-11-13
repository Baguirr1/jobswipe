-- Run in the SQL Editor (or `supabase db query --remote -f`) to (re)create the import schedules.
-- Daily imports from employer job boards + continuous embedding of new jobs.
-- Existing job 'import-jobs-daily' (10:00 UTC, Adzuna + Arbeitnow) is left as is.
-- cron.schedule(name, ...) replaces a job with the same name, so this is re-runnable.
do $$
declare
  fn_url  constant text := 'https://rkqampvzkfivnkpfudtu.supabase.co/functions/v1/import-jobs';
  headers constant text := $h$jsonb_build_object('Content-Type', 'application/json', 'x-import-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'import_jobs_secret'))$h$;
  runs    constant text[][] := array[
    -- job name                       minute  body
    array['import-greenhouse-1-daily',     '10', '{"sources":["greenhouse"],"batch":"1/3"}'],
    array['import-greenhouse-2-daily',     '15', '{"sources":["greenhouse"],"batch":"2/3"}'],
    array['import-greenhouse-3-daily',     '20', '{"sources":["greenhouse"],"batch":"3/3"}'],
    array['import-ashby-daily',            '25', '{"sources":["ashby"]}'],
    array['import-lever-1-daily',          '30', '{"sources":["lever"],"batch":"1/3"}'],
    array['import-lever-2-daily',          '35', '{"sources":["lever"],"batch":"2/3"}'],
    array['import-lever-3-daily',          '40', '{"sources":["lever"],"batch":"3/3"}'],
    array['import-smartrecruiters-1-daily','45', '{"sources":["smartrecruiters"],"batch":"1/2"}'],
    array['import-smartrecruiters-2-daily','50', '{"sources":["smartrecruiters"],"batch":"2/2"}'],
    array['import-recruitee-personio-daily','55', '{"sources":["recruitee","personio"]}']
  ];
  r text[];
begin
  foreach r slice 1 in array runs loop
    perform cron.schedule(
      r[1],
      r[2] || ' 10 * * *',
      format(
        $c$select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 150000)$c$,
        fn_url, headers, r[3]
      )
    );
  end loop;

  -- Scores unembedded jobs. 3 per call is the measured maximum: 4+ hits the
  -- Edge Function CPU limit (WORKER_RESOURCE_LIMIT).
  perform cron.schedule(
    'embed-jobs-every-minute',
    '* * * * *',
    format(
      $c$select net.http_post(url := %L, headers := %s, body := %L::jsonb, timeout_milliseconds := 30000)$c$,
      fn_url, headers, '{"embed_only":true,"embed_limit":3}'
    )
  );
end $$;

select jobname, schedule, active from cron.job order by jobname;
