import { fonts } from "@/constants/typography";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

export type BadgeTone = "neutral" | "accent" | "success" | "error" | "warning" | "info";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Explicit colors override `tone` — use for course/level palettes. */
  color?: string;
  bg?: string;
  border?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Museum pill/badge primitive. Replaces the rounded-999 + bordered <View><Text>
 * pattern that was copy-pasted 4+ times (profile role badges, quiz result chips,
 * lesson completion badge, level tags). Pass a `tone` for semantic colors, or
 * explicit `color`/`bg`/`border` for course-type palettes.
 */
export function Badge({ label, tone = "neutral", color, bg, border, style }: BadgeProps) {
  const M = useMuseumTheme();

  const tones: Record<BadgeTone, { text: string; bg: string; border: string }> = {
    neutral: { text: M.sub,     bg: M.card,     border: M.border },
    accent:  { text: M.accent,  bg: M.accentGlow,  border: M.accentBorder },
    success: { text: M.success, bg: M.successBg,   border: M.successBorder },
    error:   { text: M.error,   bg: M.errorBg,     border: M.errorBorder },
    warning: { text: M.warning, bg: M.warningBg,   border: M.warningBorder },
    info:    { text: M.info,    bg: M.infoBg,      border: M.infoBorder },
  };
  const t = tones[tone];

  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 999,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 4,
          backgroundColor: bg ?? t.bg,
          borderColor: border ?? t.border,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: fonts.headingMedium, fontSize: 12, color: color ?? t.text }}>
        {label}
      </Text>
    </View>
  );
}
