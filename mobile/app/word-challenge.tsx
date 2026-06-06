import { IconSymbol } from "@/components/ui/icon-symbol";
import { apiFetch } from "@/lib/api";
import { hapticSuccess, hapticTap } from "@/lib/haptics";
import { useWordOfTheDay } from "@/lib/hooks/use-word-of-the-day";
import { useSaveWord, useWordBank } from "@/lib/hooks/use-wordbank";
import { useMuseumTheme } from "@/lib/use-museum-theme";
import { useLanguageStore } from "@/store/language-store";
import { useUiLanguageStore } from "@/store/ui-language-store";
import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Tab = "learn" | "record" | "write";

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const M = useMuseumTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: active ? M.accent : "transparent" }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? M.accent : M.muted }}>{label}</Text>
    </Pressable>
  );
}

export default function WordChallengeScreen() {
  const M = useMuseumTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const { uiLanguage } = useUiLanguageStore();
  const selectedLanguageId = useLanguageStore((s) => s.selectedLanguageId);
  const word = useWordOfTheDay(selectedLanguageId);
  const { data: savedIds } = useWordBank();
  const saveWord = useSaveWord();

  const [tab, setTab] = useState<Tab>("learn");
  const [sentenceInput, setSentenceInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDone, setRecordingDone] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const isSaved = word ? (savedIds?.includes(word.id) ?? false) : false;

  const handleSave = useCallback(() => {
    if (word && !isSaved) {
      hapticTap();
      saveWord.mutate(word.id);
    }
  }, [word, isSaved, saveWord]);

  const playWord = useCallback(async () => {
    if (!word) return;
    hapticTap();
    if (word.audioUrl && typeof word.audioUrl === "string") {
      const { sound } = await Audio.Sound.createAsync({ uri: word.audioUrl }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinish) sound.unloadAsync(); });
    } else {
      Speech.speak(word.word, { rate: 0.85 });
    }
  }, [word]);

  const startRecord = useCallback(async () => {
    hapticTap();
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setIsRecording(true);
  }, []);

  const stopRecord = useCallback(async () => {
    if (!recordingRef.current) return;
    await recordingRef.current.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDone(true);
    hapticSuccess();
  }, []);

  const submitSentence = useCallback(async () => {
    if (!sentenceInput.trim() || !word) return;
    hapticSuccess();
    const token = await getToken();
    if (token) {
      apiFetch("/word-challenge", {
        method: "POST",
        token,
        body: JSON.stringify({ wordId: word.id, sentence: sentenceInput.trim(), languageId: selectedLanguageId }),
      }).catch(() => {});
    }
    setSubmitted(true);
  }, [sentenceInput, word, getToken, selectedLanguageId]);

  if (!word) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Word Challenge", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 15, color: M.sub, textAlign: "center" }}>No word of the day available yet.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: M.accent }}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }} edges={["top"]}>
      <Stack.Screen options={{ title: "Word Challenge", headerBackTitle: "Back" }} />

      {/* Header — word display */}
      <View style={{ backgroundColor: M.ink, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <IconSymbol name="star.fill" size={12} color={M.accent} />
          <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 2, color: M.accent }}>WORD OF THE DAY</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 36, fontWeight: "900", color: M.parchment, letterSpacing: -0.5 }}>{word.word}</Text>
            {word.pronunciation && (
              <Text style={{ fontSize: 14, color: M.textDim, marginTop: 3 }}>/{word.pronunciation}/</Text>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <Pressable onPress={playWord} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: `${M.accent}15`, borderWidth: 1, borderColor: `${M.accent}30` }}>
              <IconSymbol name="speaker.wave.2.fill" size={17} color={M.accent} />
            </Pressable>
            <Pressable onPress={handleSave} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
              <IconSymbol name={isSaved ? "bookmark.fill" : "bookmark"} size={17} color={isSaved ? M.accent : M.textDim} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", backgroundColor: M.card, borderBottomWidth: 1, borderBottomColor: M.border }}>
        <TabButton label="Learn" active={tab === "learn"} onPress={() => setTab("learn")} />
        <TabButton label="Record" active={tab === "record"} onPress={() => setTab("record")} />
        <TabButton label="Write" active={tab === "write"} onPress={() => setTab("write")} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={{ flex: 1, backgroundColor: M.card }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Learn tab */}
          {tab === "learn" && (
            <View style={{ gap: 14 }}>
              <View style={{ borderRadius: 14, backgroundColor: M.bg, borderWidth: 1, borderColor: M.border, padding: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: M.muted, marginBottom: 6 }}>MEANING</Text>
                <Text style={{ fontSize: 16, color: M.text, lineHeight: 24 }}>{word.english}</Text>
                {word.french && uiLanguage === "fr" && (
                  <Text style={{ fontSize: 14, color: M.sub, marginTop: 4 }}>{word.french}</Text>
                )}
              </View>
              {word.exampleSentence && (
                <View style={{ borderRadius: 14, backgroundColor: M.bg, borderWidth: 1, borderColor: M.border, borderLeftWidth: 4, borderLeftColor: M.accent, padding: 16 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: M.accent, marginBottom: 6 }}>EXAMPLE</Text>
                  <Text style={{ fontSize: 15, fontStyle: "italic", color: M.text, lineHeight: 22 }}>{word.exampleSentence}</Text>
                  {word.exampleSentenceTranslation && (
                    <Text style={{ fontSize: 13, color: M.sub, marginTop: 6, lineHeight: 18 }}>{word.exampleSentenceTranslation}</Text>
                  )}
                </View>
              )}
              <Pressable
                onPress={() => setTab("write")}
                style={{ borderRadius: 14, paddingVertical: 14, backgroundColor: M.accent, alignItems: "center" }}
                className="active:opacity-80"
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: M.ink }}>Write a sentence →</Text>
              </Pressable>
            </View>
          )}

          {/* Record tab */}
          {tab === "record" && (
            <View style={{ alignItems: "center", gap: 20 }}>
              <Text style={{ fontSize: 14, color: M.sub, textAlign: "center", lineHeight: 20 }}>
                Pronounce the word and compare your recording to the native audio
              </Text>
              <View style={{ width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", backgroundColor: `${M.accent}12`, borderWidth: 2, borderColor: M.accent }}>
                <Text style={{ fontSize: 32, fontWeight: "900", color: M.accent }}>{word.word[0]}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
                <Pressable
                  onPress={playWord}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: `${M.accent}15`, borderWidth: 1.5, borderColor: M.accent }}
                  className="active:opacity-70"
                >
                  <IconSymbol name="speaker.wave.2.fill" size={16} color={M.accent} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: M.accent }}>Listen</Text>
                </Pressable>
                <Pressable
                  onPress={isRecording ? stopRecord : startRecord}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: isRecording ? "#ef4444" : "#ef444415", borderWidth: 1.5, borderColor: "#ef444450" }}
                  className="active:opacity-70"
                >
                  <IconSymbol name={isRecording ? "stop.fill" : "mic.fill"} size={16} color={isRecording ? "#fff" : "#ef4444"} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: isRecording ? "#fff" : "#ef4444" }}>
                    {isRecording ? "Stop" : "Record"}
                  </Text>
                </Pressable>
              </View>
              {recordingDone && (
                <View style={{ width: "100%", borderRadius: 12, padding: 14, backgroundColor: M.successBg, borderWidth: 1, borderColor: M.successBorder }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: M.success, textAlign: "center" }}>Recording saved! Compare with Listen above.</Text>
                </View>
              )}
            </View>
          )}

          {/* Write tab */}
          {tab === "write" && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: 14, color: M.sub, lineHeight: 20 }}>
                Write a sentence using <Text style={{ fontWeight: "700", color: M.text }}>{word.word}</Text>
              </Text>
              {!submitted ? (
                <>
                  <TextInput
                    value={sentenceInput}
                    onChangeText={setSentenceInput}
                    placeholder={`Use "${word.word}" in a sentence…`}
                    placeholderTextColor={M.muted}
                    multiline
                    style={{ borderRadius: 14, borderWidth: 2, borderColor: M.inputBorder, backgroundColor: M.inputBg, color: M.text, fontSize: 16, padding: 16, minHeight: 100, lineHeight: 24 }}
                  />
                  <Pressable
                    onPress={submitSentence}
                    disabled={!sentenceInput.trim()}
                    style={{ borderRadius: 14, paddingVertical: 15, backgroundColor: sentenceInput.trim() ? M.accent : M.border, alignItems: "center" }}
                    className="active:opacity-80"
                  >
                    <Text style={{ fontSize: 15, fontWeight: "700", color: M.ink }}>Submit</Text>
                  </Pressable>
                </>
              ) : (
                <View style={{ borderRadius: 14, padding: 20, backgroundColor: M.successBg, borderWidth: 1, borderColor: M.successBorder, alignItems: "center", gap: 8 }}>
                  <IconSymbol name="checkmark.circle.fill" size={32} color={M.success} />
                  <Text style={{ fontSize: 16, fontWeight: "700", color: M.success }}>Sentence submitted!</Text>
                  <Text style={{ fontSize: 13, color: M.sub, textAlign: "center" }}>Your sentence has been shared with the community.</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
