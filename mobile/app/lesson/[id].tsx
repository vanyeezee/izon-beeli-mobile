import { AudioPlayer } from "@/components/audio/audio-player";
import { InteractiveTranscript } from "@/components/audio/interactive-transcript";
import { LevelUpModal } from "@/components/level-up-modal";
import { NotificationBanner } from "@/components/notifications/notification-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useCompletedLessons, useCompleteLesson, useTrackListen } from "@/lib/hooks/use-progress";
import { useToast } from "@/lib/hooks/use-toast";
import { useLesson } from "@/lib/hooks/use-courses";
import { getCourseTypeColors } from "@/constants/course-colors";
import { useNextLesson } from "@/lib/hooks/use-next-lesson";
import { useQueryClient } from "@tanstack/react-query";
import type { Course } from "@/types";
import { formatDuration, BUNDLED_AUDIO } from "@/lib/mock-data";
import { playFinishSound } from "@/lib/sounds";
import { hapticHeavy } from "@/lib/haptics";
import { cancelDailyStreakReminder } from "@/lib/hooks/use-daily-reminder";
import { useReviewPrompt } from "@/lib/hooks/use-review-prompt";
import { useAudioStore } from "@/store/audio-store";
import { analytics } from "@/lib/analytics";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import { useUiLanguageStore } from "@/store/ui-language-store";
import { useTourStore } from "@/store/tour-store";
import { localizeField } from "@/lib/localize";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

function animStyle(anim: Animated.Value, offsetY = 14) {
  return {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [offsetY, 0],
        }),
      },
    ],
  };
}

export default function LessonScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lesson, isLoading, isError } = useLesson(id ?? "");
  const { loadAndPlay, currentTrackId, isPlaying, togglePlayback, duration: trackDuration } = useAudioStore();
  const { data: completedLessonIds } = useCompletedLessons();
  const { selectedLanguageId } = useLanguageStore();
  const { uiLanguage } = useUiLanguageStore();
  const queryClient = useQueryClient();
  const courses = queryClient.getQueryData<Course[]>(["courses", selectedLanguageId]);
  const lessonCourse = courses?.find((c) => c.id === lesson?.courseId);
  const typeColors = getCourseTypeColors(lessonCourse?.courseType);
  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [pendingSummary, setPendingSummary] = useState(false);

  // Entrance animations
  const titleAnim  = useRef(new Animated.Value(0)).current;
  const metaAnim   = useRef(new Animated.Value(0)).current;
  const actionsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lesson) {
      Animated.stagger(60, [
        Animated.timing(titleAnim,   { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(metaAnim,    { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(actionsAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]).start();
    }
  }, [!!lesson]);

  useEffect(() => {
    if (pendingSummary && !isPlaying) {
      setShowSummary(true);
      setPendingSummary(false);
    }
  }, [pendingSummary, isPlaying]);

  const { t } = useTranslation();
  const { toast, success: toastSuccess, show: toastShow, dismiss: dismissToast } = useToast();
  const { data: nextLessonData } = useNextLesson(selectedLanguageId);
  const showTour = useTourStore((s) => s.showTour);
  const hasSeen = useTourStore((s) => s.hasSeen);
  const reviewPrompt = useReviewPrompt();
  const completeLesson = useCompleteLesson({
    onLevelUp: (level, title) => {
      analytics.levelUp(level, title);
      setLevelUp({ level, title });
      reviewPrompt.onLevelUp(level);
    },
    onStreakUpdate: (streak, isMilestone) => {
      reviewPrompt.onStreakUpdate(streak);
      if (isMilestone) {
        toastShow(
          t("streak.toastMilestoneTitle", { count: streak }),
          t("streak.toastMilestoneBody"),
          "success"
        );
      } else {
        toastSuccess(t("streak.toastTitle", { count: streak }));
      }
    },
  });
  const trackListen = useTrackListen();

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: t("lesson.title"), headerStyle: { backgroundColor: M.ink }, headerTintColor: M.parchment }} />
        <LoadingScreen />
      </>
    );
  }

  if (isError || !lesson) {
    return (
      <>
        <Stack.Screen options={{ title: t("lesson.title"), headerStyle: { backgroundColor: M.ink }, headerTintColor: M.parchment }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: M.bg }}>
          <IconSymbol name="book.fill" size={40} color={M.textDimDark} />
          <Text style={{ marginTop: 12, fontSize: 15, color: M.sub }}>{t("lesson.notFound")}</Text>
        </View>
      </>
    );
  }

  const audioSource = lesson.audioUrl ?? BUNDLED_AUDIO[lesson.id];
  const isCurrentTrack = currentTrackId === lesson.id;
  const completed = completedLessonIds?.includes(lesson.id) ?? false;
  const isSong = lesson.type === "song";
  const lessonTitle = localizeField(lesson.title, lesson.titleFr, uiLanguage);
  const lessonDescription = localizeField(lesson.description, lesson.descriptionFr, uiLanguage);
  const accentColor = typeColors.tickActive ?? M.accent;

  const handlePlayAudio = () => {
    if (isCurrentTrack) {
      togglePlayback();
    } else if (audioSource) {
      loadAndPlay(lesson.id, audioSource, lessonTitle);
      trackListen.mutate(lesson.id);
      analytics.lessonStarted(lesson.id, selectedLanguageId);
    }
  };

  const handleMarkComplete = () => {
    completeLesson.mutate(lesson.id);
    playFinishSound();
    hapticHeavy();
    analytics.lessonCompleted(lesson.id, selectedLanguageId);
    cancelDailyStreakReminder().catch(() => {});

    if (isCurrentTrack && isPlaying) {
      setPendingSummary(true);
    } else {
      setShowSummary(true);
    }

    setTimeout(() => {
      if (!hasSeen("journal")) {
        showTour("journal");
      } else if (!hasSeen("practice")) {
        showTour("practice");
      }
    }, 1500);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerStyle: { backgroundColor: M.ink },
          headerTintColor: M.parchment,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: M.ink }} edges={[]}>

        {/* ── Museum Foyer Header ── */}
        <View style={{ backgroundColor: M.ink, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}>

          {/* Course type label */}
          {lessonCourse?.courseType && typeColors.label ? (
            <Animated.View style={[{ alignSelf: "flex-start", marginBottom: 10 }, animStyle(metaAnim, 8)]}>
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 6,
              }}>
                <View style={{ width: 20, height: 1, backgroundColor: `${accentColor}80` }} />
                <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 1.8, textTransform: "uppercase", color: `${accentColor}B0` }}>
                  {typeColors.label}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          {/* Title row */}
          <Animated.View style={[{ flexDirection: "row", alignItems: "flex-start", gap: 10 }, animStyle(titleAnim, 14)]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 26, fontWeight: "900", color: M.parchment, letterSpacing: -0.4, lineHeight: 30 }}>
                {lessonTitle}
              </Text>
              {isSong && lesson.artist ? (
                <Text style={{ marginTop: 3, fontSize: 11, color: M.textDimDark }}>
                  {lesson.artist}{lesson.genre ? ` · ${t(`songs.genre_${lesson.genre}`, { defaultValue: lesson.genre })}` : ""}
                </Text>
              ) : null}
            </View>

            {completed && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                backgroundColor: M.successBg,
                borderWidth: 1, borderColor: M.successBorder,
              }}>
                <IconSymbol name="checkmark.circle.fill" size={12} color={M.success} />
                <Text style={{ fontSize: 10, fontWeight: "800", color: M.success, letterSpacing: 0.5 }}>
                  {t("lesson.done").toUpperCase()}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Duration meta */}
          {lesson.duration ? (
            <Animated.View style={[{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }, animStyle(metaAnim, 8)]}>
              <IconSymbol name="clock" size={11} color={M.textDimDark} />
              <Text style={{ fontSize: 11, color: M.textDimDark, fontVariant: ["tabular-nums"] }}>
                {formatDuration(lesson.duration)}
              </Text>
            </Animated.View>
          ) : null}

          {/* Action buttons */}
          <Animated.View style={[{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 }, animStyle(actionsAnim, 10)]}>

            {audioSource && (
              <Pressable
                onPress={handlePlayAudio}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                  backgroundColor: accentColor,
                }}
                className="active:opacity-75"
                accessibilityRole="button"
                accessibilityLabel={isCurrentTrack && isPlaying ? t("lesson.pause") : t("lesson.play")}
              >
                <IconSymbol
                  name={isCurrentTrack && isPlaying ? "pause.fill" : "play.fill"}
                  size={15}
                  color={M.ink}
                />
                <Text style={{ fontSize: 13, fontWeight: "800", color: M.ink }}>
                  {isCurrentTrack && isPlaying ? t("lesson.pause") : isCurrentTrack ? t("lesson.resume") : t("lesson.play")}
                </Text>
                {(isCurrentTrack ? trackDuration > 0 : !!lesson.duration) && (
                  <Text style={{ fontSize: 11, color: `${M.ink}99`, fontVariant: ["tabular-nums"] }}>
                    {isCurrentTrack ? formatDuration(trackDuration) : formatDuration(lesson.duration!)}
                  </Text>
                )}
              </Pressable>
            )}

            {!completed && (
              <Pressable
                onPress={handleMarkComplete}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 7,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: M.successBorder,
                  backgroundColor: M.successBg,
                }}
                className="active:opacity-75"
                accessibilityRole="button"
                accessibilityLabel={isSong ? t("songs.listened") : t("lesson.markComplete")}
              >
                <IconSymbol name="checkmark.circle.fill" size={14} color={M.success} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: M.success }}>
                  {isSong ? t("songs.listened") : t("lesson.markComplete")}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/quiz",
                  params: { courseId: lesson.courseId, lessonId: lesson.id },
                })
              }
              style={{
                flexDirection: "row", alignItems: "center", gap: 7,
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
                borderWidth: 1,
                borderColor: `${accentColor}40`,
                backgroundColor: `${accentColor}12`,
              }}
              className="active:opacity-75"
              accessibilityRole="button"
              accessibilityLabel={t("lesson.practice")}
            >
              <IconSymbol name="trophy.fill" size={14} color={accentColor} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: accentColor }}>
                {t("lesson.practice")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* ── Content area ── */}
        <View style={{ flex: 1, backgroundColor: M.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" }}>

          {/* Post-lesson summary */}
          {showSummary ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Trophy */}
              <View style={{ alignItems: "center", marginBottom: 24 }}>
                <View style={{
                  width: 68, height: 68, borderRadius: 34,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: M.successBg,
                  borderWidth: 1.5, borderColor: M.successBorder,
                }}>
                  <IconSymbol name="checkmark.circle.fill" size={36} color={M.success} />
                </View>
                <Text style={{ marginTop: 12, fontSize: 22, fontWeight: "900", color: M.text, letterSpacing: -0.3 }}>
                  {t("lesson.summary")}
                </Text>
              </View>

              {/* Stats */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
                {lesson.transcript && lesson.transcript.length > 0 && (
                  <View style={{
                    flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16,
                    backgroundColor: `${accentColor}10`,
                    borderWidth: 1, borderColor: `${accentColor}25`,
                  }}>
                    <Text style={{ fontSize: 26, fontWeight: "900", color: accentColor }}>
                      {new Set(
                        lesson.transcript
                          .flatMap((s) => s.text.split(/\s+/))
                          .map((w) => w.toLowerCase().replace(/[.,!?;:'"]/g, ""))
                          .filter(Boolean)
                      ).size}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: M.sub }}>
                      {t("lesson.wordsLearned")}
                    </Text>
                  </View>
                )}
                {lesson.duration && (
                  <View style={{
                    flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16,
                    backgroundColor: M.successBg,
                    borderWidth: 1, borderColor: M.successBorder,
                  }}>
                    <Text style={{ fontSize: 26, fontWeight: "900", color: M.success }}>
                      {formatDuration(lesson.duration)}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: M.sub }}>
                      {t("lesson.timeSpent")}
                    </Text>
                  </View>
                )}
              </View>

              {/* What's next label */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <View style={{ width: 16, height: 1, backgroundColor: `${accentColor}60` }} />
                <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 1.8, textTransform: "uppercase", color: M.muted }}>
                  {t("lesson.whatsNext")}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: M.border }} />
              </View>

              <View style={{ gap: 10 }}>
                {/* Next lesson CTA */}
                {nextLessonData?.lesson && nextLessonData.lesson.id !== lesson.id && (
                  <Pressable
                    onPress={() => {
                      setShowSummary(false);
                      router.replace(`/lesson/${nextLessonData.lesson!.id}`);
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "center",
                      gap: 8, paddingVertical: 16, borderRadius: 16,
                      backgroundColor: accentColor,
                    }}
                    className="active:opacity-75"
                    accessibilityRole="button"
                    accessibilityLabel={t("lesson.continueToNext")}
                  >
                    <IconSymbol name="play.fill" size={16} color={M.ink} />
                    <Text style={{ fontSize: 15, fontWeight: "800", color: M.ink }}>
                      {t("lesson.continueToNext")}
                    </Text>
                  </Pressable>
                )}

                {/* Secondary actions */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/quiz",
                        params: { courseId: lesson.courseId, lessonId: lesson.id },
                      })
                    }
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16,
                      borderWidth: 1, borderColor: `${accentColor}35`,
                      backgroundColor: `${accentColor}08`,
                    }}
                    className="active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={t("lesson.takeQuiz")}
                  >
                    <IconSymbol name="trophy.fill" size={18} color={accentColor} />
                    <Text style={{ marginTop: 5, fontSize: 12, fontWeight: "700", color: accentColor }}>
                      {t("lesson.takeQuiz")}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/word-review",
                        params: { lessonId: lesson.id },
                      })
                    }
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16,
                      borderWidth: 1, borderColor: M.successBorder,
                      backgroundColor: M.successBg,
                    }}
                    className="active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={t("lesson.reviewWords")}
                  >
                    <IconSymbol name="brain.head.profile" size={18} color={M.success} />
                    <Text style={{ marginTop: 5, fontSize: 12, fontWeight: "700", color: M.success }}>
                      {t("lesson.reviewWords")}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => router.push("/(tabs)/journal" as any)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16,
                    borderWidth: 1, borderColor: M.border,
                    backgroundColor: "transparent",
                  }}
                  className="active:opacity-70"
                  accessibilityRole="button"
                  accessibilityLabel={t("lesson.writeReflection")}
                >
                  <IconSymbol name="pencil.and.list.clipboard" size={16} color={M.muted} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: M.text }}>
                    {t("lesson.writeReflection")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowSummary(false)}
                  style={{ alignItems: "center", paddingVertical: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={isSong ? t("songs.lyrics") : t("lesson.transcript")}
                >
                  <Text style={{ fontSize: 13, color: M.sub }}>
                    {isSong ? t("songs.lyrics") : t("lesson.transcript")}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>

          ) : lesson.transcript && lesson.transcript.length > 0 ? (
            <View style={{ flex: 1 }}>
              {/* Section label */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 }}>
                <View style={{ width: 16, height: 1, backgroundColor: `${accentColor}60` }} />
                <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 1.8, textTransform: "uppercase", color: M.muted }}>
                  {isSong ? t("songs.lyrics") : t("lesson.transcript")}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: M.border }} />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <InteractiveTranscript segments={lesson.transcript} />
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name="book.fill" size={40} color={M.border} />
              <Text style={{ marginTop: 12, fontSize: 14, color: M.muted }}>
                {t("lesson.noTranscript")}
              </Text>
            </View>
          )}
        </View>

        {/* Full audio player at bottom */}
        {isCurrentTrack && <AudioPlayer />}
      </SafeAreaView>

      <LevelUpModal
        visible={!!levelUp}
        level={levelUp?.level ?? 1}
        title={levelUp?.title ?? ""}
        onDismiss={() => setLevelUp(null)}
      />

      <NotificationBanner
        visible={toast.visible}
        title={toast.title}
        body={toast.body}
        type={toast.type}
        onDismiss={dismissToast}
      />
    </>
  );
}
