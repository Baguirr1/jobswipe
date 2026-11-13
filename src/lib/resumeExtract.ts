// Pull profile suggestions (job title, skills, summary) out of resume text.
// Rule-based and on-device: no API calls. Results are only suggestions; the
// user picks what to keep before anything changes in their profile.

export interface ResumeSuggestions {
  title: string | null;
  skills: string[];
  summary: string | null;
}

// Canonical names match SKILL_OPTIONS (src/lib/format.ts) and the importer's
// skill tags, so suggested skills highlight on job cards.
const SKILL_PATTERNS: [string, RegExp][] = [
  ['React Native', /\breact[\s-]?native\b/i],
  ['React', /\breact(?:\.?js)?\b(?![\s-]?native)/i],
  ['Next.js', /\bnext\.?js\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['JavaScript', /\bjavascript\b|\bes6\b/i],
  ['Node.js', /\bnode(?:\.?js)?\b/i],
  ['Python', /\bpython\b/i],
  ['Go', /\bgolang\b/i],
  ['Rust', /\brust\b/i],
  ['Java', /\bjava\b(?!\s?script)/i],
  ['Kotlin', /\bkotlin\b/i],
  ['Swift', /\bswift(?:ui)?\b/i],
  ['C++', /(?:^|[^\w])c\+\+/i],
  ['C#', /(?:^|[^\w])c#(?![\w])|\.net\b/i],
  ['HTML/CSS', /\bhtml5?\b|\bcss3?\b/i],
  ['SQL', /\bsql\b|\bmysql\b|\bsqlite\b/i],
  ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
  ['MongoDB', /\bmongo(?:db)?\b/i],
  ['GraphQL', /\bgraphql\b/i],
  ['AWS', /\baws\b|\bamazon web services\b/i],
  ['Azure', /\bazure\b/i],
  ['Google Cloud', /\bgcp\b|\bgoogle cloud\b/i],
  ['Docker', /\bdocker\b/i],
  ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['Git', /\bgit(?:hub|lab)?\b/i],
  ['Linux', /\blinux\b|\bunix\b/i],
  ['Figma', /\bfigma\b/i],
  ['UI/UX', /\bui\s?\/\s?ux\b|\bux design|\buser experience\b|\buser research\b/i],
  ['Product Management', /\bproduct manag(?:er|ement)\b/i],
  ['Machine Learning', /\bmachine learning\b|\bdeep learning\b|\btensorflow\b|\bpytorch\b|\bscikit-learn\b/i],
  ['Data Analysis', /\bdata analy(?:st|sis|tics)\b|\bpandas\b|\bnumpy\b/i],
  ['Excel', /\bexcel\b|\bspreadsheets?\b/i],
  ['Tableau', /\btableau\b/i],
  ['Power BI', /\bpower ?bi\b/i],
  ['R', /\bR(?: programming|studio)\b|(?:^|[,|•·]\s*)R(?=\s*(?:[,|•·]|$))/m],
  ['MATLAB', /\bmatlab\b/i],
  ['DevOps', /\bdevops\b|\bci\/cd\b|\bjenkins\b|\bgithub actions\b/i],
  ['Salesforce', /\bsalesforce\b/i],
  ['Agile', /\bagile\b|\bscrum\b|\bjira\b/i],
  ['Public Speaking', /\bpublic speaking\b|\bpresentations?\b/i],
  ['Customer Service', /\bcustomer service\b|\bcustomer support\b/i],
];

const HEADINGS =
  'professional summary|career summary|summary|profile|objective|about me|about|' +
  'work experience|professional experience|relevant experience|experience|employment|' +
  'education|technical skills|skills|projects|certifications|awards|activities|' +
  'leadership|volunteer(?:ing)?|publications|interests|coursework|languages';
const HEADING_LINE = new RegExp(`^(?:${HEADINGS})\\s*:?$`, 'i');
// PDF text sometimes loses line breaks; put them back before ALL-CAPS headings.
const INLINE_HEADING = new RegExp(`\\s(?=(?:${HEADINGS.toUpperCase()})\\b\\s*:?\\s)`, 'g');

const TITLE_WORDS =
  /\b(?:engineer|developer|analyst|scientist|designer|manager|intern|specialist|consultant|coordinator|administrator|architect|technician|associate|assistant|representative|accountant|researcher|strategist|programmer|marketer|writer|editor|officer|nurse|teacher|tutor)\b/i;

// "SUMMARY Detail-oriented analyst..." -> heading, then the rest on its own line.
const CAPS_HEADING_WITH_TEXT = new RegExp(`^(${HEADINGS.toUpperCase()})\\s*:?\\s+(.+)$`);

function lines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(INLINE_HEADING, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .flatMap((l) => {
      const m = CAPS_HEADING_WITH_TEXT.exec(l);
      return m ? [m[1], m[2]] : [l];
    });
}

function section(all: string[], heading: RegExp): string[] {
  const start = all.findIndex((l) => HEADING_LINE.test(l) && heading.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (const l of all.slice(start + 1)) {
    if (HEADING_LINE.test(l) || (l.length < 30 && l === l.toUpperCase() && /[A-Z]{3}/.test(l))) break;
    out.push(l);
  }
  return out;
}

const MONTH = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*$/i;

/**
 * The job title part of a line like "Software Engineering Intern at Truist
 * June 2025 - Aug 2025" or "Data Analyst | Acme Corp | 2021 - 2024".
 */
function cleanTitle(line: string): string | null {
  if (/@|https?:|www\.|\(\d{3}\)|\d{3}[-.\s]\d{3,4}/.test(line)) return null;
  const title = line
    .split(/\s+[|•·–—-]\s+|\s+at\s+|,\s+/)[0]
    .replace(/\(.*?\)/g, '')
    .replace(/\b(?:19|20)\d{2}\b.*$/, '')
    .trim()
    .replace(MONTH, '')
    .trim();
  if (!TITLE_WORDS.test(title) || title.length < 4 || title.length > 60) return null;
  return title.split(' ').length <= 7 ? title : null;
}

export function extractFromResume(text: string): ResumeSuggestions {
  const all = lines(text);

  // Title: a headline near the top (under the name), else the first job title
  // listed under Experience.
  const top = all.slice(0, 6).filter((l) => !HEADING_LINE.test(l));
  const experience = section(all, /experience|employment/i);
  const title =
    top.map(cleanTitle).find(Boolean) ?? experience.slice(0, 12).map(cleanTitle).find(Boolean) ?? null;

  // Skills: anywhere in the resume, most explicit first (Skills section).
  const skillsText = section(all, /skills/i).join('\n');
  const found = new Set<string>();
  for (const source of [skillsText, all.join('\n')]) {
    for (const [name, re] of SKILL_PATTERNS) if (re.test(source)) found.add(name);
  }

  const summaryLines = section(all, /summary|profile|objective|about/i);
  const summary = summaryLines.join(' ').slice(0, 500).trim() || null;

  return { title, skills: [...found], summary };
}
