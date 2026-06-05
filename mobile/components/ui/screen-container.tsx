import { useMuseumTheme } from "@/lib/use-museum-theme";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { View, type StyleProp, type ViewStyle } from "react-native";

/** Standard horizontal screen gutter. Replaces the ad-hoc 12/14/16/20/28/32 mix. */
export const SCREEN_GUTTER = 20;

export interface ScreenContainerProps {
  children: React.ReactNode;
  /** Safe-area edges to inset. Defaults to top (most screens sit under the dark header). */
  edges?: readonly Edge[];
  /** Apply the standard horizontal gutter. Disable for full-bleed scroll views. */
  padded?: boolean;
  /** Override the background; defaults to the mode-aware content bg. */
  background?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Museum screen wrapper. Standardizes safe-area handling and the screen gutter so
 * screens stop choosing `edges={[...]}` and padding values ad-hoc.
 */
export function ScreenContainer({
  children,
  edges = ["top"],
  padded = true,
  background,
  style,
}: ScreenContainerProps) {
  const M = useMuseumTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: background ?? M.bg }}>
      <View style={[{ flex: 1, paddingHorizontal: padded ? SCREEN_GUTTER : 0 }, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}
