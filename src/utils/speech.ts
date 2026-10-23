import { containsBengaliScript } from './languageContext';

/**
 * Browser Web Speech API utilities for Voice Input (SpeechRecognition)
 * and Text-to-Speech (speechSynthesis) with asynchronous voice loading,
 * genuine Bengali (bn-BD / bn) voice ranking, non-destructive text preparation,
 * sentence-boundary chunking, duplicate-queue prevention, and dev-only diagnostics.
 */

export interface VoiceSummary {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export interface RankedBengaliVoice {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
  score: number;
  isNeuralOrNatural: boolean;
}

export interface TtsDiagnosticReport {
  availableVoices: Array<{ name: string; lang: string; localService: boolean }>;
  selectedBengaliVoice: { name: string; lang: string; score: number; isNeuralOrNatural: boolean } | null;
  hasSuitableBengaliVoice: boolean;
  chosenRate: number;
  chosenPitch: number;
}

export interface SpeakTextCallbacks {
  onEnd?: () => void;
  onError?: (userMessage: string) => void;
}

export interface SpeakTextResult {
  ok: boolean;
  language: 'bn' | 'en';
  reason?:
    | 'unsupported'
    | 'empty_text'
    | 'no_bengali_voice'
    | 'synthesis_error';
  userMessage?: string;
  diagnostic?: TtsDiagnosticReport;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesChangedListenerAttached = false;
let activeSpeechSessionId = 0;

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Normalizes a BCP-47 language tag (e.g. "bn_BD" -> "bn-bd").
 */
export function normalizeLangTag(lang?: string): string {
  if (!lang || typeof lang !== 'string') return '';
  return lang.trim().replace(/_/g, '-').toLowerCase();
}

/**
 * Checks whether a SpeechSynthesisVoice genuinely supports Bengali (bn-BD, bn-IN, bn, ben).
 * Never matches an English voice merely because no Bengali voice is installed.
 */
export function isGenuineBengaliVoice(
  voice: Pick<SpeechSynthesisVoice, 'name' | 'lang'>
): boolean {
  const lang = normalizeLangTag(voice.lang);
  const name = (voice.name || '').toLowerCase();

  if (
    lang === 'bn' ||
    lang === 'ben' ||
    lang.startsWith('bn-') ||
    lang.startsWith('ben-')
  ) {
    return true;
  }

  // Some mobile/OS synthesizers label language as empty/undetermined but include বাংলা/Bengali in voice name
  if (
    (!lang || lang === 'und') &&
    (name.includes('bengali') || name.includes('bangla') || name.includes('বাংলা'))
  ) {
    return true;
  }

  return false;
}

/**
 * Ranks a genuine Bengali voice by locale match (bn-BD preferred over bn-IN)
 * and voice synthesis quality metadata (Natural/Neural/Online > Google > standard > compact/eSpeak).
 */
export function scoreBengaliVoice(
  voice: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>
): { score: number; isNeuralOrNatural: boolean } {
  const lang = normalizeLangTag(voice.lang);
  const name = (voice.name || '').toLowerCase();
  let score = 0;

  // 1. Locale ranking: Bangladeshi Bengali (bn-BD) is primary target
  if (lang === 'bn-bd' || lang.startsWith('bn-bd-')) {
    score += 100;
  } else if (lang === 'bn' || lang === 'ben') {
    score += 80;
  } else if (lang === 'bn-in' || lang.startsWith('bn-in-')) {
    score += 70;
  } else if (lang.startsWith('bn-') || lang.startsWith('ben-')) {
    score += 65;
  } else {
    score += 40;
  }

  // 2. Voice name explicit Bangladesh / Bangla hints
  if (
    name.includes('bangladesh') ||
    name.includes('bn-bd') ||
    name.includes('pradeep') ||
    name.includes('nabanita')
  ) {
    score += 35;
  }

  // 3. Neural / Natural / High-quality engine indicators
  const isNeuralOrNatural =
    name.includes('natural') ||
    name.includes('neural') ||
    name.includes('wavenet') ||
    name.includes('online') ||
    name.includes('google') ||
    name.includes('premium') ||
    name.includes('enhanced');

  if (name.includes('natural') || name.includes('neural') || name.includes('wavenet')) {
    score += 60;
  } else if (name.includes('online') || name.includes('premium') || name.includes('enhanced')) {
    score += 40;
  } else if (name.includes('google') || name.includes('microsoft')) {
    score += 25;
  }

  // 4. Penalize known robotic / compact / formant synthesizers
  if (
    name.includes('espeak') ||
    name.includes('compact') ||
    name.includes('festival') ||
    name.includes('flite')
  ) {
    score -= 45;
  }

  return { score, isNeuralOrNatural };
}

/**
 * Filters and ranks all available voices to select the best genuine Bengali voice.
 * Returns null if no genuine Bengali voice is available on the browser/device.
 */
export function selectBestBengaliVoice(
  voices: SpeechSynthesisVoice[]
): RankedBengaliVoice | null {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const candidates: RankedBengaliVoice[] = [];
  for (const voice of voices) {
    if (!isGenuineBengaliVoice(voice)) continue;
    const { score, isNeuralOrNatural } = scoreBengaliVoice(voice);
    candidates.push({
      voice,
      name: voice.name,
      lang: voice.lang,
      score,
      isNeuralOrNatural,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Selects an appropriate English voice when speaking English text, preserving existing English TTS behavior.
 */
export function selectBestEnglishVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const enVoices = voices.filter((v) =>
    normalizeLangTag(v.lang).startsWith('en')
  );
  if (enVoices.length === 0) return null;

  return (
    enVoices.find(
      (v) =>
        normalizeLangTag(v.lang) === 'en-us' &&
        /natural|neural|google|online/i.test(v.name)
    ) ||
    enVoices.find((v) => normalizeLangTag(v.lang) === 'en-us' && v.default) ||
    enVoices.find((v) => normalizeLangTag(v.lang) === 'en-us') ||
    enVoices[0]
  );
}

/**
 * Attaches the voiceschanged event listener and loads available browser voices,
 * waiting briefly if the browser populates voices asynchronously.
 */
export async function loadAvailableVoices(
  timeoutMs = 650
): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSynthesisSupported()) return [];

  const synth = window.speechSynthesis;

  if (!voicesChangedListenerAttached) {
    voicesChangedListenerAttached = true;
    const updateCache = () => {
      try {
        const latest = synth.getVoices?.() || [];
        if (latest.length > 0) {
          cachedVoices = latest;
        }
      } catch {
        // ignore
      }
    };

    try {
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', updateCache);
      } else {
        synth.onvoiceschanged = updateCache;
      }
    } catch {
      // ignore
    }
  }

  try {
    const immediate = synth.getVoices?.() || [];
    if (immediate.length > 0) {
      cachedVoices = immediate;
      return immediate;
    }
  } catch {
    // ignore
  }

  if (cachedVoices.length > 0) {
    return cachedVoices;
  }

  // Wait for asynchronous voiceschanged event in Chromium/WebKit browsers
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        const loaded = synth.getVoices?.() || [];
        if (loaded.length > 0) {
          cachedVoices = loaded;
        }
      } catch {
        // ignore
      }
      resolve(cachedVoices);
    };

    const timer = setTimeout(finish, timeoutMs);

    try {
      const handler = () => {
        clearTimeout(timer);
        finish();
      };
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', handler, { once: true });
      } else {
        synth.onvoiceschanged = handler;
      }
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

// Kick off background voice warm-up in browser environments
if (typeof window !== 'undefined' && isSpeechSynthesisSupported()) {
  loadAvailableVoices(400).catch(() => {});
}

/**
 * Computes conservative speech rate and pitch for Bengali vs English.
 * For Bengali, keeps pitch at 1.0 and uses a conservative rate (0.85 - 1.05, default ~0.95)
 * so consonant clusters (যুক্তবর্ণ) and vowel markers remain clear.
 */
export function resolveSpeechParameters(
  requestedRate: number,
  isBengali: boolean
): { rate: number; pitch: number } {
  const safeInput =
    typeof requestedRate === 'number' && !Number.isNaN(requestedRate)
      ? requestedRate
      : 1.0;

  if (isBengali) {
    // Scale conservatively around 0.95 and clamp to [0.85, 1.05]
    const scaled = safeInput === 1.0 ? 0.95 : safeInput * 0.95;
    const rate = Number(Math.min(Math.max(scaled, 0.85), 1.05).toFixed(2));
    return { rate, pitch: 1.0 };
  }

  const rate = Number(Math.min(Math.max(safeInput, 0.7), 1.6).toFixed(2));
  return { rate, pitch: 1.0 };
}

/**
 * Prepares markdown text for TTS without destroying Bengali characters, diacritics,
 * compound-word hyphens, punctuation (।, ?, !, ,), or paragraph boundaries.
 */
export function stripMarkdownForSpeech(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';

  const isBengali = containsBengaliScript(markdown);
  const codeOmittedNotice = isBengali
    ? ' কোড অংশটি বাদ দেওয়া হয়েছে। '
    : ' Code snippet omitted for speech. ';

  return (
    markdown
      // Replace fenced code blocks with localized notice
      .replace(/```[\s\S]*?```/g, codeOmittedNotice)
      // Unwrap inline code ticks without altering identifiers (e.g. `JavaScript` -> JavaScript)
      .replace(/`([^`]+)`/g, '$1')
      // Remove markdown images
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // Keep link label text, remove URL target
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove horizontal rule lines
      .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
      // Remove heading markers (#, ##, ###) and blockquote markers (>) at line start while keeping line break
      .replace(/^\s*(?:#{1,6}|>)\s*/gm, '')
      // Remove list bullet markers (*, -, +) at line start while preserving hyphens inside words
      .replace(/^\s*[-*+•]\s+/gm, '')
      // Remove bold/italic/strikethrough emphasis markers (*, _, ~) without touching word content
      .replace(/(\*\*|__|~~|\*|_)/g, '')
      // Remove markdown table pipe delimiters
      .replace(/\|/g, ' ')
      // Ensure headings/lines that do not end with sentence punctuation get a natural pause before newline
      .replace(/([^\s।.?!,:;])\r?\n+/g, (_match, lastChar) =>
        isBengali ? `${lastChar}। ` : `${lastChar}. `
      )
      // Collapse remaining newlines and multiple spaces into clean single spaces
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Splits prepared speech text into sentence-respecting chunks so multi-sentence
 * Bengali or English responses preserve natural sentence pauses and avoid
 * browser single-utterance length cutoffs.
 */
export function splitIntoSpeechChunks(
  cleanText: string,
  maxChunkLength = 260
): string[] {
  const trimmed = cleanText.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkLength) return [trimmed];

  // Split after Bengali dari (।), period, question mark, or exclamation mark
  const sentences = trimmed
    .split(/(?<=[।.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChunkLength) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

/**
 * Builds a structured diagnostic report of available voices, selected Bengali voice,
 * suitability status, and chosen rate/pitch. Never includes chat content or keys.
 */
export function buildTtsDiagnosticReport(
  voices: SpeechSynthesisVoice[],
  requestedRate = 1.0,
  isBengali = true
): TtsDiagnosticReport {
  const bestBengali = selectBestBengaliVoice(voices);
  const { rate, pitch } = resolveSpeechParameters(requestedRate, isBengali);

  return {
    availableVoices: voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      localService: Boolean(v.localService),
    })),
    selectedBengaliVoice: bestBengali
      ? {
          name: bestBengali.name,
          lang: bestBengali.lang,
          score: bestBengali.score,
          isNeuralOrNatural: bestBengali.isNeuralOrNatural,
        }
      : null,
    hasSuitableBengaliVoice: bestBengali !== null,
    chosenRate: rate,
    chosenPitch: pitch,
  };
}

/**
 * Logs development-only TTS diagnostics to the browser console without exposing
 * any user chat text, API keys, or sensitive data.
 */
function logDevTtsDiagnostic(report: TtsDiagnosticReport, language: 'bn' | 'en'): void {
  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as any).env?.DEV);

  if (!isDev) return;

  console.info('[MINOVA AI TTS Diagnostic]', {
    targetLanguage: language,
    hasSuitableBengaliVoice: report.hasSuitableBengaliVoice,
    selectedBengaliVoice: report.selectedBengaliVoice,
    chosenRate: report.chosenRate,
    chosenPitch: report.chosenPitch,
    availableVoiceCount: report.availableVoices.length,
    availableVoices: report.availableVoices,
  });
}

export function createSpeechRecognitionInstance(lang = 'en-US'): any | null {
  if (!isSpeechRecognitionSupported()) return null;
  const SpeechRecognitionCtor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  try {
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    return recognition;
  } catch {
    return null;
  }
}

/**
 * Speaks the provided text using browser SpeechSynthesis.
 * - For Bengali text, verifies a genuine Bengali voice (bn-BD / bn) exists.
 * - If no Bengali voice is available on the device/browser, refuses to read Bengali
 *   with an English voice and invokes onError with a clear user-facing explanation.
 * - Prevents duplicate queued utterances on repeated clicks via session tracking.
 */
export function speakText(
  text: string,
  rate = 1.0,
  onEndOrCallbacks?: (() => void) | SpeakTextCallbacks
): boolean {
  const callbacks: SpeakTextCallbacks =
    typeof onEndOrCallbacks === 'function'
      ? { onEnd: onEndOrCallbacks }
      : onEndOrCallbacks || {};

  if (!isSpeechSynthesisSupported()) {
    callbacks.onError?.('Text-to-Speech is not supported in this browser.');
    callbacks.onEnd?.();
    return false;
  }

  const cleanText = stripMarkdownForSpeech(text);
  if (!cleanText) {
    callbacks.onEnd?.();
    return false;
  }

  // Increment session ID and cancel any active or queued speech immediately
  const sessionId = ++activeSpeechSessionId;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }

  const isBengali = containsBengaliScript(cleanText);
  const language: 'bn' | 'en' = isBengali ? 'bn' : 'en';

  // Asynchronously resolve voices (instant if already cached) and speak if session is still current
  void (async () => {
    const voices = await loadAvailableVoices(650);

    // Abort if user clicked Stop or triggered another Speak call while voices were loading
    if (sessionId !== activeSpeechSessionId) {
      return;
    }

    const diagnostic = buildTtsDiagnosticReport(voices, rate, isBengali);
    logDevTtsDiagnostic(diagnostic, language);

    if (isBengali) {
      const rankedBn = selectBestBengaliVoice(voices);
      if (!rankedBn) {
        const msg =
          'No suitable Bengali (bn-BD / bn) voice was found in your current browser or operating system. To hear natural Bengali pronunciation, install a Bengali system voice pack or open MINOVA AI in Microsoft Edge / Chrome with Bangla voice support.';
        callbacks.onError?.(msg);
        callbacks.onEnd?.();
        return;
      }

      const chunks = splitIntoSpeechChunks(cleanText, 240);
      let chunkIdx = 0;

      const speakNextBengaliChunk = () => {
        if (sessionId !== activeSpeechSessionId) return;
        if (chunkIdx >= chunks.length) {
          callbacks.onEnd?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[chunkIdx]);
        utterance.voice = rankedBn.voice;
        utterance.lang = rankedBn.voice.lang || 'bn-BD';
        utterance.rate = diagnostic.chosenRate;
        utterance.pitch = diagnostic.chosenPitch;

        utterance.onend = () => {
          if (sessionId !== activeSpeechSessionId) return;
          chunkIdx++;
          speakNextBengaliChunk();
        };

        utterance.onerror = (ev: any) => {
          if (sessionId !== activeSpeechSessionId) return;
          // Ignore 'canceled' / 'interrupted' events caused by explicit stopSpeaking()
          if (ev?.error === 'canceled' || ev?.error === 'interrupted') {
            return;
          }
          callbacks.onEnd?.();
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          callbacks.onEnd?.();
        }
      };

      speakNextBengaliChunk();
      return;
    }

    // English / non-Bengali TTS path (preserves existing behavior with session safety)
    const enVoice = selectBestEnglishVoice(voices);
    const { rate: enRate, pitch: enPitch } = resolveSpeechParameters(rate, false);
    const chunks = splitIntoSpeechChunks(cleanText, 300);
    let chunkIdx = 0;

    const speakNextEnglishChunk = () => {
      if (sessionId !== activeSpeechSessionId) return;
      if (chunkIdx >= chunks.length) {
        callbacks.onEnd?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIdx]);
      if (enVoice) {
        utterance.voice = enVoice;
        utterance.lang = enVoice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = enRate;
      utterance.pitch = enPitch;

      utterance.onend = () => {
        if (sessionId !== activeSpeechSessionId) return;
        chunkIdx++;
        speakNextEnglishChunk();
      };

      utterance.onerror = (ev: any) => {
        if (sessionId !== activeSpeechSessionId) return;
        if (ev?.error === 'canceled' || ev?.error === 'interrupted') {
          return;
        }
        callbacks.onEnd?.();
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        callbacks.onEnd?.();
      }
    };

    speakNextEnglishChunk();
  })();

  return true;
}

export function stopSpeaking(): void {
  activeSpeechSessionId++;
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
