import React from 'react';
import { Code2, Cpu, Image as ImageIcon, Terminal, ArrowUpRight } from 'lucide-react';
import { ComposerMode } from '../types/chat';
import { MinovaLogo } from './MinovaLogo';

interface EmptyStateWelcomeProps {
  onSelectPrompt: (prompt: string, mode: ComposerMode) => void;
  imageGenerationReady: boolean;
}

interface StarterCard {
  category: string;
  title: string;
  prompt: string;
  mode: ComposerMode;
  icon: React.ReactNode;
}

export const EmptyStateWelcome: React.FC<EmptyStateWelcomeProps> = ({
  onSelectPrompt,
  imageGenerationReady,
}) => {
  const starters: StarterCard[] = [
    {
      category: 'Software Engineering',
      title: 'Clean TypeScript API Client with Retries',
      prompt:
        'Write a clean, production-grade TypeScript fetch wrapper with exponential backoff, timeout handling via AbortController, and typed error responses.',
      mode: 'chat',
      icon: <Code2 className="w-4 h-4 text-cyan-400" />,
    },
    {
      category: 'System Architecture',
      title: 'Real-Time SSE vs WebSockets Trade-offs',
      prompt:
        'Compare Server-Sent Events (SSE) and WebSockets for streaming AI tokens to Android (Kotlin Compose) and Web clients. Include concrete architectural recommendations.',
      mode: 'chat',
      icon: <Cpu className="w-4 h-4 text-cyan-400" />,
    },
    {
      category: 'Algorithms & Optimization',
      title: 'Debug & Optimize SQL Query Performance',
      prompt:
        'Explain how composite B-tree indexes work in PostgreSQL and show how to optimize a slow paginated query filtering by status and sorting by created_at.',
      mode: 'chat',
      icon: <Terminal className="w-4 h-4 text-violet-400" />,
    },
    {
      category: imageGenerationReady ? 'Image Synthesis' : 'Creative Engineering',
      title: imageGenerationReady
        ? 'Generate Futuristic Cybernetic Studio Concept'
        : 'Design a Dark-Mode Design System Token Scale',
      prompt: imageGenerationReady
        ? 'Minimalist architectural command center at midnight, deep navy glass surfaces, subtle electric cyan rim lighting, photorealistic 8k studio photography'
        : 'Design a comprehensive dark-mode color token scale using midnight navy surfaces, electric cyan primary accents, and WCAG AA contrast ratios.',
      mode: imageGenerationReady ? 'image' : 'chat',
      icon: <ImageIcon className="w-4 h-4 text-violet-400" />,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14 flex flex-col items-center text-center">
      {/* Geometric MINOVA AI Brand Emblem */}
      <MinovaLogo size="xl" className="mb-5 shadow-lg shadow-cyan-950/40 rounded-2xl" />

      {/* Unboxed Metadata Kicker */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 mb-3">
        <span className="text-cyan-400 font-semibold">MINOVA AI</span>
        <span aria-hidden="true">·</span>
        <span>Developed by Minhaz</span>
        <span aria-hidden="true">·</span>
        <span>Model: MINOVA AI</span>
      </div>

      {/* Main Display Heading */}
      <h1
        className="text-2xl sm:text-4xl font-bold tracking-tight text-white max-w-xl mb-3"
        style={{ textWrap: 'balance' }}
      >
        Think. Create. Code. With MINOVA.
      </h1>

      <p className="text-sm sm:text-base text-slate-400 max-w-xl leading-relaxed mb-10">
        Ask complex engineering questions, stream code solutions in real time, or synthesize
        visuals directly through the MINOVA AI backend.
      </p>

      {/* Starter Prompt Grid */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
        {starters.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onSelectPrompt(item.prompt, item.mode)}
            className="group flex flex-col justify-between p-4 rounded-xl bg-[#0B1222] hover:bg-[#101A30] border border-slate-800/80 hover:border-cyan-500/40 transition-colors cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-2 font-medium text-slate-300">
                  {item.icon}
                  <span>{item.category}</span>
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0" />
              </div>
              <div className="text-sm font-semibold text-white mb-1 group-hover:text-cyan-200 transition-colors">
                {item.title}
              </div>
              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                {item.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
