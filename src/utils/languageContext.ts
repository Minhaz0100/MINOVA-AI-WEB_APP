import { ApiConversationTurn, UserSettings } from '../types/chat';

export const MINOVA_CONTEXT_MARKER = '[MINOVA AI System & Language Context]';

/**
 * Core linguistic and quality instructions for MINOVA AI.
 * Designed to ensure natural Bangladeshi Standard Bengali (বাংলাদেশে প্রচলিত প্রমিত বাংলা),
 * accurate Banglish comprehension, strict language matching, and technical precision
 * without overriding the user's actual request.
 */
export const MINOVA_BENGALI_LANGUAGE_DIRECTIVE = `${MINOVA_CONTEXT_MARKER}
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

/**
 * Detects whether a text string contains Bengali Unicode characters (U+0980..U+09FF).
 */
export function containsBengaliScript(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

/**
 * Builds the unified initial context turns combining MINOVA AI's Bengali/language quality
 * directive with optional user personalization settings.
 * Guarantees no duplicate or conflicting system turns are prepended.
 */
export function buildUnifiedConversationContext(
  rawHistory: ApiConversationTurn[],
  settings?: Partial<UserSettings>
): ApiConversationTurn[] {
  const cleanedHistory = rawHistory
    .filter((turn) => typeof turn.content === 'string' && turn.content.trim().length > 0)
    .map((turn) => ({
      role: (turn.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: turn.content.trim(),
    }));

  // If the conversation already starts with the unified MINOVA context marker, do not duplicate it
  if (
    cleanedHistory.length > 0 &&
    cleanedHistory[0].content.includes(MINOVA_CONTEXT_MARKER)
  ) {
    return cleanedHistory;
  }

  const styleDirectives: Record<NonNullable<UserSettings['responseStyle']>, string> = {
    balanced: '',
    concise: 'Keep responses concise, direct, and high-signal without unnecessary filler.',
    detailed:
      'Provide thorough, comprehensive explanations with clear architectural context and step-by-step breakdowns.',
    code_first:
      'Prioritize complete, runnable, well-structured code blocks first, followed by concise technical explanations.',
  };

  const preferenceParts: string[] = [];
  if (settings?.displayName?.trim()) {
    preferenceParts.push(`The user's name is ${settings.displayName.trim()}.`);
  }
  if (settings?.customInstructions?.trim()) {
    preferenceParts.push(settings.customInstructions.trim());
  }
  if (settings?.responseStyle && styleDirectives[settings.responseStyle]) {
    preferenceParts.push(styleDirectives[settings.responseStyle]);
  }

  const combinedDirective =
    preferenceParts.length > 0
      ? `${MINOVA_BENGALI_LANGUAGE_DIRECTIVE}\n\n5. USER PERSONALIZATION:\n${preferenceParts.join(' ')}`
      : MINOVA_BENGALI_LANGUAGE_DIRECTIVE;

  return [
    {
      role: 'user',
      content: combinedDirective,
    },
    {
      role: 'assistant',
      content:
        'Understood. As MINOVA AI (Developed by Minhaz), I will follow these language-matching, natural Bangladeshi Standard Bengali (প্রমিত বাংলা), technical accuracy, and user preference guidelines.',
    },
    ...cleanedHistory,
  ];
}
