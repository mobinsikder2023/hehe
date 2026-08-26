export type Design = {
  composition: "image_first" | "text_first";
  layout: "text_top" | "text_bottom";
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
  image_zoom: number;
  image_offset_y: number;
  bg_solid: boolean;
  fg_url: string;
  fg_scale: number;
  fg_x: number;
  fg_y: number;
  concept_enabled: boolean;
  concept_text: string;
  fade_length: number;
  darkening: number;
  shadow_color: string;
  logo: "auto" | "light" | "dark" | "none";
  logo_width: number;
  logo_top: number;
  logo_right: number;
  source_font_size: number;
  domain_font_size: number;
  source_x: number;
  source_top: number;
  source_bg: string;
  source_text_color: string;
  footer_enabled: boolean;
  footer_text: string;
  footer_color: string;
  footer_font_size: number;
};

export const DEFAULT_DESIGN: Design = {
  composition: "image_first",
  layout: "text_top",
  text_bottom: 300,
  headline_width: 1840,
  headline_top: 340,
  headline_x: 0,
  headline_font_size: 148,
  headline_max_height: 400,
  headline_color: "#ffffff",
  highlight_color: "#ffd400",
  subheadline_font_size: 72,
  subheadline_x: 0,
  subheadline_y: 40,
  subheadline_width: 1840,
  subheadline_color: "#ffffff",
  line_height: 1.1,
  photo_top: 820,
  image_zoom: 100,
  image_offset_y: 0,
  bg_solid: false,
  fg_url: "",
  fg_scale: 100,
  fg_x: 0,
  fg_y: 0,
  concept_enabled: false,
  concept_text: "Concept Image",
  fade_length: 920,
  darkening: 0.08,
  shadow_color: "#000000",
  logo: "dark",
  logo_width: 380,
  logo_top: 64,
  logo_right: 100,
  source_font_size: 34,
  domain_font_size: 46,
  source_x: 0,
  source_top: 0,
  source_bg: "#24428e",
  source_text_color: "#ffffff",
  footer_enabled: false,
  footer_text: "বিজ্ঞান, প্রযুক্তি ও গবেষণা",
  footer_color: "#24428e",
  footer_font_size: 30,
};

export type Candidate = {
  url: string;
  label?: string;
  type?: string;
  photographer?: string;
};
