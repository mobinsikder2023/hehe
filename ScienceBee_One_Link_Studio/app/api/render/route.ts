import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { downloadImage } from "@/lib/images";
import { renderPoster } from "@/lib/poster";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const s = await supabaseServer();
    const {
      data: { user },
    } = await s.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const b = await req.json();
    const db = supabaseAdmin();

    const { data: p, error } = await db
      .from("posts")
      .select("*")
      .eq("id", b.id)
      .single();

    if (error || !p) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // use the image the client currently has selected (upload / pasted URL /
    // candidate), falling back to whatever is stored on the post
    const imageUrl = b.image_url || p.image_url;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Choose an image first" },
        { status: 400 }
      );
    }

    const img = await downloadImage(imageUrl);

    // optional foreground cut-out (a PNG that sits on top of the background)
    let foreground: Buffer | null = null;
    const fgUrl = b.design?.fg_url || p.design?.fg_url;
    if (fgUrl) {
      try {
        foreground = await downloadImage(fgUrl);
      } catch {
        foreground = null;
      }
    }

    const png = await renderPoster({
      image: img,
      foreground,
      headline: String(b.headline || p.headline || ""),
      subheadline: String(b.subheadline || p.subheadline || ""),
      source: String(b.source || p.source_label || ""),
      phrases: Array.isArray(b.phrases) ? b.phrases : [],
      design: b.design || p.design || {},
      logo: b.design?.logo || p.design?.logo || "auto",
    });

    const posterPath = `${user.id}/${p.id}.png`;

    const up = await db.storage.from("posters").upload(posterPath, png, {
      contentType: "image/png",
      upsert: true,
    });

    if (up.error) throw up.error;

    const { data: pub } = db.storage.from("posters").getPublicUrl(posterPath);

    const token = crypto.randomUUID().replace(/-/g, "");

    await db
      .from("posts")
      .update({
        headline: b.headline ?? p.headline,
        subheadline: b.subheadline ?? p.subheadline,
        source_label: b.source ?? p.source_label,
        caption: p.caption,
        design: b.design ?? p.design,
        image_url: imageUrl, // persist the currently selected image
        poster_path: posterPath,
        poster_url: pub.publicUrl,
      })
      .eq("id", p.id);

    await db.from("share_links").upsert(
      { post_id: p.id, token },
      { onConflict: "post_id" }
    );

    return NextResponse.json({
      poster_url: pub.publicUrl,
      share_url: `/share/${token}`,
    });
  } catch (e: any) {
    console.error("POSTER_RENDER_ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Render failed" },
      { status: 500 }
    );
  }
}
