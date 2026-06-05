/**
 * Museum typography tokens.
 *
 * The app loads PlusJakartaSans (700 Bold / 600 SemiBold) in `app/_layout.tsx`
 * but, before this, almost nothing applied them — headings fell back to the
 * system font. Use `fonts.heading` / `fonts.headingMedium` on display text and
 * the `type` scale for consistent size + weight pairings.
 *
 * `Akagu` is the indigenous-script display face; keep it reserved for Nsịbịdị /
 * symbol rendering (see components/nsibidi/nsibidi-text.tsx).
 */
export const fonts = {
  heading: "PlusJakartaSans_700Bold",
  headingMedium: "PlusJakartaSans_600SemiBold",
  /** Indigenous script face — Nsịbịdị / Adinkra symbol contexts only. */
  script: "Akagu",
} as const;

export interface TypeStyle {
  fontFamily?: string;
  fontSize: number;
  lineHeight: number;
  fontWeight?: "400" | "500" | "600" | "700";
  letterSpacing?: number;
}

/**
 * Shared type scale. Apply with `...type.h1` inside an inline style, or read
 * individual fields. Body styles intentionally omit `fontFamily` so they inherit
 * the platform body font; headings use the loaded display face.
 */
export const type = {
  display: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  h1:      { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  h2:      { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 },
  h3:      { fontFamily: fonts.headingMedium, fontSize: 18, lineHeight: 24 },
  title:   { fontFamily: fonts.headingMedium, fontSize: 16, lineHeight: 22 },
  body:    { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  overline: { fontFamily: fonts.headingMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.5 },
} as const satisfies Record<string, TypeStyle>;
