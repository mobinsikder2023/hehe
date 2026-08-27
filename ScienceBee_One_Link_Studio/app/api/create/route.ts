import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { makeEditorial } from "@/lib/editor";
import { pexels } from "@/lib/images";
import { getArticleImage } from "@/lib/articleimage";
import { DEFAULT_DESIGN } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const s = await supabaseServer();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const brief = await makeEditorial(url);

    // 1) the source's OWN hero image (no API key, best match) —
    // 2) fall back to a Pexels photo based on the topic
    const [articleImg, candidates] = await Promise.all([
      getArticleImage(url).catch(() => null),
      pexels(
        brief.image_search_query || brief.visual_concept || "science technology"
      ).catch(() => []),
    ]);

    const bestImage = articleImg || candidates[0]?.url || null;

    const db = supabaseAdmin();
    const { data: post, error } = await db
      .from("posts")
      .insert({
        user_id: user.id,
        source_url: url,
        source_label: brief.source_label || "",
        headline: brief.headline_bn,
        subheadline: brief.subheadline_bn || "",
        caption: brief.caption_bn || "",
        yellow_phrases: brief.yellow_phrases || [],
        design: DEFAULT_DESIGN,
        image_url: bestImage,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      post: {
        id: post.id,
        headline_bn: post.headline,
        subheadline_bn: post.subheadline,
        caption: post.caption,
        source_label: post.source_label,
        yellow_phrases: post.yellow_phrases,
        design: post.design,
        image_url: post.image_url,
        visual_concept: brief.visual_concept || "",
        image_search_query: brief.image_search_query || "",
      },
      candidates,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Generation failed" },
      { status: 500 }
    );
  }
}
