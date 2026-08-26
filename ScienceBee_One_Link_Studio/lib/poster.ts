import path from "path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";
import { DEFAULT_DESIGN, Design } from "./types";

const W = 2160;
const H = 2700;

const BENGALI = "Noto Serif Bengali";
const LATIN = "Noto Sans";

/*
 * Register the bundled fonts ONCE, when this module is first loaded.
 * Skia (via @napi-rs/canvas) does correct Bengali shaping — unlike
 * resvg, it does not drop the aa-kar (া) or collapse word spaces.
 * We register both so Latin text (domain, English sources) also has
 * real glyphs to fall back to.
 */
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;

  const dir = path.join(process.cwd(), "public", "assets");
  GlobalFonts.registerFromPath(
    path.join(dir, "NotoSerifBengali-Bold.ttf"),
    BENGALI
  );
  GlobalFonts.registerFromPath(
    path.join(dir, "NotoSans-SemiBold.ttf"),
    LATIN
  );

  fontsReady = true;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function validHex(value: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

/*
 * Fix old UTF-8 / Latin-1 mojibake if it ever appears.
 * Normal Bengali text is left untouched.
 */
function repairMojibake(value: string) {
  const text = String(value ?? "");
  if (!/[àÂÃ]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (/[\u0980-\u09FF]/.test(repaired)) return repaired;
    return text;
  } catch {
    return text;
  }
}

/*
 * A font string that lets Skia fall back from Bengali to Latin so
 * mixed strings ("সোর্স: Space") render every glyph.
 */
function fontStr(size: number) {
  return `700 ${Math.round(size)}px "${BENGALI}", "${LATIN}"`;
}

/* ---- highlight splitting (unchanged behaviour) ---- */
function splitHighlight(text: string, phrases: string[]) {
  const clean = (phrases || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!clean.length || !text) return [{ text, yellow: false }];

  const escaped = clean.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const re = new RegExp(`(${escaped.join("|")})`, "g");

  return text
    .split(re)
    .filter(Boolean)
    .map((piece) => ({ text: piece, yellow: clean.includes(piece) }));
}

/* ---- word wrapping using REAL measured widths ---- */
function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  size: number
) {
  ctx.font = fontStr(size);
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lines: string[] = [];
  let cur = "";

  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/*
 * Auto-fit: shrink the font until the text fits in maxLines,
 * then return the size + wrapped lines.
 */
function fitText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  preferred: number,
  min: number,
  maxLines: number
) {
  for (let size = preferred; size >= min; size -= 2) {
    const lines = wrapLines(ctx, text, maxWidth, size);
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: min, lines: wrapLines(ctx, text, maxWidth, min) };
}

/*
 * Draw one line centred at centerX, colouring highlighted phrases
 * yellow. Each coloured piece is measured so the whole line stays
 * centred. Skia shapes each piece correctly (spaces preserved).
 */
function drawCenteredLine(
  ctx: SKRSContext2D,
  line: string,
  phrases: string[],
  centerX: number,
  baselineY: number,
  size: number,
  baseFill: string,
  highlightFill: string
) {
  ctx.font = fontStr(size);
  const pieces = splitHighlight(line, phrases);

  const widths = pieces.map((p) => ctx.measureText(p.text).width);
  const total = widths.reduce((a, b) => a + b, 0);

  let x = centerX - total / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  pieces.forEach((p, i) => {
    ctx.fillStyle = p.yellow ? highlightFill : baseFill;
    // subtle shadow for legibility on photos
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = Math.round(size * 0.06);
    ctx.shadowOffsetY = 2;
    ctx.fillText(p.text, x, baselineY);
    ctx.restore();
    x += widths[i];
  });
}

function coverDraw(
  ctx: SKRSContext2D,
  img: Awaited<ReturnType<typeof loadImage>>,
  zoomPct: number,
  offsetY: number
) {
  const iw = img.width;
  const ih = img.height;
  // never below cover scale, so the frame is always filled
  const zoom = Math.max(1, zoomPct / 100);
  const scale = Math.max(W / iw, H / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const x = (W - dw) / 2;
  const y = (H - dh) / 2 + offsetY; // + moves the image (and its subject) DOWN
  ctx.drawImage(img, x, y, dw, dh);
}

export async function renderPoster(args: {
  image: Buffer;
  foreground?: Buffer | null;
  headline: string;
  subheadline: string;
  source: string;
  phrases: string[];
  design?: Partial<Design>;
  logo: "auto" | "light" | "dark";
}) {
  ensureFonts();

  const d: Design = { ...DEFAULT_DESIGN, ...(args.design || {}) };

  const shadow =
    d.shadow_color && validHex(d.shadow_color) ? d.shadow_color : "#17234a";
  const headlineColor = validHex(d.headline_color) ? d.headline_color : "#ffffff";
  const highlightColor = validHex(d.highlight_color) ? d.highlight_color : "#ffd400";
  const subColor = validHex(d.subheadline_color) ? d.subheadline_color : "#ffe9a8";
  const sourceTextColor = validHex(d.source_text_color) ? d.source_text_color : "#ffffff";
  const footerColor = validHex(d.footer_color) ? d.footer_color : "#24428e";

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  /* background colour (in case the photo has transparency) */
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, W, H);

  /* main background: photo (cover-fit) OR a solid colour */
  if (!d.bg_solid) {
    const photo = await loadImage(args.image);
    coverDraw(
      ctx,
      photo,
      clamp(num(d.image_zoom, 100), 100, 260),
      clamp(num(d.image_offset_y, 0), -1000, 1000)
    );
  }

  /* overall darkening */
  const darkening = clamp(num(d.darkening, 0.08), 0, 0.6);
  if (darkening > 0) {
    ctx.fillStyle = `rgba(0,0,0,${darkening})`;
    ctx.fillRect(0, 0, W, H);
  }

  /* top scrim so text stays readable; height driven by fade_length */
  const scrimH = clamp(num(d.fade_length, 650) * 1.7, 700, 1700);
  const topGrad = ctx.createLinearGradient(0, 0, 0, scrimH);
  topGrad.addColorStop(0, hexA(shadow, 0.96));
  topGrad.addColorStop(0.28, hexA(shadow, 0.86));
  topGrad.addColorStop(0.6, hexA(shadow, 0.5));
  topGrad.addColorStop(1, hexA(shadow, 0));
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, scrimH);

  /* foreground subject (a cut-out PNG) — sits above the background,
     anchored to the bottom so a person/object "stands" in the lower area */
  if (args.foreground) {
    const fg = await loadImage(args.foreground);
    const fgScale = clamp(num(d.fg_scale, 100), 20, 220) / 100;
    const fgW = W * 0.72 * fgScale;
    const fgH = (fg.height / fg.width) * fgW;
    const fx = (W - fgW) / 2 + num(d.fg_x, 0);
    const fy = H - fgH + num(d.fg_y, 0);
    ctx.drawImage(fg, fx, fy, fgW, fgH);
  }

  /* logo (top-right) — "none" hides it */
  const logoTop = num(d.logo_top, 64);
  const logoRight = num(d.logo_right, 100);
  const logoMode = d.logo || args.logo || "auto";
  if (logoMode !== "none") {
    const logoName =
      logoMode === "dark" ? "logo_dark.png" : "logo_light.png";
    const logoPath = path.join(process.cwd(), "public", "assets", logoName);
    const logo = await loadImage(logoPath);
    const logoW = clamp(num(d.logo_width, 220), 120, 520);
    const logoH = (logo.height / logo.width) * logoW;
    ctx.drawImage(logo, W - logoRight - logoW, logoTop, logoW, logoH);
  }

  /* domain (top-left) */
  const domainSize = clamp(num(d.domain_font_size, 34), 18, 72);
  ctx.font = `700 ${domainSize}px "${LATIN}"`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 3;
  ctx.fillText("sciencebee.com.bd", logoRight, logoTop + 44);
  ctx.restore();

  /* ---- headline ---- */
  const centerX = W / 2 + num(d.headline_x, 0);
  const headlineWidth = clamp(num(d.headline_width, 1840), 1200, 2040);

  const headline = repairMojibake(args.headline || "");
  const hPref = d.headline_font_size ? num(d.headline_font_size, 112) : 116;
  const hFit = fitText(ctx, headline, headlineWidth - 120, hPref, 64, 3);
  const hLineH = Math.round(hFit.size * 1.16);

  const headlineTop = clamp(num(d.headline_top, 360), 200, 1400);

  hFit.lines.forEach((line, i) => {
    drawCenteredLine(
      ctx,
      line,
      args.phrases || [],
      centerX,
      headlineTop + i * hLineH + hFit.size,
      hFit.size,
      headlineColor,
      highlightColor
    );
  });

  const headlineBottom = headlineTop + hFit.lines.length * hLineH;

  /* ---- supporting line ---- */
  const sub = repairMojibake(args.subheadline || "");
  let subBottom = headlineBottom;

  if (sub.trim()) {
    const subWidth = clamp(num(d.subheadline_width, 1780), 1100, 1960);
    const sPref = d.subheadline_font_size
      ? num(d.subheadline_font_size, 52)
      : 54;
    const sFit = fitText(ctx, sub, subWidth - 120, sPref, 32, 2);
    const sLineH = Math.round(sFit.size * 1.2);
    const subTop = headlineBottom + 10 + num(d.subheadline_y, 24);

    sFit.lines.forEach((line, i) => {
      drawCenteredLine(
        ctx,
        line,
        args.phrases || [],
        centerX,
        subTop + i * sLineH + sFit.size,
        sFit.size,
        subColor,
        highlightColor
      );
    });

    subBottom = subTop + sFit.lines.length * sLineH;
  }

  /* ---- source pill (below the text block) ---- */
  const src = String(args.source || "").trim();
  if (src) {
    const sourceText = `সোর্স: ${repairMojibake(src)}`;
    const sourceFont = clamp(num(d.source_font_size, 34), 22, 46);

    ctx.font = fontStr(sourceFont);
    const textW = ctx.measureText(sourceText).width;
    const padX = 46;
    const pillW = textW + padX * 2;
    const pillH = sourceFont + 40;

    const pillCX =
      num(d.source_x, 0) !== 0 ? num(d.source_x, W / 2) : W / 2;
    const pillY = subBottom + 34 + num(d.source_top, 0);

    const bg =
      d.source_bg === "transparent"
        ? null
        : validHex(d.source_bg)
        ? d.source_bg
        : "#24428e";

    if (bg) {
      ctx.fillStyle = bg;
      ctx.globalAlpha = 0.96;
      roundRect(ctx, pillCX - pillW / 2, pillY, pillW, pillH, pillH / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = sourceTextColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sourceText, pillCX, pillY + pillH / 2 + 2);
  }

  /* ---- "Concept Image" label (optional, low opacity) ---- */
  if (d.concept_enabled) {
    const label = String(d.concept_text ?? "Concept Image").trim();
    if (label) {
      const cy = d.footer_enabled !== false ? H - 130 : H - 34;
      ctx.font = fontStr(30);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, W - 44, cy);
    }
  }

  /* ---- footer bar (optional) ---- */
  if (d.footer_enabled !== false) {
    const footerText = String(
      d.footer_text ?? "বিজ্ঞান, প্রযুক্তি ও গবেষণা"
    );
    const footerH = 108;
    const footerY = H - footerH;
    ctx.fillStyle = footerColor;
    ctx.fillRect(0, footerY, W, footerH);

    if (footerText.trim()) {
      ctx.font = fontStr(clamp(num(d.footer_font_size, 30), 18, 60));
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(footerText, W / 2, footerY + footerH / 2 + 2);
    }
  }

  return canvas.toBuffer("image/png");
}

/* rgba() from a #rrggbb hex + alpha */
function hexA(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
