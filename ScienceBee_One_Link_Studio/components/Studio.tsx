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

  const sizeSlider = (
    label: string,
    key: keyof Design,
    min: number,
    max: number,
    step = 2,
    auto = false
  ) => {
    const raw = design[key] as number | null;
    const val = raw || min;
    const shown = auto && !raw ? "Auto" : `${val}px`;
    return (
      <div className="field">
        <label>
          {label}
          <span className="pxval">{shown}</span>
        </label>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => {
            const n = +e.target.value;
            patch(key, auto && n <= min ? null : n);
          }}
        />
      </div>
    );
  };

  const numField = (label: string, key: keyof Design) => (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={(design[key] as number) ?? 0}
        onChange={(e) => patch(key, +e.target.value)}
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

      <div className="linkbar">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a Prothom Alo, Daily Star, Reuters, BBC, Nature… article URL"
        />
        <button className="primary" onClick={generate} disabled={busy}>
          {busy ? "Working…" : "Generate"}
        </button>
      </div>
      {msg && <div className="linkmsg">{msg}</div>}

      {!post ? (
        <div className="canvas" style={{ margin: "14px 20px", minHeight: 420 }}>
          <div className="empty">
            Paste a news link above and press <b>Generate</b> to start.
          </div>
        </div>
      ) : (
        <div className="editor">
          <div className="pane">
            <h3>Design</h3>

            <div className="sectiontitle">Text size</div>
            {sizeSlider("Headline", "headline_font_size", 0, 200, 2, true)}
            {sizeSlider("Subheading", "subheadline_font_size", 0, 130, 2, true)}
            {sizeSlider("Source", "source_font_size", 20, 60)}
            {sizeSlider("Domain (sciencebee.com.bd)", "domain_font_size", 18, 72)}
            {sizeSlider("Footer", "footer_font_size", 18, 60)}

            <div className="section">
              <div className="sectiontitle">Image &amp; frame</div>
              {sizeSlider("Fade length", "fade_length", 300, 1700, 10)}
              {sizeSlider("Darkening ×100", "darkening", 0, 60, 1)}
              {sizeSlider("Logo width", "logo_width", 120, 520, 5)}
            </div>

            <div className="section">
              <div className="sectiontitle">Position (px)</div>
              <div className="row3">
                {numField("Headline X", "headline_x")}
                {numField("Headline Y", "headline_top")}
                {numField("Head width", "headline_width")}
              </div>
              <div className="row3">
                {numField("Sub gap", "subheadline_y")}
                {numField("Source X", "source_x")}
                {numField("Source Y", "source_top")}
              </div>
            </div>

            <div className="section">
              <div className="sectiontitle">Colours</div>
              <div className="row3">
                {colorField("Headline", "headline_color")}
                {colorField("Highlight", "highlight_color")}
                {colorField("Subheading", "subheadline_color")}
              </div>
              <div className="row3">
                {colorField("Fade", "shadow_color")}
                {colorField("Source txt", "source_text_color")}
                {colorField("Footer bar", "footer_color")}
              </div>
            </div>

            <div className="section">
              <div className="sectiontitle">Elements</div>
              <div className="row3">
                <div className="field">
                  <label>Source box</label>
                  <select
                    value={design.source_bg}
                    onChange={(e) => patch("source_bg", e.target.value)}
                  >
                    <option value="#24428e">SB blue</option>
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
          </div>

          <div className="canvas">
            {post.poster_url ? (
              <img src={post.poster_url} alt="poster preview" />
            ) : (
              <div className="empty">
                Press <b>Render &amp; save poster</b> to preview.
              </div>
            )}
          </div>

          <div className="pane">
            <h3>Content</h3>

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
              <label>Yellow emphasis (comma separated)</label>
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
                <span>Image</span>
                <span className="muted">upload or pick</span>
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

            <div className="btnrow" style={{ marginTop: 10 }}>
              <button className="btn yellow" onClick={render} disabled={busy}>
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
        </div>
      )}
    </div>
  );
}
