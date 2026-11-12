import { NextResponse } from "next/server";

// Supabase's free plan pauses a database after a week with no requests, which
// takes the whole site down. A Vercel Cron job (vercel.json) calls this once a
// day so the database always has recent activity. It returns no study data.
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/studies?select=id&limit=1`, {
    headers: { apikey: publishableKey },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Keep-alive query failed", response.status);
    return NextResponse.json({ ok: false, status: response.status }, { status: 502 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
