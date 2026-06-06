import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { MatchingBoard } from "@/components/quiz/matching-board";
import { useMatchingStore } from "@/store/matching-store";
import { generateMatchingPairs } from "@/lib/quiz-engine";
import { useLanguageStore } from "@/store/language-store";
import { useDictionary } from "@/lib/hooks/use-dictionary";
import { getLanguageName } from "@/lib/mock-data";
import { hapticHeavy } from "@/lib/haptics";
import { playFinishSound } from "@/lib/sounds";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";

export default function MatchingGameScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ courseId?: string }>();
  const { selectedLanguageId } = useLanguageStore();
  const { data: dictionaryEntries = [], isLoading: isDictLoading } = useDictionary(selectedLanguageId);
  const { phase, startGame, getResult, reset } = useMatchingStore();
  const [isEmpty, setIsEmpty] = useState(false);
  const initialized = useRef(false);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const languageName = getLanguageName(selectedLanguageId);
  const { t } = useTranslation();

  useEffect(() => {
    if (initialized.current) return;
    if (isDictLoading) return;
    initialized.current = true;

    const pairs = generateMatchingPairs(
      {
        languageId: selectedLanguageId,
        courseId: params.courseId,
        pairCount: 8,
      },
      dictionaryEntries
    );

    if (pairs.length === 0) {
      setIsEmpty(true);
    } else {
      startGame(pairs);
    }
  }, [isDictLoading]);

  useEffect(() => {
    if (phase !== "results") return;
    hapticHeavy();
    playFinishSound();
    const result = getResult();
    const post = async () => {
      try {
        const token = await getToken();
        await apiFetch("/matching-results", {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({
            languageId: selectedLanguageId,
            accuracy: result.accuracy,
            totalPairs: result.totalPairs,
            durationMs: result.timeElapsed * 1000,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["progress"] });
      } catch {
        // non-blocking
      }
    };
    post();
  }, [phase]);

  const handlePlayAgain = useCallback(() => {
    const pairs = generateMatchingPairs(
      {
        languageId: selectedLanguageId,
        courseId: params.courseId,
        pairCount: 8,
      },
      dictionaryEntries
    );
    if (pairs.length > 0) {
      startGame(pairs);
    }
  }, [selectedLanguageId, params.courseId, dictionaryEntries, startGame]);

  const result = phase === "results" ? getResult() : null;

  const headerLeft = useCallback(
    () => (
      <Pressable onPress={() => { reset(); router.back(); }} hitSlop={8}>
        <IconSymbol name="xmark" size={22} color={M.muted} />
      </Pressable>
    ),
    [reset, router, M.muted]
  );

  const screenOptions = useMemo(
    () => ({
      title: `${languageName} ${t("matching.titleSuffix")}`,
      headerShown: true,
      presentation: "modal" as const,
      headerLeft,
    }),
    [languageName, t, headerLeft]
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={[]}>
        {isEmpty ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <IconSymbol name="rectangle.grid.2x2" size={56} color={M.border} />
            <Text style={{ marginTop: 16, textAlign: "center", fontSize: 17, fontWeight: "600", color: M.sub }}>
              {t("matching.notEnoughVocab")}
            </Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: M.muted }}>
              {t("matching.notEnoughVocabDesc")}
            </Text>
            <Pressable
              onPress={() => { reset(); router.back(); }}
              style={{ marginTop: 24, borderRadius: 12, backgroundColor: M.accent, paddingHorizontal: 32, paddingVertical: 12 }}
              className="active:opacity-80"
            >
              <Text style={{ fontWeight: "600", color: M.ink }}>{t("matching.goBack")}</Text>
            </Pressable>
          </View>
        ) : phase === "results" && result ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <View style={{ marginBottom: 24, height: 112, width: 112, alignItems: "center", justifyContent: "center", borderRadius: 56, backgroundColor: M.successBg, borderWidth: 1, borderColor: M.successBorder }}>
              <Text style={{ fontSize: 28, fontWeight: "700", color: M.success }}>{result.accuracy}%</Text>
            </View>

            <Text style={{ marginBottom: 8, fontSize: 24, fontWeight: "700", color: M.text }}>{t("matching.allMatched")}</Text>
            <Text style={{ marginBottom: 4, fontSize: 15, color: M.sub }}>
              {t("matching.pairsAttempts", { total: result.totalPairs, attempts: result.attempts })}
            </Text>
            <Text style={{ marginBottom: 24, fontSize: 15, color: M.sub }}>
              {t("matching.time", { time: result.timeElapsed })}
            </Text>

            <View style={{ width: "100%", gap: 12 }}>
              <Pressable
                onPress={handlePlayAgain}
                style={{ alignItems: "center", borderRadius: 12, backgroundColor: M.accent, paddingVertical: 16 }}
                className="active:opacity-80"
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: M.ink }}>{t("matching.playAgain")}</Text>
              </Pressable>
              <Pressable
                onPress={() => { reset(); router.back(); }}
                style={{ alignItems: "center", borderRadius: 12, borderWidth: 2, borderColor: M.border, paddingVertical: 16 }}
                className="active:opacity-80"
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: M.sub }}>{t("matching.backToLearn")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={{ marginBottom: 16, textAlign: "center", fontSize: 15, color: M.sub }}>
              {t("matching.instruction")}
            </Text>
            <MatchingBoard />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}
