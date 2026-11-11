import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/types/supabase";
import {
  computeCleanResults,
  parseCleanResultsPreset,
  parseExcludeParam,
  selectExcludedRaters,
} from "@/utils/study-clean-results";
import {
  buildStudyEngagementRiskReport,
  DEFAULT_MIN_VOTES,
  getCaptionsById,
  getProfilesById,
  getStudyCaptionMappings,
  getVotesByStudyCaptionMappingId,
  MAX_MIN_VOTES,
  parseBoundedInteger,
  type StudySummary,
} from "@/utils/study-engagement-risk";

export type CleanResultsParams = {
  preset?: string;
  exclude?: string | string[];
  minVotes?: string;
};

// Loads a study and works out its clean results. The page and the CSV export
// both use this, so a download always matches what's on screen.
export const loadCleanResults = async (
  supabase: SupabaseClient<Database>,
  study: StudySummary,
  params: CleanResultsParams,
) => {
  const preset = parseCleanResultsPreset(params.preset);
  const minVotes = parseBoundedInteger(params.minVotes, DEFAULT_MIN_VOTES, 1, MAX_MIN_VOTES);

  const mappings = await getStudyCaptionMappings(supabase, [study.id]);
  const [captionsById, voteRows] = await Promise.all([
    getCaptionsById(supabase, [...new Set(mappings.map((mapping) => mapping.caption_id))]),
    getVotesByStudyCaptionMappingId(supabase, [...new Set(mappings.map((mapping) => mapping.id))]),
  ]);
  const profilesById = await getProfilesById(supabase, [
    ...new Set(voteRows.map((vote) => vote.profile_id)),
  ]);

  const riskReport = buildStudyEngagementRiskReport({
    study,
    captionsById,
    voteRows,
    profilesById,
    minVotes: minVotes.value,
  });

  const excludedRaters = selectExcludedRaters(
    riskReport.user_summaries,
    preset,
    parseExcludeParam(params.exclude),
  );

  return {
    preset,
    minVotes,
    riskReport,
    excludedRaters,
    ...computeCleanResults({
      captionContentById: new Map(
        [...captionsById.values()].map((caption) => [caption.id, caption.content ?? ""]),
      ),
      votes: voteRows,
      excludedProfileIds: new Set(excludedRaters.map((rater) => rater.profile_id)),
    }),
  };
};
