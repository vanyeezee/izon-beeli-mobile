import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Museum design system tokens.
 *
 * Rule:
 *   - Header sections are ALWAYS dark (museum foyer signature).
 *     Use `M.parchment`, `M.textDim`, `M.textDimDark` there.
 *   - Content areas (cards, lists) are mode-aware.
 *     Use `M.text`, `M.sub`, `M.muted`, `M.card`, `M.border` there.
 */
export function useMuseumTheme() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";

  return {
    // ── Always-dark foyer ────────────────────────────────────────
    ink: "#0D0F1A",
    inkDeep: "#07080F",
    parchment: "#F7F2E8",          // primary text on dark bg
    textDim: "#9A9480",            // secondary text on dark bg
    textDimDark: "#5A5D70",        // muted text on dark bg
    accentDim: "#8B5E1A",

    // ── Mode-aware content area ──────────────────────────────────
    bg:     dark ? "#0D0F1A" : "#F0EBE0",   // screen bg (behind dark header)
    card:   dark ? "#1A1D2C" : "#FDFAF5",   // card / list-item bg
    border: dark ? "#2E3245" : "#E0D5C4",   // dividers and card borders

    // Text on content background
    text:  dark ? "#F7F2E8" : "#1A1520",   // primary content text
    sub:   dark ? "#9A9480" : "#5C4F42",   // secondary content text
    muted: dark ? "#5A5D70" : "#A89880",   // muted / timestamps

    // ── Accent (identical in both modes) ────────────────────────
    accent:       "#C4862A",
    accentBorder: dark ? "rgba(196,134,42,0.4)"  : "rgba(196,134,42,0.35)",
    accentGlow:   dark ? "rgba(196,134,42,0.15)" : "rgba(196,134,42,0.10)",
    accentLight:  "#F5E8CC",

    // ── Semantic state (mode-aware) ──────────────────────────────
    // Replaces the hardcoded #22c55e/#4ade80/#ef4444/#f97316 literals that
    // were scattered across screens. Foreground stays legible on each mode's
    // background; *Bg / *Border are the subtle fill + outline for pills/cards.
    success:       dark ? "#4ADE80" : "#16A34A",
    successBg:     dark ? "rgba(74,222,128,0.12)"  : "rgba(22,163,74,0.10)",
    successBorder: dark ? "rgba(74,222,128,0.25)"  : "rgba(22,163,74,0.25)",
    error:         dark ? "#F87171" : "#DC2626",
    errorBg:       dark ? "rgba(248,113,113,0.12)" : "rgba(220,38,38,0.10)",
    errorBorder:   dark ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.25)",
    warning:       dark ? "#FBBF24" : "#D97706",
    warningBg:     dark ? "rgba(251,191,36,0.12)"  : "rgba(217,119,6,0.10)",
    warningBorder: dark ? "rgba(251,191,36,0.25)"  : "rgba(217,119,6,0.25)",
    info:          dark ? "#60A5FA" : "#2563EB",
    infoBg:        dark ? "rgba(96,165,250,0.12)"  : "rgba(37,99,235,0.10)",
    infoBorder:    dark ? "rgba(96,165,250,0.25)"  : "rgba(37,99,235,0.25)",

    // ── Input fields ─────────────────────────────────────────────
    inputBg:          dark ? "#161826" : "#FDFAF5",
    inputBorder:      dark ? "#2E3245" : "#D4C9B8",
    inputText:        dark ? "#F7F2E8" : "#1A1520",
    inputPlaceholder: dark ? "#5A5D70" : "#A89880",

    // ── Auth screen bg (no dark header, full-screen) ─────────────
    authBg: dark ? "#0D0F1A" : "#F0EBE0",

    // ── Aliases kept for backward compat ─────────────────────────
    cardBg:    dark ? "#1A1D2C" : "#FDFAF5",
    cardDark:  dark ? "#1A1D2C" : "#FDFAF5",
    borderDark:dark ? "#2E3245" : "#E0D5C4",
    warmWhite: "#FDFAF5",

    isDark: dark,
  } as const;
}

export type MuseumTheme = ReturnType<typeof useMuseumTheme>;
