import { isPositiveStudyVote, type StudyVoteValue } from "./study-vote-events";

// A caption needs this many votes to get a rank, so one or two votes can't put
// it at the top. Applies separately to the before and after rankings.
export const MIN_VOTES_TO_RANK = 3;
export const TOP_CAPTION_COUNT = 10;

// Presets choose raters by risk level. "custom" uses the list in the URL.
export const CLEAN_RESULTS_PRESETS = ["high", "high-medium", "none", "custom"] as const;
export type CleanResultsPreset = (typeof CLEAN_RESULTS_PRESETS)[number];

export type RaterRiskLevel = "low" | "medium" | "high";

export type ScoredRater = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  risk_score: number;
  risk_level: RaterRiskLevel;
  risk_drivers: string;
};

type CleanResultsVote = {
  caption_id: string;
  profile_id: string;
  vote_value: StudyVoteValue;
};

type CaptionTally = {
  votes: number;
  positive_rate: number | null;
  rank: number | null;
};

export type CleanResultsCaption = {
  caption_id: string;
  content: string;
  before: CaptionTally;
  after: CaptionTally;
  rank_change: number | null; // Positive means the caption moved up.
  rate_change: number | null;
};

export type CleanResultsSummary = {
  excluded_raters: number;
  excluded_votes: number;
  total_votes: number;
  top_captions_replaced: number;
  biggest_rank_move: number;
};

// URLs carry a short ID per rater, which keeps long exclusion lists usable.
export const toShortRaterId = (profileId: string) => profileId.slice(0, 8);

export const parseCleanResultsPreset = (rawValue: string | undefined): CleanResultsPreset =>
  CLEAN_RESULTS_PRESETS.find((preset) => preset === rawValue) ?? "high";

export const parseExcludeParam = (rawValue: string | string[] | undefined) =>
  new Set(
    (Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => /^[0-9a-f]{8}$/i.test(value)),
  );

export const selectExcludedRaters = (
  raters: ScoredRater[],
  preset: CleanResultsPreset,
  customShortIds: Set<string>,
): ScoredRater[] => {
  switch (preset) {
    case "high":
      return raters.filter((rater) => rater.risk_level === "high");
    case "high-medium":
      return raters.filter((rater) => rater.risk_level !== "low");
    case "none":
      return [];
    case "custom":
      return raters.filter((rater) => customShortIds.has(toShortRaterId(rater.profile_id)));
  }
};

const tallyVotes = (votes: CleanResultsVote[]) => {
  const tallies = new Map<string, { votes: number; positive: number }>();
  for (const vote of votes) {
    const tally = tallies.get(vote.caption_id) ?? { votes: 0, positive: 0 };
    tally.votes += 1;
    if (isPositiveStudyVote(vote.vote_value)) {
      tally.positive += 1;
    }
    tallies.set(vote.caption_id, tally);
  }
  return tallies;
};

// Highest positive rate first. Ties go to the caption with more votes, then to
// a stable ID order, so the same data always gives the same ranking.
const rankCaptions = (tallies: Map<string, { votes: number; positive: number }>) => {
  const ranked = [...tallies.entries()]
    .filter(([, tally]) => tally.votes >= MIN_VOTES_TO_RANK)
    .map(([captionId, tally]) => ({
      captionId,
      votes: tally.votes,
      rate: tally.positive / tally.votes,
    }))
    .sort(
      (left, right) =>
        right.rate - left.rate ||
        right.votes - left.votes ||
        left.captionId.localeCompare(right.captionId),
    );

  return new Map(ranked.map((caption, index) => [caption.captionId, index + 1]));
};

const toCaptionTally = (
  tally: { votes: number; positive: number } | undefined,
  rank: number | undefined,
): CaptionTally => ({
  votes: tally?.votes ?? 0,
  positive_rate: tally && tally.votes > 0 ? tally.positive / tally.votes : null,
  rank: rank ?? null,
});

export const computeCleanResults = ({
  captionContentById,
  votes,
  excludedProfileIds,
}: {
  captionContentById: Map<string, string>;
  votes: CleanResultsVote[];
  excludedProfileIds: Set<string>;
}): { captions: CleanResultsCaption[]; summary: CleanResultsSummary } => {
  const keptVotes = votes.filter((vote) => !excludedProfileIds.has(vote.profile_id));
  const before = tallyVotes(votes);
  const after = tallyVotes(keptVotes);
  const ranksBefore = rankCaptions(before);
  const ranksAfter = rankCaptions(after);

  const captions = [...before.keys()].map<CleanResultsCaption>((captionId) => {
    const beforeTally = toCaptionTally(before.get(captionId), ranksBefore.get(captionId));
    const afterTally = toCaptionTally(after.get(captionId), ranksAfter.get(captionId));

    return {
      caption_id: captionId,
      content: captionContentById.get(captionId) ?? "(caption text unavailable)",
      before: beforeTally,
      after: afterTally,
      rank_change:
        beforeTally.rank === null || afterTally.rank === null
          ? null
          : beforeTally.rank - afterTally.rank,
      rate_change:
        beforeTally.positive_rate === null || afterTally.positive_rate === null
          ? null
          : afterTally.positive_rate - beforeTally.positive_rate,
    };
  });

  const inTopBefore = captions.filter(
    (caption) => caption.before.rank !== null && caption.before.rank <= TOP_CAPTION_COUNT,
  );

  return {
    captions: captions.sort(
      (left, right) =>
        (left.after.rank ?? Number.POSITIVE_INFINITY) -
          (right.after.rank ?? Number.POSITIVE_INFINITY) ||
        (left.before.rank ?? Number.POSITIVE_INFINITY) -
          (right.before.rank ?? Number.POSITIVE_INFINITY) ||
        left.caption_id.localeCompare(right.caption_id),
    ),
    summary: {
      excluded_raters: excludedProfileIds.size,
      excluded_votes: votes.length - keptVotes.length,
      total_votes: votes.length,
      top_captions_replaced: inTopBefore.filter(
        (caption) => caption.after.rank === null || caption.after.rank > TOP_CAPTION_COUNT,
      ).length,
      biggest_rank_move: Math.max(
        0,
        ...captions.map((caption) => Math.abs(caption.rank_change ?? 0)),
      ),
    },
  };
};

export const DISTRIBUTION_BIN_WIDTH = 5;

export type DistributionStats = { count: number; mean: number | null; stdDev: number | null };

export type CaptionDistribution = {
  bins: { label: string; before: number; after: number }[];
  before: DistributionStats;
  after: DistributionStats;
  top_caption_std_devs: number | null;
};

const getDistributionStats = (rates: number[]): DistributionStats => {
  if (rates.length === 0) {
    return { count: 0, mean: null, stdDev: null };
  }

  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const variance = rates.reduce((sum, rate) => sum + (rate - mean) ** 2, 0) / rates.length;
  return { count: rates.length, mean, stdDev: Math.sqrt(variance) };
};

// How ranked captions are spread across positive %, before and after exclusions.
// Rates stay 0-1 here; the bins are labeled in percent.
export const computeCaptionDistribution = (captions: CleanResultsCaption[]): CaptionDistribution => {
  const getRates = (side: "before" | "after") =>
    captions.flatMap((caption) =>
      caption[side].rank !== null && caption[side].positive_rate !== null
        ? [caption[side].positive_rate]
        : [],
    );
  const beforeRates = getRates("before");
  const afterRates = getRates("after");

  const binCount = 100 / DISTRIBUTION_BIN_WIDTH;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    label: `${index * DISTRIBUTION_BIN_WIDTH}%`,
    before: 0,
    after: 0,
  }));
  const getBinIndex = (rate: number) =>
    Math.min(Math.floor((rate * 100) / DISTRIBUTION_BIN_WIDTH), binCount - 1);
  beforeRates.forEach((rate) => (bins[getBinIndex(rate)].before += 1));
  afterRates.forEach((rate) => (bins[getBinIndex(rate)].after += 1));

  const before = getDistributionStats(beforeRates);
  const after = getDistributionStats(afterRates);

  return {
    bins,
    before,
    after,
    top_caption_std_devs:
      after.mean === null || !after.stdDev
        ? null
        : (Math.max(...afterRates) - after.mean) / after.stdDev,
  };
};

// The share of other ranked captions this rank beats, from 0 to 1.
export const getShareBeaten = (rank: number | null, rankedCount: number) =>
  rank === null || rankedCount < 2 ? null : (rankedCount - rank) / (rankedCount - 1);

// A cell starting with one of these runs as a formula when opened in Excel or
// Sheets, so captions and names are made literal text.
const escapeCsvCell = (value: string | number | null) => {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }

  const safeValue = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
};

export const toCsv = (rows: (string | number | null)[][]) =>
  `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;

const toPercentCell = (rate: number | null) => (rate === null ? null : Number((rate * 100).toFixed(2)));

export const cleanResultsToCsv = (captions: CleanResultsCaption[]) => {
  const rankedAfter = captions.filter((caption) => caption.after.rank !== null).length;

  return toCsv([
    [
      "rank_after",
      "rank_before",
      "rank_change",
      "beats_pct_of_captions",
      "positive_pct_after",
      "positive_pct_before",
      "votes_after",
      "votes_before",
      "caption_id",
      "caption",
    ],
    ...captions.map((caption) => [
      caption.after.rank,
      caption.before.rank,
      caption.rank_change,
      toPercentCell(getShareBeaten(caption.after.rank, rankedAfter)),
      toPercentCell(caption.after.positive_rate),
      toPercentCell(caption.before.positive_rate),
      caption.after.votes,
      caption.before.votes,
      caption.caption_id,
      caption.content,
    ]),
  ]);
};

export const excludedRatersToCsv = (raters: ScoredRater[]) =>
  toCsv([
    ["profile_id", "rater", "email", "risk_level", "risk_score", "risk_drivers", "votes"],
    ...raters.map((rater) => [
      rater.profile_id,
      rater.user_label,
      rater.email,
      rater.risk_level,
      rater.risk_score,
      rater.risk_drivers,
      rater.total_votes,
    ]),
  ]);

const formatShare = (part: number, whole: number) =>
  `${((part / Math.max(whole, 1)) * 100).toFixed(1)}%`;

const pluralize = (count: number, noun: string) =>
  `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;

// A plain-English recap to paste into a team update.
export const buildShareSummary = (
  studyLabel: string,
  captions: CleanResultsCaption[],
  summary: CleanResultsSummary,
) => {
  const totalVotes = pluralize(summary.total_votes, "vote");
  const top = captions.find((caption) => caption.after.rank === 1);

  return [
    summary.excluded_raters === 0
      ? `Study ${studyLabel}: no raters excluded; results use all ${totalVotes}.`
      : `Study ${studyLabel}: excluding ${pluralize(summary.excluded_raters, "rater")} removed ${summary.excluded_votes.toLocaleString("en-US")} of ${totalVotes} (${formatShare(summary.excluded_votes, summary.total_votes)}). ${pluralize(summary.top_captions_replaced, "caption")} dropped out of the top ${TOP_CAPTION_COUNT}, and the biggest rank move was ${pluralize(summary.biggest_rank_move, "place")}.`,
    top && top.after.positive_rate !== null
      ? `Top caption: "${top.content}" (${formatShare(top.after.positive_rate, 1)} positive over ${pluralize(top.after.votes, "vote")}).`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const PRESET_DESCRIPTIONS: Record<CleanResultsPreset, string> = {
  high: "Raters rated high risk were excluded.",
  "high-medium": "Raters rated high or medium risk were excluded.",
  none: "No raters were excluded.",
  custom: "Excluded raters were picked by hand.",
};

// How the numbers were produced, as a separate file. Adding this text to the
// top of the CSV would break read.csv() and Excel's column headers.
export const buildMethodNotes = ({
  shareSummary,
  preset,
  minVotes,
}: {
  shareSummary: string;
  preset: CleanResultsPreset;
  minVotes: number;
}) =>
  [
    shareSummary,
    "",
    "How these results were produced",
    `- ${PRESET_DESCRIPTIONS[preset]} Risk levels come from the engagement risk report.`,
    `- Raters needed at least ${pluralize(minVotes, "vote")} to be scored. Raters below that were not scored, so they were not excluded.`,
    '- Positive % is the share of votes that were "funny" or "very funny".',
    `- A caption needs at least ${MIN_VOTES_TO_RANK} votes to be ranked. Ties go to the caption with more votes.`,
    "- The study data was not changed. Exclusions apply only to this report.",
    "",
  ].join("\r\n");
