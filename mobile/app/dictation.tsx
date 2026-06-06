import { IconSymbol } from "@/components/ui/icon-symbol";
import { getSentencesForLanguage } from "@/lib/data/sentences";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import { useAudioStore } from "@/store/audio-store";
import type { SentenceTemplate } from "@/types";
import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SESSION_SIZE = 6;
const BUNDLED_PHRASE_AUDIO: Record<string, string> = {};

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-zÀ-ɏḀ-ỿ]/gi, "").trim();
}

function scoreAnswer(userAnswer: string, correct: string): { exact: boolean; pct: number } {
  const u = normalise(userAnswer);
  const c = normalise(correct);
  if (u === c) return { exact: true, pct: 100 };
  const cWords = c.split(/\s+/);
  const uWords = u.split(/\s+/);
  const matched = cWords.filter((w) => uWords.includes(w)).length;
  const pct = cWords.length > 0 ? Math.round((matched / cWords.length) * 100) : 0;
  return { exact: false, pct };
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const M = useMuseumTheme();
  return (
    <View style={{ marginHorizontal: 20, marginTop: 8, height: 6, borderRadius: 999, backgroundColor: M.border }}>
      <View style={{ height: 6, borderRadius: 999, backgroundColor: M.accent, width: `${(current / total) * 100}%` }} />
    </View>
  );
}

export default function DictationScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const selectedLanguageId = useLanguageStore((s) => s.selectedLanguageId);
  const { loadAndPlay, setSpeed } = useAudioStore();

  const sentences = useMemo(() => {
    const all = getSentencesForLanguage(selectedLanguageId).filter((s) => !!s.sentence);
    return shuffle(all).slice(0, SESSION_SIZE);
  }, [selectedLanguageId]);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"active" | "results">("active");
  const [userInput, setUserInput] = useState("");
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<{ exact: boolean; pct: number } | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [startTime] = useState(Date.now());
  const [playCount, setPlayCount] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const current = sentences[index];

  const playAudio = useCallback(async (slow: boolean = false) => {
    if (!current) return;
    hapticTap();
    setPlayCount((c) => c + 1);
    const audioUrl = BUNDLED_PHRASE_AUDIO[current.id];
    if (audioUrl) {
      setSpeed(slow ? 0.75 : 1);
      await loadAndPlay(`dictation-${current.id}`, audioUrl, current.sentence);
    } else {
      const { default: Speech } = await import("expo-speech");
      Speech.speak(current.sentence, { rate: slow ? 0.6 : 0.85 });
    }
  }, [current, loadAndPlay, setSpeed]);

  const handleCheck = useCallback(() => {
    if (!current || !userInput.trim()) return;
    const r = scoreAnswer(userInput.trim(), current.sentence);
    setResult(r);
    setChecked(true);
    if (r.exact || r.pct >= 80) {
      hapticSuccess();
      setTotalScore((s) => s + Math.round(r.pct));
    } else {
      hapticError();
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 70, useNativeDriver: true }),
      ]).start();
    }
  }, [current, userInput, shakeAnim]);

  const advance = useCallback(() => {
    if (index + 1 >= sentences.length) {
      setPhase("results");
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setIndex((i) => i + 1);
      setUserInput("");
      setChecked(false);
      setResult(null);
      setPlayCount(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [index, sentences.length, fadeAnim]);

  if (sentences.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Dictation Drop", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>No sentences available for this language yet.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: M.accent }}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "results") {
    const maxScore = sentences.length * 100;
    const accuracy = Math.round((totalScore / maxScore) * 100);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Dictation Drop", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: M.accent, alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <Text style={{ fontSize: 36, fontWeight: "900", color: M.accent }}>{accuracy}%</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: M.text, marginBottom: 8 }}>Session Complete</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>
            {sentences.length} phrases transcribed
          </Text>
          <View style={{ width: "100%", gap: 10, marginTop: 32 }}>
            <Pressable
              onPress={() => { setIndex(0); setUserInput(""); setChecked(false); setResult(null); setTotalScore(0); setPlayCount(0); setPhase("active"); }}
              style={{ borderRadius: 14, paddingVertical: 16, backgroundColor: M.accent, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Try Again</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: M.border, alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: M.text }}>Back to Discover</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!current) return null;

  const inputBorderColor = checked
    ? (result && (result.exact || result.pct >= 80)) ? M.success : M.error
    : M.inputBorder;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top"]}>
      <Stack.Screen options={{ title: "Dictation Drop", headerBackTitle: "Back" }} />
      <ProgressBar current={index} total={sentences.length} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.8, color: M.muted, marginBottom: 16 }}>
            {index + 1} / {sentences.length}
          </Text>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: M.text, marginBottom: 6 }}>Listen & Type</Text>
            <Text style={{ fontSize: 13, color: M.sub, marginBottom: 24, lineHeight: 18 }}>
              Play the phrase then write exactly what you hear in {selectedLanguageId}
            </Text>

            {/* Play buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
              <Pressable
                onPress={() => playAudio(false)}
                style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, backgroundColor: M.accent }}
                className="active:opacity-80"
              >
                <IconSymbol name="play.fill" size={16} color={M.ink} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: M.ink }}>Play</Text>
              </Pressable>
              <Pressable
                onPress={() => playAudio(true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: M.border }}
                className="active:opacity-70"
              >
                <IconSymbol name="tortoise.fill" size={14} color={M.muted} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: M.muted }}>Slow</Text>
              </Pressable>
            </View>

            {/* Input */}
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <TextInput
                value={userInput}
                onChangeText={setUserInput}
                placeholder="Type what you hear…"
                placeholderTextColor={M.muted}
                editable={!checked}
                multiline
                style={{
                  borderRadius: 14, borderWidth: 2, borderColor: inputBorderColor,
                  backgroundColor: M.inputBg, color: M.text,
                  fontSize: 16, padding: 16, minHeight: 80,
                  fontWeight: "500", lineHeight: 24,
                }}
              />
            </Animated.View>

            {/* Hint: translation */}
            {playCount >= 2 && !checked && (
              <View style={{ marginTop: 10, borderRadius: 10, padding: 10, backgroundColor: `${M.accent}08` }}>
                <Text style={{ fontSize: 11, color: M.muted }}>Hint: {current.englishSentence}</Text>
              </View>
            )}

            {/* Result feedback */}
            {checked && result && (
              <View style={{ marginTop: 14, borderRadius: 12, padding: 14, backgroundColor: (result.exact || result.pct >= 80) ? M.successBg : M.errorBg, borderWidth: 1, borderColor: (result.exact || result.pct >= 80) ? M.successBorder : M.errorBorder }}>
                <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: (result.exact || result.pct >= 80) ? M.success : M.error, marginBottom: 6 }}>
                  {result.exact ? "PERFECT!" : result.pct >= 80 ? `CLOSE — ${result.pct}%` : `${result.pct}% MATCH`}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: M.muted, marginBottom: 3 }}>CORRECT PHRASE</Text>
                <Text style={{ fontSize: 14, color: M.text, fontWeight: "600" }}>{current.sentence}</Text>
              </View>
            )}

            {/* Check / Next */}
            <View style={{ marginTop: 20 }}>
              {!checked ? (
                <Pressable
                  onPress={handleCheck}
                  disabled={!userInput.trim()}
                  style={{ borderRadius: 14, paddingVertical: 15, backgroundColor: userInput.trim() ? M.accent : M.border, alignItems: "center" }}
                  className="active:opacity-80"
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Check</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={advance}
                  style={{ borderRadius: 14, paddingVertical: 15, backgroundColor: M.accent, alignItems: "center" }}
                  className="active:opacity-80"
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>
                    {index + 1 >= sentences.length ? "Finish" : "Next →"}
                  </Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
