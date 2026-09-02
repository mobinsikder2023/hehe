import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const s = await supabaseServer();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: p } = await db
      .from("posts")
      .select("id,user_id,poster_path")
      .eq("id", id)
      .single();

    if (!p || p.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // remove share link, poster file, then the post row
    await db.from("share_links").delete().eq("post_id", id);
    if (p.poster_path) {
      try {
        await db.storage.from("posters").remove([p.poster_path]);
      } catch {
        /* best effort */
      }
    }
    await db.from("posts").delete().eq("id", id).eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
