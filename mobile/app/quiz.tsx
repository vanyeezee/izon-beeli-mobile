import { ListeningQuestion } from "@/components/quiz/listening-question";
import { OptionCard } from "@/components/quiz/option-card";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { analytics } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { hapticError, hapticHeavy, hapticSuccess } from "@/lib/haptics";
import { useDictionary } from "@/lib/hooks/use-dictionary";
import { useLesson } from "@/lib/hooks/use-courses";
import { getLanguageName } from "@/lib/mock-data";
import { generateFocusedQuiz, generateQuiz } from "@/lib/quiz-engine";
import {
    playCorrectSound,
    playFinishSound,
    playIncorrectSound,
} from "@/lib/sounds";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import { useQuizStore } from "@/store/quiz-store";
import type { QuizQuestion } from "@/types";
import { useInvalidateDailyChallenges } from "@/lib/hooks/use-daily-challenge";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const QUESTION_COUNTS = [5, 10, 15, 20] as const;
const TIME_ESTIMATE_MINUTES: Record<number, number> = { 5: 3, 10: 6, 15: 9, 20: 12 };

const FEEDBACK_DELAY = 1200;

function ProgressBar({ current, total }: { current: number; total: number }) {
  const M = useMuseumTheme();
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <View style={{ marginHorizontal: 20, marginTop: 8, height: 8, borderRadius: 999, backgroundColor: M.border }}>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: M.accent, width: `${pct}%` }} />
    </View>
  );
}

function QuestionTypeLabel({ type }: { type: QuizQuestion["type"] }) {
  const M = useMuseumTheme();
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    "word-to-english": t("quiz.wordToEnglish"),
    "english-to-word": t("quiz.englishToWord"),
    "fill-in-the-blank": t("quiz.fillInBlank"),
    listening: t("quiz.listening"),
  };
  return (
    <View style={{ marginBottom: 8, alignSelf: "flex-start", borderRadius: 999, backgroundColor: M.accentGlow, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: M.accentBorder }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: M.accent }}>
        {labels[type] ?? type}
      </Text>
    </View>
  );
}

function ConfigView({ onStart }: { onStart: (count: number) => void }) {
  const M = useMuseumTheme();
  const { t } = useTranslation();
  const [count, setCount] = useState(10);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: M.accentGlow, borderWidth: 1, borderColor: M.accentBorder }}>
        <IconSymbol name="trophy.fill" size={36} color={M.accent} />
      </View>
      <Text style={{ marginTop: 16, fontSize: 20, fontWeight: "700", color: M.text }}>
        {t("quiz.title")}
      </Text>
      <Text style={{ marginTop: 8, marginBottom: 32, textAlign: "center", fontSize: 14, color: M.sub }}>
        {t("quiz.subtitle")}
      </Text>

      <Text style={{ marginBottom: 12, fontSize: 13, fontWeight: "500", color: M.sub }}>
        {t("quiz.numberOfQuestions")}
      </Text>
      <View style={{ marginBottom: 32, flexDirection: "row", gap: 12 }}>
        {QUESTION_COUNTS.map((n) => (
          <Pressable
            key={n}
            onPress={() => setCount(n)}
            style={{
              height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 2,
              borderColor: count === n ? M.accent : M.border,
              backgroundColor: count === n ? M.accent : M.card,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: count === n ? M.ink : M.text }}>{n}</Text>
            <Text style={{ fontSize: 10, color: count === n ? `${M.ink}99` : M.muted }}>
              {t("quiz.minutesEstimate", { minutes: TIME_ESTIMATE_MINUTES[n] })}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => onStart(count)}
        style={{ width: "100%", alignItems: "center", borderRadius: 12, backgroundColor: M.accent, paddingVertical: 16 }}
        className="active:opacity-80"
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: M.ink }}>{t("quiz.startQuiz")}</Text>
      </Pressable>
    </View>
  );
}

function ActiveView() {
  const { t } = useTranslation();
  const {
    questions,
    currentIndex,
    lastAnswerCorrect,
    answerQuestion,
    nextQuestion,
  } = useQuizStore();

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const question = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  // Reset local state when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setLocked(false);
  }, [currentIndex]);

  const handleSelect = useCallback(
    async (answer: string) => {
      if (locked) return;
      setLocked(true);
      setSelectedAnswer(answer);

      const correct = answerQuestion(answer);
      if (correct) {
        playCorrectSound();
        hapticSuccess();
        if (isLastQuestion) {
          setTimeout(() => { playFinishSound(); }, FEEDBACK_DELAY - 200);
        }
        setTimeout(() => { nextQuestion(); }, FEEDBACK_DELAY);
      } else {
        playIncorrectSound();
        hapticError();
      }
    },
    [locked, answerQuestion, nextQuestion, isLastQuestion]
  );

  const handleContinue = useCallback(() => {
    if (isLastQuestion) playFinishSound();
    nextQuestion();
  }, [nextQuestion, isLastQuestion]);

  if (!question) return null;

  const getOptionState = (option: string) => {
    if (!locked) return "default" as const;
    if (option === question.correctAnswer) return "correct" as const;
    if (option === selectedAnswer && option !== question.correctAnswer)
      return "incorrect" as const;
    return "dimmed" as const;
  };

  const M = useMuseumTheme();

  return (
    <View style={{ flex: 1 }}>
      <ProgressBar current={currentIndex + (locked ? 1 : 0)} total={questions.length} />

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: M.sub }}>
            {t("quiz.questionOf", { current: currentIndex + 1, total: questions.length })}
          </Text>
          {lastAnswerCorrect !== null && locked && (
            <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: lastAnswerCorrect ? M.successBg : M.errorBg }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: lastAnswerCorrect ? M.success : M.error }}>
                {lastAnswerCorrect ? t("quiz.correct") : t("quiz.incorrect")}
              </Text>
            </View>
          )}
        </View>

        <QuestionTypeLabel type={question.type} />

        {question.type === "listening" && question.audioSource ? (
          <ListeningQuestion audioSource={question.audioSource} />
        ) : (
          <Text style={{ marginBottom: 32, fontSize: 20, fontWeight: "700", color: M.text }}>
            {question.prompt}
          </Text>
        )}

        {question.options.map((option, idx) => (
          <OptionCard
            key={`${question.id}-${idx}`}
            label={option}
            state={getOptionState(option)}
            onPress={() => handleSelect(option)}
          />
        ))}

        {locked && lastAnswerCorrect === false && (
          <View style={{ marginTop: 12, borderRadius: 16, backgroundColor: M.errorBg, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: M.errorBorder }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <IconSymbol name="lightbulb.fill" size={14} color={M.warning} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: M.warning }}>
                {t("quiz.correctAnswerLabel")}
              </Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 14, fontWeight: "700", color: M.text }}>
              {question.correctAnswer}
            </Text>
            {question.explanation && (
              <Text style={{ marginTop: 4, fontSize: 12, color: M.sub }}>
                {question.explanation}
              </Text>
            )}
            {question.exampleSentence && (
              <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: M.errorBorder, paddingTop: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: M.muted }}>
                  {t("wordDetail.example")}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, fontStyle: "italic", color: M.sub }}>
                  {question.exampleSentence}
                </Text>
                {question.exampleSentenceTranslation && (
                  <Text style={{ marginTop: 2, fontSize: 12, color: M.muted }}>
                    {question.exampleSentenceTranslation}
                  </Text>
                )}
              </View>
            )}
            <Pressable
              onPress={handleContinue}
              style={{ marginTop: 12, alignItems: "center", borderRadius: 12, backgroundColor: M.error, paddingVertical: 12 }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>
                {t("common.continue")}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function ResultsView({ languageId }: { languageId: string }) {
  const M = useMuseumTheme();
  const { t } = useTranslation();
  const { getResult, reset, startQuiz, questions, answeredQuestions } = useQuizStore();
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const invalidateDailyChallenges = useInvalidateDailyChallenges();
  const result = getResult();
  const startTime = useQuizStore((s) => s.startTime);
  const [xpResult, setXpResult] = useState<{ xpEarned: number; leveledUp: boolean } | null>(null);

  useEffect(() => {
    hapticHeavy();
    const post = async () => {
      try {
        const token = await getToken();
        const durationMs = Date.now() - startTime;
        const res = await apiFetch<{ xpEarned: number; leveledUp: boolean; newLevel?: number }>("/quiz-results", {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({
            languageId,
            score: result.correctCount,
            accuracy: result.accuracy,
            durationMs,
            questionCount: result.totalQuestions,
          }),
        });
        setXpResult({ xpEarned: res.xpEarned, leveledUp: res.leveledUp });
        queryClient.invalidateQueries({ queryKey: ["progress"] });
        invalidateDailyChallenges();
        analytics.quizFinished(languageId, result.accuracy, durationMs);
      } catch {
        // non-blocking — results display even if save fails
        analytics.quizFinished(languageId, result.accuracy, 0);
      }
    };
    post();
  }, []);

  const scoreValue = result.accuracy >= 80 ? M.success : result.accuracy >= 50 ? M.accent : M.error;
  const scoreBg = result.accuracy >= 80 ? M.successBg : result.accuracy >= 50 ? M.accentGlow : M.errorBg;

  const mins = Math.floor(result.timeElapsed / 60);
  const secs = result.timeElapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const handleTryAgain = () => {
    const reshuffled = [...questions].sort(() => Math.random() - 0.5);
    const reshuffledQuestions = reshuffled.map((q) => ({
      ...q,
      options: [...q.options].sort(() => Math.random() - 0.5),
    }));
    startQuiz(reshuffledQuestions);
  };

  const missedItems = answeredQuestions
    .filter((a) => !a.correct)
    .map((a) => ({ ...a, question: questions.find((q) => q.id === a.questionId) }))
    .filter((a) => a.question != null);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 32, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: "center" }}>
        <View style={{ marginBottom: 24, height: 112, width: 112, alignItems: "center", justifyContent: "center", borderRadius: 56, backgroundColor: scoreBg, borderWidth: 2, borderColor: scoreValue }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: scoreValue }}>
            {result.correctCount}/{result.totalQuestions}
          </Text>
        </View>

        <Text style={{ marginBottom: 8, fontSize: 40, fontWeight: "700", color: scoreValue }}>
          {result.accuracy}%
        </Text>
        {xpResult && (
          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ borderRadius: 999, backgroundColor: M.accentGlow, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: M.accentBorder }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: M.accent }}>
                {t("quiz.xpEarned", { xp: xpResult.xpEarned })}
              </Text>
            </View>
            {xpResult.leveledUp && (
              <View style={{ borderRadius: 999, backgroundColor: "#a78bfa20", paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: "#a78bfa40" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#a78bfa" }}>
                  {t("quiz.leveledUp")}
                </Text>
              </View>
            )}
          </View>
        )}
        <Text style={{ marginBottom: 24, fontSize: 16, color: M.sub }}>
          {t("quiz.completedIn", { time: timeStr })}
        </Text>

        <View style={{ width: "100%", gap: 12 }}>
          <Pressable onPress={handleTryAgain} style={{ alignItems: "center", borderRadius: 12, backgroundColor: M.accent, paddingVertical: 16 }} className="active:opacity-80">
            <Text style={{ fontSize: 16, fontWeight: "600", color: M.ink }}>{t("quiz.tryAgain")}</Text>
          </Pressable>
          <Pressable onPress={() => { reset(); router.back(); }} style={{ alignItems: "center", borderRadius: 12, borderWidth: 2, borderColor: M.border, paddingVertical: 16 }} className="active:opacity-80">
            <Text style={{ fontSize: 16, fontWeight: "600", color: M.sub }}>{t("quiz.backToLearn")}</Text>
          </Pressable>
        </View>
      </View>

      {missedItems.length > 0 && (
        <View style={{ marginTop: 32 }}>
          <Text style={{ marginBottom: 12, fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: M.muted }}>
            {t(missedItems.length === 1 ? "quiz.missedCount_one" : "quiz.missedCount_other", { count: missedItems.length })}
          </Text>
          {missedItems.map(({ question, selectedAnswer }) => (
            <View key={question!.id} style={{ marginBottom: 12, borderRadius: 16, backgroundColor: M.errorBg, padding: 16, borderWidth: 1, borderColor: M.errorBorder }}>
              <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: "600", color: M.text }}>{question!.prompt}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconSymbol name="xmark.circle.fill" size={14} color={M.error} />
                <Text style={{ fontSize: 12, color: M.muted, textDecorationLine: "line-through" }}>{selectedAnswer}</Text>
              </View>
              <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconSymbol name="checkmark.circle.fill" size={14} color={M.success} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: M.success }}>{question!.correctAnswer}</Text>
              </View>
              {question!.exampleSentence && (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: M.errorBorder, paddingTop: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: M.muted }}>{t("wordDetail.example")}</Text>
                  <Text style={{ marginTop: 2, fontSize: 11, fontStyle: "italic", color: M.sub }}>{question!.exampleSentence}</Text>
                  {question!.exampleSentenceTranslation && (
                    <Text style={{ marginTop: 2, fontSize: 11, color: M.muted }}>{question!.exampleSentenceTranslation}</Text>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function EmptyView() {
  const M = useMuseumTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { reset } = useQuizStore();

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: M.card, borderWidth: 1, borderColor: M.border, marginBottom: 16 }}>
        <IconSymbol name="character.book.closed" size={36} color={M.muted} />
      </View>
      <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: M.text }}>
        {t("quiz.notEnoughVocab")}
      </Text>
      <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: M.sub }}>
        {t("quiz.notEnoughVocabDesc")}
      </Text>
      <Pressable
        onPress={() => { reset(); router.back(); }}
        style={{ marginTop: 24, borderRadius: 12, backgroundColor: M.accent, paddingHorizontal: 32, paddingVertical: 12 }}
        className="active:opacity-80"
      >
        <Text style={{ fontWeight: "600", color: M.ink }}>{t("common.goBack")}</Text>
      </Pressable>
    </View>
  );
}

export default function QuizScreen() {
  const M = useMuseumTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    courseId?: string;
    category?: string;
    focusWord?: string;
    focusEnglish?: string;
    focusAudio?: string;
    lessonId?: string;
  }>();
  const { selectedLanguageId } = useLanguageStore();
  const { data: dictionaryEntries = [], isLoading: isDictLoading } = useDictionary(selectedLanguageId);
  const { data: lessonData, isLoading: isLessonLoading } = useLesson(params.lessonId ?? "");

  // When lessonId is provided, filter dictionary to words that appear in the lesson transcript.
  // Falls back to full dictionary if fewer than 4 matches (not enough for distractors).
  const activeEntries = useMemo(() => {
    if (!params.lessonId || !lessonData?.transcript?.length) return dictionaryEntries;
    const transcriptWords = new Set(
      lessonData.transcript.flatMap((seg) =>
        seg.text.split(/\s+/).map((w) => w.toLowerCase().replace(/[.,!?;:'"()\[\]]/g, "").trim())
      ).filter(Boolean)
    );
    const matches = dictionaryEntries.filter((e) =>
      transcriptWords.has(e.word.toLowerCase().trim())
    );
    return matches.length >= 4 ? matches : dictionaryEntries;
  }, [params.lessonId, lessonData, dictionaryEntries]);
  const { phase, startQuiz, reset } = useQuizStore();
  const [isEmpty, setIsEmpty] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const initialized = useRef(false);

  // Reset quiz state on unmount so a dismissed mid-quiz doesn't persist into the next visit
  useEffect(() => {
    return () => { reset(); };
  }, [reset]);

  const isFocused = !!params.focusWord && !!params.focusEnglish;
  const languageName = getLanguageName(selectedLanguageId);
  const quizTitle = isFocused
    ? t("quiz.practiceTitle", { word: params.focusWord })
    : t("quiz.quizTitle", { language: languageName });

  const makeTq = useCallback(
    () => (key: string, opts?: Record<string, unknown>) =>
      t(key as any, { language: languageName, ...opts } as any),
    [t, languageName]
  );

  // Once dictionary (and lesson, if applicable) data loads: auto-start focused quizzes, show config for regular quizzes
  useEffect(() => {
    if (initialized.current) return;
    if (isDictLoading) return;
    if (params.lessonId && isLessonLoading) return;
    initialized.current = true;

    const tq = makeTq();

    if (isFocused) {
      const questions = generateFocusedQuiz(
        params.focusWord!,
        params.focusEnglish!,
        params.focusAudio || undefined,
        dictionaryEntries,
        tq
      );
      if (questions.length === 0) {
        setIsEmpty(true);
      } else {
        startQuiz(questions);
        analytics.quizStarted(selectedLanguageId, questions.length);
      }
    } else {
      // Check there's enough vocabulary before showing the config screen
      const test = generateQuiz(
        { languageId: selectedLanguageId, courseId: params.courseId, category: params.category, questionCount: 5 },
        activeEntries,
        undefined,
        tq
      );
      if (test.length === 0) {
        setIsEmpty(true);
      } else {
        setConfigReady(true);
      }
    }
  }, [isDictLoading, isLessonLoading]);

  const handleStart = useCallback(
    (count: number) => {
      const tq = makeTq();
      const questions = generateQuiz(
        {
          languageId: selectedLanguageId,
          courseId: params.courseId,
          category: params.category,
          questionCount: count,
        },
        activeEntries,
        undefined,
        tq
      );
      if (questions.length === 0) {
        setIsEmpty(true);
      } else {
        startQuiz(questions);
        analytics.quizStarted(selectedLanguageId, questions.length);
      }
    },
    [selectedLanguageId, params.courseId, params.category, activeEntries, makeTq, startQuiz]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: quizTitle,
          headerShown: true,
          presentation: "modal",
          headerLeft: () => (
            <Pressable
              onPress={() => {
                reset();
                router.back();
              }}
              hitSlop={8}
            >
              <IconSymbol name="xmark" size={22} color={M.textDim} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={[]}>
        {isEmpty ? (
          <EmptyView />
        ) : phase === "results" ? (
          <ResultsView languageId={selectedLanguageId} />
        ) : phase === "active" ? (
          <ActiveView />
        ) : configReady ? (
          <ConfigView onStart={handleStart} />
        ) : null}
      </SafeAreaView>
    </>
  );
}
