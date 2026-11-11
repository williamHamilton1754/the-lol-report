import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportLoadForm } from "@/components/report-load-form";
import { StudyEngagementRiskTable } from "@/components/study-engagement-risk-table";
import { formatDurationFromMinutes } from "@/utils/format-duration";
import {
  buildStudyEngagementRiskReport,
  DEFAULT_MIN_VOTES,
  formatPercent,
  formatStudyWindow,
  getCaptionsById,
  getHighestRiskUser,
  getProfilesById,
  getStudies,
  getStudyCaptionMappings,
  getStudyLabel,
  getVotesByStudyCaptionMappingId,
  MAX_MIN_VOTES,
  parseBoundedInteger,
  parseStudyIdParam,
} from "@/utils/study-engagement-risk";
import { createClient } from "@/utils/supabase/server";

type StudyEngagementRiskSearchParams = Promise<{
  minVotes?: string;
}>;

type StudyEngagementRiskPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: StudyEngagementRiskSearchParams;
};

export const dynamic = "force-dynamic";

export default async function StudyEngagementRiskPage({
  params: routeParams,
  searchParams,
}: StudyEngagementRiskPageProps) {
  const [{ id }, params] = await Promise.all([routeParams, searchParams]);
  const requestedStudyId = parseStudyIdParam(id);
  if (requestedStudyId === null) {
    notFound();
  }

  const minVotesResult = parseBoundedInteger(
    params.minVotes,
    DEFAULT_MIN_VOTES,
    1,
    MAX_MIN_VOTES,
  );
  const generatedAtUtc = new Date().toISOString();

  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const selectedStudy = studies.find((study) => study.id === requestedStudyId) ?? null;
  if (selectedStudy === null) {
    notFound();
  }

  const mappings = await getStudyCaptionMappings(supabase, [requestedStudyId]);
  const uniqueCaptionIds = [...new Set(mappings.map((mapping) => mapping.caption_id))];
  const [captionsById, voteRows] = await Promise.all([
    getCaptionsById(supabase, uniqueCaptionIds),
    getVotesByStudyCaptionMappingId(
      supabase,
      [...new Set(mappings.map((mapping) => mapping.id))],
    ),
  ]);
  const uniqueProfileIds = [...new Set(voteRows.map((vote) => vote.profile_id))];
  const profilesById = await getProfilesById(supabase, uniqueProfileIds);
  const report = buildStudyEngagementRiskReport({
    study: selectedStudy,
    captionsById,
    voteRows,
    profilesById,
    minVotes: minVotesResult.value,
  });
  const highestRiskUser = getHighestRiskUser(report.user_summaries);

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">Study Engagement Risk</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/study/${requestedStudyId}/clean-results${
                  params.minVotes ? `?minVotes=${encodeURIComponent(params.minVotes)}` : ""
                }`}
                className="app-button app-button-primary inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
              >
                See clean results
              </Link>
              <Link
                href="/"
                className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
              >
                Home
              </Link>
            </div>
          </div>
          <p className="app-muted text-sm">
            Composite risk score = 40% speed/read-load, 30% low leave-one-out consensus agreement,
            15% low vote switching, and 15% extreme upvote/downvote bias. Use this to screen for
            rushed participation, not to make automatic disciplinary decisions.
          </p>
          <p className="app-muted text-sm">
            Extremely low vote timing also triggers an absolute speed penalty, so a uniformly
            rushed class still scores as high risk.
          </p>
          <p className="app-muted text-sm">Generated at: {generatedAtUtc}</p>
          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{
              fieldName: "studyId",
              prefix: "/study",
              suffix: "engagement-risk",
            }}
          >
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Study</span>
              <select
                name="studyId"
                defaultValue={requestedStudyId.toString()}
                disabled={studies.length === 0}
                className="app-input h-9 min-w-80 rounded-md px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {studies.map((study) => (
                  <option key={study.id} value={study.id}>
                    {getStudyLabel(study)}
                  </option>
                ))}
              </select>
            </label>
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Min votes per user</span>
              <input
                type="number"
                name="minVotes"
                min={1}
                max={MAX_MIN_VOTES}
                defaultValue={minVotesResult.value}
                className="app-input h-9 w-44 rounded-md px-2 text-sm outline-none"
              />
            </label>
          </ReportLoadForm>
          {!minVotesResult.isValid && params.minVotes ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Invalid <code>minVotes</code> value. Using default of {DEFAULT_MIN_VOTES}.
            </p>
          ) : null}
          {report.cohort_rushing_warning ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Cohort-wide rushing is likely in this study. The score is applying absolute speed
              penalties because many voters are moving too quickly.
            </p>
          ) : null}
          <p className="app-muted text-sm">Study window: {formatStudyWindow(selectedStudy)}</p>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="app-card app-stat-card-teal rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Study Captions
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.caption_count.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              {report.total_votes.toLocaleString()} votes scanned
            </p>
          </article>
          <article className="app-card app-stat-card-amber rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Included Voters
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.included_voters.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              {report.excluded_voters.toLocaleString()} below min votes
            </p>
          </article>
          <article className="app-card app-stat-card-rose rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              High Risk Users
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.high_risk_users.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              {report.very_fast_voters.toLocaleString()} users at 2s median gap or faster
            </p>
          </article>
          <article className="app-card app-stat-card-sky rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Study Upvote %
            </p>
            <p className="mt-2 text-2xl font-semibold">{formatPercent(report.study_upvote_percentage)}</p>
            <p className="app-muted mt-1 text-xs">
              Study median gap{" "}
              {formatDurationFromMinutes(report.study_median_gap_minutes)}
            </p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
            <article className="app-card rounded-xl p-4">
              <h2 className="text-lg font-semibold">Interpretation</h2>
              <div className="app-muted mt-3 space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-foreground">Speed/read-load</span>: flags
                  people who move through high-character captions implausibly quickly or leave very
                  small median gaps between votes. Absolute speed floors also keep a whole rushed
                  class from looking artificially normal.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Consensus agreement</span>: each
                  vote is compared against the leave-one-out majority on the same caption, so a
                  student is not graded against their own vote.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Monotony</span>: low switching
                  rates and long same-vote runs catch users who plow through with one repeated
                  response pattern.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Polarity</span>: extreme
                  upvote/downvote behavior relative to the study baseline is only a minor signal by
                  itself, but it helps when paired with speed or low consensus.
                </p>
              </div>
            </article>
            <article className="app-card rounded-xl p-4">
              <h2 className="text-lg font-semibold">Highest Risk User</h2>
              {highestRiskUser ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-xl font-semibold">{highestRiskUser.user_label}</p>
                  <p className="app-muted">{highestRiskUser.email ?? "n/a"}</p>
                  <p>
                    Risk score <span className="font-semibold">{highestRiskUser.risk_score.toFixed(1)}</span>{" "}
                    ({highestRiskUser.risk_level})
                  </p>
                  <p className="app-muted">Drivers: {highestRiskUser.risk_drivers}</p>
                  <p className="app-muted">
                    Median gap {formatDurationFromMinutes(highestRiskUser.median_minutes_between_votes)} |{" "}
                    Consensus agree{" "}
                    {highestRiskUser.consensus_agreement_rate === null
                      ? "n/a"
                      : formatPercent(highestRiskUser.consensus_agreement_rate)}
                  </p>
                </div>
              ) : (
                <p className="app-muted mt-3 text-sm">
                  No user met the current vote threshold for scoring.
                </p>
              )}
            </article>
          </section>

        {report.user_summaries.length ? (
          <StudyEngagementRiskTable rows={report.user_summaries} />
        ) : (
          <article className="app-card rounded-xl p-4">
            <p className="app-muted text-sm">
              No users met the current <code>minVotes</code> threshold for risk scoring.
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
