import { IconSymbol } from "@/components/ui/icon-symbol";
import { apiFetch } from "@/lib/api";
import { getSentencesForLanguage } from "@/lib/data/sentences";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import { playCorrectSound, playFinishSound, playIncorrectSound } from "@/lib/sounds";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import type { SentenceTemplate } from "@/types";
import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";

const SESSION_SIZE = 8;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

interface WordTile {
  id: string;
  text: string;
}

function buildTiles(sentence: SentenceTemplate): WordTile[] {
  return shuffle(
    sentence.sentence
      .split(/\s+/)
      .filter(Boolean)
      .map((w, i) => ({ id: `${i}-${w}`, text: w }))
  );
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

export default function SentenceBuilderScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const selectedLanguageId = useLanguageStore((s) => s.selectedLanguageId);

  const sentences = useMemo(() => {
    const all = getSentencesForLanguage(selectedLanguageId);
    return shuffle(all).slice(0, SESSION_SIZE);
  }, [selectedLanguageId]);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"active" | "results">("active");
  const [bank, setBank] = useState<WordTile[]>(() => buildTiles(sentences[0] ?? { id: "", languageId: "", sentence: "", answer: "", englishSentence: "" }));
  const [placed, setPlaced] = useState<WordTile[]>([]);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const current = sentences[index];

  const doCheck = useCallback(() => {
    if (!current || placed.length === 0) return;
    const userSentence = placed.map((t) => t.text).join(" ");
    const isCorrect = userSentence === current.sentence;
    setAttempts((a) => a + 1);
    setChecked(true);
    setCorrect(isCorrect);
    if (isCorrect) {
      hapticSuccess();
      playCorrectSound();
      setCorrectCount((c) => c + 1);
    } else {
      hapticError();
      playIncorrectSound();
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 70, useNativeDriver: true }),
      ]).start();
    }
  }, [current, placed, shakeAnim]);

  const advance = useCallback(() => {
    if (index + 1 >= sentences.length) {
      playFinishSound();
      setPhase("results");
      const duration = Math.round((Date.now() - startTime) / 1000);
      getToken().then((token) => {
        if (!token) return;
        apiFetch("/quiz-results", {
          method: "POST",
          token,
          body: JSON.stringify({ languageId: selectedLanguageId, score: correctCount, accuracy: sentences.length > 0 ? Math.round((correctCount / sentences.length) * 100) : 0, durationMs: duration * 1000, questionCount: sentences.length }),
        }).catch(() => {});
      });
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      const next = index + 1;
      setIndex(next);
      setBank(buildTiles(sentences[next]!));
      setPlaced([]);
      setChecked(false);
      setCorrect(false);
      setAttempts(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [index, sentences, correctCount, fadeAnim, startTime, getToken]);

  const tapBank = useCallback((tile: WordTile) => {
    hapticTap();
    setBank((b) => b.filter((t) => t.id !== tile.id));
    setPlaced((p) => [...p, tile]);
  }, []);

  const tapPlaced = useCallback((tile: WordTile) => {
    if (checked) return;
    hapticTap();
    setPlaced((p) => p.filter((t) => t.id !== tile.id));
    setBank((b) => [...b, tile]);
  }, [checked]);

  const reset = useCallback(() => {
    if (!current) return;
    setBank(buildTiles(current));
    setPlaced([]);
    setChecked(false);
    setCorrect(false);
    hapticTap();
  }, [current]);

  if (sentences.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: M.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Stack.Screen options={{ title: "Build a Sentence", headerBackTitle: "Back" }} />
        <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>No sentences available for this language yet.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: M.accent }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "results") {
    const accuracy = Math.round((correctCount / sentences.length) * 100);
    return (
      <View style={{ flex: 1, backgroundColor: M.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Stack.Screen options={{ title: "Build a Sentence", headerBackTitle: "Back" }} />
        <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: M.accent, alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <Text style={{ fontSize: 36, fontWeight: "900", color: M.accent }}>{accuracy}%</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: "800", color: M.text, marginBottom: 8 }}>Done!</Text>
        <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>
          {correctCount} of {sentences.length} sentences built correctly
        </Text>
        <View style={{ width: "100%", gap: 10, marginTop: 32 }}>
          <Pressable
            onPress={() => { setIndex(0); setCorrectCount(0); setBank(buildTiles(sentences[0]!)); setPlaced([]); setChecked(false); setCorrect(false); setPhase("active"); }}
            style={{ borderRadius: 14, paddingVertical: 16, backgroundColor: M.accent, alignItems: "center" }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Play Again</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: M.border, alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: M.text }}>Back to Discover</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!current) return null;

  const answerBorderColor = checked
    ? correct ? M.success : M.error
    : M.border;

  return (
    <View style={{ flex: 1, backgroundColor: M.bg }}>
      <Stack.Screen options={{ title: "Build a Sentence", headerBackTitle: "Back" }} />
      <ProgressBar current={index} total={sentences.length} />

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.8, color: M.muted, marginBottom: 16 }}>
          {index + 1} / {sentences.length}
        </Text>

        <Animated.View style={{ opacity: fadeAnim }}>
          {/* English translation hint */}
          <View style={{ borderRadius: 14, backgroundColor: M.card, borderWidth: 1, borderColor: M.border, padding: 14, marginBottom: 20 }}>
            <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 2, color: M.muted, marginBottom: 4 }}>TRANSLATE INTO {selectedLanguageId.toUpperCase()}</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: M.text }}>{current.englishSentence}</Text>
          </View>

          {/* Answer row */}
          <Animated.View
            style={{
              transform: [{ translateX: shakeAnim }],
              borderRadius: 14,
              borderWidth: 2,
              borderColor: answerBorderColor,
              backgroundColor: checked ? (correct ? M.successBg : M.errorBg) : "transparent",
              minHeight: 56,
              padding: 12,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {placed.length === 0 && (
              <Text style={{ color: M.muted, fontSize: 13, alignSelf: "center" }}>Tap words below to place them here</Text>
            )}
            {placed.map((tile) => (
              <Pressable
                key={tile.id}
                onPress={() => tapPlaced(tile)}
                style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: checked ? (correct ? M.successBg : M.errorBg) : `${M.accent}15`, borderWidth: 1, borderColor: checked ? (correct ? M.successBorder : M.errorBorder) : `${M.accent}40` }}
                className="active:opacity-60"
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: checked ? (correct ? M.success : M.error) : M.accent }}>{tile.text}</Text>
              </Pressable>
            ))}
          </Animated.View>

          {/* Reveal answer on incorrect */}
          {checked && !correct && (
            <View style={{ borderRadius: 12, backgroundColor: M.successBg, borderWidth: 1, borderColor: M.successBorder, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: M.success, marginBottom: 4 }}>CORRECT ANSWER</Text>
              <Text style={{ fontSize: 14, color: M.success, fontWeight: "600" }}>{current.sentence}</Text>
            </View>
          )}

          {/* Word bank */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
            {bank.map((tile) => (
              <Pressable
                key={tile.id}
                onPress={() => tapBank(tile)}
                style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: M.card, borderWidth: 1.5, borderColor: M.border }}
                className="active:opacity-70"
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: M.text }}>{tile.text}</Text>
              </Pressable>
            ))}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={reset}
              style={{ flex: 1, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: M.border, alignItems: "center" }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: M.muted }}>Reset</Text>
            </Pressable>
            {!checked ? (
              <Pressable
                onPress={doCheck}
                disabled={placed.length === 0}
                style={{ flex: 2, borderRadius: 12, paddingVertical: 14, backgroundColor: placed.length > 0 ? M.accent : M.border, alignItems: "center" }}
                className="active:opacity-80"
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: M.ink }}>Check</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={advance}
                style={{ flex: 2, borderRadius: 12, paddingVertical: 14, backgroundColor: M.accent, alignItems: "center" }}
                className="active:opacity-80"
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: M.ink }}>
                  {index + 1 >= sentences.length ? "Finish" : "Next →"}
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
