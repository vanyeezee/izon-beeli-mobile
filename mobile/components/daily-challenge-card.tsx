import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useRegenerateDailyChallenges, useTodayChallenges } from "@/lib/hooks/use-daily-challenge";
import { ApiError } from "@/lib/api";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useTranslation } from "react-i18next";
import type { ChallengeType, DailyChallenge } from "@/types";

const CHALLENGE_CONFIG: Record<
  ChallengeType,
  { icon: string; color: string; route: string }
> = {
  complete_quiz: { icon: "trophy.fill", color: "#f59e0b", route: "/quiz" },
  review_words: { icon: "brain.fill", color: "#8b5cf6", route: "/word-review" },
  listen_lesson: { icon: "headphones", color: "#3b82f6", route: "/(tabs)/learn" },
  complete_lesson: { icon: "checkmark.circle.fill", color: "#22c55e", route: "/(tabs)/learn" },
  save_words: { icon: "bookmark.fill", color: "#ec4899", route: "/dictionary" },
};

function ChallengeItem({ challenge }: { challenge: DailyChallenge }) {
  const M = useMuseumTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const config = CHALLENGE_CONFIG[challenge.challengeType] ?? {
    icon: "star.fill",
    color: "#3b82f6",
    route: "/(tabs)/learn",
  };

  const progress = Math.min(challenge.progress / challenge.target, 1);

  return (
    <Pressable
      onPress={() => router.push(config.route as any)}
      style={{ borderRadius: 12, backgroundColor: M.card, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: M.border }}
      className="active:opacity-70"
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{ marginRight: 10, height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: `${config.color}20` }}
        >
          <IconSymbol name={config.icon as any} size={17} color={config.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", color: M.muted }}>
              {challenge.title}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: "600", color: config.color }}>
              +{challenge.xpReward} XP
            </Text>
          </View>
          <View style={{ marginTop: 4, height: 4, borderRadius: 999, backgroundColor: M.border }}>
            <View
              style={{
                height: "100%", borderRadius: 999,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: challenge.completed ? M.success : config.color,
              }}
            />
          </View>
          <Text style={{ marginTop: 2, fontSize: 10, color: M.muted }}>
            {challenge.progress} / {challenge.target}
            {challenge.completed && (
              <Text style={{ fontWeight: "600", color: M.success }}> · {t("learn.complete")}</Text>
            )}
          </Text>
        </View>
        {challenge.completed ? (
          <IconSymbol name="checkmark.circle.fill" size={18} color={M.success} style={{ marginLeft: 8 }} />
        ) : (
          <IconSymbol name="chevron.right" size={14} color={M.muted} style={{ marginLeft: 8 }} />
        )}
      </View>
    </Pressable>
  );
}

export function DailyChallengeCards() {
  const { t } = useTranslation();
  const M = useMuseumTheme();
  const { data: challenges, isLoading } = useTodayChallenges();
  const regenerate = useRegenerateDailyChallenges();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await regenerate();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        Alert.alert("", t("dailyChallenge.refreshBlocked"));
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading || !challenges?.length) return null;

  const allCompleted = challenges.every((c) => c.completed);

  return (
    <View style={{ gap: 12 }}>
      {challenges.map((challenge) => (
        <ChallengeItem key={challenge.id} challenge={challenge} />
      ))}
      {!allCompleted && (
        <Pressable
          onPress={handleRefresh}
          disabled={isRefreshing}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4, opacity: isRefreshing ? 0.5 : 1 }}
          className="active:opacity-60"
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={M.muted} />
          ) : (
            <>
              <IconSymbol name="arrow.clockwise" size={13} color={M.muted} />
              <Text style={{ fontSize: 12, color: M.muted }}>
                {t("dailyChallenge.refresh")}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
