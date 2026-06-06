import { IconSymbol } from "@/components/ui/icon-symbol";
import { getProverbsForLanguage } from "@/lib/data/proverbs";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { apiFetch } from "@/lib/api";
import { playCorrectSound, playFinishSound, playIncorrectSound } from "@/lib/sounds";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import type { Proverb } from "@/types";
import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FEEDBACK_DELAY = 1100;
const SESSION_SIZE = 8;

interface ProverbPuzzle {
  proverb: Proverb;
  blankWord: string;
  displayText: string;
  options: string[];
  correctIndex: number;
}

function pickBlankWord(text: string): { word: string; index: number } | null {
  const words = text.split(" ").filter((w) => w.trim().length > 2);
  if (words.length === 0) return null;
  const word = words[Math.floor(Math.random() * words.length)];
  const idx = text.indexOf(word);
  return { word, index: idx };
}

function buildPuzzles(proverbs: Proverb[]): ProverbPuzzle[] {
  const shuffled = [...proverbs].sort(() => Math.random() - 0.5).slice(0, SESSION_SIZE);
  const puzzles: ProverbPuzzle[] = [];

  for (const proverb of shuffled) {
    const blank = pickBlankWord(proverb.text);
    if (!blank) continue;
    const displayText = proverb.text.replace(blank.word, "______");
    const distractors = shuffled
      .filter((p) => p.id !== proverb.id)
      .map((p) => {
        const b = pickBlankWord(p.text);
        return b?.word ?? null;
      })
      .filter((w): w is string => !!w && w !== blank.word)
      .slice(0, 3);
    if (distractors.length < 3) continue;
    const allOptions = [blank.word, ...distractors].sort(() => Math.random() - 0.5);
    puzzles.push({
      proverb,
      blankWord: blank.word,
      displayText,
      options: allOptions,
      correctIndex: allOptions.indexOf(blank.word),
    });
  }
  return puzzles;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const M = useMuseumTheme();
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <View style={{ marginHorizontal: 20, marginTop: 8, height: 6, borderRadius: 999, backgroundColor: M.border }}>
      <View style={{ height: 6, borderRadius: 999, backgroundColor: M.accent, width: `${pct}%` }} />
    </View>
  );
}

function OptionTile({
  label,
  state,
  onPress,
}: {
  label: string;
  state: "default" | "correct" | "incorrect" | "dimmed";
  onPress: () => void;
}) {
  const M = useMuseumTheme();
  const bg = { default: M.card, correct: M.successBg, incorrect: M.errorBg, dimmed: M.card }[state];
  const border = { default: M.border, correct: M.success, incorrect: M.error, dimmed: M.border }[state];
  const color = { default: M.text, correct: M.success, incorrect: M.error, dimmed: M.muted }[state];
  return (
    <Pressable
      onPress={onPress}
      disabled={state !== "default"}
      style={{
        marginBottom: 10, borderRadius: 12, borderWidth: 2,
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: bg, borderColor: border,
        opacity: state === "dimmed" ? 0.45 : 1,
      }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

export default function FillTheProverbScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const selectedLanguageId = useLanguageStore((s) => s.selectedLanguageId);

  const puzzles = useMemo(() => {
    const proverbs = getProverbsForLanguage(selectedLanguageId);
    return buildPuzzles(proverbs);
  }, [selectedLanguageId]);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"active" | "results">("active");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const current = puzzles[index];

  const advance = useCallback(() => {
    if (index + 1 >= puzzles.length) {
      playFinishSound();
      setPhase("results");
      const duration = Math.round((Date.now() - startTime) / 1000);
      getToken().then((token) => {
        if (!token) return;
        apiFetch("/quiz-results", {
          method: "POST",
          token,
          body: JSON.stringify({ languageId: selectedLanguageId, score: correctCount, accuracy: puzzles.length > 0 ? Math.round((correctCount / puzzles.length) * 100) : 0, durationMs: duration * 1000, questionCount: puzzles.length }),
        }).catch(() => {});
      });
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setIndex((i) => i + 1);
      setSelectedOption(null);
      setLocked(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [index, puzzles.length, correctCount, fadeAnim, startTime, getToken]);

  const handleOption = useCallback((optionIndex: number) => {
    if (locked || !current) return;
    setLocked(true);
    setSelectedOption(optionIndex);
    const isCorrect = optionIndex === current.correctIndex;
    if (isCorrect) {
      hapticSuccess();
      playCorrectSound();
      setCorrectCount((c) => c + 1);
    } else {
      hapticError();
      playIncorrectSound();
    }
    setTimeout(advance, FEEDBACK_DELAY);
  }, [locked, current, advance]);

  if (puzzles.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top"]}>
        <Stack.Screen options={{ title: "Fill the Proverb", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <IconSymbol name="text.quote" size={48} color={M.muted} />
          <Text style={{ marginTop: 16, textAlign: "center", fontSize: 15, color: M.sub }}>
            No proverbs available for this language yet.
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: M.accent }}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "results") {
    const accuracy = Math.round((correctCount / puzzles.length) * 100);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Fill the Proverb", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: M.accent, alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <Text style={{ fontSize: 36, fontWeight: "900", color: M.accent }}>{accuracy}%</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: M.text, marginBottom: 8 }}>Completed</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>
            {correctCount} of {puzzles.length} proverbs completed correctly
          </Text>
          <View style={{ width: "100%", gap: 10, marginTop: 32 }}>
            <Pressable
              onPress={() => { setIndex(0); setCorrectCount(0); setSelectedOption(null); setLocked(false); setPhase("active"); }}
              style={{ borderRadius: 14, paddingVertical: 16, backgroundColor: M.accent, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Play Again</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={{ borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: M.border, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: M.text }}>Back to Discover</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!current) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Fill the Proverb", headerBackTitle: "Back" }} />
      <ProgressBar current={index} total={puzzles.length} />

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.8, color: M.muted, marginBottom: 6 }}>
          {index + 1} / {puzzles.length}
        </Text>

        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Proverb card */}
          <View style={{ borderRadius: 16, backgroundColor: M.card, borderWidth: 1, borderColor: M.border, borderLeftWidth: 4, borderLeftColor: M.accent, padding: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <IconSymbol name="text.quote" size={12} color={M.accent} />
              <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 2, color: M.accent }}>PROVERB</Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: M.text, lineHeight: 28 }}>
              {current.displayText.split("______").map((part, i, arr) => (
                i < arr.length - 1
                  ? <Text key={i}>
                      {part}
                      <Text style={{ backgroundColor: `${M.accent}25`, color: M.accent, fontWeight: "900", paddingHorizontal: 4 }}>
                        {"  ______  "}
                      </Text>
                    </Text>
                  : <Text key={i}>{part}</Text>
              ))}
            </Text>
            <View style={{ marginTop: 14, height: 1, backgroundColor: M.border }} />
            <Text style={{ marginTop: 10, fontSize: 13, fontStyle: "italic", color: M.sub, lineHeight: 18 }}>
              {current.proverb.translation}
            </Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: "700", color: M.muted, marginBottom: 12, letterSpacing: 0.5 }}>
            Choose the missing word:
          </Text>

          {current.options.map((opt, i) => {
            let state: "default" | "correct" | "incorrect" | "dimmed" = "default";
            if (selectedOption !== null) {
              if (i === current.correctIndex) state = "correct";
              else if (i === selectedOption) state = "incorrect";
              else state = "dimmed";
            }
            return (
              <OptionTile key={i} label={opt} state={state} onPress={() => handleOption(i)} />
            );
          })}

          {selectedOption !== null && current.proverb.meaning && (
            <View style={{ marginTop: 8, borderRadius: 12, padding: 14, backgroundColor: `${M.accent}10`, borderWidth: 1, borderColor: `${M.accent}25` }}>
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: M.accent, marginBottom: 4 }}>MEANING</Text>
              <Text style={{ fontSize: 13, color: M.sub, lineHeight: 18 }}>{current.proverb.meaning}</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
