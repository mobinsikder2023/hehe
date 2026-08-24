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
 * Load the Bengali font.
 *
 * We prefer a regular Bengali font for normal text and a semibold/bold
 * version for headings when available.
 */
async function loadFont(
  candidates: string[]
): Promise<Buffer | null> {
  for (const filename of candidates) {
    try {
      return await fs.readFile(
        path.join(process.cwd(), "public", "assets", filename)
      );
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function loadFonts() {
  const regular = await loadFont([
    "NotoSansBengali-Regular.ttf",
    "NotoSansBengali-SemiBold.ttf",
    "NotoSerifBengali-Regular.ttf",
    "NotoSerifBengali-Bold.ttf",
  ]);

  const semibold = await loadFont([
    "NotoSansBengali-SemiBold.ttf",
    "NotoSansBengali-Bold.ttf",
    "NotoSerifBengali-Bold.ttf",
    "NotoSansBengali-Regular.ttf",
  ]);

  if (!regular && !semibold) {
    throw new Error(
      "Bengali font not found. Add NotoSansBengali-Regular.ttf and/or NotoSansBengali-SemiBold.ttf to public/assets."
    );
  }

  return {
    regular: regular || semibold!,
    semibold: semibold || regular!,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Creates nested span nodes instead of using flex-wrap on every text
 * fragment. This keeps the Bengali sentence flowing naturally.
 */
function makeHighlightedNodes(
  text: string,
  phrases: string[] | null | undefined
) {
  const clean = (phrases || [])
    .filter((x) => typeof x === "string" && x.trim())
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

  return parts.map((part, index) => {
    if (!part) return null;

    const highlighted = clean.includes(part);

    return {
      type: "span",
      key: `text-${index}`,
      props: {
        style: {
          color: highlighted ? "#FFD400" : "#FFFFFF",
        },
        children: part,
      },
    };
  });
}

/**
 * Rich text wrapper.
 *
 * IMPORTANT:
 * The wrapper contains exactly ONE child.
 * The nested span contains the text fragments.
 *
 * This avoids the Satori error:
 * "Expected <div> to have explicit display:flex..."
 */
function richText(
  text: string,
  phrases: string[],
  style: Record<string, any>
) {
  return {
    type: "div",
    props: {
      style: {
        ...style,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      },

      children: [
        {
          type: "span",
          props: {
            style: {
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              width: "100%",
              justifyContent: "center",
              textAlign: "center",
            },

            children: [
              {
                type: "span",
                props: {
                  style: {
                    color: "#FFFFFF",
                  },
                  children: makeHighlightedNodes(text, phrases),
                },
              },
            ],
          },
        },
      ],
    },
  };
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
    d.shadow_color === "auto"
      ? await autoColor(args.image, d.darkening || 0.08)
      : valid(d.shadow_color)
      ? d.shadow_color
      : "#17234a";

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

  const fonts = await loadFonts();

  const image64 = args.image.toString("base64");
  const logo64 = logo.toString("base64");

  const headlineSize = clamp(
    Number(d.headline_font_size || 112),
    60,
    150
  );

  const subheadlineSize = clamp(
    Number(d.subheadline_font_size || 54),
    32,
    80
  );

  const headlineWidth = clamp(
    Number(d.headline_width || 1840),
    1000,
    1960
  );

  const subheadlineWidth = clamp(
    Number(d.subheadline_width || 1840),
    1000,
    1960
  );

  const headlineTop =
    Number(d.headline_top || 420);

  const sourceTop =
    Number(d.source_top || 250);

  const logoWidth =
    Number(d.logo_width || 220);

  const logoTop =
    Number(d.logo_top || 60);

  const logoRight =
    Number(d.logo_right || 80);

  const sourceFontSize =
    Number(d.source_font_size || 34);

  const lineHeight =
    Number(d.line_height || 1.08);

  const imageTop =
    Number(d.photo_top || 0);

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
         * PHOTO
         */
        {
          type: "img",

          props: {
            src: `data:image/jpeg;base64,${image64}`,

            style: {
              position: "absolute",
              left: 0,
              top: imageTop,
              width: 2160,
              height: 2700 - imageTop,
              objectFit: "cover",
            },
          },
        },

        /*
         * TOP DARK PANEL
         */
        {
          type: "div",

          props: {
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: 2160,
              height: 1000,
              backgroundColor: "rgba(12, 22, 52, 0.80)",
              display: "flex",
            },

            children: [],
          },
        },

        /*
         * LOWER TEXT PROTECTION
         */
        {
          type: "div",

          props: {
            style: {
              position: "absolute",
              left: 0,
              top: 880,
              width: 2160,
              height: 850,
              backgroundColor: "rgba(10, 16, 35, 0.30)",
              display: "flex",
            },

            children: [],
          },
        },

        /*
         * WEBSITE
         */
        {
          type: "div",

          props: {
            style: {
              position: "absolute",
              left: 90,
              top: 70,
              fontFamily: "SB",
              fontSize: 38,
              fontWeight: 600,
              color: "#ffffff",
              display: "flex",
            },

            children: "sciencebee.com.bd",
          },
        },

        /*
         * SCIENCE BEE LOGO
         */
        {
          type: "img",

          props: {
            src: `data:image/png;base64,${logo64}`,

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
         * SOURCE PILL
         */
        {
          type: "div",

          props: {
            style: {
              position: "absolute",
              left: 420,
              top: sourceTop,
              width: 1320,
              minHeight: 72,

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              borderRadius: 36,

              backgroundColor:
                valid(d.source_bg)
                  ? d.source_bg
                  : "#24428E",

              color: "#ffffff",

              fontFamily: "SB",
              fontSize: sourceFontSize,
              fontWeight: 600,

              textAlign: "center",

              paddingLeft: 40,
              paddingRight: 40,
            },

            children: `সূত্র: ${args.source || ""}`,
          },
        },

        /*
         * HEADLINE AREA
         */
        {
          type: "div",

          props: {
            style: {
              position: "absolute",

              left:
                1080 +
                Number(d.headline_x || 0) -
                headlineWidth / 2,

              top: headlineTop,

              width: headlineWidth,

              display: "flex",
              flexDirection: "column",
              alignItems: "center",

              fontFamily: "SB",
              fontSize: headlineSize,
              fontWeight: 700,

              lineHeight,

              textAlign: "center",

              color: "#ffffff",
            },

            children: [
              /*
               * HEADLINE TEXT
               *
               * No flex-wrap here.
               */
              richText(
                args.headline || "",
                args.phrases || [],
                {
                  width: headlineWidth,
                  fontFamily: "SB",
                  fontSize: headlineSize,
                  fontWeight: 700,
                  lineHeight,
                  textAlign: "center",
                  color: "#ffffff",
                }
              ),

              /*
               * SUBHEADLINE
               */
              {
                type: "div",

                props: {
                  style: {
                    marginTop:
                      Number(d.subheadline_y || 28),

                    width: subheadlineWidth,

                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",

                    fontFamily: "SB",
                    fontSize: subheadlineSize,
                    fontWeight: 600,

                    lineHeight,

                    textAlign: "center",

                    color: "#ffffff",
                  },

                  children: [
                    richText(
                      args.subheadline || "",
                      args.phrases || [],
                      {
                        width: subheadlineWidth,
                        fontFamily: "SB",
                        fontSize: subheadlineSize,
                        fontWeight: 600,
                        lineHeight,
                        textAlign: "center",
                        color: "#ffffff",
                      }
                    ),
                  ],
                },
              },
            ],
          },
        },

        /*
         * BOTTOM SCIENCE BEE STRIP
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
              alignItems: "center",
              justifyContent: "center",

              backgroundColor: "#172F75",

              color: "#ffffff",

              fontFamily: "SB",
              fontSize: 32,
              fontWeight: 600,

              textAlign: "center",
            },

            children:
              "বিজ্ঞান, প্রযুক্তি ও গবেষণা",
          },
        },
      ],
    },
  };

  const svg = await satori(tree, {
    width: 2160,
    height: 2700,

    fonts: [
      {
        name: "SB",
        data: fonts.regular,
        weight: 400,
        style: "normal",
      },
      {
        name: "SB",
        data: fonts.regular,
        weight: 500,
        style: "normal",
      },
      {
        name: "SB",
        data: fonts.semibold,
        weight: 600,
        style: "normal",
      },
      {
        name: "SB",
        data: fonts.semibold,
        weight: 700,
        style: "normal",
      },
    ],

    embedFont: true,

    pointScaleFactor: 1,
  });

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
