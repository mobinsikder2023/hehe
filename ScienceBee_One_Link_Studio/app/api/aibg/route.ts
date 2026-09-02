import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * Generate a background image from a text prompt using Pollinations.ai
 * (free, no API key). The image is fetched server-side and stored in our
 * own Supabase bucket so the poster has a stable URL.
 */
export async function POST(req: Request) {
  try {
    const s = await supabaseServer();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const id = String(body.id || "");
    const prompt = String(body.prompt || "").trim();
    const layout = String(body.layout || "text_top");
    if (!id) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json(
        { error: "Type a prompt for the AI background" },
        { status: 400 }
      );
    }

    // portrait by default so it fills the 4:5 poster
    const w = Math.min(Math.max(Number(body.width) || 1600, 512), 2160);
    const h = Math.min(Math.max(Number(body.height) || 2000, 512), 2700);
    const seed = Math.floor(Math.random() * 1e9);

    // where the text will sit -> keep the opposite area clear for the subject
    const space =
      layout === "text_bottom"
        ? "the main subject placed in the UPPER half of the frame, the lower half kept simple and uncluttered as empty negative space"
        : "the main subject placed in the LOWER half of the frame, the upper half kept simple and uncluttered as empty negative space";

    // realistic editorial photo, clean composition, and absolutely no text
    const styledPrompt =
      prompt +
      ", " +
      space +
      ", photorealistic editorial photograph, natural lighting, shallow depth of field, ultra detailed, shot on DSLR, 4k, clean simple background, " +
      "absolutely no text, no words, no letters, no numbers, no captions, no signage, no watermark, no logo, no typography";

    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(styledPrompt)}` +
      `?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;

    let r: Response;
    try {
      r = await fetch(url, {
        headers: { "User-Agent": "ScienceBeeEditorialBot/2.0" },
      });
    } catch {
      throw new Error("Image generator is not reachable right now.");
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("Image generation failed: " + t.slice(0, 140));
    }

    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length < 1000) {
      throw new Error("Generator returned an empty image, try again.");
    }

    const db = supabaseAdmin();
    const path = `${user.id}/${id}/aibg-${Date.now()}.jpg`;
    const up = await db.storage.from("images").upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (up.error) throw up.error;

    const { data } = db.storage.from("images").getPublicUrl(path);
    return NextResponse.json({ image_url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AI background failed" },
      { status: 500 }
    );
  }
}
