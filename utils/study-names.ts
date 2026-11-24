import { STUDY_TITLES } from "./study-titles";

// Study names are stored as slugs like "10-12--0--first-day-intern-energy".
// These helpers turn them into readable labels for every report. Display only:
// the stored slug, study IDs and URLs stay the same.
export type NamedStudy = {
  id: number;
  slug: string | null;
  description: string | null;
  start_datetime_utc: string | null;
  end_datetime_utc: string | null;
  created_datetime_utc: string;
};

// One fixed zone, so a study has the same date on the server and for everyone.
const TIME_ZONE = "America/New_York";

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";

const formatDate = (value: string, options: Intl.DateTimeFormatOptions) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, ...options }).format(date);
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const getStart = (study: NamedStudy) => study.start_datetime_utc ?? study.created_datetime_utc;

// Removes dates (labels show the study's real start date) and spells out the
// rest. Returns null when the slug was only a date.
export const getReadableStudyName = (slug: string | null) => {
  if (!slug) return null;

  const name = slug
    .trim()
    .replace(/^20\d{2}-\d{1,2}-\d{1,2}(?=-|[a-z]?$)/i, "")
    .replace(/^\d{1,2}-\d{1,2}(?=-|[a-z]?$)/i, "")
    .replace(/^-+0-+/, "")
    .replace(/-\d{1,2}-\d{1,2}(?:-(?:\d{4}|\d{2}))?$/, "")
    .replace(new RegExp(`(^|-)${MONTH}-?\\d{1,2}(?=[a-z]?(?:-|$))`, "gi"), "$1")
    // Sizes like "38img" don't match the real image counts, so they are left out.
    .replace(/(^|-)\d+img(?=-|$)/gi, "$1")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .join(" ")
    .replace(/(^|\s)([a-z])$/, (_, space: string, letter: string) =>
      `${space}${space ? "" : "Version "}${letter.toUpperCase()}`,
    );

  return name ? capitalize(name) : null;
};

// A written title if there is one, otherwise the cleaned-up stored name.
const getStudyTitle = (study: NamedStudy) =>
  (study.slug && STUDY_TITLES[study.slug]) ??
  getReadableStudyName(study.slug) ??
  (study.slug ? null : study.description);

export const getStudyLabel = (study: NamedStudy) => {
  const title = getStudyTitle(study);
  const date = formatDate(getStart(study), { month: "short", day: "numeric", year: "numeric" });

  return `Study ${study.id}${title ? `: ${title}` : ""}${date ? ` (${date})` : ""}`;
};

// Short enough for a chart axis.
export const getShortStudyLabel = (study: NamedStudy) => {
  const date = formatDate(getStart(study), { month: "short", day: "numeric" });
  return date ? `#${study.id} ${date}` : `#${study.id}`;
};

export const formatStudyWindow = (study: NamedStudy) => {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  const start = formatDate(getStart(study), options) ?? "n/a";
  const end = (study.end_datetime_utc && formatDate(study.end_datetime_utc, options)) || "n/a";

  return `${start} to ${end} (Eastern)`;
};
