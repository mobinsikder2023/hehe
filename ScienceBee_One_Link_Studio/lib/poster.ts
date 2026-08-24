import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_DESIGN, Design } from "./types";

const W = 2160;
const H = 2700;

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

function repairMojibake(value: string) {
  let text = String(value ?? "");
  /*
   * Older records were occasionally saved/displayed after UTF-8 bytes were
   * decoded as Windows-1252/Latin-1. Typical signs are "à¦..." / "à§...".
   * Repair only when those tell-tale sequences are present so normal Bengali
   * text is left untouched.
   */
  if (!/[àÂÃ]/.test(text)) return text;

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return /[\u0980-\u09FF]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
}

function rgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/*
 * IMPORTANT:
 * The old renderer used Satori for the poster itself.
 * Satori currently documents that advanced typography features such as
 * kerning/ligatures are not supported. Bengali is an Indic complex script,
 * so production rendering is more reliable when Resvg handles the SVG text
 * directly with the actual Bengali font loaded into its font database.
 */

function bengaliUnits(text: string) {
  let units = 0;
  for (const ch of text) {
    if (ch === " ") units += 0.28;
    else if (/\d/.test(ch)) units += 0.48;
    else if (/[A-Za-z]/.test(ch)) units += 0.50;
    else if (ch >= "\u0980" && ch <= "\u09FF") units += 0.55;
    else units += 0.45;
  }
  return units;
}

function wrapWords(text: string, maxUnits: number) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = "";
  let units = 0;

  for (const word of words) {
    const wordUnits = bengaliUnits(word);
    const nextUnits = current ? units + 0.28 + wordUnits : wordUnits;

    if (current && nextUnits > maxUnits) {
      lines.push(current);
      current = word;
      units = wordUnits;
    } else {
      current = current ? `${current} ${word}` : word;
      units = nextUnits;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function fitLines(
  text: string,
  width: number,
  preferredSize: number,
  minSize: number,
  maxLines: number
) {
  for (let size = preferredSize; size >= minSize; size -= 2) {
    const maxUnits = width / size;
    const lines = wrapWords(text, maxUnits);
    if (lines.length <= maxLines) {
      return { size, lines };
    }
  }

  const size = minSize;
  const lines = wrapWords(text, width / size);
  return { size, lines };
}

function splitHighlight(text: string, phrases: string[]) {
  const clean = (phrases || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!clean.length || !text) {
    return [{ text, yellow: false }];
  }

  const escaped = clean.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const pieces = text.split(re);

  return pieces.filter(Boolean).map((piece) => ({
    text: piece,
    yellow: clean.includes(piece),
  }));
}

function lineTextSvg(
  text: string,
  phrases: string[],
  x: number,
  y: number,
  fontSize: number,
  fill = "#ffffff"
) {
  const parts = splitHighlight(text, phrases);
  const tspans = parts
    .map(
      (part) =>
        `<tspan fill="${part.yellow ? "#ffd400" : fill}">${esc(
          part.text
        )}</tspan>`
    )
    .join("");

  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Noto Serif Bengali, DejaVu Sans" font-size="${fontSize}" font-weight="700" fill="${fill}" style="paint-order:stroke;stroke:rgba(0,0,0,.22);stroke-width:2px">${tspans}</text>`;
}

async function prepareJpeg(image: Buffer) {
  return sharp(image)
    .rotate()
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
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

  const shadow =
    d.shadow_color && d.shadow_color !== "auto" && validHex(d.shadow_color)
      ? d.shadow_color
      : "#17234a";

  const fontPath = path.join(
    process.cwd(),
    "public/assets/NotoSerifBengali-Bold.ttf"
  );

  const logoName =
    args.logo === "dark" ? "logo_dark.png" : "logo_light.png";
  const logoPath = path.join(process.cwd(), "public/assets", logoName);

  const [jpeg, logo] = await Promise.all([
    prepareJpeg(args.image),
    fs.readFile(logoPath),
  ]);

  const image64 = jpeg.toString("base64");
  const logo64 = logo.toString("base64");

  const headlineWidth = clamp(d.headline_width || 1840, 1200, 1980);
  const subWidth = clamp(d.subheadline_width || 1840, 1200, 1980);

  const headlineFit = fitLines(
    args.headline || "",
    headlineWidth - 80,
    d.headline_font_size || 112,
    76,
    2
  );

  const subFit = fitLines(
    args.subheadline || "",
    subWidth - 80,
    d.subheadline_font_size || 50,
    34,
    2
  );

  const headlineLineHeight = Math.round(headlineFit.size * 1.02);
  const subLineHeight = Math.round(subFit.size * 1.15);

  const headlineBlockHeight =
    Math.max(1, headlineFit.lines.length) * headlineLineHeight;

  const subBlockHeight =
    Math.max(1, subFit.lines.length) * subLineHeight;

  /*
   * Stable editorial layout:
   * logo/domain at top, source pill above headline, headline below it,
   * supporting line below headline, photo remains dominant.
   */
  const topPadding = 95;
  const sourceY = 250;
  const sourceH = 82;

  const headlineTop =
    d.composition === "text_first"
      ? 470
      : clamp(
          d.headline_top || 410,
          350,
          650
        );

  const sourceText = `সূত্র: ${repairMojibake(args.source || "")}`;
  const sourceWidth = clamp(520 + bengaliUnits(sourceText) * 28, 620, 1500);

  const subTop =
    headlineTop +
    headlineBlockHeight +
    Math.max(24, d.subheadline_y || 28);

  const footerH = 105;
  const footerY = H - footerH;

  /*
   * Keep the photograph visible. Only the upper editorial region receives
   * the dark gradient needed for text contrast.
   */
  const topGradient = `
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${esc(shadow)}" stop-opacity="0.98"/>
      <stop offset="24%" stop-color="${esc(shadow)}" stop-opacity="0.90"/>
      <stop offset="48%" stop-color="${esc(shadow)}" stop-opacity="0.68"/>
      <stop offset="72%" stop-color="${esc(shadow)}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="${esc(shadow)}" stop-opacity="0"/>
    </linearGradient>
  `;

  const headlineSvg = headlineFit.lines
    .map((line, i) =>
      lineTextSvg(
        line,
        args.phrases || [],
        W / 2,
        headlineTop + i * headlineLineHeight + headlineFit.size,
        headlineFit.size
      )
    )
    .join("");

  const subSvg = subFit.lines
    .map((line, i) =>
      lineTextSvg(
        line,
        args.phrases || [],
        W / 2,
        subTop + i * subLineHeight + subFit.size,
        subFit.size,
        "#ffffff"
      )
    )
    .join("");

  const sourceFont = clamp(d.source_font_size || 32, 26, 40);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${topGradient}
    <linearGradient id="photoBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#17234a" stop-opacity="0"/>
      <stop offset="100%" stop-color="#17234a" stop-opacity="0.16"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${shadow}"/>

  <image
    href="data:image/jpeg;base64,${image64}"
    x="0" y="0" width="${W}" height="${H}"
    preserveAspectRatio="xMidYMid slice"
  />

  <rect x="0" y="0" width="${W}" height="1120" fill="url(#topFade)"/>
  <rect x="0" y="${H - 620}" width="${W}" height="620" fill="url(#photoBottom)"/>

  <image
    href="data:image/png;base64,${logo64}"
    x="${W - (d.logo_right || 100) - (d.logo_width || 220)}"
    y="${d.logo_top || topPadding}"
    width="${d.logo_width || 220}"
    preserveAspectRatio="xMidYMid meet"
  />

  <text
    x="${d.logo_right || 100}"
    y="${(d.logo_top || topPadding) + 44}"
    font-family="DejaVu Sans"
    font-size="34"
    font-weight="700"
    fill="#ffffff"
    opacity="0.96"
    style="paint-order:stroke;stroke:rgba(0,0,0,.22);stroke-width:1px"
  >sciencebee.com.bd</text>

  <rect
    x="${W / 2 - sourceWidth / 2}"
    y="${sourceY}"
    width="${sourceWidth}"
    height="${sourceH}"
    rx="${sourceH / 2}"
    fill="${d.source_bg && d.source_bg !== "transparent" && validHex(d.source_bg) ? d.source_bg : "#24428e"}"
    opacity="0.96"
  />

  <text
    x="${W / 2}"
    y="${sourceY + 53}"
    text-anchor="middle"
    font-family="Noto Serif Bengali, DejaVu Sans"
    font-size="${sourceFont}"
    font-weight="700"
    fill="#ffffff"
  >${esc(sourceText)}</text>

  ${headlineSvg}
  ${subSvg}

  <rect x="0" y="${footerY}" width="${W}" height="${footerH}" fill="#24428e"/>

  <text
    x="${W / 2}"
    y="${footerY + 66}"
    text-anchor="middle"
    font-family="Noto Serif Bengali, DejaVu Sans"
    font-size="30"
    font-weight="700"
    fill="#ffffff"
  >বিজ্ঞান, প্রযুক্তি ও গবেষণা</text>
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: true,
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans",
      serifFamily: "Noto Serif Bengali",
    },
    textRendering: 2,
    shapeRendering: 2,
  });

  return Buffer.from(resvg.render().asPng());
}
