import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const s = await supabaseServer();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) return NextResponse.json({ posts: [] });

    const db = supabaseAdmin();
    const { data } = await db
      .from("posts")
      .select("id,headline,poster_url,created_at")
      .eq("user_id", user.id)
      .not("poster_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({ posts: data || [] });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}
