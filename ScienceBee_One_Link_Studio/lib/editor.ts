import OpenAI from "openai";

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `You are the senior Bengali science and technology editor for Science Bee Bangladesh.
Write natural Bangladesh Bengali — never literal machine translation. Preserve facts, names, dates and numbers. Use correct Unicode Bengali যুক্তবর্ণ. Avoid academic stiffness, generic AI phrases, exaggerated claims and clickbait.

Produce:
- headline_bn: one short, strong Bengali headline.
- subheadline_bn: one useful supporting line.
- yellow_phrases: 1–3 short phrases that are EXACT substrings of the headline or the supporting line.
- caption_bn: an engaging, human Facebook caption written as 3 to 4 short PARAGRAPHS, each separated by a BLANK LINE. Pack it with the article's SPECIFIC details — real numbers, percentages, sample sizes, dates, institution and researcher names, study design, and concrete findings — never vague generalities. Structure it: (1) a hook that draws the reader in, (2) what was actually found and how the study/work was done, (3) the key data and what it means, (4) a thoughtful takeaway or question. 10 to 15 sentences total across the paragraphs. It must read like a knowledgeable science page — not a dry report and not generic filler.
- source_label: ONLY the media / outlet name — for example "BBC", "Reuters", "Prothom Alo", "Nature", "Science", "Space", "The Daily Star". No dates, no article titles, no descriptions, no links. At most 3 words.

STRICT RULES for caption_bn:
- Absolutely NO URLs, web links, domain names, markdown links, footnotes, reference numbers, "utm_source", or parenthetical source citations of any kind.
- Do NOT state where the information came from inside the caption. Just tell the story naturally.
- Output plain flowing Bengali only, with no markdown, no square brackets, no code, no headings.

Never use an em dash or en dash (the "—" or "–" characters) anywhere in any field. Use a comma or a full stop instead.

Never invent facts. Return JSON only.`;

/* Remove any links / citations the model may still slip into the caption. */
function stripLinks(text: string): string {
  return String(text || "")
    // [label](url) -> label
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // parenthetical chunks that contain a domain / url / utm
    .replace(
      /\([^()]*\b(?:https?:|www\.|utm_source|\.com|\.org|\.gov|\.net|\.live|\.io|\.co)\b[^()]*\)/gi,
      ""
    )
    // bare urls (optionally wrapped in parens)
    .replace(/\(?\bhttps?:\/\/[^\s)]+\)?/gi, "")
    .replace(/\bwww\.[^\s)]+/gi, "")
    // leftover empty brackets and doubled spaces
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([।,!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* Remove em/en dashes everywhere (per house style). */
function noDash(text: string): string {
  return String(text || "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/,\s*,/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*।/g, "।")
    .replace(/[ \t]{2,}/g, " ");
}

/* Keep only the outlet name, e.g. "BBC Future, 18 Aug 2026 …" -> "BBC Future". */
function shortSource(text: string): string {
  let s = String(text || "").trim();
  s = s.replace(/https?:\/\/\S+/gi, "").trim();
  // cut at the first dash / colon / pipe / opening paren
  s = s.split(/[—–\-:|(]/)[0];
  s = s.replace(/["'“”‘’]/g, "").replace(/[.,;]+$/, "").trim();
  const words = s.split(/\s+/).filter(Boolean).slice(0, 3);
  return words.join(" ");
}

export async function makeEditorial(url: string) {
  const r = await client().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Read and verify this news story using web search. URL: ${url}

Return JSON with: headline_bn, subheadline_bn, yellow_phrases, caption_bn (3 to 4 paragraphs separated by blank lines, 10 to 15 sentences, rich with concrete numbers/names/dates from the article, NO links or citations anywhere), source_label (outlet name only, max 3 words), category, confidence, needs_editor_review, reason_for_review, visual_concept, image_search_query.`,
      },
    ],
    tools: [{ type: "web_search" }],
  });

  let s = r.output_text
    .trim()
    .replace(/^```json\s*/, "")
    .replace(/```$/, "")
    .trim();

  const j = JSON.parse(s);

  if (j.caption_bn) j.caption_bn = noDash(stripLinks(j.caption_bn));
  if (j.headline_bn) j.headline_bn = noDash(j.headline_bn);
  if (j.subheadline_bn) j.subheadline_bn = noDash(j.subheadline_bn);
  if (j.source_label) j.source_label = shortSource(j.source_label);

  return j;
}
