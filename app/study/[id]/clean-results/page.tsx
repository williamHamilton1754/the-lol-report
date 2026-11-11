import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportLoadForm } from "@/components/report-load-form";
import { StudyCleanResultsDistribution } from "@/components/study-clean-results-distribution";
import {
  computeCaptionDistribution,
  getShareBeaten,
  MIN_VOTES_TO_RANK,
  toShortRaterId,
  TOP_CAPTION_COUNT,
  type CleanResultsCaption,
  type CleanResultsPreset,
} from "@/utils/study-clean-results";
import { loadCleanResults } from "@/utils/study-clean-results-data";
import {
  DEFAULT_MIN_VOTES,
  formatPercent,
  formatStudyWindow,
  getStudies,
  getStudyLabel,
  MAX_MIN_VOTES,
  parseStudyIdParam,
} from "@/utils/study-engagement-risk";
import { createClient } from "@/utils/supabase/server";

const RESULT_ROWS_SHOWN = 25;
const MOVER_ROWS_SHOWN = 10;
const HEAVY_EXCLUSION_SHARE = 0.5;

const PRESET_LINKS: { preset: CleanResultsPreset; label: string }[] = [
  { preset: "high", label: "High risk" },
  { preset: "high-medium", label: "High + medium risk" },
  { preset: "none", label: "Exclude nobody" },
];

type CleanResultsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preset?: string; exclude?: string | string[]; minVotes?: string }>;
};

const formatRankChange = (change: number | null) => {
  if (change === null) return "—";
  if (change === 0) return "No change";
  return change > 0 ? `▲ ${change}` : `▼ ${Math.abs(change)}`;
};

const formatRate = (rate: number | null) => (rate === null ? "—" : formatPercent(rate));

const formatShareBeaten = (share: number | null) =>
  share === null ? "—" : `${Math.round(share * 100)}% of captions`;

const formatWholePercent = (rate: number) => `${Math.round(rate * 100)}%`;

function CaptionTable({
  captions,
  rankedCount,
}: {
  captions: CleanResultsCaption[];
  rankedCount: number;
}) {
  return (
    <div className="app-table-shell overflow-x-auto rounded-xl">
      <table className="app-table w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 font-semibold">Rank after</th>
            <th className="px-3 py-2 font-semibold">Rank before</th>
            <th className="px-3 py-2 font-semibold">Moved</th>
            <th className="px-3 py-2 font-semibold">Beats</th>
            <th className="px-3 py-2 font-semibold">Positive % after</th>
            <th className="px-3 py-2 font-semibold">Positive % before</th>
            <th className="px-3 py-2 font-semibold">Votes kept</th>
            <th className="px-3 py-2 font-semibold">Caption</th>
          </tr>
        </thead>
        <tbody>
          {captions.map((caption) => (
            <tr key={caption.caption_id}>
              <td className="px-3 py-2 tabular-nums">{caption.after.rank ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{caption.before.rank ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {formatRankChange(caption.rank_change)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {formatShareBeaten(getShareBeaten(caption.after.rank, rankedCount))}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatRate(caption.after.positive_rate)}</td>
              <td className="px-3 py-2 tabular-nums">{formatRate(caption.before.positive_rate)}</td>
              <td className="px-3 py-2 tabular-nums">
                {caption.after.votes.toLocaleString()} of {caption.before.votes.toLocaleString()}
              </td>
              <td className="px-3 py-2">{caption.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function StudyCleanResultsPage({
  params: routeParams,
  searchParams,
}: CleanResultsPageProps) {
  const [{ id }, params] = await Promise.all([routeParams, searchParams]);
  const studyId = parseStudyIdParam(id);
  if (studyId === null) {
    notFound();
  }

  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const study = studies.find((candidate) => candidate.id === studyId);
  if (!study) {
    notFound();
  }

  const { preset, minVotes, riskReport, excludedRaters, captions, summary } = await loadCleanResults(
    supabase,
    study,
    params,
  );

  const pagePath = `/study/${studyId}/clean-results`;
  const minVotesQuery = params.minVotes ? `&minVotes=${encodeURIComponent(params.minVotes)}` : "";
  const settingsQuery = [
    `preset=${preset}`,
    ...(preset === "custom"
      ? excludedRaters.map((rater) => `exclude=${toShortRaterId(rater.profile_id)}`)
      : []),
    ...(params.minVotes ? [`minVotes=${encodeURIComponent(params.minVotes)}`] : []),
  ].join("&");

  const excludedIds = new Set(excludedRaters.map((rater) => rater.profile_id));
  const flaggedRaters = riskReport.user_summaries
    .filter((rater) => rater.risk_level !== "low" || excludedIds.has(rater.profile_id))
    .sort((left, right) => right.risk_score - left.risk_score);
  const lowRiskHidden = riskReport.user_summaries.length - flaggedRaters.length;

  const distribution = computeCaptionDistribution(captions);
  const { mean: averageRate, stdDev } = distribution.after;

  const movers = captions
    .filter((caption) => (caption.rank_change ?? 0) !== 0)
    .sort((left, right) => Math.abs(right.rank_change ?? 0) - Math.abs(left.rank_change ?? 0))
    .slice(0, MOVER_ROWS_SHOWN);

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">Clean Results</h1>
            </div>
            <Link
              href="/"
              className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
            >
              Home
            </Link>
          </div>
          <p className="app-muted text-sm">
            See how this study&apos;s caption rankings change without raters flagged by the{" "}
            <Link href={`/study/${studyId}/engagement-risk`} className="underline">
              engagement risk report
            </Link>
            . This only changes this view and its downloads. No study data is edited or deleted.
          </p>
          <p className="app-muted text-sm">
            Captions rank by the share of positive votes (&quot;funny&quot; or &quot;very
            funny&quot;). A caption needs at least {MIN_VOTES_TO_RANK} votes to get a rank.
          </p>
          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{ fieldName: "studyId", prefix: "/study", suffix: "clean-results" }}
          >
            {/* Exclusions belong to one study, so a new choice here starts over. */}
            <input type="hidden" name="preset" value="high" />
            <input type="hidden" name="exclude" value="" />
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Study</span>
              <select
                name="studyId"
                defaultValue={studyId.toString()}
                className="app-input h-9 min-w-80 rounded-md px-2 text-sm outline-none"
              >
                {studies.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {getStudyLabel(candidate)}
                  </option>
                ))}
              </select>
            </label>
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Min votes to score a rater</span>
              <input
                type="number"
                name="minVotes"
                min={1}
                max={MAX_MIN_VOTES}
                defaultValue={minVotes.value}
                className="app-input h-9 w-44 rounded-md px-2 text-sm outline-none"
              />
            </label>
          </ReportLoadForm>
          {!minVotes.isValid ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Invalid <code>minVotes</code> value. Using default of {DEFAULT_MIN_VOTES}.
            </p>
          ) : null}
          <p className="app-muted text-sm">Study window: {formatStudyWindow(study)}</p>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="app-card app-stat-card-rose rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Raters Excluded
            </p>
            <p className="mt-2 text-2xl font-semibold">{summary.excluded_raters.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              of {riskReport.included_voters.toLocaleString()} scored raters
            </p>
          </article>
          <article className="app-card app-stat-card-amber rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">Votes Removed</p>
            <p className="mt-2 text-2xl font-semibold">{summary.excluded_votes.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              of {summary.total_votes.toLocaleString()} votes
              {summary.total_votes > 0
                ? ` (${formatPercent(summary.excluded_votes / summary.total_votes)})`
                : ""}
            </p>
          </article>
          <article className="app-card app-stat-card-teal rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Top {TOP_CAPTION_COUNT} Changes
            </p>
            <p className="mt-2 text-2xl font-semibold">{summary.top_captions_replaced}</p>
            <p className="app-muted mt-1 text-xs">
              captions fell out of the top {TOP_CAPTION_COUNT}
            </p>
          </article>
          <article className="app-card app-stat-card-sky rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Biggest Rank Move
            </p>
            <p className="mt-2 text-2xl font-semibold">{summary.biggest_rank_move}</p>
            <p className="app-muted mt-1 text-xs">places, up or down</p>
          </article>
        </section>

        {summary.excluded_votes / Math.max(summary.total_votes, 1) >= HEAVY_EXCLUSION_SHARE ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This removes more than half of the study&apos;s votes, so the rankings below rest on a
            small part of the original sample. Treat them with caution.
          </p>
        ) : null}

        <section className="app-card space-y-3 rounded-xl p-4">
          <div>
            <h2 className="text-lg font-semibold">Who to exclude</h2>
            <p className="app-muted text-sm">
              Flags are a prompt to review, not proof of careless rating. Check the list before
              relying on it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_LINKS.map((option) => (
              <Link
                key={option.preset}
                href={`${pagePath}?preset=${option.preset}${minVotesQuery}`}
                aria-current={preset === option.preset ? "true" : undefined}
                className={`app-button rounded-lg px-3 py-2 text-sm font-medium transition ${
                  preset === option.preset ? "app-button-primary" : ""
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>

          {flaggedRaters.length > 0 ? (
            <ReportLoadForm
              key={`${preset}-${[...excludedIds].sort().join()}`}
              className="space-y-3"
            >
              <input type="hidden" name="preset" value="custom" />
              <input type="hidden" name="exclude" value="" />
              <div className="app-table-shell max-h-96 overflow-auto rounded-xl">
                <table className="app-table w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 font-semibold">Exclude</th>
                      <th className="px-3 py-2 font-semibold">Rater</th>
                      <th className="px-3 py-2 font-semibold">Risk</th>
                      <th className="px-3 py-2 font-semibold">Why flagged</th>
                      <th className="px-3 py-2 font-semibold">Votes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedRaters.map((rater) => (
                      <tr key={rater.profile_id}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            name="exclude"
                            value={toShortRaterId(rater.profile_id)}
                            defaultChecked={excludedIds.has(rater.profile_id)}
                            aria-label={`Exclude ${rater.user_label}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {rater.user_label}
                          {rater.email ? (
                            <span className="app-muted block text-xs">{rater.email}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 capitalize">
                          {rater.risk_level} ({rater.risk_score.toFixed(1)})
                        </td>
                        <td className="px-3 py-2">{rater.risk_drivers}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {rater.total_votes.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="app-button app-button-primary rounded-lg px-4 py-2 text-sm font-medium transition"
                >
                  Update results
                </button>
                {lowRiskHidden > 0 ? (
                  <p className="app-muted text-sm">
                    {lowRiskHidden.toLocaleString()} low-risk raters are not listed and stay
                    included.
                  </p>
                ) : null}
              </div>
            </ReportLoadForm>
          ) : (
            <p className="app-muted text-sm">
              No raters in this study are flagged at the current minimum vote setting.
            </p>
          )}
        </section>

        {averageRate !== null ? (
          <section className="app-chart-card space-y-3 rounded-xl p-4">
            <div>
              <h2 className="text-lg font-semibold">How captions compare</h2>
              <p className="app-muted text-sm">
                How many captions landed at each positive %. Most sit near the middle of the curve,
                and the funniest are out on the right.
              </p>
            </div>
            <StudyCleanResultsDistribution
              bins={distribution.bins}
              showBefore={summary.excluded_raters > 0}
              averagePercent={averageRate * 100}
            />
            <p className="app-muted text-sm">
              The average caption scores {formatWholePercent(averageRate)} positive
              {summary.excluded_raters > 0 && distribution.before.mean !== null
                ? ` (${formatWholePercent(distribution.before.mean)} before exclusions)`
                : ""}
              .
              {stdDev
                ? ` About two in three captions usually fall between ${formatWholePercent(
                    Math.max(averageRate - stdDev, 0),
                  )} and ${formatWholePercent(Math.min(averageRate + stdDev, 1))}.`
                : ""}
              {distribution.top_caption_std_devs !== null
                ? ` The top caption is ${distribution.top_caption_std_devs.toFixed(
                    1,
                  )} standard deviations above average.`
                : ""}
            </p>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Results</h2>
              <p className="app-muted text-sm">
                Top {Math.min(RESULT_ROWS_SHOWN, captions.length)} of{" "}
                {captions.length.toLocaleString()} captions with votes. The download has all of
                them.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`${pagePath}/export?file=results&${settingsQuery}`}
                className="app-button app-button-primary rounded-lg px-3 py-2 text-sm font-medium transition"
              >
                Download results (CSV)
              </a>
              <a
                href={`${pagePath}/export?file=raters&${settingsQuery}`}
                className="app-button rounded-lg px-3 py-2 text-sm font-medium transition"
              >
                Download excluded raters (CSV)
              </a>
            </div>
          </div>
          {captions.length > 0 ? (
            <CaptionTable
              captions={captions.slice(0, RESULT_ROWS_SHOWN)}
              rankedCount={distribution.after.count}
            />
          ) : (
            <article className="app-card rounded-xl p-4">
              <p className="app-muted text-sm">This study has no votes yet.</p>
            </article>
          )}
        </section>

        {movers.length > 0 ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Biggest movers</h2>
              <p className="app-muted text-sm">
                The captions whose rank changed most with these raters excluded.
              </p>
            </div>
            <CaptionTable captions={movers} rankedCount={distribution.after.count} />
          </section>
        ) : null}
      </section>
    </main>
  );
}
