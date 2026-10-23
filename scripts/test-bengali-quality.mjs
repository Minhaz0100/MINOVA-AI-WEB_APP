/**
 * Repeatable Bengali & Banglish Language Quality Evaluation Suite for MINOVA AI.
 * Executes live requests against https://minova-ai-backend.ai.studio/api/chat
 * using the exact unified conversation context produced by src/utils/languageContext.ts.
 *
 * Run with:
 *   node scripts/test-bengali-quality.mjs
 */

const BACKEND_URL = 'https://minova-ai-backend.ai.studio/api/chat';

const MINOVA_CONTEXT_MARKER = '[MINOVA AI System & Language Context]';

const MINOVA_BENGALI_LANGUAGE_DIRECTIVE = `${MINOVA_CONTEXT_MARKER}
You are MINOVA AI (Developed by Minhaz). Follow these language and response quality rules without overriding the user's explicit request:

1. LANGUAGE MATCHING:
- When the user writes in Bengali script (বাংলা), reply in natural Bangladeshi Standard Bengali (বাংলাদেশে প্রচলিত প্রমিত বাংলা).
- When the user writes in Banglish (Bengali written using Latin characters, e.g., "Ami C++ e pointer bujhte parchi na"), understand the Banglish accurately and reply in natural Bengali script (বাংলা) by default.
- Reply in Banglish (Latin-script Bengali) ONLY when the user explicitly requests a Banglish reply (e.g., "Banglish e uttor din", "reply in Banglish").
- When the user writes in English, reply in English unless they explicitly request Bengali or another language.
- For mixed-language messages (such as Bengali/Banglish sentences containing English technical terms), follow the user's dominant sentence language.

2. NATURAL BANGLADESHI BENGALI (প্রমিত বাংলা) QUALITY:
- Use fluent, natural, idiomatic Bangladeshi Standard Bengali (বাংলাদেশে প্রচলিত প্রমিত বাংলা) with accurate grammar, natural sentence flow, proper punctuation (।, ,, ?), and standard spelling (e.g., use "কীভাবে" for how/manner and "কি" for yes/no questions; use natural phrasing instead of stiff word-for-word English translations).
- Avoid awkward calques, unnatural passive voice, repetitive filler sentences, and excessive decorative emojis in headings.
- Organize explanations with clear, coherent paragraphs and clean headings or numbered/bulleted lists when helpful.

3. TECHNICAL ACCURACY & CODE PRESERVATION:
- Keep all source code, programming syntax, identifiers, function/class names, API endpoints, CLI commands, and error names (e.g., pointer, memory address, NullPointerException, REST API, JSON, async/await) intact in English/code formatting.
- Explain technical concepts, debugging steps, and architectural trade-offs naturally in Bengali when responding in Bengali, using English technical terms in parentheses or inline code where natural for Bangladeshi developers and students.

4. ACKNOWLEDGING UNCERTAINTY:
- If a question asks for unverified facts, real-time live data, private system state, or information you cannot verify with certainty, clearly and honestly state what is uncertain or cannot be verified rather than guessing or fabricating information.`;

function buildUnifiedConversation() {
  return [
    {
      role: 'user',
      content: MINOVA_BENGALI_LANGUAGE_DIRECTIVE,
    },
    {
      role: 'assistant',
      content:
        'Understood. As MINOVA AI (Developed by Minhaz), I will follow these language-matching, natural Bangladeshi Standard Bengali (প্রমিত বাংলা), technical accuracy, and user preference guidelines.',
    },
  ];
}

function countBengaliChars(text) {
  const matches = text.match(/[\u0980-\u09FF]/g);
  return matches ? matches.length : 0;
}

const TEST_SUITE = [
  {
    id: '1_everyday_bengali',
    category: '1. Everyday conversation in Bengali',
    prompt:
      'আসসালামু আলাইকুম! পড়াশোনা আর কোডিংয়ের পাশাপাশি প্রতিদিন নিজের মনোযোগ ধরে রাখার জন্য কিছু বাস্তবসম্মত পরামর্শ দিতে পারেন?',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasDari = reply.includes('।');
      return {
        passed: bnChars > 120 && hasDari,
        metrics: `Bengali chars: ${bnChars}, uses দাঁড়ি (।): ${hasDari}`,
      };
    },
  },
  {
    id: '2a_banglish_default_to_bengali',
    category: '2a. Banglish question (replies in natural Bengali script by default)',
    prompt:
      'Ami C++ e pointer ar reference er parthokko ঠিকমতো bujhte parchi na, udhahoron shoho shohoj vabe bujhiye bolun.',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasCppCode = reply.includes('int') || reply.includes('*') || reply.includes('&');
      return {
        passed: bnChars > 150 && hasCppCode,
        metrics: `Bengali chars: ${bnChars}, preserves C++ syntax: ${hasCppCode}`,
      };
    },
  },
  {
    id: '2b_banglish_explicit_request',
    category: '2b. Explicit Banglish request (replies in Banglish only when requested)',
    prompt:
      'Amake shudhu Banglish (Latin script) e সংক্ষেপে bujhiye bolun: Git merge conflict keno hoy ebong kivabe solve korte hoy? Bangla font use korben na, Banglish e uttor din.',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasLatinWords = /\b(git|merge|conflict|branch|commit)\b/i.test(reply);
      return {
        passed: bnChars < 25 && hasLatinWords,
        metrics: `Bengali script chars: ${bnChars} (expected < 25 for explicit Banglish), preserves Git terms: ${hasLatinWords}`,
      };
    },
  },
  {
    id: '3_technical_cpp_java_api_debugging',
    category: '3. Technical explanation: Java NullPointerException, REST API & Debugging',
    prompt:
      'Java-তে REST API থেকে JSON ডেটা রিসিভ করার সময় `NullPointerException` কেন হয় এবং কীভাবে ধাপে ধাপে এটি debug ও সমাধান করা যায়? উদাহরণ কোডসহ ব্যাখ্যা করুন।',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasTechTerms =
        reply.includes('NullPointerException') &&
        (reply.includes('null') || reply.includes('Optional'));
      return {
        passed: bnChars > 180 && hasTechTerms,
        metrics: `Bengali chars: ${bnChars}, preserves Java identifiers: ${hasTechTerms}`,
      };
    },
  },
  {
    id: '4_step_by_step_instructions',
    category: '4. Step-by-step instructions in Bengali',
    prompt:
      'একটি নতুন Node.js এবং Express প্রজেক্ট তৈরি করে সেখানে একটি সাধারণ `/api/health` রাউট চালানোর সম্পূর্ণ প্রক্রিয়াটি ধাপে ধাপে বুঝিয়ে দিন।',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasCommands =
        reply.includes('npm init') &&
        reply.includes('express') &&
        reply.includes('/api/health');
      return {
        passed: bnChars > 120 && hasCommands,
        metrics: `Bengali chars: ${bnChars}, preserves CLI & route commands: ${hasCommands}`,
      };
    },
  },
  {
    id: '5_long_structured_headings_lists',
    category: '5. Long structured answer with headings and lists',
    prompt:
      'ডাটাবেস ইনডেক্সিং (Database Indexing) কী, এটি কীভাবে কাজ করে, কখন ইনডেক্স ব্যবহার করা উচিত এবং কখন অতিরিক্ত ইনডেক্স পারফরম্যান্স কমিয়ে দেয়—শিরোনাম ও পয়েন্ট আকারে বিস্তারিত আলোচনা করুন।',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasHeadings = /^#{1,4}\s+/m.test(reply) || /\*\*[^*]+\*\*/.test(reply);
      const hasLists = /^(\s*[-*•]|\s*[০-৯0-9]+[.)])\s+/m.test(reply);
      return {
        passed: bnChars > 250 && hasHeadings && hasLists,
        metrics: `Bengali chars: ${bnChars}, headings: ${hasHeadings}, lists: ${hasLists}`,
      };
    },
  },
  {
    id: '6_acknowledge_uncertainty',
    category: '6. Question requiring the model to acknowledge uncertainty',
    prompt:
      'আগামীকাল ঢাকায় ঠিক সকাল ১০টা ১৫ মিনিটে কত মিলিমিটার বৃষ্টি হবে এবং বাংলাদেশ ব্যাংকের আগামী মাসের অপ্রকাশিত অভ্যন্তরীণ সার্কুলারে কী লেখা আছে?',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const acknowledgesUncertainty =
        /নিশ্চিতভাবে বলা সম্ভব নয়|পূর্বাভাস|অপ্রকাশিত|জানা সম্ভব নয়|নির্দিষ্ট করে বলা|যাচাই|রিয়েল-টাইম|সঠিক তথ্য দেওয়া সম্ভব নয়|নিশ্চিত/i.test(
          reply
        );
      return {
        passed: bnChars > 60 && acknowledgesUncertainty,
        metrics: `Bengali chars: ${bnChars}, honestly acknowledges uncertainty: ${acknowledgesUncertainty}`,
      };
    },
  },
  {
    id: '7_mixed_bengali_english_terminology',
    category: '7. Mixed Bengali-English technical terminology',
    prompt:
      'React এ `useEffect` hook ব্যবহারের সময় dependency array খালি `[]` রাখলে আর না রাখলে component lifecycle ও re-render এ কী পার্থক্য হয়?',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const keepsReactTerms =
        reply.includes('useEffect') &&
        (reply.includes('render') || reply.includes('dependency'));
      return {
        passed: bnChars > 140 && keepsReactTerms,
        metrics: `Bengali chars: ${bnChars}, preserves React terms: ${keepsReactTerms}`,
      };
    },
  },
  {
    id: '8_english_language_matching',
    category: '8. English language matching sanity check',
    prompt:
      'Explain the difference between TCP and UDP in two short paragraphs.',
    validate: (reply) => {
      const bnChars = countBengaliChars(reply);
      const hasTcpUdp = reply.includes('TCP') && reply.includes('UDP');
      return {
        passed: bnChars === 0 && hasTcpUdp,
        metrics: `Bengali chars: ${bnChars} (expected 0), contains TCP/UDP: ${hasTcpUdp}`,
      };
    },
  },
];

async function callChatApi(message) {
  const payload = {
    message,
    conversation: buildUnifiedConversation(),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const start = Date.now();
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const latencyMs = Date.now() - start;
    const data = await res.json();

    if (res.ok && data?.success && typeof data.message === 'string') {
      return { reply: data.message, latencyMs };
    }

    if (attempt < 2 && (res.status === 503 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }

    throw new Error(
      `HTTP ${res.status}: ${JSON.stringify(data?.error || data)}`
    );
  }
}

async function runSuite() {
  console.log('==============================================================');
  console.log('MINOVA AI — Bengali & Banglish Quality Evaluation Suite');
  console.log(`Target Backend: ${BACKEND_URL}`);
  console.log('==============================================================\n');

  let passedCount = 0;

  for (const testCase of TEST_SUITE) {
    console.log(`--------------------------------------------------------------`);
    console.log(`[${testCase.category}]`);
    console.log(`Prompt: ${testCase.prompt}\n`);

    try {
      const { reply, latencyMs } = await callChatApi(testCase.prompt);
      const check = testCase.validate(reply);
      if (check.passed) passedCount++;

      console.log(`Status: ${check.passed ? 'PASS' : 'REVIEW'} (${latencyMs} ms)`);
      console.log(`Metrics: ${check.metrics}`);
      console.log(`Reply Excerpt:\n${reply.slice(0, 520)}${reply.length > 520 ? '\n...[truncated]' : ''}\n`);
    } catch (err) {
      console.error(`Status: ERROR — ${err.message}\n`);
    }
  }

  console.log('==============================================================');
  console.log(`Summary: ${passedCount} / ${TEST_SUITE.length} test cases passed.`);
  console.log('==============================================================');

  if (passedCount < TEST_SUITE.length) {
    process.exitCode = 1;
  }
}

runSuite();
