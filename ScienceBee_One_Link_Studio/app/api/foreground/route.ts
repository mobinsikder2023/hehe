import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function fetchBytes(url: string): Promise<Buffer> {
  const r = await fetch(url, {
    headers: { "User-Agent": "ScienceBeeEditorialBot/2.0" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Could not fetch that image URL");
  return Buffer.from(await r.arrayBuffer());
}

/*
 * Turn any photo into a transparent cut-out using the free, self-hosted
 * `withoutbg` service (see bg_service.py). No API key, no per-image cost.
 * Configure its URL with BG_SERVICE_URL (defaults to the local service).
 */
async function removeBackground(bytes: Buffer): Promise<Buffer> {
  const endpoint =
    process.env.BG_SERVICE_URL || "http://127.0.0.1:8600/remove";
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)]), "image.png");

  let r: Response;
  try {
    r = await fetch(endpoint, { method: "POST", body: fd });
  } catch {
    throw new Error(
      "Background remover is not reachable. Is the bg_service running? (see setup)"
    );
  }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("Background removal failed: " + t.slice(0, 160));
  }
  return Buffer.from(await r.arrayBuffer());
}

export async function POST(req: Request) {
  try {
    const s = await supabaseServer();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ct = req.headers.get("content-type") || "";
    let bytes: Buffer;
    let id = "";
    let remove = false;

    if (ct.includes("multipart/form-data")) {
      const f = await req.formData();
      const file = f.get("file") as File | null;
      id = String(f.get("id") || "");
      remove = String(f.get("remove_bg") || "") === "1";
      if (!file) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }
      bytes = Buffer.from(await file.arrayBuffer());
    } else {
      const j = await req.json();
      id = String(j.id || "");
      remove = !!j.remove_bg;
      if (!j.image_url) {
        return NextResponse.json(
          { error: "Missing image_url" },
          { status: 400 }
        );
      }
      bytes = await fetchBytes(String(j.image_url));
    }

    if (!id) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    const out = remove ? await removeBackground(bytes) : bytes;

    const db = supabaseAdmin();
    const path = `${user.id}/${id}/fg-${Date.now()}.png`;
    const up = await db.storage.from("images").upload(path, out, {
      contentType: "image/png",
      upsert: true,
    });
    if (up.error) throw up.error;

    const { data } = db.storage.from("images").getPublicUrl(path);
    return NextResponse.json({ image_url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Foreground failed" },
      { status: 500 }
    );
  }
}
