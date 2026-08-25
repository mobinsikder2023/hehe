"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DEFAULT_DESIGN, Design, Candidate } from "@/lib/types";

export default function Studio({ userEmail }: { userEmail: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [post, setPost] = useState<any>(null);
  const [caption, setCaption] = useState("");
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [share, setShare] = useState("");

  const patch = (k: keyof Design, v: any) =>
    setDesign((x) => ({ ...x, [k]: v }));

  async function generate() {
    if (!url.trim()) return;
    setBusy(true);
    setMsg("Article পড়ছি, fact-checking করছি, Bengali editorial copy লিখছি…");
    setShare("");
    try {
      const r = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Generation failed");
      setPost(j.post);
      setCaption(j.post.caption);
      setDesign({ ...DEFAULT_DESIGN, ...j.post.design });
      setCands(j.candidates || []);
      setMsg("Draft ready. Review the copy and image, then render.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function render() {
    if (!post) return;
    setBusy(true);
    setMsg("Rendering 4K poster…");
    try {
      const r = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: post.id,
          headline: post.headline_bn,
          subheadline: post.subheadline_bn,
          source: post.source_label,
          phrases: post.yellow_phrases,
          design,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Render failed");
      // cache-bust so the browser always shows the freshly rendered poster
      const fresh =
        j.poster_url + (j.poster_url.includes("?") ? "&" : "?") + "v=" + Date.now();
      setPost((p: any) => ({ ...p, poster_url: fresh }));
      setShare(j.share_url || "");
      setMsg("Poster saved. Share link is ready.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    location.href = "/login";
  }

  // small helpers to keep the JSX tidy
  const numField = (
    label: string,
    key: keyof Design,
    extra: any = {}
  ) => (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={(design[key] as number) ?? 0}
        onChange={(e) => patch(key, +e.target.value)}
        {...extra}
      />
    </div>
  );

  const colorField = (label: string, key: keyof Design) => (
    <div className="field">
      <label>{label}</label>
      <input
        type="color"
        value={(design[key] as string) || "#000000"}
        onChange={(e) => patch(key, e.target.value)}
        style={{ height: 40, padding: 4, cursor: "pointer" }}
      />
    </div>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/assets/logo_light.png" />
          <div>
            <strong>Science Bee One-Link Studio</strong>
            <span>Editorial automation · 4:5 · 2160×2700</span>
          </div>
        </div>
        <div className="userbar">
          {userEmail}
          <button className="logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div className="eyebrow">ONE LINK → ONE COMPLETE CONTENT PACKAGE</div>
          <h1>Turn a science/tech news link into a polished Bengali post.</h1>
          <p>
            Humanized headline, supporting line, image selection, 10–15 sentence
            caption and editable poster.
          </p>
          <div className="linkrow">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a Prothom Alo, Daily Star, Reuters, BBC, Nature, etc. article URL…"
            />
            <button className="primary" onClick={generate} disabled={busy}>
              {busy ? "Working…" : "Generate"}
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {msg}
          </div>
        </section>

        {post && (
          <section className="workspace">
            <div className="panel">
              <h3>Editorial content</h3>

              <div className="field">
                <label>Main Bengali headline</label>
                <textarea
                  value={post.headline_bn}
                  onChange={(e) =>
                    setPost({ ...post, headline_bn: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>Important supporting line</label>
                <textarea
                  value={post.subheadline_bn}
                  onChange={(e) =>
                    setPost({ ...post, subheadline_bn: e.target.value })
                  }
                />
              </div>

              <div className="field">
                <label>Yellow emphasis</label>
                <input
                  value={(post.yellow_phrases || []).join(", ")}
                  onChange={(e) =>
                    setPost({
                      ...post,
                      yellow_phrases: e.target.value
                        .split(",")
                        .map((x: string) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>

              <div className="field">
                <label>Source</label>
                <input
                  value={post.source_label}
                  onChange={(e) =>
                    setPost({ ...post, source_label: e.target.value })
                  }
                />
              </div>

              <div className="section">
                <div className="sectiontitle">
                  <span>Caption · 10–15 sentences</span>
                  <button
                    className="btn"
                    onClick={() => navigator.clipboard.writeText(caption)}
                  >
                    Copy
                  </button>
                </div>
                <div className="captionbox" style={{ marginTop: 7 }}>
                  {caption}
                </div>
              </div>

              <div className="section">
                <div className="sectiontitle">
                  <span>Image</span>
                  <span className="muted">Replace manually if needed</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  style={{ width: "100%", marginTop: 7 }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !post) return;
                    const fd = new FormData();
                    fd.append("file", f);
                    fd.append("id", post.id);
                    const r = await fetch("/api/upload", {
                      method: "POST",
                      body: fd,
                    });
                    const j = await r.json();
                    if (r.ok) setPost({ ...post, image_url: j.image_url });
                  }}
                />
                <div className="candidates">
                  {cands.map((c, i) => (
                    <button
                      key={i}
                      className="candidate"
                      onClick={() => setPost({ ...post, image_url: c.url })}
                    >
                      <img src={c.url} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ---------- Layout & size ---------- */}
              <div className="section">
                <div className="sectiontitle">
                  <span>Layout &amp; size</span>
                  <span className="muted">poster pixels</span>
                </div>

                <div className="row3">
                  {numField("Headline size (0=auto)", "headline_font_size", {
                    value: design.headline_font_size || 0,
                    onChange: (e: any) =>
                      patch("headline_font_size", +e.target.value || null),
                  })}
                  {numField("Headline X", "headline_x")}
                  {numField("Headline Y", "headline_top")}
                </div>

                <div className="row3">
                  {numField("Headline width", "headline_width")}
                  {numField("Subheading size (0=auto)", "subheadline_font_size", {
                    value: design.subheadline_font_size || 0,
                    onChange: (e: any) =>
                      patch("subheadline_font_size", +e.target.value || null),
                  })}
                  {numField("Subheading gap", "subheadline_y")}
                </div>

                <div className="row3">
                  {numField("Fade length", "fade_length")}
                  {numField("Darkening", "darkening", {
                    min: 0,
                    max: 0.6,
                    step: 0.01,
                  })}
                  {numField("Source size", "source_font_size")}
                </div>

                <div className="row3">
                  {numField("Source X (0=center)", "source_x")}
                  {numField("Source Y offset", "source_top")}
                  {numField("Logo width", "logo_width")}
                </div>
              </div>

              {/* ---------- Colours ---------- */}
              <div className="section">
                <div className="sectiontitle">
                  <span>Colours</span>
                  <span className="muted">tap to pick</span>
                </div>

                <div className="row3">
                  {colorField("Headline", "headline_color")}
                  {colorField("Highlight", "highlight_color")}
                  {colorField("Subheading", "subheadline_color")}
                </div>

                <div className="row3">
                  {colorField("Fade / shade", "shadow_color")}
                  {colorField("Source text", "source_text_color")}
                  {colorField("Footer bar", "footer_color")}
                </div>

                <div className="row3">
                  <div className="field">
                    <label>Source box</label>
                    <select
                      value={design.source_bg}
                      onChange={(e) => patch("source_bg", e.target.value)}
                    >
                      <option value="#24428e">Science Bee blue</option>
                      <option value="#000000">Black</option>
                      <option value="#ffffff">White</option>
                      <option value="transparent">None</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Logo</label>
                    <select
                      value={design.logo}
                      onChange={(e) => patch("logo", e.target.value)}
                    >
                      <option value="auto">Auto</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Footer</label>
                    <select
                      value={design.footer_enabled ? "on" : "off"}
                      onChange={(e) =>
                        patch("footer_enabled", e.target.value === "on")
                      }
                    >
                      <option value="on">Show</option>
                      <option value="off">Hide</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Footer text</label>
                  <input
                    value={design.footer_text}
                    onChange={(e) => patch("footer_text", e.target.value)}
                  />
                </div>
              </div>

              <div className="btnrow" style={{ marginTop: 8 }}>
                <button
                  className="btn yellow"
                  onClick={render}
                  disabled={busy}
                >
                  {busy ? "Rendering…" : "Render & save poster"}
                </button>
                {share && (
                  <button
                    className="btn"
                    onClick={() =>
                      navigator.clipboard.writeText(location.origin + share)
                    }
                  >
                    Copy share link
                  </button>
                )}
              </div>
            </div>

            <div className="previewbox">
              <div style={{ width: "100%" }}>
                {post.poster_url ? (
                  <img className="posterimg" src={post.poster_url} />
                ) : (
                  <div
                    style={{ color: "#fff", padding: 40, textAlign: "center" }}
                  >
                    Render the poster to preview it here.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
