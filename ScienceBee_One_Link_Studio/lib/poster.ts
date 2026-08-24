import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_DESIGN, Design } from "./types";

function rgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  return `rgba(${r},${g},${b},${alpha})`;
}

function valid(hex: string) {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function autoColor(image: Buffer, darkening: number) {
  try {
    const { data, info } = await sharp(image)
      .resize(120, 120, {
        fit: "cover",
        position: "top",
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;

    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }

    const factor = Math.max(0.35, 1 - darkening);

    return `#${Math.round((r / n) * factor)
      .toString(16)
      .padStart(2, "0")}${Math.round((g / n) * factor)
      .toString(16)
      .padStart(2, "0")}${Math.round((b / n) * factor)
      .toString(16)
      .padStart(2, "0")}`;
  } catch {
    return "#17234a";
  }
}

async function loadFont() {
  return fs.readFile(
    path.join(
      process.cwd(),
      "public/assets/NotoSerifBengali-Bold.ttf"
    )
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spans(text: string, phrases: string[] | null | undefined) {
  const clean = (phrases || [])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!text) {
    return "";
  }

  if (!clean.length) {
    return text;
  }

  const expression = new RegExp(
    `(${clean.map(escapeRegExp).join("|")})`,
    "g"
  );

  const parts = text.split(expression);

  return parts.map((part) => {
    if (clean.includes(part)) {
      return {
        type: "span",
        props: {
          style: {
            color: "#ffd400",
          },
          children: part,
        },
      };
    }

    return part;
  });
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
   * ------------------------------------------------------------
   * COLORS
   * ------------------------------------------------------------
   */

  let shadow =
    d.shadow_color === "auto"
      ? await autoColor(args.image, d.darkening)
      : d.shadow_color;

  if (!valid(shadow)) {
    shadow = "#17234a";
  }

  /*
   * ------------------------------------------------------------
   * LOGO
   * ------------------------------------------------------------
   */

  const logoName =
    args.logo === "light"
      ? "logo_light.png"
      : args.logo === "dark"
      ? "logo_dark.png"
      : "logo_light.png";

  const logo = await fs.readFile(
    path.join(process.cwd(), "public/assets", logoName)
  );

  const fontData = await loadFont();

  const image64 = args.image.toString("base64");
  const logo64 = logo.toString("base64");

  /*
   * ------------------------------------------------------------
   * FONT SIZES
   * ------------------------------------------------------------
   */

  const headlineSize =
    d.headline_font_size || 112;

  const subheadlineSize =
    d.subheadline_font_size || 54;

  /*
   * ------------------------------------------------------------
   * TEXT WIDTHS
   * ------------------------------------------------------------
   */

  const headlineWidth = clamp(
    d.headline_width || 1840,
    900,
    2000
  );

  const subheadlineWidth = clamp(
    d.subheadline_width || 1840,
    900,
    2000
  );

  /*
   * ------------------------------------------------------------
   * COMPOSITION
   * ------------------------------------------------------------
   *
   * image_first:
   *   Photograph remains dominant.
   *   Text is placed in the upper portion.
   *
   * text_first:
   *   Text receives a stronger dedicated upper region.
   *
   * The image is NEVER globally darkened heavily.
   */

  const composition =
    d.composition || "image_first";

  /*
   * ------------------------------------------------------------
   * GRADIENT
   * ------------------------------------------------------------
   *
   * fade_length now actually controls how far the gradient
   * extends.
   *
   * We do NOT put a black overlay over the entire image.
   */

  const fade = clamp(
    d.fade_length || 650,
    150,
    1400
  );

  const fadePercent = clamp(
    (fade / 2700) * 100,
    8,
    58
  );

  const gradient =
    composition === "image_first"
      ? `
        linear-gradient(
          to bottom,
          ${rgba(shadow, 0.98)} 0%,
          ${rgba(shadow, 0.92)} 12%,
          ${rgba(shadow, 0.70)} 25%,
          ${rgba(shadow, 0.32)} ${Math.max(
            32,
            fadePercent * 0.75
          )}%,
          rgba(0,0,0,0) ${fadePercent}%
        )
      `
      : `
        linear-gradient(
          to bottom,
          ${rgba(shadow, 0.98)} 0%,
          ${rgba(shadow, 0.94)} 14%,
          ${rgba(shadow, 0.72)} 30%,
          ${rgba(shadow, 0.25)} ${Math.max(
            40,
            fadePercent
          )}%,
          rgba(0,0,0,0) ${Math.min(
            72,
            fadePercent + 18
          )}%
        )
      `;

  /*
   * ------------------------------------------------------------
   * IMAGE POSITION
   * ------------------------------------------------------------
   */

  const imageTop =
    d.photo_top && d.photo_top !== 0
      ? d.photo_top
      : 0;

  /*
   * We retain the existing photo_top setting but don't force
   * the image into an artificial crop when it is zero.
   */

  /*
   * ------------------------------------------------------------
   * HEADLINE POSITION
   * ------------------------------------------------------------
   */

  const headlineTop =
    composition === "image_first"
      ? Math.max(220, d.headline_top || 340)
      : Math.max(180, d.headline_top || 300);

  /*
   * ------------------------------------------------------------
   * SOURCE
   * ------------------------------------------------------------
   *
   * IMPORTANT:
   * This is actual Bengali UTF-8, not the corrupted text
   * that existed in the previous renderer.
   */

  const sourceText =
    `সূত্র: ${args.source || ""}`;

  const sourceWidth = clamp(
    300 + sourceText.length * 16,
    420,
    1000
  );

  const sourceTop =
    composition === "image_first"
      ? Math.max(
          180,
          headlineTop - d.source_font_size - 80
        )
      : Math.max(
          180,
          d.source_top || 500
        );

  /*
   * ------------------------------------------------------------
   * SOURCE BACKGROUND
   * ------------------------------------------------------------
   */

  const sourceBackground =
    d.source_bg === "transparent"
      ? "transparent"
      : valid(d.source_bg)
      ? d.source_bg
      : "#24428e";

  /*
   * ------------------------------------------------------------
   * SATORI TREE
   * ------------------------------------------------------------
   */

  const tree: any = {
    type: "div",

    props: {
      style: {
        width: 2160,
        height: 2700,

        display: "flex",
        position: "relative",

        overflow: "hidden",

        backgroundColor: shadow,
      },

      children: [
        /*
         * ======================================================
         * IMAGE
         * ======================================================
         */

        {
          type: "img",

          props: {
            src:
              `data:image/jpeg;base64,${image64}`,

            style: {
              position: "absolute",

              left: 0,
              top: imageTop,

              width: 2160,
              height:
                2700 - imageTop,

              objectFit: "cover",

              objectPosition: "center center",
            },
          },
        },

        /*
         * ======================================================
         * CONTROLLED GRADIENT
         * ======================================================
         *
         * Only the text area receives strong shading.
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left: 0,
              top: 0,
              right: 0,

              height:
                composition === "image_first"
                  ? Math.min(
                      1600,
                      fade + 850
                    )
                  : Math.min(
                      1750,
                      fade + 1000
                    ),

              backgroundImage: gradient,

              pointerEvents: "none",
            },
          },
        },

        /*
         * ======================================================
         * VERY LIGHT GLOBAL DARKENING
         * ======================================================
         *
         * Previous version used d.darkening directly and could
         * make the entire photograph very dark.
         *
         * Now the value is intentionally capped.
         */

        ...(d.darkening > 0
          ? [
              {
                type: "div",

                props: {
                  style: {
                    position: "absolute",

                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,

                    backgroundColor:
                      `rgba(0,0,0,${clamp(
                        d.darkening * 0.10,
                        0,
                        0.035
                      )})`,
                  },
                },
              },
            ]
          : []),

        /*
         * ======================================================
         * WEBSITE
         * ======================================================
         *
         * IMPORTANT:
         * Don't use Arial here.
         *
         * Satori does not automatically have Arial available
         * on Vercel.
         *
         * SB is our loaded Bengali/Unicode font.
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left: 100,
              top: 88,

              fontFamily: "SB",

              fontSize: 44,
              fontWeight: 700,

              color: "#ffffff",

              whiteSpace: "nowrap",

              textShadow:
                "0 2px 5px rgba(0,0,0,0.35)",
            },

            children:
              "sciencebee.com.bd",
          },
        },

        /*
         * ======================================================
         * LOGO
         * ======================================================
         */

        {
          type: "img",

          props: {
            src:
              `data:image/png;base64,${logo64}`,

            style: {
              position: "absolute",

              right: d.logo_right,
              top: d.logo_top,

              width: d.logo_width,

              height: "auto",
            },
          },
        },

        /*
         * ======================================================
         * SOURCE
         * ======================================================
         *
         * Compact pill/rectangle.
         * It no longer becomes a full-width blue bar.
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left:
                d.source_x || 1080,

              top: sourceTop,

              width: sourceWidth,
              height: 74,

              transform:
                "translateX(-50%)",

              display: "flex",

              alignItems: "center",
              justifyContent: "center",

              paddingLeft: 28,
              paddingRight: 28,

              borderRadius: 38,

              backgroundColor:
                sourceBackground,

              color: "#ffffff",

              fontFamily: "SB",

              fontSize:
                d.source_font_size || 34,

              fontWeight: 700,

              whiteSpace: "nowrap",

              overflow: "hidden",

              textAlign: "center",

              textShadow:
                "0 2px 5px rgba(0,0,0,0.25)",
            },

            children: sourceText,
          },
        },

        /*
         * ======================================================
         * TEXT CONTAINER
         * ======================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left:
                1080 +
                (d.headline_x || 0) -
                headlineWidth / 2,

              top: headlineTop,

              width: headlineWidth,

              display: "flex",

              flexDirection: "column",

              alignItems: "center",

              fontFamily: "SB",

              fontWeight: 700,

              textAlign: "center",

              color: "#ffffff",

              overflow: "hidden",
            },

            children: [
              /*
               * ==================================================
               * HEADLINE
               * ==================================================
               *
               * IMPORTANT:
               * No horizontal flex container around the text.
               *
               * This lets Satori perform natural text wrapping.
               */

              {
                type: "div",

                props: {
                  style: {
                    width: headlineWidth,

                    display: "block",

                    fontFamily: "SB",

                    fontSize:
                      headlineSize,

                    lineHeight:
                      d.line_height || 1.10,

                    fontWeight: 700,

                    textAlign: "center",

                    color: "#ffffff",

                    paddingLeft: 20,
                    paddingRight: 20,

                    textShadow:
                      "0 3px 8px rgba(0,0,0,0.55)",

                    wordBreak: "normal",
                  },

                  children: spans(
                    args.headline || "",
                    args.phrases || []
                  ),
                },
              },

              /*
               * ==================================================
               * SUBHEADLINE
               * ==================================================
               */

              {
                type: "div",

                props: {
                  style: {
                    marginTop:
                      d.subheadline_y || 15,

                    width:
                      subheadlineWidth,

                    display: "block",

                    transform:
                      `translateX(${
                        d.subheadline_x || 0
                      }px)`,

                    fontFamily: "SB",

                    fontSize:
                      subheadlineSize,

                    lineHeight:
                      d.line_height || 1.10,

                    fontWeight: 700,

                    textAlign: "center",

                    color: "#ffffff",

                    paddingLeft: 20,
                    paddingRight: 20,

                    textShadow:
                      "0 3px 7px rgba(0,0,0,0.55)",

                    wordBreak: "normal",
                  },

                  children: spans(
                    args.subheadline || "",
                    args.phrases || []
                  ),
                },
              },
            ],
          },
        },
      ],
    },
  };

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  const svg = await satori(
    tree,
    {
      width: 2160,
      height: 2700,

      fonts: [
        {
          name: "SB",

          data: fontData,

          weight: 700,

          style: "normal",
        },
      ],
    }
  );

  return Buffer.from(
    new Resvg(svg, {
      fitTo: {
        mode: "width",
        value: 2160,
      },
    })
      .render()
      .asPng()
  );
}
