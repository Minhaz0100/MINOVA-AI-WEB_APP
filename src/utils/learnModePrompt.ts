import {
  ApiConversationTurn,
  LearnLanguageId,
  LearnSubjectCategory,
  QuizQuestion,
} from '../types/chat';

export const LEARN_LANGUAGE_OPTIONS: Array<{
  id: LearnLanguageId;
  label: string;
}> = [
  { id: 'auto', label: 'Auto Detect' },
  { id: 'bn', label: 'Bangla (বাংলা)' },
  { id: 'en', label: 'English' },
  { id: 'banglish', label: 'Banglish' },
  { id: 'ar', label: 'Arabic' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ur', label: 'Urdu' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'zh', label: 'Chinese' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'es', label: 'Spanish' },
];

export const LEARN_SUBJECT_CATEGORIES: LearnSubjectCategory[] = [
  'Computer Science & IT',
  'Programming & Software Engineering',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English Language & Grammar',
  'Bangla Language & Literature',
  'Business & Economics',
  'Accounting & Finance',
  'History',
  'Geography',
  'General Knowledge',
  'BCS & Competitive Exam Preparation',
  'Engineering & Technology',
  'Other',
];

export function getLearnLanguageLabel(languageId: LearnLanguageId): string {
  return (
    LEARN_LANGUAGE_OPTIONS.find((opt) => opt.id === languageId)?.label ||
    'Auto Detect'
  );
}

export function resolveEffectiveSubjectLabel(
  subjectCategory: LearnSubjectCategory,
  customSubject?: string
): string {
  if (subjectCategory === 'Other') {
    const trimmed = (customSubject || '').trim();
    return trimmed ? `Other (${trimmed})` : 'Other (General Study)';
  }
  return subjectCategory;
}

/**
 * Produces a precise task-level language instruction that works harmoniously
 * with src/utils/languageContext.ts without adding duplicate system-context turns.
 */
export function buildLearnLanguageInstruction(
  languageId: LearnLanguageId
): string {
  switch (languageId) {
    case 'auto':
      return 'Output Language: Auto Detect — Match the dominant language of the user topic/question using MINOVA AI standard language rules (if written in Bengali or Banglish, reply in natural Bangladeshi Standard Bengali script বাংলাদেশে প্রচলিত প্রমিত বাংলা unless Banglish is requested; if written in English, reply in English). Keep technical terms and code identifiers intact.';
    case 'bn':
      return 'Output Language: Bangla (বাংলা) — Write the entire lesson, explanation, examples, and feedback in natural Bangladeshi Standard Bengali script (বাংলাদেশে প্রচলিত প্রমিত বাংলা), even if the topic title is written in English. Preserve technical terms, formulas, and code identifiers accurately in English/code formatting.';
    case 'en':
      return 'Output Language: English — Write the entire response in clear, natural English. Preserve technical terms, formulas, and code identifiers accurately.';
    case 'banglish':
      return 'Output Language: Banglish (Explicit User Selection: reply in Banglish) — The user explicitly requested Banglish. Write all prose explanations, questions, options, and feedback in natural Banglish (Bengali expressed using Latin characters, e.g., "Ei concept-ti bujhte hole amader prothom-e...") without using Bengali Unicode script. Keep all technical terms, formulas, and code identifiers intact in English.';
    case 'ar':
      return 'Output Language: Arabic (العربية) — Write all explanations, examples, questions, and feedback in clear, natural Modern Standard Arabic while preserving code syntax and technical identifiers in English.';
    case 'hi':
      return 'Output Language: Hindi (हिन्दी) — Write all explanations, examples, questions, and feedback in natural Standard Hindi (Devanagari script) while preserving code syntax and technical identifiers in English.';
    case 'ur':
      return 'Output Language: Urdu (اردو) — Write all explanations, examples, questions, and feedback in natural Urdu while preserving code syntax and technical identifiers in English.';
    case 'ja':
      return 'Output Language: Japanese (日本語) — Write all explanations, examples, questions, and feedback in natural Japanese while preserving code syntax and technical identifiers in English.';
    case 'ko':
      return 'Output Language: Korean (한국어) — Write all explanations, examples, questions, and feedback in natural Korean while preserving code syntax and technical identifiers in English.';
    case 'zh':
      return 'Output Language: Chinese (中文) — Write all explanations, examples, questions, and feedback in natural Chinese while preserving code syntax and technical identifiers in English.';
    case 'fr':
      return 'Output Language: French (Français) — Write all explanations, examples, questions, and feedback in natural French while preserving code syntax and technical identifiers in English.';
    case 'de':
      return 'Output Language: German (Deutsch) — Write all explanations, examples, questions, and feedback in natural German while preserving code syntax and technical identifiers in English.';
    case 'es':
      return 'Output Language: Spanish (Español) — Write all explanations, examples, questions, and feedback in natural Spanish while preserving code syntax and technical identifiers in English.';
  }
}

export function buildStudyLessonPrompt(params: {
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  studyFormat: 'deep_dive' | 'socratic' | 'cheatsheet' | 'exercises';
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject?: string;
}): string {
  const formatInstructions: Record<typeof params.studyFormat, string> = {
    deep_dive:
      'Provide a structured, crystal-clear lesson with core mental models, domain-appropriate analogies, concrete examples (or code/formulas where relevant to the subject), and common pitfalls.',
    socratic:
      'Teach using the Socratic method: break the concept into 3 progressive stages, explain each stage clearly, and pose thought-provoking check-in questions with guided answers.',
    cheatsheet:
      'Create a high-density exam & interview reference guide with key definitions, comparison tables, core principles/formulas, and rapid-fire review points.',
    exercises:
      'Design 3 hands-on practice problems graded from warm-up to challenging, followed by complete step-by-step worked solutions.',
  };

  const subjectLabel = resolveEffectiveSubjectLabel(
    params.subjectCategory,
    params.customSubject
  );
  const langRule = buildLearnLanguageInstruction(params.language);

  return [
    'Act as MINOVA AI Study Tutor.',
    `Subject Category: ${subjectLabel}`,
    `Topic: ${params.topic.trim()}`,
    `Difficulty Level: ${params.difficulty}`,
    `Session Format Instruction: ${formatInstructions[params.studyFormat]}`,
    `Tailor the pedagogical style, terminology, and examples specifically to the "${subjectLabel}" domain.`,
    langRule,
  ].join('\n');
}

export function buildStudyFollowUpPromptAndHistory(params: {
  question: string;
  topic: string;
  difficulty: string;
  priorContent: string;
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject?: string;
}): { prompt: string; history: ApiConversationTurn[] } {
  const subjectLabel = resolveEffectiveSubjectLabel(
    params.subjectCategory,
    params.customSubject
  );
  const langLabel = getLearnLanguageLabel(params.language);
  const langRule = buildLearnLanguageInstruction(params.language);

  const history: ApiConversationTurn[] = [
    {
      role: 'user',
      content: `We are in a Learn Mode study session.\nSubject Category: ${subjectLabel}\nTopic: ${params.topic} (${params.difficulty})\nSelected Language: ${langLabel}\n${langRule}`,
    },
    {
      role: 'assistant',
      content: params.priorContent.slice(-12000),
    },
  ];

  const prompt = `${params.question.trim()}\n\n[Tutor Context — Subject: ${subjectLabel} | Language: ${langLabel}. ${langRule}]`;

  return { prompt, history };
}

export function buildQuizGenerationPrompt(params: {
  topic: string;
  difficulty: string;
  questionCount: number;
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject?: string;
}): string {
  const subjectLabel = resolveEffectiveSubjectLabel(
    params.subjectCategory,
    params.customSubject
  );
  const langRule = buildLearnLanguageInstruction(params.language);

  return [
    `Generate a ${params.questionCount}-question multiple-choice quiz for MINOVA AI Learn Mode.`,
    `Subject Category: ${subjectLabel}`,
    `Quiz Topic: "${params.topic.trim()}"`,
    `Difficulty Level: ${params.difficulty}`,
    langRule,
    'Every question, all 4 options, and the grading explanation MUST follow the Output Language rule above and be tailored to the Subject Category while keeping code/formulas/identifiers intact.',
    `Respond ONLY with a valid JSON array of ${params.questionCount} objects in this exact schema (no markdown prose outside the JSON array):`,
    '[',
    '  {',
    '    "question": "Clear, specific question text in the selected language?",',
    '    "options": ["Option A", "Option B", "Option C", "Option D"],',
    '    "correctIndex": 0,',
    '    "explanation": "Concise grading explanation in the selected language of why the correct option is right and why common distractors are wrong."',
    '  }',
    ']',
  ].join('\n');
}

export function buildQuizGradingFeedbackPrompt(params: {
  topic: string;
  difficulty: string;
  questions: QuizQuestion[];
  selectedAnswers: Record<number, number>;
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject?: string;
}): string {
  const subjectLabel = resolveEffectiveSubjectLabel(
    params.subjectCategory,
    params.customSubject
  );
  const langRule = buildLearnLanguageInstruction(params.language);

  let score = 0;
  const breakdownLines = params.questions.map((q, idx) => {
    const pickedIdx = params.selectedAnswers[idx];
    const pickedText =
      pickedIdx !== undefined ? q.options[pickedIdx] : 'Not answered';
    const correctText = q.options[q.correctIndex];
    const isCorrect = pickedIdx === q.correctIndex;
    if (isCorrect) score++;
    return `${idx + 1}. Q: ${q.question}\n   - User Answer: ${pickedText} (${
      isCorrect ? 'CORRECT' : 'INCORRECT'
    })\n   - Correct Answer: ${correctText}`;
  });

  return [
    'Act as MINOVA AI Exam & Quiz Evaluator.',
    `Subject Category: ${subjectLabel}`,
    `Quiz Topic: ${params.topic}`,
    `Difficulty Level: ${params.difficulty}`,
    `Score: ${score} / ${params.questions.length}`,
    langRule,
    'Provide personalized grading feedback in the selected Output Language covering:',
    '1. Overall performance assessment.',
    '2. Clear explanation and remediation for any missed questions (or advanced extension insights if all answers were correct).',
    '3. 3 targeted revision tips for this Subject Category.',
    '',
    'Question Breakdown:',
    ...breakdownLines,
  ].join('\n');
}

export function buildFlashcardsPrompt(params: {
  topic: string;
  difficulty: string;
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject?: string;
}): string {
  const subjectLabel = resolveEffectiveSubjectLabel(
    params.subjectCategory,
    params.customSubject
  );
  const langRule = buildLearnLanguageInstruction(params.language);

  return [
    `Generate 6 active-recall study flashcards for MINOVA AI Learn Mode.`,
    `Subject Category: ${subjectLabel}`,
    `Topic: "${params.topic.trim()}" (${params.difficulty} level)`,
    langRule,
    'Write both the "front" prompt and "back" answer in the selected Output Language while keeping code identifiers and formulas intact.',
    'Respond ONLY with a valid JSON array of 6 objects in this exact schema:',
    '[',
    '  {',
    '    "front": "Concise concept question or term in the selected language?",',
    '    "back": "Clear, high-signal answer, definition, or formula in the selected language."',
    '  }',
    ']',
  ].join('\n');
}

export function formatStudyExportWithMetadata(params: {
  content: string;
  topic: string;
  difficulty: string;
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject?: string;
}): string {
  const subjectLabel = resolveEffectiveSubjectLabel(
    params.subjectCategory,
    params.customSubject
  );
  const langLabel = getLearnLanguageLabel(params.language);

  return [
    `**Subject Category:** ${subjectLabel}  `,
    `**Language:** ${langLabel}  `,
    `**Topic:** ${params.topic} (${params.difficulty})`,
    '',
    '---',
    '',
    params.content,
  ].join('\n');
}
