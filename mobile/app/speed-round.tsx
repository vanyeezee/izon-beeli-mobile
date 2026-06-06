import { IconSymbol } from "@/components/ui/icon-symbol";
import { apiFetch } from "@/lib/api";
import { Circle, Svg } from "react-native-svg";
import { hapticError, hapticHeavy, hapticSuccess } from "@/lib/haptics";
import { useDictionary } from "@/lib/hooks/use-dictionary";
import { playCorrectSound, playFinishSound, playIncorrectSound } from "@/lib/sounds";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import type { DictionaryEntry } from "@/lib/dictionary";
import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TOTAL_SECONDS = 60;
const FEEDBACK_DELAY = 600;

interface SpeedQuestion {
  word: string;
  correct: string;
  options: string[];
  correctIndex: number;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildQuestions(entries: DictionaryEntry[]): SpeedQuestion[] {
  if (entries.length < 4) return [];
  const pool = shuffle(entries);
  return pool.map((entry) => {
    const distractors = shuffle(pool.filter((e) => e.id !== entry.id))
      .slice(0, 3)
      .map((e) => e.english);
    const options = shuffle([entry.english, ...distractors]);
    return {
      word: entry.word,
      correct: entry.english,
      options,
      correctIndex: options.indexOf(entry.english),
    };
  });
}

function TimerArc({ timeLeft }: { timeLeft: number }) {
  const M = useMuseumTheme();
  const pct = timeLeft / TOTAL_SECONDS;
  const color = pct > 0.5 ? M.accent : pct > 0.25 ? M.warning : M.error;
  const size = 72;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: 20, fontWeight: "900", color }}>{timeLeft}</Text>
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
      style={{ marginBottom: 10, borderRadius: 12, borderWidth: 2, paddingVertical: 15, paddingHorizontal: 20, backgroundColor: bg, borderColor: border, opacity: state === "dimmed" ? 0.45 : 1 }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

export default function SpeedRoundScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const selectedLanguageId = useLanguageStore((s) => s.selectedLanguageId);
  const { data: entries = [] } = useDictionary(selectedLanguageId);

  const [phase, setPhase] = useState<"idle" | "active" | "results">("idle");
  const [questions, setQuestions] = useState<SpeedQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreRef = useRef(0);
  const indexRef = useRef(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const endGame = useCallback((finalScore: number, total: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
    playFinishSound();
    hapticHeavy();
    setScore(finalScore);
    setPhase("results");
    getToken().then((token) => {
      if (!token) return;
      apiFetch("/quiz-results", {
        method: "POST",
        token,
        body: JSON.stringify({ languageId: selectedLanguageId, score: finalScore, accuracy: total > 0 ? Math.round((finalScore / total) * 100) : 0, durationMs: TOTAL_SECONDS * 1000, questionCount: total }),
      }).catch(() => {});
    });
  }, [getToken]);

  const startGame = useCallback(() => {
    const qs = buildQuestions(entries);
    if (qs.length === 0) return;
    setQuestions(qs);
    setIndex(0);
    indexRef.current = 0;
    setScore(0);
    scoreRef.current = 0;
    setSelected(null);
    setLocked(false);
    setTimeLeft(TOTAL_SECONDS);
    setPhase("active");
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          endGame(scoreRef.current, indexRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [entries, endGame]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
  }, []);

  const advance = useCallback((qs: SpeedQuestion[]) => {
    const nextIndex = indexRef.current + 1;
    if (nextIndex >= qs.length) {
      endGame(scoreRef.current, qs.length);
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      setSelected(null);
      setLocked(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  }, [fadeAnim, endGame]);

  const handleOption = useCallback((optIdx: number) => {
    if (locked || phase !== "active") return;
    const current = questions[index];
    if (!current) return;
    setLocked(true);
    setSelected(optIdx);
    const isCorrect = optIdx === current.correctIndex;
    if (isCorrect) {
      hapticSuccess();
      playCorrectSound();
      scoreRef.current += 1;
      setScore((s) => s + 1);
    } else {
      hapticError();
      playIncorrectSound();
    }
    feedbackRef.current = setTimeout(() => advance(questions), FEEDBACK_DELAY);
  }, [locked, phase, questions, index, advance]);

  const current = questions[index];

  if (phase === "idle") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Speed Round", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: `${M.accent}15`, marginBottom: 20 }}>
            <IconSymbol name="bolt.fill" size={38} color={M.accent} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: "900", color: M.text, textAlign: "center" }}>Speed Round</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center", marginTop: 8, lineHeight: 22 }}>
            Answer as many word-to-English questions as you can in 60 seconds
          </Text>
          <View style={{ marginTop: 32, flexDirection: "row", gap: 24, marginBottom: 40 }}>
            {[{ icon: "bolt.fill" as const, label: "60 sec", color: M.accent }, { icon: "trophy.fill" as const, label: "+XP", color: "#a78bfa" }].map((item) => (
              <View key={item.label} style={{ alignItems: "center" }}>
                <IconSymbol name={item.icon} size={22} color={item.color} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: item.color, marginTop: 4 }}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={startGame}
            disabled={entries.length < 4}
            style={{ borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, backgroundColor: M.accent }}
            className="active:opacity-80"
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: M.ink }}>Start</Text>
          </Pressable>
          {entries.length < 4 && (
            <Text style={{ marginTop: 12, fontSize: 12, color: M.muted, textAlign: "center" }}>
              Not enough words in dictionary for this language yet.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "results") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Speed Round", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: M.accent, alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <Text style={{ fontSize: 48, fontWeight: "900", color: M.accent }}>{score}</Text>
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: M.muted }}>CORRECT</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: M.text, marginBottom: 8 }}>Time&apos;s Up!</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>
            You answered {score} {score === 1 ? "word" : "words"} correctly
          </Text>
          <View style={{ width: "100%", gap: 10, marginTop: 32 }}>
            <Pressable onPress={startGame} style={{ borderRadius: 14, paddingVertical: 16, backgroundColor: M.accent, alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Play Again</Text>
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Speed Round", headerBackTitle: "Back" }} />

      {/* Top bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: `${M.accent}15`, borderWidth: 1, borderColor: `${M.accent}30` }}>
          <Text style={{ fontSize: 18, fontWeight: "900", color: M.accent }}>{score}</Text>
          <Text style={{ fontSize: 8, fontWeight: "700", letterSpacing: 1.5, color: M.muted }}>SCORE</Text>
        </View>
        <TimerArc timeLeft={timeLeft} />
        <View style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: M.border }}>
          <Text style={{ fontSize: 18, fontWeight: "900", color: M.text }}>{index + 1}</Text>
          <Text style={{ fontSize: 8, fontWeight: "700", letterSpacing: 1.5, color: M.muted }}>WORD</Text>
        </View>
      </View>

      <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Word display */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <Text style={{ fontSize: 44, fontWeight: "900", color: M.text, textAlign: "center", letterSpacing: -1 }}>
              {current.word}
            </Text>
          </View>

          <Text style={{ fontSize: 12, fontWeight: "700", color: M.muted, marginBottom: 12, letterSpacing: 0.5, textAlign: "center" }}>
            What does this mean in English?
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
