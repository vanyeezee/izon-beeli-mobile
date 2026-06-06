import { IconSymbol } from "@/components/ui/icon-symbol";
import { apiFetch } from "@/lib/api";
import { hapticError, hapticHeavy, hapticSuccess, hapticTap } from "@/lib/haptics";
import { useDictionary } from "@/lib/hooks/use-dictionary";
import { useWordsDueForReview } from "@/lib/hooks/use-wordbank";
import { playCorrectSound, playFinishSound, playIncorrectSound } from "@/lib/sounds";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import type { DictionaryEntry } from "@/lib/dictionary";
import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GRID_SIZE = 5;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const FREE_CELL = Math.floor(TOTAL_TILES / 2); // index 12 = center

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

interface BingoTile {
  word: string;
  english: string;
  isFree: boolean;
  marked: boolean;
}

function checkBingo(tiles: BingoTile[]): boolean {
  const marked = (i: number) => tiles[i]?.marked;
  // Rows
  for (let r = 0; r < GRID_SIZE; r++) {
    if ([0, 1, 2, 3, 4].every((c) => marked(r * GRID_SIZE + c))) return true;
  }
  // Cols
  for (let c = 0; c < GRID_SIZE; c++) {
    if ([0, 1, 2, 3, 4].every((r) => marked(r * GRID_SIZE + c))) return true;
  }
  // Diagonals
  if ([0, 6, 12, 18, 24].every(marked)) return true;
  if ([4, 8, 12, 16, 20].every(marked)) return true;
  return false;
}

function buildGrid(entries: DictionaryEntry[]): BingoTile[] {
  const pool = shuffle(entries).slice(0, TOTAL_TILES - 1);
  const tiles: BingoTile[] = pool.map((e) => ({ word: e.word, english: e.english, isFree: false, marked: false }));
  tiles.splice(FREE_CELL, 0, { word: "FREE", english: "FREE", isFree: true, marked: true });
  return tiles;
}

function TileView({ tile, index, onPress, shake }: { tile: BingoTile; index: number; onPress: () => void; shake: boolean }) {
  const M = useMuseumTheme();
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shake) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [shake]);

  const bg = tile.isFree
    ? M.accent
    : tile.marked
    ? `${M.accent}20`
    : M.card;
  const borderColor = tile.isFree
    ? M.accent
    : tile.marked
    ? M.accent
    : M.border;
  const textColor = tile.isFree
    ? M.ink
    : tile.marked
    ? M.accent
    : M.text;

  return (
    <Animated.View style={{ transform: [{ translateX: shakeAnim }], flex: 1 }}>
      <Pressable
        onPress={onPress}
        disabled={tile.marked}
        style={{
          flex: 1,
          aspectRatio: 1,
          borderRadius: 8,
          borderWidth: tile.marked ? 1.5 : 1,
          borderColor,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 3,
        }}
        className="active:opacity-70"
      >
        <Text
          style={{ fontSize: 9, fontWeight: tile.isFree ? "900" : "600", color: textColor, textAlign: "center", lineHeight: 12 }}
          numberOfLines={3}
        >
          {tile.isFree ? "FREE" : tile.word}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function RecallBingoScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const selectedLanguageId = useLanguageStore((s) => s.selectedLanguageId);
  const { data: dueWords = [] } = useWordsDueForReview(selectedLanguageId);
  const { data: allWords = [] } = useDictionary(selectedLanguageId);

  const [phase, setPhase] = useState<"idle" | "active" | "won">("idle");
  const [tiles, setTiles] = useState<BingoTile[]>([]);
  const [currentCallWord, setCurrentCallWord] = useState<{ word: string; english: string } | null>(null);
  const [callQueue, setCallQueue] = useState<{ word: string; english: string }[]>([]);
  const [shakeTile, setShakeTile] = useState<number | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [correctHits, setCorrectHits] = useState(0);
  const callIndexRef = useRef(0);

  const startGame = useCallback(() => {
    const pool: DictionaryEntry[] = dueWords.length >= TOTAL_TILES - 1
      ? dueWords
      : [...dueWords, ...allWords.filter((e) => !dueWords.find((d) => d.id === e.id))];

    if (pool.length < TOTAL_TILES - 1) return;

    const grid = buildGrid(pool);
    const callOrder = shuffle(grid.filter((t) => !t.isFree));
    setTiles(grid);
    setCallQueue(callOrder);
    setCurrentCallWord(callOrder[0] ?? null);
    callIndexRef.current = 0;
    setStartTime(Date.now());
    setCorrectHits(0);
    setPhase("active");
  }, [dueWords, allWords]);

  const nextCall = useCallback((q: { word: string; english: string }[]) => {
    const next = callIndexRef.current + 1;
    callIndexRef.current = next;
    setCurrentCallWord(q[next] ?? null);
  }, []);

  const handleTilePress = useCallback((tileIndex: number) => {
    if (phase !== "active" || !currentCallWord) return;
    const tile = tiles[tileIndex];
    if (!tile || tile.marked) return;

    if (tile.word === currentCallWord.word) {
      hapticSuccess();
      playCorrectSound();
      Speech.speak(currentCallWord.english, { language: "en", rate: 0.9 });
      const updated = tiles.map((t, i) =>
        i === tileIndex ? { ...t, marked: true } : t
      );
      setTiles(updated);
      setCorrectHits((h) => h + 1);

      if (checkBingo(updated)) {
        hapticHeavy();
        playFinishSound();
        setPhase("won");
        const duration = Math.round((Date.now() - startTime) / 1000);
        getToken().then((token) => {
          if (!token) return;
          apiFetch("/quiz-results", {
            method: "POST",
            token,
            body: JSON.stringify({ languageId: selectedLanguageId, score: correctHits + 1, accuracy: 100, durationMs: duration * 1000, questionCount: 25 }),
          }).catch(() => {});
        });
      } else {
        nextCall(callQueue);
      }
    } else {
      hapticError();
      playIncorrectSound();
      setShakeTile(tileIndex);
      setTimeout(() => setShakeTile(null), 400);
    }
  }, [phase, currentCallWord, tiles, callQueue, startTime, correctHits, nextCall, getToken]);

  const readWord = useCallback(() => {
    if (currentCallWord) {
      Speech.speak(currentCallWord.english, { language: "en", rate: 0.85 });
      hapticTap();
    }
  }, [currentCallWord]);

  const canStart = dueWords.length + allWords.length >= TOTAL_TILES - 1;

  if (phase === "idle") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Recall Bingo", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: `${M.accent}15`, marginBottom: 20 }}>
            <IconSymbol name="square.grid.3x3.fill" size={40} color={M.accent} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: "900", color: M.text, textAlign: "center" }}>Recall Bingo</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center", marginTop: 8, lineHeight: 22 }}>
            A word is called — tap the matching tile on your card. Get a line to win!
          </Text>
          {!canStart && (
            <Text style={{ marginTop: 12, fontSize: 12, color: M.error, textAlign: "center" }}>
              Not enough words available yet. Keep learning to unlock Bingo!
            </Text>
          )}
          <Pressable
            onPress={startGame}
            disabled={!canStart}
            style={{ marginTop: 32, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, backgroundColor: canStart ? M.accent : M.border }}
            className="active:opacity-80"
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: M.ink }}>Play</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "won") {
    const duration = Math.round((Date.now() - startTime) / 1000);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Recall Bingo", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 64, marginBottom: 8 }}>🎉</Text>
          <Text style={{ fontSize: 32, fontWeight: "900", color: M.accent, marginBottom: 8 }}>BINGO!</Text>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>
            {correctHits} tiles marked · {timeStr}
          </Text>
          <View style={{ width: "100%", gap: 10, marginTop: 32 }}>
            <Pressable onPress={startGame} style={{ borderRadius: 14, paddingVertical: 16, backgroundColor: M.accent, alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>New Card</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: M.border, alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: M.text }}>Back to Discover</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Recall Bingo", headerBackTitle: "Back" }} />

      {/* Call word banner */}
      <Pressable
        onPress={readWord}
        style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 16, backgroundColor: M.card, borderWidth: 1, borderColor: M.border, borderLeftWidth: 4, borderLeftColor: M.accent, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
        className="active:opacity-70"
      >
        <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${M.accent}15` }}>
          <IconSymbol name="speaker.wave.2.fill" size={18} color={M.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 2, color: M.accent }}>FIND THIS WORD</Text>
          <Text style={{ fontSize: 22, fontWeight: "900", color: M.text, marginTop: 2 }}>
            {currentCallWord?.english ?? "—"}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: M.muted }}>Tap to hear</Text>
      </Pressable>

      {/* Grid */}
      <View style={{ flex: 1, padding: 16, gap: 4 }}>
        {Array.from({ length: GRID_SIZE }).map((_, row) => (
          <View key={row} style={{ flex: 1, flexDirection: "row", gap: 4 }}>
            {Array.from({ length: GRID_SIZE }).map((_, col) => {
              const tileIndex = row * GRID_SIZE + col;
              const tile = tiles[tileIndex];
              if (!tile) return null;
              return (
                <TileView
                  key={tileIndex}
                  tile={tile}
                  index={tileIndex}
                  onPress={() => handleTilePress(tileIndex)}
                  shake={shakeTile === tileIndex}
                />
              );
            })}
          </View>
        ))}
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Text style={{ fontSize: 11, color: M.muted, textAlign: "center" }}>
          {correctHits} tiles matched
        </Text>
      </View>
    </SafeAreaView>
  );
}
