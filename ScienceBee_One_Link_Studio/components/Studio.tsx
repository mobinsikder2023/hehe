"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DEFAULT_DESIGN, Design, Candidate } from "@/lib/types";

export default function Studio({ userEmail }: { userEmail: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [post, setPost] = useState<any>(null);
  const [caption, setCaption] = useState("");
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [share, setShare] = useState("");
  const [imgLink, setImgLink] = useState("");

  const patch = (k: keyof Design, v: any) =>
    setDesign((x) => ({ ...x, [k]: v }));

  // keep latest state for the debounced auto-render
  const stateRef = useRef({ post, design });
  stateRef.current = { post, design };

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
      setMsg("Draft ready — the poster updates live as you edit.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Re-render the poster image. This does NOT call OpenAI — it only
  // redraws the PNG on the server, so live editing costs no AI usage.
  const autoSave = useCallback(async () => {
    const { post, design } = stateRef.current;
    if (!post || !post.image_url) return;
    setSaving(true);
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
      if (r.ok) {
        const fresh =
          j.poster_url +
          (j.poster_url.includes("?") ? "&" : "?") +
          "v=" +
          Date.now();
        setPost((p: any) => ({ ...p, poster_url: fresh }));
        setShare(j.share_url || "");
      }
    } catch {
      /* ignore transient errors during live editing */
    } finally {
      setSaving(false);
    }
  }, []);

  // debounce: whenever the copy or the design changes, re-render ~0.6s later
  useEffect(() => {
    if (!post) return;
    const t = setTimeout(() => autoSave(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    design,
    post?.headline_bn,
    post?.subheadline_bn,
    post?.source_label,
    JSON.stringify(post?.yellow_phrases),
    post?.image_url,
  ]);

  async function download() {
    if (!post?.poster_url) return;
    try {
      const r = await fetch(post.poster_url, { cache: "no-store" });
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = "sciencebee-poster.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
    } catch {
      window.open(post.poster_url, "_blank");
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
    auto = false,
    unit = "px"
  ) => {
    const raw = design[key] as number | null;
    const val = raw ?? min;
    const shown = auto && !raw ? "Auto" : `${val}${unit}`;
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
            {sizeSlider("Headline", "headline_font_size", 40, 200, 2, true)}
            {sizeSlider("Subheading", "subheadline_font_size", 24, 130, 2, true)}
            {sizeSlider("Source", "source_font_size", 20, 60)}
            {sizeSlider("Domain (sciencebee.com.bd)", "domain_font_size", 18, 72)}

            <div className="section">
              <div className="sectiontitle">Image &amp; frame</div>
              {sizeSlider("Fade length", "fade_length", 300, 1700, 10)}
              {sizeSlider("Darkening ×100", "darkening", 0, 60, 1)}
              {sizeSlider("Logo width", "logo_width", 120, 520, 5)}
              {sizeSlider("Image zoom", "image_zoom", 100, 260, 2, false, "%")}
              {sizeSlider("Image shift down", "image_offset_y", -1000, 1000, 10, false, "px")}
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
                {colorField("Fade", "shadow_color")}
              </div>
              <div className="row3">
                {colorField("Source txt", "source_text_color")}
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
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto</option>
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
                    <option value="off">Hide</option>
                    <option value="on">Show</option>
                  </select>
                </div>
              </div>

              {design.footer_enabled && (
                <>
                  <div className="row3">
                    {colorField("Footer bar", "footer_color")}
                    {sizeSlider("Footer size", "footer_font_size", 18, 60)}
                  </div>
                  <div className="field">
                    <label>Footer text</label>
                    <input
                      value={design.footer_text}
                      onChange={(e) => patch("footer_text", e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="canvas">
            {post.poster_url ? (
              <img src={post.poster_url} alt="poster preview" />
            ) : (
              <div className="empty">
                {saving ? "Rendering…" : "Pick an image to see the preview."}
              </div>
            )}
          </div>

          <div className="pane">
            <div className="contenthead">
              <h3 style={{ margin: 0 }}>Content</h3>
              <span className="savestate">
                {saving ? "Updating…" : post.poster_url ? "Saved ✓" : ""}
              </span>
            </div>

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
              <label>Source (media name only)</label>
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
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <input
                  placeholder="…or paste an image URL"
                  value={imgLink}
                  onChange={(e) => setImgLink(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn"
                  onClick={() => {
                    const u = imgLink.trim();
                    if (u) setPost({ ...post, image_url: u });
                  }}
                >
                  Use
                </button>
              </div>
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
              <button
                className="btn yellow"
                onClick={download}
                disabled={!post.poster_url}
              >
                ⬇ Download poster
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
