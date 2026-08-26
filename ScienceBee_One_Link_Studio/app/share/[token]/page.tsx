import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import ShareActions from "./ShareActions";

export default async function Share({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data } = await db
    .from("share_links")
    .select("*,posts(*)")
    .eq("token", token)
    .single();

  if (!data) notFound();
  const p: any = data.posts;

  return (
    <main className="sharepage">
      <div className="sharecard">
        <div className="eyebrow">SCIENCE BEE · READY-TO-POST</div>

        <img className="shareposter" src={p.poster_url} alt="poster" />

        <ShareActions caption={p.caption || ""} posterUrl={p.poster_url} />

        <div className="sharecaptionhead">
          <span>Caption</span>
          <span className="muted">
            {p.source_label ? `Source: ${p.source_label}` : ""}
          </span>
        </div>
        <div className="sharecaption bn">{p.caption}</div>

        <div className="sharefoot muted">
          Made with Science Bee One-Link Studio · sciencebee.com.bd
        </div>
      </div>
    </main>
  );
}
