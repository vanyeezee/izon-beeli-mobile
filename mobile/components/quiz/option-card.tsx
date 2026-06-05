import { useMuseumTheme } from "@/lib/use-museum-theme";
import { Pressable, Text } from "react-native";

export type OptionState = "default" | "correct" | "incorrect" | "dimmed";

export function OptionCard({
  label,
  state,
  onPress,
}: {
  label: string;
  state: OptionState;
  onPress: () => void;
}) {
  const M = useMuseumTheme();

  const bgColor = {
    default: M.card,
    correct: M.successBg,
    incorrect: M.errorBg,
    dimmed: M.card,
  }[state];

  const borderColor = {
    default: M.border,
    correct: M.success,
    incorrect: M.error,
    dimmed: M.border,
  }[state];

  const textColor = {
    default: M.text,
    correct: M.success,
    incorrect: M.error,
    dimmed: M.muted,
  }[state];

  return (
    <Pressable
      onPress={onPress}
      disabled={state !== "default"}
      style={{
        marginBottom: 12, borderRadius: 12, borderWidth: 2,
        paddingHorizontal: 20, paddingVertical: 16,
        backgroundColor: bgColor, borderColor,
        opacity: state === "dimmed" ? 0.5 : 1,
      }}
      accessibilityRole="button"
      accessibilityLabel={
        state === "correct"
          ? `${label}, correct`
          : state === "incorrect"
            ? `${label}, incorrect`
            : label
      }
      accessibilityHint={state === "default" ? "Tap to select this answer" : undefined}
      accessibilityState={{ disabled: state !== "default", selected: state === "correct" || state === "incorrect" }}
    >
      <Text style={{ fontSize: 16, fontWeight: "500", color: textColor }}>{label}</Text>
    </Pressable>
  );
}
