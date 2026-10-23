import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  BookOpen,
  HelpCircle,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  MessageSquare,
  Download,
  Send,
  Globe,
  FolderKanban,
  Award,
} from 'lucide-react';
import {
  LearnLanguageId,
  LearnSessionPreferences,
  LearnSubjectCategory,
  QuizQuestion,
  SavedQuizResult,
} from '../types/chat';
import { sendChatMessage, streamChatMessage } from '../services/minovaApi';
import {
  exportDocumentAsDocx,
  exportDocumentAsPdf,
} from '../utils/documentFiles';
import {
  LEARN_LANGUAGE_OPTIONS,
  LEARN_SUBJECT_CATEGORIES,
  buildFlashcardsPrompt,
  buildLearnLanguageInstruction,
  buildQuizGenerationPrompt,
  buildQuizGradingFeedbackPrompt,
  buildStudyFollowUpPromptAndHistory,
  buildStudyLessonPrompt,
  formatStudyExportWithMetadata,
  getLearnLanguageLabel,
  resolveEffectiveSubjectLabel,
} from '../utils/learnModePrompt';
import { MarkdownRenderer } from './MarkdownRenderer';

interface LearnModeProps {
  onSendToChat: (prompt: string, assistantReply?: string) => void;
}

interface FlashcardItem {
  front: string;
  back: string;
}

const QUIZ_HISTORY_KEY = 'minova_ai_quiz_history_v1';
const STUDY_NOTES_KEY = 'minova_ai_study_notes_v1';
const LEARN_SESSION_STORAGE_KEY = 'minova_ai_learn_session_v1';

const DEFAULT_LEARN_SESSION: LearnSessionPreferences = {
  language: 'auto',
  subjectCategory: 'Other',
  customSubject: '',
  studyTopic: 'Kotlin Coroutines & Structured Concurrency',
  difficulty: 'Intermediate',
  studyFormat: 'deep_dive',
  studyContent: '',
  quizTopic: 'Data Structures & Graph Algorithms',
  questionCount: 5,
  flashcardTopic: 'Android Jetpack Compose State & Recomposition',
};

function loadLearnSessionFromStorage(): LearnSessionPreferences {
  try {
    const raw = localStorage.getItem(LEARN_SESSION_STORAGE_KEY);
    if (!raw) return DEFAULT_LEARN_SESSION;
    const parsed = JSON.parse(raw);
    const validLang = LEARN_LANGUAGE_OPTIONS.some(
      (l) => l.id === parsed?.language
    )
      ? (parsed.language as LearnLanguageId)
      : 'auto';
    const validSubject = LEARN_SUBJECT_CATEGORIES.includes(
      parsed?.subjectCategory
    )
      ? (parsed.subjectCategory as LearnSubjectCategory)
      : 'Other';

    return {
      ...DEFAULT_LEARN_SESSION,
      ...parsed,
      language: validLang,
      subjectCategory: validSubject,
      customSubject:
        typeof parsed?.customSubject === 'string' ? parsed.customSubject : '',
    };
  } catch {
    return DEFAULT_LEARN_SESSION;
  }
}

function extractQuizQuestionsFromResponse(rawText: string): QuizQuestion[] {
  const jsonMatch = /\[[\s\S]*\]/.exec(rawText);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter(
            (q) =>
              typeof q.question === 'string' &&
              Array.isArray(q.options) &&
              q.options.length >= 2
          )
          .map((q) => ({
            question: q.question,
            options: q.options.map(String),
            correctIndex:
              typeof q.correctIndex === 'number' &&
              q.correctIndex >= 0 &&
              q.correctIndex < q.options.length
                ? q.correctIndex
                : 0,
            explanation:
              typeof q.explanation === 'string'
                ? q.explanation
                : 'Review the core concept above.',
          }));
      }
    } catch {
      // fall through
    }
  }
  return [];
}

function extractFlashcardsFromResponse(rawText: string): FlashcardItem[] {
  const jsonMatch = /\[[\s\S]*\]/.exec(rawText);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter(
            (c) => typeof c.front === 'string' && typeof c.back === 'string'
          )
          .map((c) => ({
            front: c.front.trim(),
            back: c.back.trim(),
          }));
      }
    } catch {
      // ignore
    }
  }
  return [];
}

export const LearnMode: React.FC<LearnModeProps> = ({ onSendToChat }) => {
  const [initialSession] = useState<LearnSessionPreferences>(() =>
    loadLearnSessionFromStorage()
  );

  const [subTab, setSubTab] = useState<'study' | 'quiz' | 'flashcards'>('study');

  // Persisted Language & Subject Category state
  const [language, setLanguage] = useState<LearnLanguageId>(
    initialSession.language
  );
  const [subjectCategory, setSubjectCategory] = useState<LearnSubjectCategory>(
    initialSession.subjectCategory
  );
  const [customSubject, setCustomSubject] = useState<string>(
    initialSession.customSubject
  );

  // Study Session state
  const [studyTopic, setStudyTopic] = useState(initialSession.studyTopic);
  const [difficulty, setDifficulty] = useState<
    'Beginner' | 'Intermediate' | 'Advanced'
  >(initialSession.difficulty);
  const [studyFormat, setStudyFormat] = useState<
    'deep_dive' | 'socratic' | 'cheatsheet' | 'exercises'
  >(initialSession.studyFormat);
  const [studyContent, setStudyContent] = useState(initialSession.studyContent);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [isStudying, setIsStudying] = useState(false);
  const [personalNotes, setPersonalNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(STUDY_NOTES_KEY) || '';
    } catch {
      return '';
    }
  });

  // Quiz Lab state
  const [quizTopic, setQuizTopic] = useState(initialSession.quizTopic);
  const [questionCount, setQuestionCount] = useState<number>(
    initialSession.questionCount
  );
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, number>
  >({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [gradingFeedback, setGradingFeedback] = useState<string>('');
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [quizHistory, setQuizHistory] = useState<SavedQuizResult[]>(() => {
    try {
      const raw = localStorage.getItem(QUIZ_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Flashcards state
  const [flashcardTopic, setFlashcardTopic] = useState(
    initialSession.flashcardTopic
  );
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<Record<number, boolean>>(
    {}
  );
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);

  // Persist session preferences & active study content when changed
  useEffect(() => {
    try {
      const snapshot: LearnSessionPreferences = {
        language,
        subjectCategory,
        customSubject,
        studyTopic,
        difficulty,
        studyFormat,
        studyContent: studyContent.slice(0, 48000),
        quizTopic,
        questionCount,
        flashcardTopic,
      };
      localStorage.setItem(LEARN_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore storage quota errors
    }
  }, [
    language,
    subjectCategory,
    customSubject,
    studyTopic,
    difficulty,
    studyFormat,
    studyContent,
    quizTopic,
    questionCount,
    flashcardTopic,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(STUDY_NOTES_KEY, personalNotes);
    } catch {
      // ignore
    }
  }, [personalNotes]);

  useEffect(() => {
    try {
      localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(quizHistory));
    } catch {
      // ignore
    }
  }, [quizHistory]);

  const activeLanguageLabel = getLearnLanguageLabel(language);
  const activeSubjectLabel = resolveEffectiveSubjectLabel(
    subjectCategory,
    customSubject
  );

  const handleStartStudySession = async () => {
    if (!studyTopic.trim() || isStudying) return;
    setIsStudying(true);
    setStudyContent('');

    const prompt = buildStudyLessonPrompt({
      topic: studyTopic,
      difficulty,
      studyFormat,
      language,
      subjectCategory,
      customSubject,
    });

    try {
      const res = await streamChatMessage(prompt, [], (_delta, acc) => {
        setStudyContent(acc);
      });
      setStudyContent(res.reply);
    } catch (err) {
      setStudyContent(
        `### Error\n${
          err instanceof Error ? err.message : 'Unable to start study session.'
        }`
      );
    } finally {
      setIsStudying(false);
    }
  };

  const handleAskStudyFollowUp = async () => {
    if (!followUpQuestion.trim() || isStudying || !studyContent) return;
    const q = followUpQuestion.trim();
    setFollowUpQuestion('');
    setIsStudying(true);

    const priorContent = studyContent;
    const separator = `\n\n---\n### Follow-Up (${activeLanguageLabel} · ${activeSubjectLabel}): ${q}\n\n`;
    setStudyContent(`${priorContent}${separator}`);

    const { prompt, history } = buildStudyFollowUpPromptAndHistory({
      question: q,
      topic: studyTopic,
      difficulty,
      priorContent,
      language,
      subjectCategory,
      customSubject,
    });

    try {
      const res = await streamChatMessage(prompt, history, (_delta, acc) => {
        setStudyContent(`${priorContent}${separator}${acc}`);
      });
      setStudyContent(`${priorContent}${separator}${res.reply}`);
    } catch (err) {
      setStudyContent(
        `${priorContent}${separator}*Error: ${
          err instanceof Error ? err.message : 'Follow-up failed.'
        }*`
      );
    } finally {
      setIsStudying(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!quizTopic.trim() || isGeneratingQuiz) return;
    setIsGeneratingQuiz(true);
    setQuizError(null);
    setQuizQuestions([]);
    setSelectedAnswers({});
    setGradingFeedback('');

    const prompt = buildQuizGenerationPrompt({
      topic: quizTopic,
      difficulty,
      questionCount,
      language,
      subjectCategory,
      customSubject,
    });

    try {
      const res = await sendChatMessage(prompt, []);
      const questions = extractQuizQuestionsFromResponse(res.reply);
      if (questions.length === 0) {
        throw new Error(
          'Could not parse quiz format from response. Please click Generate Quiz again.'
        );
      }
      setQuizQuestions(questions);
    } catch (err) {
      setQuizError(
        err instanceof Error ? err.message : 'Failed to generate quiz questions.'
      );
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleGenerateGradingFeedback = async () => {
    if (quizQuestions.length === 0 || isGeneratingFeedback) return;
    setIsGeneratingFeedback(true);
    setGradingFeedback('');

    const prompt = buildQuizGradingFeedbackPrompt({
      topic: quizTopic,
      difficulty,
      questions: quizQuestions,
      selectedAnswers,
      language,
      subjectCategory,
      customSubject,
    });

    try {
      const res = await streamChatMessage(prompt, [], (_delta, acc) => {
        setGradingFeedback(acc);
      });
      setGradingFeedback(res.reply);
    } catch (err) {
      setGradingFeedback(
        `*Error generating grading feedback: ${
          err instanceof Error ? err.message : 'Request failed.'
        }*`
      );
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!flashcardTopic.trim() || isGeneratingCards) return;
    setIsGeneratingCards(true);
    setFlashcards([]);
    setFlippedIndices({});

    const prompt = buildFlashcardsPrompt({
      topic: flashcardTopic,
      difficulty,
      language,
      subjectCategory,
      customSubject,
    });

    try {
      const res = await sendChatMessage(prompt, []);
      const cards = extractFlashcardsFromResponse(res.reply);
      setFlashcards(cards);
    } catch {
      // ignore
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handleSelectOption = (qIndex: number, optIndex: number) => {
    if (selectedAnswers[qIndex] !== undefined) return;
    const next = { ...selectedAnswers, [qIndex]: optIndex };
    setSelectedAnswers(next);

    if (
      quizQuestions.length > 0 &&
      Object.keys(next).length === quizQuestions.length
    ) {
      const score = quizQuestions.reduce(
        (acc, q, idx) => acc + (next[idx] === q.correctIndex ? 1 : 0),
        0
      );
      const result: SavedQuizResult = {
        id: `quiz_${Date.now()}`,
        topic: quizTopic.trim(),
        difficulty,
        score,
        total: quizQuestions.length,
        completedAt: new Date().toISOString(),
        language,
        subjectCategory,
        customSubject: subjectCategory === 'Other' ? customSubject.trim() : undefined,
      };
      setQuizHistory((prev) => [result, ...prev.slice(0, 14)]);
    }
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const currentScore = quizQuestions.reduce(
    (acc, q, idx) => acc + (selectedAnswers[idx] === q.correctIndex ? 1 : 0),
    0
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 font-semibold mb-1">
            <GraduationCap className="w-4 h-4" />
            <span>MINOVA AI · Learn Mode</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Study Sessions, Interactive Quizzes & Flashcards
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0B1222] border border-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('study')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              subTab === 'study'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Study Sessions</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('quiz')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              subTab === 'quiz'
                ? 'bg-violet-500 text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Quiz Lab</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('flashcards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              subTab === 'flashcards'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Flashcards</span>
          </button>
        </div>
      </div>

      {/* Top Language & Subject Category Selector Bar (Applies across Study, Quiz & Flashcards) */}
      <section
        aria-label="Learn Mode Language and Subject Preferences"
        className="p-4 sm:p-5 rounded-2xl bg-[#0B1222] border border-slate-800/90 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
          {/* Language Dropdown */}
          <div>
            <label
              htmlFor="learn-language-select"
              className="flex items-center gap-1.5 text-xs text-slate-300 mb-1.5 font-medium"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>Language</span>
            </label>
            <select
              id="learn-language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as LearnLanguageId)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500/60 cursor-pointer"
            >
              {LEARN_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Category Dropdown */}
          <div className={subjectCategory === 'Other' ? '' : 'sm:col-span-1 lg:col-span-2'}>
            <label
              htmlFor="learn-subject-select"
              className="flex items-center gap-1.5 text-xs text-slate-300 mb-1.5 font-medium"
            >
              <FolderKanban className="w-3.5 h-3.5 text-violet-400" />
              <span>Subject Category</span>
            </label>
            <select
              id="learn-subject-select"
              value={subjectCategory}
              onChange={(e) =>
                setSubjectCategory(e.target.value as LearnSubjectCategory)
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500/60 cursor-pointer"
            >
              {LEARN_SUBJECT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Custom Subject Input when "Other" is selected */}
          {subjectCategory === 'Other' && (
            <div className="sm:col-span-2 lg:col-span-1">
              <label
                htmlFor="learn-custom-subject-input"
                className="block text-xs text-slate-300 mb-1.5 font-medium"
              >
                Custom Subject (Optional)
              </label>
              <input
                id="learn-custom-subject-input"
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="e.g., Astronomy, Medical Pharmacology, Law..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          )}
        </div>

        {/* Active Session Context Summary Row */}
        <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>Active Session Context:</span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-medium">
              Language: {activeLanguageLabel}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 font-medium">
              Subject: {activeSubjectLabel}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Saved automatically to local study session
          </span>
        </div>
      </section>

      {subTab === 'study' ? (
        <div className="space-y-6">
          {/* Study Configuration Bar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1222] border border-slate-800/90 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="learn-study-topic-input"
                  className="block text-xs text-slate-400 mb-1.5 font-medium"
                >
                  Study Topic or Concept
                </label>
                <input
                  id="learn-study-topic-input"
                  type="text"
                  value={studyTopic}
                  onChange={(e) => setStudyTopic(e.target.value)}
                  placeholder="e.g., Operating System Virtual Memory, Jetpack Compose State..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              <div>
                <label
                  htmlFor="learn-study-difficulty"
                  className="block text-xs text-slate-400 mb-1.5 font-medium"
                >
                  Difficulty Level
                </label>
                <select
                  id="learn-study-difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500/60 cursor-pointer"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'deep_dive', label: 'Concept Deep-Dive' },
                  { id: 'socratic', label: 'Socratic Tutor' },
                  { id: 'cheatsheet', label: 'Exam Reference Sheet' },
                  { id: 'exercises', label: 'Worked Practice Problems' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setStudyFormat(fmt.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      studyFormat === fmt.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-[#070B16] text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleStartStudySession}
                disabled={isStudying || !studyTopic.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                {isStudying ? 'Generating Lesson...' : 'Start Study Session'}
              </button>
            </div>
          </div>

          {/* Study Content + Personal Notes Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-2xl bg-[#090F1E] border border-slate-800/90 p-5 flex flex-col min-h-[380px]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-4 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-cyan-400">
                    MINOVA AI · Study Lesson
                  </span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-300">{activeSubjectLabel}</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className="text-cyan-300">{activeLanguageLabel}</span>
                </div>
                {studyContent && !isStudying && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportDocumentAsPdf(
                          `Study Guide: ${studyTopic} (${activeSubjectLabel})`,
                          formatStudyExportWithMetadata({
                            content: studyContent,
                            topic: studyTopic,
                            difficulty,
                            language,
                            subjectCategory,
                            customSubject,
                          }),
                          `study-guide-${studyTopic}`
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-cyan-400" />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportDocumentAsDocx(
                          `Study Guide: ${studyTopic} (${activeSubjectLabel})`,
                          formatStudyExportWithMetadata({
                            content: studyContent,
                            topic: studyTopic,
                            difficulty,
                            language,
                            subjectCategory,
                            customSubject,
                          }),
                          `study-guide-${studyTopic}`
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-violet-400" />
                      <span>DOCX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSendToChat(
                          `Continue studying "${studyTopic}" (${difficulty}) in Subject: ${activeSubjectLabel} | Language: ${activeLanguageLabel}. ${buildLearnLanguageInstruction(
                            language
                          )}`,
                          formatStudyExportWithMetadata({
                            content: studyContent,
                            topic: studyTopic,
                            difficulty,
                            language,
                            subjectCategory,
                            customSubject,
                          })
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Continue in Chat</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1">
                {isStudying && !studyContent ? (
                  <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
                    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                    <span>
                      MINOVA AI is preparing your {activeLanguageLabel} lesson in{' '}
                      {activeSubjectLabel}...
                    </span>
                  </div>
                ) : studyContent ? (
                  <MarkdownRenderer content={studyContent} />
                ) : (
                  <div className="py-16 text-center text-xs text-slate-500">
                    Select your <strong className="text-slate-300">Language</strong>,{' '}
                    <strong className="text-slate-300">Subject Category</strong>, and
                    topic above, then click{' '}
                    <strong className="text-slate-300">
                      Start Study Session
                    </strong>
                    .
                  </div>
                )}
              </div>

              {/* Follow-Up Tutor Input inside Study Session */}
              {studyContent && (
                <div className="mt-5 pt-3 border-t border-slate-800 flex items-center gap-2">
                  <input
                    type="text"
                    value={followUpQuestion}
                    onChange={(e) => setFollowUpQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAskStudyFollowUp();
                      }
                    }}
                    disabled={isStudying}
                    placeholder={`Ask Tutor a follow-up in ${activeLanguageLabel} (${activeSubjectLabel})...`}
                    aria-label="Ask study tutor a follow-up question"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-[#060A14] border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500/60"
                  />
                  <button
                    type="button"
                    onClick={handleAskStudyFollowUp}
                    disabled={isStudying || !followUpQuestion.trim()}
                    className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Ask Tutor</span>
                  </button>
                </div>
              )}
            </div>

            {/* Personal Study Scratchpad */}
            <div className="rounded-2xl bg-[#080D1A] border border-slate-800/90 p-4 flex flex-col">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800 text-xs">
                <span className="font-semibold text-slate-200">
                  Study Scratchpad
                </span>
                {personalNotes && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportDocumentAsPdf(
                          `MINOVA AI Study Notes (${activeSubjectLabel})`,
                          formatStudyExportWithMetadata({
                            content: personalNotes,
                            topic: studyTopic,
                            difficulty,
                            language,
                            subjectCategory,
                            customSubject,
                          }),
                          'minova-study-notes'
                        )
                      }
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                )}
              </div>
              <textarea
                value={personalNotes}
                onChange={(e) => setPersonalNotes(e.target.value)}
                rows={12}
                placeholder="Jot down key takeaways, formulas, or flashcards here. Automatically saved in your browser..."
                className="w-full flex-1 bg-transparent text-xs leading-relaxed text-slate-200 placeholder:text-slate-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>
      ) : subTab === 'quiz' ? (
        <div className="space-y-6">
          {/* Quiz Generator Bar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1222] border border-slate-800/90 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="learn-quiz-topic-input"
                className="block text-xs text-slate-400 mb-1.5 font-medium"
              >
                Quiz Topic ({activeSubjectLabel} · {activeLanguageLabel})
              </label>
              <input
                id="learn-quiz-topic-input"
                type="text"
                value={quizTopic}
                onChange={(e) => setQuizTopic(e.target.value)}
                placeholder="e.g., Android Activity Lifecycle, Calculus Derivatives, 46th BCS Preliminary..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-violet-500/60"
              />
            </div>

            <div className="w-full sm:w-36">
              <label
                htmlFor="learn-quiz-difficulty"
                className="block text-xs text-slate-400 mb-1.5 font-medium"
              >
                Difficulty
              </label>
              <select
                id="learn-quiz-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none cursor-pointer"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>

            <div className="w-full sm:w-32">
              <label
                htmlFor="learn-quiz-count"
                className="block text-xs text-slate-400 mb-1.5 font-medium"
              >
                Questions
              </label>
              <select
                id="learn-quiz-count"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none cursor-pointer"
              >
                <option value={3}>3 Questions</option>
                <option value={5}>5 Questions</option>
                <option value={8}>8 Questions</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleGenerateQuiz}
              disabled={isGeneratingQuiz || !quizTopic.trim()}
              className="px-5 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              {isGeneratingQuiz ? 'Generating Quiz...' : 'Generate Quiz'}
            </button>
          </div>

          {quizError && (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 text-xs text-rose-200 flex items-center justify-between">
              <span>{quizError}</span>
              <button
                type="button"
                onClick={handleGenerateQuiz}
                className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-200 font-medium cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {isGeneratingQuiz && (
            <div className="p-12 rounded-2xl bg-[#090F1E] border border-slate-800 flex items-center justify-center gap-3 text-sm text-slate-300">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
              <span>
                MINOVA AI is crafting {activeLanguageLabel} quiz questions for{' '}
                {activeSubjectLabel}...
              </span>
            </div>
          )}

          {quizQuestions.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#0D1527] border border-slate-800 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-200">
                  <span className="font-semibold text-white">{quizTopic}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-violet-300">{activeSubjectLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-300">{activeLanguageLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-cyan-400 font-semibold">
                    Score: {currentScore} / {quizQuestions.length} ({answeredCount}{' '}
                    answered)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnswers({});
                      setGradingFeedback('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Answers</span>
                  </button>
                  {answeredCount > 0 && (
                    <button
                      type="button"
                      onClick={handleGenerateGradingFeedback}
                      disabled={isGeneratingFeedback}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/30 cursor-pointer disabled:opacity-50"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>
                        {isGeneratingFeedback
                          ? 'Grading...'
                          : 'AI Grading Feedback'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onSendToChat(
                        `Help me review key concepts from my ${difficulty} quiz on "${quizTopic}" (Subject Category: ${activeSubjectLabel} | Language: ${activeLanguageLabel}). I scored ${currentScore}/${quizQuestions.length}. ${buildLearnLanguageInstruction(
                          language
                        )}`
                      )
                    }
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Review in Chat</span>
                  </button>
                </div>
              </div>

              {gradingFeedback && (
                <div className="p-5 rounded-2xl bg-[#0B1222] border border-violet-500/40 space-y-2">
                  <div className="flex items-center justify-between text-xs text-violet-300 font-semibold pb-2 border-b border-slate-800">
                    <span>
                      MINOVA AI · Grading & Remediation Feedback (
                      {activeLanguageLabel} · {activeSubjectLabel})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        exportDocumentAsPdf(
                          `Quiz Feedback: ${quizTopic} (${activeSubjectLabel})`,
                          formatStudyExportWithMetadata({
                            content: gradingFeedback,
                            topic: quizTopic,
                            difficulty,
                            language,
                            subjectCategory,
                            customSubject,
                          }),
                          `quiz-feedback-${quizTopic}`
                        )
                      }
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export PDF</span>
                    </button>
                  </div>
                  <MarkdownRenderer content={gradingFeedback} />
                </div>
              )}

              {quizQuestions.map((q, qIdx) => {
                const picked = selectedAnswers[qIdx];
                const isAnswered = picked !== undefined;

                return (
                  <div
                    key={qIdx}
                    className="p-5 rounded-2xl bg-[#090F1E] border border-slate-800/90 space-y-3"
                  >
                    <div className="text-sm font-semibold text-white">
                      {qIdx + 1}. {q.question}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = oIdx === q.correctIndex;
                        const isPicked = picked === oIdx;

                        let btnStyle =
                          'bg-[#0D1527] hover:bg-[#131F38] border-slate-800 text-slate-200';
                        if (isAnswered) {
                          if (isCorrect) {
                            btnStyle =
                              'bg-emerald-950/40 border-emerald-500/60 text-emerald-200';
                          } else if (isPicked && !isCorrect) {
                            btnStyle =
                              'bg-rose-950/40 border-rose-500/60 text-rose-200';
                          } else {
                            btnStyle =
                              'bg-[#070B16] border-slate-800/60 text-slate-500';
                          }
                        }

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={isAnswered}
                            onClick={() => handleSelectOption(qIdx, oIdx)}
                            className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-left text-xs font-medium transition-colors cursor-pointer disabled:cursor-default ${btnStyle}`}
                          >
                            <span>{opt}</span>
                            {isAnswered && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                            {isAnswered && isPicked && !isCorrect && (
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {isAnswered && (
                      <div className="p-3 rounded-xl bg-[#060A14] border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        <strong className="text-cyan-400">Explanation: </strong>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {quizHistory.length > 0 && (
            <div className="rounded-2xl bg-[#080D1A] border border-slate-800/80 p-4">
              <div className="text-xs font-semibold text-slate-300 mb-3">
                Recent Quiz Sessions (Local History)
              </div>
              <div className="divide-y divide-slate-800/60 text-xs">
                {quizHistory.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="py-2 flex items-center justify-between text-slate-400 gap-2"
                  >
                    <div className="truncate pr-3">
                      <span className="text-slate-200 font-medium">
                        {item.topic}
                      </span>
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span>{item.difficulty}</span>
                      {item.subjectCategory && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-violet-400">
                            {resolveEffectiveSubjectLabel(
                              item.subjectCategory,
                              item.customSubject
                            )}
                          </span>
                        </>
                      )}
                      {item.language && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-cyan-400">
                            {getLearnLanguageLabel(item.language)}
                          </span>
                        </>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-cyan-400 font-semibold shrink-0">
                      {item.score}/{item.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Flashcards Tab */
        <div className="space-y-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1222] border border-slate-800/90 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="learn-flashcard-topic-input"
                className="block text-xs text-slate-400 mb-1.5 font-medium"
              >
                Flashcard Deck Topic ({activeSubjectLabel} ·{' '}
                {activeLanguageLabel})
              </label>
              <input
                id="learn-flashcard-topic-input"
                type="text"
                value={flashcardTopic}
                onChange={(e) => setFlashcardTopic(e.target.value)}
                placeholder="Enter topic to generate active-recall flashcards..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateFlashcards}
              disabled={isGeneratingCards || !flashcardTopic.trim()}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              {isGeneratingCards ? 'Generating Deck...' : 'Generate 6 Flashcards'}
            </button>
          </div>

          {isGeneratingCards && (
            <div className="p-12 rounded-2xl bg-[#090F1E] border border-slate-800 flex items-center justify-center gap-3 text-sm text-slate-300">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              <span>
                MINOVA AI is building your {activeLanguageLabel} flashcard deck
                for {activeSubjectLabel}...
              </span>
            </div>
          )}

          {flashcards.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {flashcards.map((card, idx) => {
                const flipped = Boolean(flippedIndices[idx]);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setFlippedIndices((prev) => ({
                        ...prev,
                        [idx]: !prev[idx],
                      }))
                    }
                    className={`p-5 rounded-2xl border text-left transition-colors min-h-[170px] flex flex-col justify-between cursor-pointer ${
                      flipped
                        ? 'bg-[#101C35] border-cyan-500/50 text-slate-100'
                        : 'bg-[#090F1E] hover:bg-[#0D162C] border-slate-800 text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                      <span>Card {idx + 1}</span>
                      <span
                        className={flipped ? 'text-cyan-400' : 'text-violet-400'}
                      >
                        {flipped
                          ? 'ANSWER (Click to flip)'
                          : 'PROMPT (Click to reveal)'}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm leading-relaxed font-medium my-auto">
                      {flipped ? card.back : card.front}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
