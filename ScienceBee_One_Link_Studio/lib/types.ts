export type Design = {
  composition: "image_first" | "text_first";
  text_bottom: number;
  headline_width: number;
  headline_top: number;
  headline_x: number;
  headline_font_size: number | null;
  headline_max_height: number;
  headline_color: string;
  highlight_color: string;
  subheadline_font_size: number | null;
  subheadline_x: number;
  subheadline_y: number;
  subheadline_width: number;
  subheadline_color: string;
  line_height: number;
  photo_top: number;
  fade_length: number;
  darkening: number;
  shadow_color: string;
  logo: "auto" | "light" | "dark" | "none";
  logo_width: number;
  logo_top: number;
  logo_right: number;
  source_font_size: number;
  source_x: number;
  source_top: number;
  source_bg: string;
  source_text_color: string;
  footer_enabled: boolean;
  footer_text: string;
  footer_color: string;
};

export const DEFAULT_DESIGN: Design = {
  composition: "image_first",
  text_bottom: 140,
  headline_width: 1840,
  headline_top: 340,
  headline_x: 0,
  headline_font_size: null,
  headline_max_height: 400,
  headline_color: "#ffffff",
  highlight_color: "#ffd400",
  subheadline_font_size: null,
  subheadline_x: 0,
  subheadline_y: 15,
  subheadline_width: 1840,
  subheadline_color: "#ffe9a8",
  line_height: 1.1,
  photo_top: 820,
  fade_length: 650,
  darkening: 0.08,
  shadow_color: "#17234a",
  logo: "auto",
  logo_width: 220,
  logo_top: 64,
  logo_right: 100,
  source_font_size: 34,
  source_x: 0,
  source_top: 0,
  source_bg: "#24428e",
  source_text_color: "#ffffff",
  footer_enabled: true,
  footer_text: "বিজ্ঞান, প্রযুক্তি ও গবেষণা",
  footer_color: "#24428e",
};

export type Candidate = {
  url: string;
  label?: string;
  type?: string;
  photographer?: string;
};
