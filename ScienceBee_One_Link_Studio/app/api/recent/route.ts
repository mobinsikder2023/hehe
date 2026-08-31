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
      .select("id,headline,poster_url,created_at,share_links(token)")
      .eq("user_id", user.id)
      .not("poster_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    const posts = (data || []).map((p: any) => ({
      id: p.id,
      headline: p.headline,
      poster_url: p.poster_url,
      token: Array.isArray(p.share_links)
        ? p.share_links[0]?.token || null
        : p.share_links?.token || null,
    }));

    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}
