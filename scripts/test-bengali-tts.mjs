/**
 * Code-Level & Mocked Browser SpeechSynthesis Verification Suite for MINOVA AI Web TTS.
 * Directly imports and tests src/utils/speech.ts using `npx tsx scripts/test-bengali-tts.mjs`.
 *
 * Note: This script verifies code-level voice loading, ranking, text preparation,
 * utterance construction, rate/pitch clamping, cancellation, duplicate-click prevention,
 * and the no-Bengali-voice fallback. It does NOT replace human listening tests on a physical
 * browser/OS with audio output hardware.
 */

import assert from 'node:assert/strict';
import {
  buildTtsDiagnosticReport,
  isGenuineBengaliVoice,
  loadAvailableVoices,
  selectBestBengaliVoice,
  splitIntoSpeechChunks,
  speakText,
  stopSpeaking,
  stripMarkdownForSpeech,
} from '../src/utils/speech.ts';
import { containsBengaliScript } from '../src/utils/languageContext.ts';

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.onend = null;
    this.onerror = null;
  }
}

function setupMockWindow(initialVoices, asyncVoices) {
  const spokenUtterances = [];
  let cancelCount = 0;
  let currentVoices = [...initialVoices];
  const listeners = {};

  const mockSynth = {
    getVoices: () => currentVoices,
    cancel: () => {
      cancelCount++;
    },
    speak: (utterance) => {
      spokenUtterances.push(utterance);
    },
    addEventListener: (event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
    onvoiceschanged: null,
  };

  globalThis.window = {
    speechSynthesis: mockSynth,
    SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
  };
  globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

  if (asyncVoices) {
    setTimeout(() => {
      currentVoices = [...asyncVoices];
      if (typeof mockSynth.onvoiceschanged === 'function') {
        mockSynth.onvoiceschanged();
      }
      for (const cb of listeners['voiceschanged'] || []) {
        cb();
      }
    }, 30);
  }

  return {
    spokenUtterances,
    getCancelCount: () => cancelCount,
    setVoices: (nextVoices) => {
      currentVoices = [...nextVoices];
      for (const cb of listeners['voiceschanged'] || []) {
        cb();
      }
    },
  };
}

const SAMPLE_MULTI_VOICE_CATALOG = [
  { name: 'Google US English', lang: 'en-US', localService: false, default: true },
  { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, default: false },
  { name: 'Google हिन्दी', lang: 'hi-IN', localService: false, default: false },
  { name: 'eSpeak Bengali Compact', lang: 'bn', localService: true, default: false },
  { name: 'Google বাংলা (India)', lang: 'bn-IN', localService: false, default: false },
  { name: 'Google বাংলা', lang: 'bn-BD', localService: false, default: false },
  {
    name: 'Microsoft Pradeep Online (Natural) - Bengali (Bangladesh)',
    lang: 'bn-BD',
    localService: false,
    default: false,
  },
];

const BENGALI_TEST_SENTENCES = [
  'আমি বাংলায় কথা বলতে চাই।',
  'আজকের আবহাওয়া খুব সুন্দর।',
  'বাংলা উচ্চারণ পরিষ্কার ও স্বাভাবিক হওয়া দরকার।',
  'আমি JavaScript শিখছি এবং একটি ওয়েব অ্যাপ তৈরি করছি।',
];

async function runTests() {
  console.log('==============================================================');
  console.log('MINOVA AI Web — Bengali TTS Code-Level & Diagnostic Test Suite');
  console.log('==============================================================\n');

  // 1. Asynchronous voiceschanged loading test
  const env = setupMockWindow([], SAMPLE_MULTI_VOICE_CATALOG);
  const loadedVoices = await loadAvailableVoices(300);
  assert.equal(
    loadedVoices.length,
    SAMPLE_MULTI_VOICE_CATALOG.length,
    'Should asynchronously load voices via voiceschanged event'
  );
  console.log('[PASS] 1. Asynchronous voice loading via voiceschanged');

  // 2. Voice filtering & ranking test
  const diag = buildTtsDiagnosticReport(loadedVoices, 1.0, true);
  console.log('\n--- Development TTS Diagnostic Report (Multi-Voice Catalog) ---');
  console.log(JSON.stringify(diag, null, 2));
  assert.equal(diag.hasSuitableBengaliVoice, true);
  assert.equal(
    diag.selectedBengaliVoice?.name,
    'Microsoft Pradeep Online (Natural) - Bengali (Bangladesh)'
  );
  assert.equal(diag.selectedBengaliVoice?.lang, 'bn-BD');
  assert.equal(diag.chosenRate, 0.95);
  assert.equal(diag.chosenPitch, 1.0);
  assert.equal(
    isGenuineBengaliVoice({ name: 'Google US English', lang: 'en-US' }),
    false,
    'Must never classify an English voice as Bengali'
  );
  const ranked = selectBestBengaliVoice(loadedVoices);
  assert.equal(
    ranked?.name,
    'Microsoft Pradeep Online (Natural) - Bengali (Bangladesh)'
  );
  console.log('[PASS] 2. Genuine Bengali voice identification & ranking (bn-BD Natural > bn-BD Google > bn-IN > eSpeak)\n');

  // 3. Test all 4 required Bengali sentences
  for (let i = 0; i < BENGALI_TEST_SENTENCES.length; i++) {
    const sentence = BENGALI_TEST_SENTENCES[i];
    assert.equal(containsBengaliScript(sentence), true);
    const prepared = stripMarkdownForSpeech(sentence);
    assert.equal(
      prepared,
      sentence,
      `Bengali sentence #${i + 1} must not be altered or transliterated by stripMarkdownForSpeech`
    );

    const beforeCount = env.spokenUtterances.length;
    let errorCalled = null;
    speakText(sentence, 1.0, {
      onError: (msg) => {
        errorCalled = msg;
      },
    });
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(errorCalled, null);
    assert.equal(env.spokenUtterances.length, beforeCount + 1);
    const latestUtterance = env.spokenUtterances[env.spokenUtterances.length - 1];
    assert.equal(latestUtterance.text, sentence);
    assert.equal(
      latestUtterance.voice?.name,
      'Microsoft Pradeep Online (Natural) - Bengali (Bangladesh)'
    );
    assert.equal(latestUtterance.lang, 'bn-BD');
    assert.equal(latestUtterance.rate, 0.95);
    assert.equal(latestUtterance.pitch, 1.0);

    console.log(
      `[PASS] 3.${i + 1} Bengali Sentence: "${sentence}" -> Voice: "${latestUtterance.voice?.name}" [${latestUtterance.lang}], Rate: ${latestUtterance.rate}, Pitch: ${latestUtterance.pitch}`
    );
  }

  // 4. Test English TTS preservation
  {
    const englishText = 'Welcome to MINOVA AI. Think, create, and code.';
    const beforeCount = env.spokenUtterances.length;
    speakText(englishText, 1.1);
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(env.spokenUtterances.length, beforeCount + 1);
    const u = env.spokenUtterances[env.spokenUtterances.length - 1];
    assert.equal(u.lang, 'en-US');
    assert.equal(u.voice?.name, 'Google US English');
    assert.equal(u.rate, 1.1);
    console.log(
      `\n[PASS] 4. English TTS preserved -> Voice: "${u.voice?.name}" [${u.lang}], Rate: ${u.rate}`
    );
  }

  // 5. Test Stop Speech and Repeated Clicks (no duplicate queueing)
  {
    const multiSentenceBn =
      'আমি বাংলায় কথা বলতে চাই। আজকের আবহাওয়া খুব সুন্দর। বাংলা উচ্চারণ পরিষ্কার ও স্বাভাবিক হওয়া দরকার।';
    const cancelsBefore = env.getCancelCount();
    const utterancesBefore = env.spokenUtterances.length;

    // Rapid triple click simulation
    speakText(multiSentenceBn, 1.0);
    speakText(multiSentenceBn, 1.0);
    speakText(multiSentenceBn, 1.0);
    await new Promise((r) => setTimeout(r, 35));

    // Only the 3rd (latest) session should have spoken an utterance; sessions 1 and 2 were superseded before speaking
    assert.equal(
      env.spokenUtterances.length,
      utterancesBefore + 1,
      'Repeated rapid Speak clicks must not queue duplicate utterances'
    );
    assert.ok(env.getCancelCount() >= cancelsBefore + 3);

    // Explicit stopSpeaking()
    stopSpeaking();
    assert.ok(env.getCancelCount() >= cancelsBefore + 4);
    console.log(
      '[PASS] 5. Stop speech & repeated clicks verified (stale sessions aborted, zero duplicate utterances queued)'
    );
  }

  // 6. Test No-Bengali-Voice Scenario (e.g., Linux/desktop browser with only English voices installed)
  {
    env.setVoices([
      { name: 'Google US English', lang: 'en-US', localService: false, default: true },
      { name: 'Google UK English Female', lang: 'en-GB', localService: false, default: false },
    ]);

    const noBnDiag = buildTtsDiagnosticReport(
      globalThis.window.speechSynthesis.getVoices(),
      1.0,
      true
    );
    assert.equal(noBnDiag.hasSuitableBengaliVoice, false);
    assert.equal(noBnDiag.selectedBengaliVoice, null);

    const utterancesBefore = env.spokenUtterances.length;
    let capturedUserError = null;
    let ended = false;

    speakText('আমি বাংলায় কথা বলতে চাই।', 1.0, {
      onError: (msg) => {
        capturedUserError = msg;
      },
      onEnd: () => {
        ended = true;
      },
    });
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(
      env.spokenUtterances.length,
      utterancesBefore,
      'Must NOT speak Bengali text using an English voice when no Bengali voice exists'
    );
    assert.ok(
      capturedUserError && capturedUserError.includes('No suitable Bengali (bn-BD / bn) voice'),
      'Must return a clear user-facing message when no Bengali voice is available'
    );
    assert.equal(ended, true);
    console.log(
      `[PASS] 6. No-Bengali-Voice Scenario verified -> Blocked English voice fallback and surfaced user message:\n       "${capturedUserError}"`
    );
  }

  // 7. Verify compound-word hyphens & paragraph pauses in stripMarkdownForSpeech and chunking
  {
    const markdownSample = `### ১. সংক্ষিপ্ত ধারণা\nReact-এর \`useEffect\` হুকে **রি-রেন্ডার** নিয়ন্ত্রণ করা হয়।\n\`\`\`js\nuseEffect(() => {}, []);\n\`\`\``;
    const cleaned = stripMarkdownForSpeech(markdownSample);
    assert.ok(cleaned.includes('রি-রেন্ডার'), 'Must preserve hyphens inside compound Bengali words');
    assert.ok(cleaned.includes('১. সংক্ষিপ্ত ধারণা।'), 'Must insert pause after heading without punctuation');
    assert.ok(cleaned.includes('কোড অংশটি বাদ দেওয়া হয়েছে।'), 'Must use Bengali notice for omitted code blocks');
    const chunks = splitIntoSpeechChunks(cleaned, 50);
    assert.ok(chunks.length >= 2, 'Should split multi-sentence Bengali text at sentence boundaries');
    console.log('[PASS] 7. Bengali markdown stripping & sentence-boundary chunking verified');
  }

  console.log('\n==============================================================');
  console.log('All code-level Bengali & English TTS tests passed.');
  console.log('==============================================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
