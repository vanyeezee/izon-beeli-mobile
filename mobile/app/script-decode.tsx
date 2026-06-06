import { IconSymbol } from "@/components/ui/icon-symbol";
import { FIDEL_CHART } from "@/lib/data/geez/fidel-chart";
import type { GeezCharacter } from "@/lib/data/geez/fidel-chart";
import { NSIBIDI_CHARACTERS } from "@/lib/data/nsibidi";
import type { NsibidiCharacter } from "@/lib/data/nsibidi";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { apiFetch } from "@/lib/api";
import { playCorrectSound, playFinishSound, playIncorrectSound } from "@/lib/sounds";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScriptMode = "geez" | "nsibidi";

interface DecodeQuestion {
  character: string;
  correctAnswer: string;
  options: string[];
  correctIndex: number;
  hint?: string;
}

const SESSION_SIZE = 10;
const FEEDBACK_DELAY = 1000;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildGeezQuestions(): DecodeQuestion[] {
  const pool = shuffle(FIDEL_CHART).slice(0, SESSION_SIZE + 12);
  return pool.slice(0, SESSION_SIZE).map((char) => {
    const distractors = shuffle(pool.filter((c) => c.id !== char.id))
      .slice(0, 3)
      .map((c) => c.romanization);
    const options = shuffle([char.romanization, ...distractors]);
    return {
      character: char.character,
      correctAnswer: char.romanization,
      options,
      correctIndex: options.indexOf(char.romanization),
      hint: `Order ${char.order} (${["e","u","i","a","ē","ə","o"][char.order - 1] ?? ""})`,
    };
  });
}

function buildNsibidiQuestions(): DecodeQuestion[] {
  const pool = shuffle(NSIBIDI_CHARACTERS).slice(0, SESSION_SIZE + 12);
  return pool.slice(0, SESSION_SIZE).map((char) => {
    const distractors = shuffle(pool.filter((c) => c.id !== char.id))
      .slice(0, 3)
      .map((c) => c.meaning);
    const options = shuffle([char.meaning, ...distractors]);
    return {
      character: char.character,
      correctAnswer: char.meaning,
      options,
      correctIndex: options.indexOf(char.meaning),
      hint: char.name,
    };
  });
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
        paddingHorizontal: 20, paddingVertical: 15,
        backgroundColor: bg, borderColor: border,
        opacity: state === "dimmed" ? 0.45 : 1,
      }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: 14, fontWeight: "600", color, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

function ConfigScreen({ onStart }: { onStart: (mode: ScriptMode) => void }) {
  const M = useMuseumTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Script Decode", headerBackTitle: "Back" }} />
      <View style={{ flex: 1, justifyContent: "center", padding: 28 }}>
        <View style={{ alignItems: "center", marginBottom: 36 }}>
          <View style={{ width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: `${M.accent}15`, marginBottom: 16 }}>
            <Text style={{ fontSize: 40, color: M.accent }}>ሀ</Text>
          </View>
          <Text style={{ fontSize: 26, fontWeight: "900", color: M.text, textAlign: "center" }}>Script Decode</Text>
          <Text style={{ fontSize: 14, color: M.sub, textAlign: "center", marginTop: 6 }}>
            Read a symbol and identify its meaning or romanization
          </Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 2, color: M.muted, marginBottom: 14, textAlign: "center" }}>
          CHOOSE A SCRIPT
        </Text>
        <Pressable
          onPress={() => onStart("geez")}
          style={{ borderRadius: 16, backgroundColor: M.card, borderWidth: 1, borderColor: M.border, borderLeftWidth: 4, borderLeftColor: "#4ade80", padding: 16, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 }}
          className="active:opacity-70"
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(74,222,128,0.1)" }}>
            <Text style={{ fontSize: 26, color: "#4ade80" }}>ሀ</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: M.text }}>Ge&apos;ez / Fidel</Text>
            <Text style={{ fontSize: 12, color: M.sub, marginTop: 2 }}>Ethiopic alphabet · Amharic & Tigrinya</Text>
          </View>
          <IconSymbol name="chevron.right" size={14} color="#4ade80" />
        </Pressable>
        <Pressable
          onPress={() => onStart("nsibidi")}
          style={{ borderRadius: 16, backgroundColor: M.card, borderWidth: 1, borderColor: M.border, borderLeftWidth: 4, borderLeftColor: "#f59e0b", padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
          className="active:opacity-70"
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,158,11,0.1)" }}>
            <Text style={{ fontSize: 26, color: "#f59e0b" }}>𐘕</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: M.text }}>Nsịbịdị</Text>
            <Text style={{ fontSize: 12, color: M.sub, marginTop: 2 }}>Indigenous Igbo script</Text>
          </View>
          <IconSymbol name="chevron.right" size={14} color="#f59e0b" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function ScriptDecodeScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { getToken } = useAuth();

  const [mode, setMode] = useState<ScriptMode | null>(null);
  const [phase, setPhase] = useState<"config" | "active" | "results">("config");
  const [questions, setQuestions] = useState<DecodeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const accentColor = mode === "geez" ? "#4ade80" : "#f59e0b";

  const handleStart = useCallback((selectedMode: ScriptMode) => {
    const qs = selectedMode === "geez" ? buildGeezQuestions() : buildNsibidiQuestions();
    setMode(selectedMode);
    setQuestions(qs);
    setIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setLocked(false);
    setStartTime(Date.now());
    setPhase("active");
  }, []);

  const advance = useCallback(() => {
    if (index + 1 >= questions.length) {
      playFinishSound();
      setPhase("results");
      const duration = Math.round((Date.now() - startTime) / 1000);
      getToken().then((token) => {
        if (!token) return;
        apiFetch("/quiz-results", {
          method: "POST",
          token,
          body: JSON.stringify({ languageId: selectedLanguageId, score: correctCount, accuracy: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0, durationMs: duration * 1000, questionCount: questions.length }),
        }).catch(() => {});
      });
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setIndex((i) => i + 1);
      setSelected(null);
      setLocked(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }, [index, questions.length, correctCount, fadeAnim, startTime, getToken]);

  const handleOption = useCallback((optIdx: number) => {
    if (locked) return;
    const current = questions[index];
    if (!current) return;
    setLocked(true);
    setSelected(optIdx);
    const isCorrect = optIdx === current.correctIndex;
    if (isCorrect) { hapticSuccess(); playCorrectSound(); setCorrectCount((c) => c + 1); }
    else { hapticError(); playIncorrectSound(); }
    setTimeout(advance, FEEDBACK_DELAY);
  }, [locked, questions, index, advance]);

  if (phase === "config") return <ConfigScreen onStart={handleStart} />;

  if (phase === "results") {
    const accuracy = Math.round((correctCount / questions.length) * 100);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Script Decode", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: accentColor, alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <Text style={{ fontSize: 36, fontWeight: "900", color: accentColor }}>{accuracy}%</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: M.text, marginBottom: 8 }}>Session Complete</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>
            {correctCount} of {questions.length} characters decoded correctly
          </Text>
          <View style={{ width: "100%", gap: 10, marginTop: 32 }}>
            <Pressable
              onPress={() => mode && handleStart(mode)}
              style={{ borderRadius: 14, paddingVertical: 16, backgroundColor: accentColor, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Play Again</Text>
            </Pressable>
            <Pressable
              onPress={() => setPhase("config")}
              style={{ borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: M.border, alignItems: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: M.text }}>Switch Script</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={{ borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: M.muted }}>Back to Discover</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const current = questions[index];
  if (!current) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Script Decode", headerBackTitle: "Back" }} />
      <ProgressBar current={index} total={questions.length} />

      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.8, color: M.muted, marginBottom: 16 }}>
          {index + 1} / {questions.length}
        </Text>

        <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
          {/* Big character display */}
          <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 32, flex: 1, maxHeight: 180 }}>
            <View style={{ width: 140, height: 140, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: `${accentColor}12`, borderWidth: 2, borderColor: `${accentColor}30` }}>
              <Text style={{ fontSize: 72, color: accentColor, lineHeight: 84 }}>{current.character}</Text>
            </View>
            {current.hint && (
              <Text style={{ marginTop: 10, fontSize: 11, color: M.muted, letterSpacing: 0.5 }}>{current.hint}</Text>
            )}
          </View>

          <Text style={{ fontSize: 12, fontWeight: "700", color: M.muted, marginBottom: 12, letterSpacing: 0.5 }}>
            What does this {mode === "geez" ? "character" : "symbol"} represent?
          </Text>

          {current.options.map((opt, i) => {
            let state: "default" | "correct" | "incorrect" | "dimmed" = "default";
            if (selected !== null) {
              if (i === current.correctIndex) state = "correct";
              else if (i === selected) state = "incorrect";
              else state = "dimmed";
            }
            return <OptionTile key={i} label={opt} state={state} onPress={() => handleOption(i)} />;
          })}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
