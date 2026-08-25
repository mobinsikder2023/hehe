import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_DESIGN, Design } from "./types";

const W = 2160;
const H = 2700;

const BENGALI_FONT_FAMILY = "Noto Serif Bengali";
const LATIN_FONT_FAMILY = "Noto Sans";

/*
 * Figure space (U+2007) is not present in the Bengali font, so
 * resvg draws it from the Latin font. Unlike a normal ASCII space,
 * the Bengali shaper will NOT absorb it into a preceding vowel-sign
 * cluster, which is what previously made word gaps disappear
 * (e.g. "সমুদ্রে ভাসমান" collapsing into one word). We use it as the
 * separator between every word.
 */
const FIGURE_SPACE = "\u2007";

function isBengaliChar(ch: string) {
  const c = ch.codePointAt(0) || 0;
  return (
    (c >= 0x0980 && c <= 0x09ff) ||
    c === 0x200c ||
    c === 0x200d
  );
}

type ScriptRun = { text: string; latin: boolean };

/*
 * Split a single word into runs of Bengali vs non-Bengali so each
 * run is drawn with a font that actually contains its glyphs.
 * (The bundled Bengali TTF has no Latin glyphs at all.)
 */
function scriptRuns(word: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let cur: ScriptRun | null = null;

  for (const ch of String(word ?? "")) {
    const latin = !isBengaliChar(ch);
    if (cur && cur.latin === latin) {
      cur.text += ch;
    } else {
      if (cur) runs.push(cur);
      cur = { latin, text: ch };
    }
  }

  if (cur) runs.push(cur);
  return runs;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function validHex(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function esc(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/*
 * Fix old UTF-8/Latin-1 mojibake when it exists.
 * Normal Bengali text is left untouched.
 */
function repairMojibake(value: string) {
  const text = String(value ?? "");

  if (!/[àÂÃ]/.test(text)) {
    return text;
  }

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");

    if (/[\u0980-\u09FF]/.test(repaired)) {
      return repaired;
    }

    return text;
  } catch {
    return text;
  }
}

/*
 * Approximate Bengali text width for wrapping.
 * This is intentionally conservative so text does not touch
 * the edges of the poster.
 */
function textUnits(text: string) {
  let units = 0;

  for (const ch of text) {
    if (ch === " ") {
      units += 0.30;
    } else if (/\d/.test(ch)) {
      units += 0.48;
    } else if (/[A-Za-z]/.test(ch)) {
      units += 0.52;
    } else if (ch >= "\u0980" && ch <= "\u09FF") {
      units += 0.58;
    } else {
      units += 0.45;
    }
  }

  return units;
}

function wrapWords(text: string, maxUnits: number) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return [];
  }

  const lines: string[] = [];
  let current = "";
  let units = 0;

  for (const word of words) {
    const wordUnits = textUnits(word);
    const nextUnits = current
      ? units + 0.30 + wordUnits
      : wordUnits;

    if (current && nextUnits > maxUnits) {
      lines.push(current);
      current = word;
      units = wordUnits;
    } else {
      current = current
        ? `${current} ${word}`
        : word;

      units = nextUnits;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function fitLines(
  text: string,
  width: number,
  preferredSize: number,
  minSize: number,
  maxLines: number
) {
  for (
    let size = preferredSize;
    size >= minSize;
    size -= 2
  ) {
    const maxUnits = width / size;
    const lines = wrapWords(text, maxUnits);

    if (lines.length <= maxLines) {
      return {
        size,
        lines,
      };
    }
  }

  const size = minSize;

  return {
    size,
    lines: wrapWords(text, width / size),
  };
}

function splitHighlight(
  text: string,
  phrases: string[]
) {
  const clean = (phrases || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!clean.length || !text) {
    return [
      {
        text,
        yellow: false,
      },
    ];
  }

  const escaped = clean.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );

  const re = new RegExp(
    `(${escaped.join("|")})`,
    "g"
  );

  const pieces = text.split(re);

  return pieces
    .filter(Boolean)
    .map((piece) => ({
      text: piece,
      yellow: clean.includes(piece),
    }));
}

/*
 * Build inner <tspan> markup for a single line:
 *  - words separated by an explicit figure-space tspan (never a raw
 *    space between Bengali clusters, which resvg would swallow)
 *  - each word split into Bengali / Latin runs for correct fonts
 *  - highlighted phrases coloured yellow
 */
function buildInner(
  text: string,
  phrases: string[],
  fill: string
) {
  const parts = splitHighlight(text, phrases);

  let first = true;
  let out = "";

  for (const part of parts) {
    const color = part.yellow ? "#ffd400" : fill;

    const words = String(part.text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    for (const word of words) {
      if (!first) {
        out += `<tspan font-family="${LATIN_FONT_FAMILY}">${FIGURE_SPACE}</tspan>`;
      }
      first = false;

      for (const run of scriptRuns(word)) {
        out += `<tspan fill="${color}" font-family="${
          run.latin ? LATIN_FONT_FAMILY : BENGALI_FONT_FAMILY
        }">${esc(run.text)}</tspan>`;
      }
    }
  }

  return out;
}

/*
 * Render one Bengali text line.
 *
 * IMPORTANT:
 * The SVG uses ONLY the bundled Bengali font.
 * We do not ask the renderer to fall back to DejaVu Sans.
 */
function lineTextSvg(
  text: string,
  phrases: string[],
  x: number,
  y: number,
  fontSize: number,
  fill = "#ffffff"
) {
  const tspans = buildInner(text, phrases, fill);

  return `
    <text
      x="${x}"
      y="${y}"
      text-anchor="middle"
      font-family="${BENGALI_FONT_FAMILY}"
      font-size="${fontSize}px"
      font-weight="700"
      fill="${fill}"
      style="
        paint-order:stroke;
        stroke:rgba(0,0,0,.24);
        stroke-width:2px;
      "
    >${tspans}</text>
  `;
}

async function prepareJpeg(image: Buffer) {
  return sharp(image)
    .rotate()
    .jpeg({
      quality: 94,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
}

export async function renderPoster(args: {
  image: Buffer;
  headline: string;
  subheadline: string;
  source: string;
  phrases: string[];
  design?: Partial<Design>;
  logo: "auto" | "light" | "dark";
}) {
  const d: Design = {
    ...DEFAULT_DESIGN,
    ...(args.design || {}),
  };

  /*
   * Bundled font.
   *
   * This file MUST exist in:
   *
   * public/assets/NotoSerifBengali-Bold.ttf
   */
  const fontPath = path.join(
    process.cwd(),
    "public",
    "assets",
    "NotoSerifBengali-Bold.ttf"
  );

  const latinFontPath = path.join(
    process.cwd(),
    "public",
    "assets",
    "NotoSans-SemiBold.ttf"
  );

  /*
   * Fail with a useful error instead of silently falling
   * back to an incorrect system font.
   */
  try {
    await fs.access(fontPath);
  } catch {
    throw new Error(
      `Bengali font not found: ${fontPath}`
    );
  }

  const shadow =
    d.shadow_color &&
    d.shadow_color !== "auto" &&
    validHex(d.shadow_color)
      ? d.shadow_color
      : "#17234a";

  const logoName =
    args.logo === "dark"
      ? "logo_dark.png"
      : "logo_light.png";

  const logoPath = path.join(
    process.cwd(),
    "public",
    "assets",
    logoName
  );

  const [jpeg, logo] = await Promise.all([
    prepareJpeg(args.image),
    fs.readFile(logoPath),
  ]);

  const image64 = jpeg.toString("base64");
  const logo64 = logo.toString("base64");

  /*
   * Text widths.
   */
  const headlineWidth = clamp(
    d.headline_width || 1840,
    1350,
    1980
  );

  const subWidth = clamp(
    d.subheadline_width || 1780,
    1250,
    1900
  );

  /*
   * Headline.
   */
  const headline = repairMojibake(
    args.headline || ""
  );

  const headlineFit = fitLines(
    headline,
    headlineWidth - 100,
    d.headline_font_size || 112,
    72,
    3
  );

  /*
   * Supporting line.
   */
  const subheadline = repairMojibake(
    args.subheadline || ""
  );

  const subFit = fitLines(
    subheadline,
    subWidth - 100,
    d.subheadline_font_size || 50,
    32,
    2
  );

  const headlineLineHeight = Math.round(
    headlineFit.size * 1.06
  );

  const subLineHeight = Math.round(
    subFit.size * 1.18
  );

  const headlineBlockHeight =
    Math.max(1, headlineFit.lines.length) *
    headlineLineHeight;

  /*
   * Layout.
   */
  const topPadding = 85;

  const sourceY = 235;
  const sourceH = 78;

  const headlineTop =
    d.composition === "text_first"
      ? 440
      : clamp(
          d.headline_top || 400,
          340,
          620
        );

  const subTop =
    headlineTop +
    headlineBlockHeight +
    Math.max(
      28,
      d.subheadline_y || 28
    );

  const footerH = 105;
  const footerY = H - footerH;

  /*
   * Source.
   */
  const sourceText =
    `সূত্র: ${repairMojibake(args.source || "")}`;

  const sourceWidth = clamp(
    560 + textUnits(sourceText) * 30,
    680,
    1550
  );

  const sourceFont = clamp(
    d.source_font_size || 31,
    25,
    38
  );

  /*
   * Dark gradient over the upper part of the image.
   */
  const topGradient = `
    <linearGradient
      id="topFade"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="${esc(shadow)}"
        stop-opacity="0.98"
      />

      <stop
        offset="25%"
        stop-color="${esc(shadow)}"
        stop-opacity="0.90"
      />

      <stop
        offset="52%"
        stop-color="${esc(shadow)}"
        stop-opacity="0.62"
      />

      <stop
        offset="78%"
        stop-color="${esc(shadow)}"
        stop-opacity="0.20"
      />

      <stop
        offset="100%"
        stop-color="${esc(shadow)}"
        stop-opacity="0"
      />
    </linearGradient>
  `;

  /*
   * Headline SVG.
   */
  const headlineSvg = headlineFit.lines
    .map((line, i) =>
      lineTextSvg(
        line,
        args.phrases || [],
        W / 2,
        headlineTop +
          i * headlineLineHeight +
          headlineFit.size,
        headlineFit.size
      )
    )
    .join("");

  /*
   * Supporting text SVG.
   */
  const subSvg = subFit.lines
    .map((line, i) =>
      lineTextSvg(
        line,
        args.phrases || [],
        W / 2,
        subTop +
          i * subLineHeight +
          subFit.size,
        subFit.size,
        "#ffffff"
      )
    )
    .join("");

  /*
   * Complete SVG.
   */
  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${W}"
  height="${H}"
  viewBox="0 0 ${W} ${H}"
>

  <defs>

    ${topGradient}

    <linearGradient
      id="photoBottom"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="#17234a"
        stop-opacity="0"
      />

      <stop
        offset="100%"
        stop-color="#17234a"
        stop-opacity="0.18"
      />
    </linearGradient>

  </defs>

  <!-- Background -->
  <rect
    width="${W}"
    height="${H}"
    fill="${shadow}"
  />

  <!-- Main photograph -->
  <image
    href="data:image/jpeg;base64,${image64}"
    x="0"
    y="0"
    width="${W}"
    height="${H}"
    preserveAspectRatio="xMidYMid slice"
  />

  <!-- Upper text contrast -->
  <rect
    x="0"
    y="0"
    width="${W}"
    height="1120"
    fill="url(#topFade)"
  />

  <!-- Bottom photo shade -->
  <rect
    x="0"
    y="${H - 620}"
    width="${W}"
    height="620"
    fill="url(#photoBottom)"
  />

  <!-- Science Bee logo -->
  <image
    href="data:image/png;base64,${logo64}"
    x="${
      W -
      (d.logo_right || 100) -
      (d.logo_width || 220)
    }"
    y="${d.logo_top || topPadding}"
    width="${d.logo_width || 220}"
    preserveAspectRatio="xMidYMid meet"
  />

  <!-- Domain -->
  <text
    x="${d.logo_right || 100}"
    y="${(d.logo_top || topPadding) + 44}"
    font-family="${LATIN_FONT_FAMILY}"
    font-size="34px"
    font-weight="700"
    fill="#ffffff"
    opacity="0.96"
    style="
      paint-order:stroke;
      stroke:rgba(0,0,0,.22);
      stroke-width:1px;
    "
  ><tspan font-family="${LATIN_FONT_FAMILY}">sciencebee.com.bd</tspan></text>

  <!-- Source pill -->
  <rect
    x="${W / 2 - sourceWidth / 2}"
    y="${sourceY}"
    width="${sourceWidth}"
    height="${sourceH}"
    rx="${sourceH / 2}"
    fill="${
      d.source_bg &&
      d.source_bg !== "transparent" &&
      validHex(d.source_bg)
        ? d.source_bg
        : "#24428e"
    }"
    opacity="0.96"
  />

  <!-- Source -->
  <text
    x="${W / 2}"
    y="${sourceY + 51}"
    text-anchor="middle"
    font-family="${BENGALI_FONT_FAMILY}"
    font-size="${sourceFont}px"
    font-weight="700"
    fill="#ffffff"
  >${buildInner(sourceText, [], "#ffffff")}</text>

  <!-- Headline -->
  ${headlineSvg}

  <!-- Supporting line -->
  ${subSvg}

  <!-- Footer -->
  <rect
    x="0"
    y="${footerY}"
    width="${W}"
    height="${footerH}"
    fill="#24428e"
  />

  <text
    x="${W / 2}"
    y="${footerY + 66}"
    text-anchor="middle"
    font-family="${BENGALI_FONT_FAMILY}"
    font-size="30px"
    font-weight="700"
    fill="#ffffff"
  >${buildInner("বিজ্ঞান, প্রযুক্তি ও গবেষণা", [], "#ffffff")}</text>

</svg>
`;

  /*
   * Resvg configuration.
   *
   * CRITICAL:
   * Do NOT let Vercel's system fonts decide what Bengali font
   * to use. The bundled TTF is the font.
   */
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: W,
    },

    font: {
      fontFiles: [fontPath, latinFontPath],

      loadSystemFonts: false,

      defaultFontFamily:
        BENGALI_FONT_FAMILY,

      serifFamily:
        BENGALI_FONT_FAMILY,

      sansSerifFamily:
        LATIN_FONT_FAMILY,
    },

    textRendering: 2,
    shapeRendering: 2,
  });

  return Buffer.from(
    resvg.render().asPng()
  );
}
