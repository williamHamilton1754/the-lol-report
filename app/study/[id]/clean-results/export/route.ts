import { NextResponse, type NextRequest } from "next/server";

import {
  buildMethodNotes,
  buildShareSummary,
  cleanResultsToCsv,
  excludedRatersToCsv,
} from "@/utils/study-clean-results";
import { loadCleanResults } from "@/utils/study-clean-results-data";
import { getStudies, getStudyLabel, parseStudyIdParam } from "@/utils/study-engagement-risk";
import { createClient } from "@/utils/supabase/server";

// Downloads a study's clean results (?file=results) or the raters who were
// excluded and why (?file=raters), or the method notes (?file=notes), using the same settings as the page.
// Access is enforced by proxy.ts and by the signed-in user's RLS policies.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const studyId = parseStudyIdParam((await params).id);
  if (studyId === null) {
    return new NextResponse("Unknown study.", { status: 404 });
  }

  const supabase = await createClient();
  const study = (await getStudies(supabase)).find((candidate) => candidate.id === studyId);
  if (!study) {
    return new NextResponse("Unknown study.", { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const file = searchParams.get("file") === "raters" ? "raters" : "results";
  const { captions, excludedRaters, minVotes, preset, summary } = await loadCleanResults(supabase, study, {
    preset: searchParams.get("preset") ?? undefined,
    exclude: searchParams.getAll("exclude"),
    minVotes: searchParams.get("minVotes") ?? undefined,
  });

  if (searchParams.get("file") === "notes") {
    const notes = buildMethodNotes({
      shareSummary: buildShareSummary(getStudyLabel(study), captions, summary),
      preset,
      minVotes: minVotes.value,
    });
    return new NextResponse(`\uFEFF${notes}`, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="study-${studyId}-method-notes.txt"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = file === "raters" ? excludedRatersToCsv(excludedRaters) : cleanResultsToCsv(captions);
  const filename =
    file === "raters" ? `study-${studyId}-excluded-raters.csv` : `study-${studyId}-clean-results.csv`;

  // The leading BOM tells Excel the file is UTF-8, so captions display correctly.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
