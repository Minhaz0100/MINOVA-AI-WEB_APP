import React, { useState, useEffect, useRef } from 'react';
import {
  Code2,
  Bug,
  Zap,
  FileCode2,
  CheckCircle2,
  Download,
  MessageSquare,
  Square,
  Loader2,
  Copy,
  Check,
  ArrowRightLeft,
} from 'lucide-react';
import { streamChatMessage } from '../services/minovaApi';
import { MarkdownRenderer } from './MarkdownRenderer';

interface CodeWorkspaceProps {
  onSendToChat: (prompt: string, assistantReply?: string) => void;
}

type CodeActionType =
  | 'debug'
  | 'optimize'
  | 'explain'
  | 'tests'
  | 'convert';

const LANGUAGES = [
  { id: 'kotlin', label: 'Kotlin (Android / Compose)', ext: 'kt' },
  { id: 'typescript', label: 'TypeScript / React', ext: 'ts' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'cpp', label: 'C++', ext: 'cpp' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'rust', label: 'Rust', ext: 'rs' },
  { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'go', label: 'Go', ext: 'go' },
];

const CODE_STORAGE_KEY = 'minova_ai_code_workspace_v1';

export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({ onSendToChat }) => {
  const [language, setLanguage] = useState('kotlin');
  const [targetLanguage, setTargetLanguage] = useState('typescript');
  const [sourceCode, setSourceCode] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(CODE_STORAGE_KEY) ||
        `suspend fun fetchUserProfile(userId: String): Result<UserProfile> {\n    val response = apiService.getUser(userId)\n    return Result.success(response.body()!!)\n}`
      );
    } catch {
      return '';
    }
  });
  const [errorTrace, setErrorTrace] = useState('');
  const [activeAction, setActiveAction] = useState<CodeActionType>('debug');
  const [analysisOutput, setAnalysisOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CODE_STORAGE_KEY, sourceCode);
    } catch {
      // ignore
    }
  }, [sourceCode]);

  const buildCodePrompt = (action: CodeActionType): string => {
    const langLabel =
      LANGUAGES.find((l) => l.id === language)?.label || language;
    const targetLabel =
      LANGUAGES.find((l) => l.id === targetLanguage)?.label || targetLanguage;

    const traceBlock = errorTrace.trim()
      ? `\n\nCompiler / Runtime Error or Stack Trace:\n\`\`\`text\n${errorTrace.trim()}\n\`\`\``
      : '';

    const langRule = `\n\nLanguage Note: If the user's comments or error notes are written in Bengali (বাংলা) or Banglish, write your explanation in natural Bangladeshi Standard Bengali (প্রমিত বাংলা) while keeping all code, syntax, and identifiers in English.`;

    switch (action) {
      case 'debug':
        return `Act as MINOVA AI Senior Code Debugger. Analyze the following ${langLabel} code${
          errorTrace.trim() ? ' and its error trace' : ''
        }. Identify all bugs, null-safety hazards, concurrency issues, or edge cases, explain the root cause concisely, and provide the complete corrected ${langLabel} code.${langRule}\n\nSource Code:\n\`\`\`${language}\n${sourceCode}\n\`\`\`${traceBlock}`;
      case 'optimize':
        return `Refactor and optimize the following ${langLabel} code for production performance, readability, and idiomatic best practices. Explain the improvements made.${langRule}\n\nSource Code:\n\`\`\`${language}\n${sourceCode}\n\`\`\`${traceBlock}`;
      case 'explain':
        return `Explain the following ${langLabel} code step-by-step, covering its control flow, time/space complexity, and architectural design.${langRule}\n\nSource Code:\n\`\`\`${language}\n${sourceCode}\n\`\`\``;
      case 'tests':
        return `Write a comprehensive suite of unit tests (including happy path, boundary conditions, and error/failure cases) for the following ${langLabel} code.${langRule}\n\nSource Code:\n\`\`\`${language}\n${sourceCode}\n\`\`\``;
      case 'convert':
        return `Port and translate the following ${langLabel} code into idiomatic, production-ready ${targetLabel}. Preserve all business logic and explain key language adaptations.${langRule}\n\nSource Code:\n\`\`\`${language}\n${sourceCode}\n\`\`\``;
    }
  };

  const handleRunAction = async (action: CodeActionType) => {
    if (!sourceCode.trim() || isRunning) return;
    setActiveAction(action);
    setAnalysisOutput('');
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const prompt = buildCodePrompt(action);
      const res = await streamChatMessage(
        prompt,
        [],
        (_delta, accumulated) => {
          setAnalysisOutput(accumulated);
        },
        controller.signal
      );
      setAnalysisOutput(res.reply);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        setAnalysisOutput((prev) =>
          prev ? `${prev}\n\n*[Analysis stopped by user]*` : '*Analysis stopped.*'
        );
      } else {
        setAnalysisOutput(
          `### Error\n${
            err instanceof Error ? err.message : 'Code analysis request failed.'
          }`
        );
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleDownloadCode = () => {
    const ext = LANGUAGES.find((l) => l.id === language)?.ext || 'txt';
    const blob = new Blob([sourceCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minova-workspace.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExtractFirstCodeBlock = () => {
    const match = /```(?:\w+)?\n([\s\S]*?)```/.exec(analysisOutput);
    if (match && match[1]) {
      setSourceCode(match[1].trim());
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 font-semibold mb-1">
            <Code2 className="w-4 h-4" />
            <span>MINOVA AI · Code Workspace & Debugger</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Inspect, Debug & Refactor Code
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#0B1222] border border-slate-800 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-500/60 cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(sourceCode);
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 1600);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B1222] hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{copiedCode ? 'Copied' : 'Copy Source'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B1222] hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download File</span>
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleRunAction('debug')}
          disabled={isRunning || !sourceCode.trim()}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
            activeAction === 'debug'
              ? 'bg-cyan-500 text-slate-950'
              : 'bg-[#0B1222] hover:bg-[#111C34] text-slate-200 border border-slate-800'
          }`}
        >
          <Bug className="w-3.5 h-3.5" />
          <span>Debug & Fix Bugs</span>
        </button>

        <button
          type="button"
          onClick={() => handleRunAction('optimize')}
          disabled={isRunning || !sourceCode.trim()}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
            activeAction === 'optimize'
              ? 'bg-cyan-500 text-slate-950'
              : 'bg-[#0B1222] hover:bg-[#111C34] text-slate-200 border border-slate-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Optimize & Refactor</span>
        </button>

        <button
          type="button"
          onClick={() => handleRunAction('explain')}
          disabled={isRunning || !sourceCode.trim()}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
            activeAction === 'explain'
              ? 'bg-cyan-500 text-slate-950'
              : 'bg-[#0B1222] hover:bg-[#111C34] text-slate-200 border border-slate-800'
          }`}
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Explain Logic</span>
        </button>

        <button
          type="button"
          onClick={() => handleRunAction('tests')}
          disabled={isRunning || !sourceCode.trim()}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
            activeAction === 'tests'
              ? 'bg-cyan-500 text-slate-950'
              : 'bg-[#0B1222] hover:bg-[#111C34] text-slate-200 border border-slate-800'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Generate Unit Tests</span>
        </button>

        <div className="flex items-center gap-1.5 bg-[#0B1222] border border-slate-800 rounded-xl p-1">
          <button
            type="button"
            onClick={() => handleRunAction('convert')}
            disabled={isRunning || !sourceCode.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Port to:</span>
          </button>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="bg-transparent text-xs text-slate-200 pr-2 focus:outline-none cursor-pointer"
          >
            {LANGUAGES.filter((l) => l.id !== language).map((l) => (
              <option key={l.id} value={l.id} className="bg-[#0B1222]">
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {isRunning && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold cursor-pointer ml-auto"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Split Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Left: Code & Error Trace Input */}
        <div className="flex flex-col gap-4">
          <div className="flex-1 flex flex-col rounded-2xl bg-[#080D1A] border border-slate-800/90 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0B1222] border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono font-medium text-slate-200">
                Source Editor ({language})
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                {sourceCode.split('\n').length} lines
              </span>
            </div>
            <textarea
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              rows={13}
              spellCheck={false}
              placeholder="Paste or write code to inspect, debug, or refactor..."
              className="w-full flex-1 p-4 bg-transparent font-mono text-xs sm:text-[13px] leading-relaxed text-slate-100 focus:outline-none resize-y"
            />
          </div>

          <div className="rounded-2xl bg-[#080D1A] border border-slate-800/90 overflow-hidden">
            <div className="px-4 py-2 bg-[#0B1222] border-b border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span className="font-medium text-slate-300">
                Optional Compiler / Stack Trace Log
              </span>
              {errorTrace && (
                <button
                  type="button"
                  onClick={() => setErrorTrace('')}
                  className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                >
                  Clear log
                </button>
              )}
            </div>
            <textarea
              value={errorTrace}
              onChange={(e) => setErrorTrace(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="Paste exception stack trace, Logcat error, or compiler output here..."
              className="w-full p-3.5 bg-transparent font-mono text-xs text-rose-200/90 placeholder:text-slate-500 focus:outline-none resize-y"
            />
          </div>
        </div>

        {/* Right: MINOVA AI Diagnostic & Refactored Output */}
        <div className="flex flex-col rounded-2xl bg-[#090F1E] border border-slate-800/90 overflow-hidden min-h-[420px]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0B1222] border-b border-slate-800 text-xs">
            <span className="font-semibold text-cyan-400">
              MINOVA AI · Diagnostic Output
            </span>
            {analysisOutput && !isRunning && (
              <div className="flex items-center gap-2">
                {analysisOutput.includes('```') && (
                  <button
                    type="button"
                    onClick={handleExtractFirstCodeBlock}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Apply Code to Editor
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onSendToChat(buildCodePrompt(activeAction), analysisOutput)
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-3 h-3 text-cyan-400" />
                  <span>Open in Chat</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5 flex-1 overflow-y-auto">
            {isRunning && !analysisOutput ? (
              <div className="flex items-center gap-3 py-12 justify-center text-sm text-slate-400">
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                <span>MINOVA AI is analyzing your code...</span>
              </div>
            ) : analysisOutput ? (
              <MarkdownRenderer content={analysisOutput} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4 text-xs text-slate-500 space-y-2">
                <Bug className="w-7 h-7 text-slate-600 mb-1" />
                <div className="text-sm font-medium text-slate-300">
                  Ready for Code Inspection
                </div>
                <p className="max-w-sm leading-relaxed">
                  Paste your source code and optional stack trace on the left, then select{' '}
                  <strong className="text-slate-300">Debug & Fix Bugs</strong>,{' '}
                  <strong className="text-slate-300">Optimize</strong>, or{' '}
                  <strong className="text-slate-300">Generate Unit Tests</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
