import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import fixtures from "./fixtures/boards.json" with { type: "json" };
import freehire from "./fixtures/freehire.json" with { type: "json" };
import {
  dedupeJobs,
  fetchFreehire,
  fetchGreenhouse,
  fetchSmartRecruiters,
  fetchText,
  type ImportedJob,
  jobFingerprint,
  JobRequestError,
  normalizeAdzuna,
  normalizeArbeitnow,
  normalizeAshby,
  normalizeFreehire,
  normalizeGreenhouse,
  normalizeLever,
  normalizePersonio,
  normalizeRecruitee,
  normalizeSalary,
  normalizeSmartRecruiters,
  htmlToText,
  normalizeHourly,
  toEmploymentType,
  toWorkplaceType,
} from "../job-sources.ts";

// Every test starts with network access disabled, even if run with permissions.
const denyFetch: typeof fetch = () => {
  throw new Error("Unexpected fetch in offline test");
};
function offlineTest(name: string, run: () => void | Promise<void>) {
  Deno.test(name, async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    // Network failures have no Retry-After; advance their backoff without waiting.
    if (name.includes("network")) {
      globalThis.setTimeout = ((handler, _delay, ...args) =>
        originalSetTimeout(handler, 0, ...args)) as typeof setTimeout;
    }
    globalThis.fetch = denyFetch;
    try {
      await run();
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }
  });
}
async function withFetch(stub: typeof fetch, run: () => Promise<void>) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
  }
}
const json = (body: unknown) => new Response(JSON.stringify(body));
const base = normalizeGreenhouse(fixtures.greenhouse, "acme")!;

offlineTest(
  "jobFingerprint normalizes case, punctuation, suffixes and first location segment",
  () => {
    const fingerprint = jobFingerprint(base);
    assertEquals(fingerprint, "acme|software engineering intern|austin");
    for (const company_name of ["ACME, LLC", "Acme Inc.", "Acme"]) {
      for (const location of ["AUSTIN; Texas", "Austin|USA", "Austin, TX"]) {
        assertEquals(
          jobFingerprint({
            ...base,
            company_name,
            location,
            title: "Software-Engineering INTERN!",
          }),
          fingerprint,
        );
      }
    }
    assertNotEquals(
      jobFingerprint({ ...base, title: "Data Intern" }),
      fingerprint,
    );
    assertNotEquals(
      jobFingerprint({ ...base, location: "Boston, MA" }),
      fingerprint,
    );
    assertEquals(jobFingerprint({ ...base, location: null }).split("|")[2], "");
  },
);

offlineTest(
  "dedupeJobs keeps first provider/id and preferred cross-provider job in survivor order",
  () => {
    const low = { ...base, source: "adzuna" as const, external_id: "low" };
    const distinct = {
      ...base,
      source: "lever" as const,
      external_id: "other",
      title: "Data Intern",
    };
    const duplicateId = { ...base, title: "Changed title" };
    const sameProvider = { ...base, external_id: "second" };
    const input = [low, distinct, base, duplicateId, sameProvider];
    assertEquals(dedupeJobs(input), [distinct, base]);
    assertEquals(input.length, 5);
    assertEquals(dedupeJobs([]), []);
    assertEquals(dedupeJobs([distinct, { ...distinct, source: "adzuna" }]), [
      distinct,
    ]);
  },
);

const normalizers = [
  ["greenhouse", () => normalizeGreenhouse(fixtures.greenhouse, "acme"), "101"],
  ["lever", () => normalizeLever(fixtures.lever, "acme"), "lv-1"],
  ["ashby", () => normalizeAshby(fixtures.ashby, "acme"), "as-1"],
  [
    "smartrecruiters",
    () => normalizeSmartRecruiters(fixtures.smartrecruiters, "acme"),
    "sr-1",
  ],
  ["recruitee", () => normalizeRecruitee(fixtures.recruitee, "acme"), "201"],
  ["personio", () => normalizePersonio(fixtures.personio, "acme"), "301"],
] as const;
for (const [source, normalize, id] of normalizers) {
  offlineTest(`${source} fixture normalizes identity, HTML and skills`, () => {
    const job = normalize();
    assert(job);
    assertEquals(job.source, source);
    assertEquals(job.external_id, `acme:${id}`);
    assertStringIncludes(job.description, "Python");
    assertStringIncludes(job.description, "&");
    assert(!/<\/?(?:p|li|ul)>|&amp;/.test(job.description));
    assert(job.required_skills.includes("Python"));
    assert(job.apply_url.startsWith("https://"));
  });
}

offlineTest(
  "ATS eligibility rejects senior/non-US roles, permits remote and option overrides",
  () => {
    const cases: Array<
      (title: string, location: string, remote: boolean) => ImportedJob | null
    > = [
      (title, location) =>
        normalizeGreenhouse({
          ...fixtures.greenhouse,
          title,
          location: { name: location },
        }, "acme"),
      (text, location, remote) =>
        normalizeLever({
          ...fixtures.lever,
          text,
          country: undefined,
          categories: { location },
          workplaceType: remote ? "remote" : "onsite",
        }, "acme"),
      (title, location, isRemote) =>
        normalizeAshby({
          ...fixtures.ashby,
          title,
          location,
          isRemote,
          address: undefined,
        }, "acme"),
      (name, fullLocation, remote) =>
        normalizeSmartRecruiters({
          ...fixtures.smartrecruiters,
          name,
          location: { fullLocation, remote },
        }, "acme"),
      (title, location, remote) =>
        normalizeRecruitee({
          ...fixtures.recruitee,
          title,
          location,
          remote,
          country_code: undefined,
        }, "acme"),
      (title, location) =>
        normalizePersonio(
          fixtures.personio.replace("Engineering Intern", title).replace(
            "Remote, USA",
            location,
          ),
          "acme",
        ),
    ];
    for (const normalize of cases) {
      assertEquals(normalize("Senior Engineer", "Austin, TX", false), null);
      assertEquals(normalize("Junior Engineer", "Berlin, Germany", true), null);
      assert(normalize("Junior Engineer", "Remote", true));
      assert(normalize("Senior Intern", "Austin, TX", false));
    }
    assert(
      normalizeGreenhouse(
        {
          ...fixtures.greenhouse,
          title: "Senior Engineer",
          location: { name: "Berlin, Germany" },
        },
        "acme",
        { earlyCareerOnly: false, usOnly: false },
      ),
    );
    assertEquals(
      normalizeAshby({ ...fixtures.ashby, isListed: false }, "acme"),
      null,
    );
    assertEquals(
      normalizeRecruitee({ ...fixtures.recruitee, status: "draft" }, "acme"),
      null,
    );
    assertEquals(
      normalizeLever({ ...fixtures.lever, country: "CA" }, "acme"),
      null,
    );
  },
);

offlineTest(
  "annual salary normalization and nonannual salary exclusion",
  () => {
    assertEquals(normalizeSalary("90000.6", 70000), [70000, 90001]);
    assertEquals(normalizeSalary(35, NaN), [null, null]);
    assertEquals(normalizeSalary(Infinity, undefined), [null, null]);
    for (
      const [job, expected] of [
        [normalizeLever(fixtures.lever, "acme"), [70000, 90000]],
        [normalizeAshby(fixtures.ashby, "acme"), [80000, 100000]],
        [normalizeRecruitee(fixtures.recruitee, "acme"), [75000, 95000]],
        [
          normalizeLever({
            ...fixtures.lever,
            salaryRange: { min: 80000, max: 90000, interval: "hour" },
          }, "acme"),
          [null, null],
        ],
        [
          normalizeAshby({
            ...fixtures.ashby,
            compensation: {
              summaryComponents: [{
                compensationType: "Salary",
                interval: "monthly",
                minValue: 12000,
              }],
            },
          }, "acme"),
          [null, null],
        ],
        [
          normalizeRecruitee({
            ...fixtures.recruitee,
            salary: { min: 12000, period: "month" },
          }, "acme"),
          [null, null],
        ],
      ] as const
    ) {
      assert(job);
      assertEquals<readonly (number | null)[]>([job.salary_min, job.salary_max], expected);
    }
  },
);

offlineTest(
  "Adzuna fixture strips HTML and excludes predicted salaries",
  () => {
    const job = normalizeAdzuna(fixtures.adzuna)!;
    assertEquals(job.external_id, "401");
    assertEquals(job.title, "Junior Engineer");
    assertEquals(job.description, "Build Python & SQL tools.");
    assertEquals([job.salary_min, job.salary_max], [80000, 100000]);
    assertEquals(
      normalizeAdzuna({ ...fixtures.adzuna, salary_is_predicted: "1" })!
        .salary_min,
      null,
    );
    assertEquals(
      normalizeAdzuna({ ...fixtures.adzuna, redirect_url: "" }),
      null,
    );
    assert(job.is_remote);
  },
);
offlineTest("Arbeitnow fixture requires remote English listings", () => {
  const job = normalizeArbeitnow(fixtures.arbeitnow)!;
  assertEquals(job.external_id, fixtures.arbeitnow.slug);
  assertEquals(job.description, "Build Python & SQL tools.");
  assert(job.required_skills.includes("React"));
  assertEquals(
    normalizeArbeitnow({ ...fixtures.arbeitnow, remote: false }),
    null,
  );
  assertEquals(
    normalizeArbeitnow({ ...fixtures.arbeitnow, title: "Entwickler (m/w/d)" }),
    null,
  );
});

const secretUrl = "https://example.test/private?api_key=secret";
for (const status of [429, 500, 503]) {
  offlineTest(
    `fetchText retries ${status} twice, honors zero Retry-After, redacts URL`,
    async () => {
      let calls = 0;
      const start = performance.now();
      await withFetch(() => {
        calls++;
        return Promise.resolve(
          new Response("failed", { status, headers: { "Retry-After": "0" } }),
        );
      }, async () => {
        const error = await assertRejects(
          () => fetchText(secretUrl, { provider: "Fixture", company: "Acme" }),
          JobRequestError,
        );
        assertEquals(error.status, status);
        assertEquals(error.message, `Fixture Acme request failed (${status})`);
        assert(!error.message.includes(secretUrl));
      });
      assertEquals(calls, 3); // Initial request plus MAX_RETRIES (2).
      assert(
        performance.now() - start < 1000,
        "Retry-After should bypass exponential backoff",
      );
    },
  );
}
offlineTest("fetchText returns successful retry body", async () => {
  let calls = 0;
  await withFetch(
    () =>
      Promise.resolve(
        ++calls === 1
          ? new Response("busy", {
            status: 429,
            headers: { "Retry-After": "0" },
          })
          : new Response("ready"),
      ),
    async () => {
      assertEquals(await fetchText(secretUrl), "ready");
    },
  );
  assertEquals(calls, 2);
});
offlineTest(
  "fetchText does not retry 404 and preserves status without URL",
  async () => {
    let calls = 0;
    await withFetch(() => {
      calls++;
      return Promise.resolve(new Response("closed", { status: 404 }));
    }, async () => {
      const error = await assertRejects(
        () => fetchText(secretUrl),
        JobRequestError,
      );
      assertEquals(error.status, 404);
      assertEquals(error.message, "Jobs  request failed (404)");
    });
    assertEquals(calls, 1);
  },
);
offlineTest(
  "fetchText retries network failures and redacts underlying URL",
  async () => {
    let calls = 0;
    await withFetch(() => {
      calls++;
      throw new TypeError(`Cannot fetch ${secretUrl}`);
    }, async () => {
      const error = await assertRejects(
        () => fetchText(secretUrl),
        JobRequestError,
      );
      assertEquals(error.status, undefined);
      assertEquals(error.message, "Jobs  request failed (TypeError)");
    });
    assertEquals(calls, 3);
  },
);
offlineTest("fetchText recovers after network failure", async () => {
  let calls = 0;
  await withFetch(() => {
    if (++calls === 1) throw new TypeError(secretUrl);
    return Promise.resolve(new Response("recovered"));
  }, async () => {
    assertEquals(await fetchText(secretUrl), "recovered");
  });
  assertEquals(calls, 2);
});

offlineTest(
  "Greenhouse lists all qualifying IDs beyond 60 details; skips 404 and warns for other failures",
  async () => {
    const rows = Array.from(
      { length: 63 },
      (_, id) => ({ ...fixtures.greenhouse, id }),
    );
    const listed: string[] = [],
      warnings: string[] = [],
      details: number[] = [];
    await withFetch((input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs")) {
        return Promise.resolve(
          json({
            jobs: [...rows, { ...rows[0], id: 99, title: "Senior Engineer" }],
          }),
        );
      }
      const id = Number(path.split("/").pop());
      details.push(id);
      if (id === 0) {
        return Promise.resolve(new Response("closed", { status: 404 }));
      }
      if (id === 1) {
        return Promise.resolve(
          new Response("unavailable", {
            status: 503,
            headers: { "Retry-After": "0" },
          }),
        );
      }
      assert(id < 60, "No detail requests beyond cap");
      return Promise.resolve(json({ content: "<p>Python</p>" }));
    }, async () => {
      const jobs = await fetchGreenhouse("acme", {
        onListed: (id) => listed.push(id),
        onWarning: (message) => warnings.push(message),
      });
      assertEquals(jobs.length, 58);
      assertEquals(jobs[0].external_id, "acme:2");
    });
    assertEquals(listed, rows.map((r) => `acme:${r.id}`));
    assertEquals(details, [
      0,
      1,
      1,
      1,
      ...Array.from({ length: 58 }, (_, i) => i + 2),
    ]);
    assertEquals(warnings, ["greenhouse acme: 1/60 detail requests failed"]);
  },
);
offlineTest("Greenhouse 404 detail alone is silent", async () => {
  const warnings: string[] = [];
  await withFetch(
    (input) =>
      Promise.resolve(
        String(input).endsWith("/jobs")
          ? json({ jobs: [fixtures.greenhouse] })
          : new Response("closed", { status: 404 }),
      ),
    async () => {
      assertEquals(
        await fetchGreenhouse("acme", {
          onWarning: (message) => warnings.push(message),
        }),
        [],
      );
    },
  );
  assertEquals(warnings, []);
});
offlineTest(
  "SmartRecruiters keeps paging and listing after 40 details, deduplicates and filters",
  async () => {
    const rows = Array.from(
      { length: 105 },
      (_, id) => ({ ...fixtures.smartrecruiters, id: String(id) }),
    );
    const listed: string[] = [], offsets: number[] = [], details: string[] = [];
    await withFetch((input) => {
      const url = new URL(String(input));
      if (url.searchParams.has("offset")) {
        const offset = Number(url.searchParams.get("offset"));
        offsets.push(offset);
        assert(offset === 0 || offset === 100, "Unexpected page");
        return Promise.resolve(json({
          totalFound: 108,
          content: offset === 0
            ? rows.slice(0, 100)
            : [...rows.slice(100), rows[0], {
              ...rows[0],
              id: "senior",
              name: "Senior Engineer",
            }, { ...rows[0], id: "foreign", location: { country: "DE" } }],
        }));
      }
      const id = url.pathname.split("/").pop()!;
      details.push(id);
      assert(Number(id) < 40, "No detail requests past cap");
      return Promise.resolve(json({ jobAd: fixtures.smartrecruiters.jobAd }));
    }, async () => {
      const jobs = await fetchSmartRecruiters("acme", {
        onListed: (id) => listed.push(id),
      });
      assertEquals(jobs.length, 40);
      assertEquals(
        jobs.map((j) => j.external_id),
        rows.slice(0, 40).map((r) => `acme:${r.id}`),
      );
    });
    assertEquals(offsets, [0, 100]);
    assertEquals(details, rows.slice(0, 40).map((r) => r.id));
    assertEquals(listed, rows.map((r) => `acme:${r.id}`));
  },
);

offlineTest("fetchText schedules zero delay for Retry-After: 0", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((handler, delay, ...args) => {
    delays.push(delay ?? 0);
    return originalSetTimeout(handler, 0, ...args);
  }) as typeof setTimeout;
  try {
    await withFetch(
      async () =>
        new Response("busy", { status: 429, headers: { "Retry-After": "0" } }),
      async () => {
        await assertRejects(() => fetchText(secretUrl), JobRequestError);
      },
    );
    assertEquals(delays, [0, 0]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

offlineTest(
  "Personio decodes XML entities and CDATA HTML including numeric entities",
  () => {
    const xml = fixtures.personio
      .replace("Engineering Intern", "Engineering &amp; Design Intern")
      .replace("Python &amp; SQL", "Python &amp; SQL &#39;tools&#39; &#x41;");
    const job = normalizePersonio(xml, "acme");
    assert(job);
    assertEquals(job.title, "Engineering & Design Intern");
    assertEquals(job.description, "Work\nBuild Python & SQL 'tools' A tools.");
  },
);

offlineTest("toEmploymentType maps each board's labels", () => {
  const cases: [string, string | null][] = [
    ["Full-time", "full_time"], ["FullTime", "full_time"], ["fulltime", "full_time"], ["permanent", "full_time"],
    ["Part-time", "part_time"], ["PartTime", "part_time"],
    ["Intern", "internship"], ["Internship", "internship"], ["trainee", "internship"],
    ["Contract", "contract"], ["freelance", "contract"],
    ["Temporary", "temporary"], ["Seasonal", "temporary"],
    ["", null], ["Internal", null],
  ];
  for (const [label, expected] of cases) assertEquals(toEmploymentType(label), expected, label);
  // The first label that maps wins (Personio: employmentType, then schedule).
  assertEquals(toEmploymentType("", "part-time"), "part_time");
  assertEquals(toEmploymentType(undefined, null), null);
});

offlineTest("toWorkplaceType maps each board's labels", () => {
  const cases: [string | undefined, string | null][] = [
    ["OnSite", "onsite"], ["onsite", "onsite"], ["On-site", "onsite"],
    ["Hybrid", "hybrid"], ["remote", "remote"], ["unspecified", null], [undefined, null],
  ];
  for (const [label, expected] of cases) assertEquals(toWorkplaceType(label), expected, String(label));
});

offlineTest("ATS normalizers pass through the board's job type and workplace", () => {
  const lever = normalizeLever({
    ...fixtures.lever,
    categories: { ...fixtures.lever.categories, commitment: "Intern" },
    workplaceType: "hybrid",
  }, "acme");
  assertEquals([lever?.employment_type, lever?.workplace_type], ["internship", "hybrid"]);

  const ashby = normalizeAshby({ ...fixtures.ashby, employmentType: "PartTime", workplaceType: "OnSite" }, "acme");
  assertEquals([ashby?.employment_type, ashby?.workplace_type], ["part_time", "onsite"]);

  const smart = normalizeSmartRecruiters({
    ...fixtures.smartrecruiters,
    typeOfEmployment: { label: "Full-time" },
    location: { ...fixtures.smartrecruiters.location, hybrid: true },
  }, "acme");
  assertEquals([smart?.employment_type, smart?.workplace_type], ["full_time", "hybrid"]);

  const recruitee = normalizeRecruitee({ ...fixtures.recruitee, employment_type_code: "contract" }, "acme");
  assertEquals([recruitee?.employment_type, recruitee?.workplace_type], ["contract", "remote"]);

  // Greenhouse has no such fields: leave both for the database to derive.
  const greenhouse = normalizeGreenhouse(fixtures.greenhouse, "acme");
  assertEquals([greenhouse?.employment_type, greenhouse?.workplace_type], [null, null]);
  // Arbeitnow only imports remote listings.
  assertEquals(normalizeArbeitnow(fixtures.arbeitnow)?.workplace_type, "remote");
});

offlineTest("Adzuna predictions become an estimate, not a salary", () => {
  const job = normalizeAdzuna({ ...fixtures.adzuna, salary_is_predicted: "1" })!;
  assertEquals([job.salary_min, job.salary_max], [null, null]);
  assertEquals(
    [job.est_pay_min, job.est_pay_max, job.est_pay_period, job.est_pay_source],
    [80000, 100000, "year", "adzuna"],
  );
  const real = normalizeAdzuna(fixtures.adzuna)!;
  assertEquals([real.est_pay_min, real.est_pay_source], [null, null]);
});

offlineTest("hourly pay from board salary fields", () => {
  const lever = normalizeLever({
    ...fixtures.lever,
    salaryRange: { min: 25, max: 35, interval: "per-hour-wage" },
  }, "acme")!;
  assertEquals(
    [lever.salary_min, lever.salary_max, lever.hourly_min, lever.hourly_max],
    [null, null, 25, 35],
  );
  const ashby = normalizeAshby({
    ...fixtures.ashby,
    compensation: {
      summaryComponents: [{ compensationType: "Salary", interval: "1 HOUR", minValue: 40.5, maxValue: 45 }],
    },
  }, "acme")!;
  assertEquals([ashby.hourly_min, ashby.hourly_max], [40.5, 45]);
  const recruitee = normalizeRecruitee({
    ...fixtures.recruitee,
    salary: { min: 18, max: 22, period: "hour" },
  }, "acme")!;
  assertEquals([recruitee.hourly_min, recruitee.hourly_max], [18, 22]);
  // Annual-only boards are unchanged.
  assertEquals(normalizeLever(fixtures.lever, "acme")!.hourly_min, null);
  assertEquals(normalizeHourly(5, 1000), [null, null]);
  assertEquals(normalizeHourly(30, 20), [20, 30]);
});

offlineTest("htmlToText decodes typographic entities", () => {
  assertEquals(
    htmlToText("<p>$153,120&mdash;$196,750 &ndash; we&rsquo;re hiring&hellip;</p>"),
    "$153,120—$196,750 – we’re hiring…",
  );
});

// ---------- freehire ----------
// Fixtures are real API records (descriptions trimmed), fetched 2026-11-16.
offlineTest("normalizeFreehire maps fields, annual salary and skills", () => {
  const job = normalizeFreehire(freehire.annual)!;
  assertEquals(job.source, "freehire");
  assertEquals(job.external_id, freehire.annual.public_slug);
  assertEquals(job.apply_url, freehire.annual.url);
  assertEquals(job.company_name, "Booking.com");
  assertEquals(job.location, "Grand Rapids");
  assertEquals([job.salary_min, job.salary_max, job.hourly_min], [105100, 116000, null]);
  assertEquals([job.employment_type, job.workplace_type, job.is_remote], ["full_time", null, false]);
  // "powerbi" in freehire's skill tags still maps to the app's Power BI tag.
  for (const skill of ["Python", "SQL", "Tableau", "Power BI"]) assert(job.required_skills.includes(skill), skill);
});

offlineTest("normalizeFreehire: junior tag counts as early career without a title keyword", () => {
  // "Data Analyst I" has no early-career word; freehire's seniority tag does it.
  assert(normalizeFreehire(freehire.annual) !== null);
  const mid = { ...freehire.annual, enrichment: { ...freehire.annual.enrichment, seniority: "middle" } };
  assertEquals(normalizeFreehire(mid), null);
  assert(normalizeFreehire(mid, { earlyCareerOnly: false }) !== null);
  // A senior title stays out even when tagged junior.
  assertEquals(normalizeFreehire({ ...freehire.annual, title: "Senior Data Analyst" }), null);
});

offlineTest("normalizeFreehire: hourly and period-less salaries", () => {
  const hourly = normalizeFreehire(freehire.hourly)!;
  assertEquals([hourly.salary_min, hourly.hourly_min, hourly.hourly_max], [null, 20, 22]);
  assertEquals([hourly.employment_type, hourly.workplace_type], ["internship", "hybrid"]);
  const noPeriod = normalizeFreehire(freehire.no_period)!;
  assertEquals([noPeriod.salary_min, noPeriod.salary_max, noPeriod.hourly_min], [65000, 75000, null]);
  const eur = { ...freehire.annual, enrichment: { ...freehire.annual.enrichment, salary_currency: "EUR" } };
  assertEquals([normalizeFreehire(eur)!.salary_min, normalizeFreehire(eur)!.hourly_min], [null, null]);
});

offlineTest("normalizeFreehire drops closed, non-English and non-US postings", () => {
  assertEquals(normalizeFreehire({ ...freehire.annual, closed_at: "2026-11-15T00:00:00Z" }), null);
  assertEquals(normalizeFreehire({ ...freehire.annual, enrichment: { ...freehire.annual.enrichment, posting_language: "de" } }), null);
  const london = { ...freehire.annual, location: "London", countries: ["gb"] };
  assertEquals(normalizeFreehire(london), null);
  assert(normalizeFreehire(london, { usOnly: false }) !== null);
  assertEquals(normalizeFreehire({ ...freehire.annual, url: undefined }), null);
});

offlineTest("dedupeJobs prefers the employer board over freehire, freehire over Adzuna", () => {
  const fh = normalizeFreehire(freehire.annual)!;
  const board = { ...fh, source: "greenhouse" as const, external_id: "booking:1" };
  const adzuna = { ...fh, source: "adzuna" as const, external_id: "az-1" };
  assertEquals(dedupeJobs([fh, board]), [board]);
  assertEquals(dedupeJobs([adzuna, fh]), [fh]);
});

offlineTest("fetchFreehire sends US junior/intern facets and pages until the total", async () => {
  const urls: URL[] = [];
  const page = (offset: number) =>
    Array.from({ length: offset === 0 ? 100 : 20 }, (_, i) => ({ ...freehire.annual, public_slug: `job-${offset + i}`, title: `Data Analyst ${offset + i}` }));
  await withFetch(((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    const offset = Number(url.searchParams.get("offset"));
    return Promise.resolve(json({ data: page(offset), meta: { total: 120, limit: 100, offset } }));
  }) as typeof fetch, async () => {
    const jobs = await fetchFreehire({ keywords: ["data analyst", "data engineer"] });
    assertEquals(jobs.length, 120);
  });
  assertEquals(urls.length, 2);
  const first = urls[0];
  assertEquals(first.pathname, "/api/v1/agent/jobs/search");
  assertEquals(first.searchParams.get("q"), "data analyst OR data engineer");
  assertEquals(first.searchParams.getAll("countries"), ["us"]);
  assertEquals(first.searchParams.getAll("seniority"), ["intern", "junior"]);
  assertEquals(first.searchParams.get("description_format"), "text");
  assertEquals(urls[1].searchParams.get("offset"), "100");
});

offlineTest("fetchFreehire splits more than 5 keywords across requests", async () => {
  const queries: string[] = [];
  await withFetch(((input: string | URL | Request) => {
    queries.push(new URL(String(input)).searchParams.get("q")!);
    return Promise.resolve(json({ data: [], meta: { total: 0 } }));
  }) as typeof fetch, async () => {
    assertEquals(await fetchFreehire({ keywords: ["a", "b", "c", "d", "e", "f OR g"] }), []);
  });
  assertEquals(queries, ["a OR b OR c OR d OR e", "f g"]);
});
