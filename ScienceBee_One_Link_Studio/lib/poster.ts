import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_DESIGN, Design } from "./types";

function valid(hex: string) {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function autoColor(image: Buffer, darkening: number) {
  try {
    const { data, info } = await sharp(image)
      .resize(80, 80, {
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

    const factor = Math.max(0.4, 1 - darkening);

    return (
      "#" +
      Math.round((r / n) * factor)
        .toString(16)
        .padStart(2, "0") +
      Math.round((g / n) * factor)
        .toString(16)
        .padStart(2, "0") +
      Math.round((b / n) * factor)
        .toString(16)
        .padStart(2, "0")
    );
  } catch {
    return "#17234a";
  }
}

/**
 * Load a Bengali font from public/assets.
 */
async function loadBengaliFont() {
  const candidates = [
    "NotoSansBengali-SemiBold.ttf",
    "NotoSansBengali-Regular.ttf",
    "NotoSansBengali-Bold.ttf",
    "NotoSerifBengali-Bold.ttf",
  ];

  for (const filename of candidates) {
    try {
      return await fs.readFile(
        path.join(
          process.cwd(),
          "public",
          "assets",
          filename
        )
      );
    } catch {
      // Try next font.
    }
  }

  throw new Error(
    "Bengali font not found. Put NotoSansBengali-SemiBold.ttf inside public/assets."
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Creates highlighted text fragments.
 *
 * Every fragment is an explicit span.
 * No null children.
 */
function makeHighlightedText(
  text: string,
  phrases: string[] | null | undefined
) {
  const clean = (phrases || [])
    .filter(
      (x) =>
        typeof x === "string" &&
        x.trim().length > 0
    )
    .map((x) => x.trim())
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

  return parts
    .filter(
      (part) =>
        typeof part === "string" &&
        part.length > 0
    )
    .map((part, index) => {
      const highlighted = clean.includes(part);

      return {
        type: "span",
        key: `phrase-${index}`,
        props: {
          style: {
            color: highlighted
              ? "#FFD400"
              : "#FFFFFF",
          },
          children: part,
        },
      };
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
   * ----------------------------------------------------
   * COLORS
   * ----------------------------------------------------
   */

  const shadow =
    d.shadow_color === "auto"
      ? await autoColor(
          args.image,
          d.darkening || 0.08
        )
      : valid(d.shadow_color)
      ? d.shadow_color
      : "#17234a";

  /*
   * ----------------------------------------------------
   * LOGO
   * ----------------------------------------------------
   */

  const logoName =
    args.logo === "dark"
      ? "logo_dark.png"
      : "logo_light.png";

  const logo = await fs.readFile(
    path.join(
      process.cwd(),
      "public",
      "assets",
      logoName
    )
  );

  /*
   * ----------------------------------------------------
   * FONT
   * ----------------------------------------------------
   */

  const fontData =
    await loadBengaliFont();

  /*
   * ----------------------------------------------------
   * IMAGE DATA
   * ----------------------------------------------------
   */

  const image64 =
    args.image.toString("base64");

  const logo64 =
    logo.toString("base64");

  /*
   * ----------------------------------------------------
   * DESIGN VALUES
   * ----------------------------------------------------
   */

  const headlineSize = clamp(
    Number(
      d.headline_font_size || 112
    ),
    60,
    150
  );

  const subheadlineSize = clamp(
    Number(
      d.subheadline_font_size || 54
    ),
    32,
    80
  );

  const headlineWidth = clamp(
    Number(
      d.headline_width || 1840
    ),
    1000,
    1960
  );

  const subheadlineWidth = clamp(
    Number(
      d.subheadline_width || 1750
    ),
    1000,
    1960
  );

  /*
   * We deliberately use a little more vertical separation
   * than the previous version.
   */

  const headlineTop =
    Number(
      d.headline_top || 390
    );

  const sourceTop =
    Number(
      d.source_top || 235
    );

  const logoWidth =
    Number(
      d.logo_width || 220
    );

  const logoTop =
    Number(
      d.logo_top || 55
    );

  const logoRight =
    Number(
      d.logo_right || 70
    );

  const sourceFontSize =
    Number(
      d.source_font_size || 32
    );

  const lineHeight =
    Number(
      d.line_height || 1.12
    );

  const imageTop =
    Number(
      d.photo_top || 0
    );

  /*
   * ----------------------------------------------------
   * TEXT
   * ----------------------------------------------------
   */

  const headline =
    args.headline || "";

  const subheadline =
    args.subheadline || "";

  const source =
    args.source || "";

  /*
   * ----------------------------------------------------
   * SATORI TREE
   * ----------------------------------------------------
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
         * =================================================
         * PHOTO
         * =================================================
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
            },
          },
        },

        /*
         * =================================================
         * TOP DARK PANEL
         * =================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left: 0,
              top: 0,

              width: 2160,
              height: 980,

              backgroundColor:
                "rgba(10, 20, 48, 0.78)",

              display: "flex",
            },

            children: [],
          },
        },

        /*
         * =================================================
         * IMAGE PROTECTION
         * =================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left: 0,
              top: 850,

              width: 2160,
              height: 850,

              backgroundColor:
                "rgba(8, 15, 34, 0.26)",

              display: "flex",
            },

            children: [],
          },
        },

        /*
         * =================================================
         * SCIENCE BEE LOGO
         * =================================================
         */

        {
          type: "img",

          props: {
            src:
              `data:image/png;base64,${logo64}`,

            style: {
              position: "absolute",

              right: logoRight,
              top: logoTop,

              width: logoWidth,

              height: "auto",
            },
          },
        },

        /*
         * =================================================
         * WEBSITE / BRAND
         *
         * Removed from here intentionally.
         *
         * Your previous render showed missing glyph boxes
         * around this area. The actual Science Bee logo
         * already provides the branding.
         * =================================================
         */

        /*
         * =================================================
         * SOURCE PILL
         * =================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left: 390,
              top: sourceTop,

              width: 1380,
              height: 76,

              display: "flex",

              alignItems: "center",

              justifyContent: "center",

              borderRadius: 38,

              backgroundColor:
                valid(d.source_bg)
                  ? d.source_bg
                  : "#24428E",

              color: "#FFFFFF",

              fontFamily: "SB",

              fontSize:
                sourceFontSize,

              fontWeight: 600,

              textAlign: "center",

              paddingLeft: 45,
              paddingRight: 45,
            },

            children:
              `সূত্র: ${source}`,
          },
        },

        /*
         * =================================================
         * HEADLINE
         * =================================================
         *
         * IMPORTANT:
         *
         * The text fragments are inside ONE span.
         *
         * We do NOT use flex-wrap around each phrase.
         * =================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left:
                1080 +
                Number(
                  d.headline_x || 0
                ) -
                headlineWidth / 2,

              top: headlineTop,

              width: headlineWidth,

              display: "flex",

              flexDirection:
                "column",

              alignItems:
                "center",

              justifyContent:
                "center",

              fontFamily: "SB",

              fontSize:
                headlineSize,

              fontWeight: 700,

              lineHeight,

              textAlign: "center",

              color: "#FFFFFF",
            },

            children: [
              {
                type: "span",

                props: {
                  style: {
                    width:
                      headlineWidth,

                    fontFamily: "SB",

                    fontSize:
                      headlineSize,

                    fontWeight: 700,

                    lineHeight,

                    textAlign:
                      "center",

                    color:
                      "#FFFFFF",
                  },

                  children:
                    makeHighlightedText(
                      headline,
                      args.phrases || []
                    ),
                },
              },
            ],
          },
        },

        /*
         * =================================================
         * SUBHEADLINE
         * =================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left:
                1080 -
                subheadlineWidth / 2,

              top:
                headlineTop +
                430 +
                Number(
                  d.subheadline_y || 0
                ),

              width:
                subheadlineWidth,

              display: "flex",

              flexDirection:
                "column",

              alignItems:
                "center",

              justifyContent:
                "center",

              fontFamily: "SB",

              fontSize:
                subheadlineSize,

              fontWeight: 600,

              lineHeight: 1.16,

              textAlign: "center",

              color:
                "#FFFFFF",
            },

            children: [
              {
                type: "span",

                props: {
                  style: {
                    width:
                      subheadlineWidth,

                    fontFamily: "SB",

                    fontSize:
                      subheadlineSize,

                    fontWeight: 600,

                    lineHeight: 1.16,

                    textAlign:
                      "center",

                    color:
                      "#FFFFFF",
                  },

                  children:
                    makeHighlightedText(
                      subheadline,
                      args.phrases || []
                    ),
                },
              },
            ],
          },
        },

        /*
         * =================================================
         * BOTTOM BRAND STRIP
         * =================================================
         */

        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left: 0,
              bottom: 0,

              width: 2160,
              height: 105,

              display: "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              backgroundColor:
                "#173579",

              color:
                "#FFFFFF",

              fontFamily: "SB",

              fontSize: 32,

              fontWeight: 600,

              textAlign:
                "center",
            },

            children:
              "বিজ্ঞান, প্রযুক্তি ও গবেষণা",
          },
        },
      ],
    },
  };

  /*
   * ----------------------------------------------------
   * SATORI
   * ----------------------------------------------------
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

          weight: 400,

          style: "normal",
        },

        {
          name: "SB",

          data: fontData,

          weight: 500,

          style: "normal",
        },

        {
          name: "SB",

          data: fontData,

          weight: 600,

          style: "normal",
        },

        {
          name: "SB",

          data: fontData,

          weight: 700,

          style: "normal",
        },
      ],
    }
  );

  /*
   * ----------------------------------------------------
   * RESVG → PNG
   * ----------------------------------------------------
   */

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
