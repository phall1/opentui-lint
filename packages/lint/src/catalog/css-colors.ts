/**
 * CSS color syntax that OpenTUI does not understand, and its exact hex value.
 *
 * `parseColor()` accepts 28 names plus hex and turns everything else into
 * opaque magenta. But almost every rejected value still has one unambiguous
 * correct answer: `rgb(34, 197, 94)` *is* `#22c55e`, and CSS `indigo` *is*
 * `#4b0082`. Those conversions are exact, so the linter can apply them as real
 * autofixes rather than leaving the author to look them up.
 *
 * The table below is the CSS Color Level 4 named-color list, which is a frozen
 * W3C constant — unlike everything else in this directory it is not generated,
 * because there is no OpenTUI install to generate it from. Only the names
 * OpenTUI *rejects* need to be here; the ones it accepts are in the generated
 * catalog and must not be rewritten.
 */

const CSS_NAMED: Record<string, string> = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  blanchedalmond: "#ffebcd",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  darkgreen: "#006400",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  greenyellow: "#adff2f",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  lightgreen: "#90ee90",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  oldlace: "#fdf5e6",
  olivedrab: "#6b8e23",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  rebeccapurple: "#663399",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  whitesmoke: "#f5f5f5",
  yellowgreen: "#9acd32",
};

/**
 * The Tailwind palette, at its default 500 shade.
 *
 * These are not CSS colors — `slate` means nothing to any renderer — but they
 * are overwhelmingly what a model reaches for, because Tailwind is what it has
 * read the most of. Converting them is a *guess about intent* (which shade did
 * you mean?), so these only ever become editor suggestions, never autofixes.
 */
const TAILWIND_500: Record<string, string> = {
  slate: "#64748b",
  gray: "#6b7280",
  zinc: "#71717a",
  neutral: "#737373",
  stone: "#78716c",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (n: number) => clamp255(n).toString(16).padStart(2, "0");

/** Parses one `rgb()`/`rgba()` channel, honoring the percentage form. */
function channel(raw: string): number | undefined {
  const text = raw.trim();
  if (text.endsWith("%")) {
    const pct = Number.parseFloat(text.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * 255 : undefined;
  }
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

function alphaToHex(raw: string | undefined): string {
  if (raw === undefined) return "";
  const text = raw.trim();
  const value = text.endsWith("%")
    ? Number.parseFloat(text.slice(0, -1)) / 100
    : Number.parseFloat(text);
  if (!Number.isFinite(value) || value >= 1) return "";
  return hex2(value * 255);
}

function hslToHex(h: number, s: number, l: number, alpha: string | undefined): string {
  const sat = Math.max(0, Math.min(1, s));
  const light = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hue = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${hex2((r! + m) * 255)}${hex2((g! + m) * 255)}${hex2((b! + m) * 255)}${alphaToHex(alpha)}`;
}

export interface ColorConversion {
  hex: string;
  /** True when the conversion is exact and can be applied automatically. */
  exact: boolean;
  /** Why this is the right value, for the diagnostic. */
  reason: string;
}

/**
 * Converts a color OpenTUI rejects into the hex it unambiguously means.
 *
 * Returns `exact: true` only when there is precisely one correct answer.
 * A Tailwind palette name has no single answer — `slate` spans ten shades — so
 * it comes back inexact and the caller must offer it rather than apply it.
 */
export function convertColor(value: string): ColorConversion | undefined {
  const text = value.trim();
  const lower = text.toLowerCase();

  const named = CSS_NAMED[lower];
  if (named) {
    return { hex: named, exact: true, reason: `CSS "${lower}" is exactly ${named}` };
  }

  const rgb =
    /^rgba?\(\s*([^,\s/]+)[\s,]+([^,\s/]+)[\s,]+([^,\s/)]+)(?:\s*[,/]\s*([^)\s]+))?\s*\)$/i.exec(
      text,
    );
  if (rgb) {
    const r = channel(rgb[1]!);
    const g = channel(rgb[2]!);
    const b = channel(rgb[3]!);
    if (r !== undefined && g !== undefined && b !== undefined) {
      const hex = `#${hex2(r)}${hex2(g)}${hex2(b)}${alphaToHex(rgb[4])}`;
      return { hex, exact: true, reason: `${text} is exactly ${hex}` };
    }
  }

  const hsl =
    /^hsla?\(\s*([^,\s/]+)[\s,]+([^,\s/]+)[\s,]+([^,\s/)]+)(?:\s*[,/]\s*([^)\s]+))?\s*\)$/i.exec(
      text,
    );
  if (hsl) {
    const h = Number.parseFloat(hsl[1]!.replace(/deg$/i, ""));
    const s = Number.parseFloat(hsl[2]!) / (hsl[2]!.includes("%") ? 100 : 1);
    const l = Number.parseFloat(hsl[3]!) / (hsl[3]!.includes("%") ? 100 : 1);
    if (Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l)) {
      const hex = hslToHex(h, s, l, hsl[4]);
      return { hex, exact: true, reason: `${text} is exactly ${hex}` };
    }
  }

  const tailwind = TAILWIND_500[lower];
  if (tailwind) {
    return {
      hex: tailwind,
      exact: false,
      reason: `"${lower}" is a Tailwind palette name, not a color. ${tailwind} is its 500 shade`,
    };
  }

  return undefined;
}

/** True for a name that only exists in Tailwind's palette. */
export function isTailwindPaletteName(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower in TAILWIND_500 && !(lower in CSS_NAMED);
}
