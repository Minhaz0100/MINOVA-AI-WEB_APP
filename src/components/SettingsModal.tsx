import React, { useRef, useEffect, useState } from 'react';
import {
  X,
  Volume2,
  Download,
  Upload,
  Trash2,
  User,
  Sliders,
} from 'lucide-react';
import {
  ConversationThread,
  ResponseStylePreset,
  UserSettings,
} from '../types/chat';
import { MinovaLogo } from './MinovaLogo';
import {
  buildTtsDiagnosticReport,
  isSpeechSynthesisSupported,
  loadAvailableVoices,
  TtsDiagnosticReport,
} from '../utils/speech';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (next: UserSettings) => void;
  threads: ConversationThread[];
  onImportThreads: (imported: ConversationThread[]) => void;
  onClearAllData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  threads,
  onImportThreads,
  onClearAllData,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ttsDiag, setTtsDiag] = useState<TtsDiagnosticReport | null>(null);

  useEffect(() => {
    if (!isOpen || !isSpeechSynthesisSupported()) return;
    let active = true;
    loadAvailableVoices(650).then((voices) => {
      if (!active) return;
      setTtsDiag(buildTtsDiagnosticReport(voices, settings.speechRate, true));
    });
    return () => {
      active = false;
    };
  }, [isOpen, settings.speechRate]);

  if (!isOpen) return null;

  const styleOptions: Array<{
    id: ResponseStylePreset;
    label: string;
    desc: string;
  }> = [
    {
      id: 'balanced',
      label: 'Balanced',
      desc: 'Clear explanations with practical examples',
    },
    {
      id: 'concise',
      label: 'Concise & Direct',
      desc: 'Brief, high-signal answers without filler',
    },
    {
      id: 'detailed',
      label: 'Deep & Comprehensive',
      desc: 'Thorough step-by-step architectural breakdowns',
    },
    {
      id: 'code_first',
      label: 'Code-First',
      desc: 'Prioritize clean, runnable code blocks immediately',
    },
  ];

  const handleExportAllJson = () => {
    const backup = {
      product: 'MINOVA AI',
      attribution: 'Developed by Minhaz',
      exportedAt: new Date().toISOString(),
      settings,
      threads,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minova-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed?.threads) && parsed.threads.length > 0) {
          onImportThreads(parsed.threads);
        }
        if (parsed?.settings) {
          onUpdateSettings({ ...settings, ...parsed.settings });
        }
      } catch {
        // ignore invalid file
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-[#0B1120] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <MinovaLogo size="sm" />
            <div>
              <h2 className="text-base font-bold text-white">
                Settings & Personalization
              </h2>
              <p className="text-xs text-slate-400">
                MINOVA AI · Local Browser Preferences
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto text-xs">
          {/* Profile & Custom Instructions */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
              <User className="w-4 h-4 text-cyan-400" />
              <span>Personalization & Custom Instructions</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={settings.displayName}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, displayName: e.target.value })
                  }
                  placeholder="e.g., Minhaz"
                  className="w-full px-3 py-2 rounded-xl bg-[#070B16] border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Default Delivery Mode
                </label>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#070B16] border border-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ ...settings, defaultDeliveryMode: 'stream' })
                    }
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors cursor-pointer ${
                      settings.defaultDeliveryMode === 'stream'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SSE Stream
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ ...settings, defaultDeliveryMode: 'standard' })
                    }
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors cursor-pointer ${
                      settings.defaultDeliveryMode === 'standard'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Standard
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">
                Custom System Instructions (Prepended to MINOVA AI context)
              </label>
              <textarea
                rows={3}
                value={settings.customInstructions}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    customInstructions: e.target.value,
                  })
                }
                placeholder="e.g., I am an Android & Web engineer. Prefer Kotlin Jetpack Compose and TypeScript examples with strict type safety."
                className="w-full p-3 rounded-xl bg-[#070B16] border border-slate-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 resize-none"
              />
            </div>
          </div>

          {/* Response Style Preset */}
          <div className="space-y-3 pt-4 border-t border-slate-800/70">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>Response Style</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {styleOptions.map((opt) => {
                const active = settings.responseStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ ...settings, responseStyle: opt.id })
                    }
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#101C35] border-cyan-500/50 text-white'
                        : 'bg-[#070B16] border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-slate-100">{opt.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice & Speech Settings */}
          <div className="space-y-3 pt-4 border-t border-slate-800/70">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                <Volume2 className="w-4 h-4 text-violet-400" />
                <span>Voice & Text-to-Speech</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {isSpeechSynthesisSupported()
                  ? ttsDiag?.hasSuitableBengaliVoice
                    ? `Bangla Voice Ready (${ttsDiag.selectedBengaliVoice?.lang})`
                    : 'Browser TTS Supported (No Bangla Voice Installed)'
                  : 'TTS Unavailable in Browser'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#070B16] border border-slate-800 cursor-pointer">
                <span className="text-slate-200 font-medium">
                  Auto-Read Responses Aloud
                </span>
                <input
                  type="checkbox"
                  checked={settings.autoSpeakResponses}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      autoSpeakResponses: e.target.checked,
                    })
                  }
                  className="accent-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <div className="p-3 rounded-xl bg-[#070B16] border border-slate-800 flex items-center justify-between gap-3">
                <span className="text-slate-300 font-medium whitespace-nowrap">
                  Speech Rate: {settings.speechRate.toFixed(1)}x
                </span>
                <input
                  type="range"
                  min="0.8"
                  max="1.5"
                  step="0.1"
                  value={settings.speechRate}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      speechRate: parseFloat(e.target.value),
                    })
                  }
                  className="w-28 accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>

            {import.meta.env.DEV && ttsDiag && (
              <div className="p-3 rounded-xl bg-[#070B16] border border-slate-800/80 font-mono text-[11px] text-slate-400 space-y-1">
                <div className="text-cyan-400 font-semibold">
                  Dev-Only TTS Diagnostic
                </div>
                <div>
                  Suitable Bengali Voice Found:{' '}
                  <span className="text-slate-200">
                    {ttsDiag.hasSuitableBengaliVoice ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  Selected Bengali Voice:{' '}
                  <span className="text-slate-200">
                    {ttsDiag.selectedBengaliVoice
                      ? `${ttsDiag.selectedBengaliVoice.name} (${ttsDiag.selectedBengaliVoice.lang})`
                      : 'None (English fallback blocked for Bengali text)'}
                  </span>
                </div>
                <div>
                  Bengali Rate / Pitch:{' '}
                  <span className="text-slate-200">
                    {ttsDiag.chosenRate}x / {ttsDiag.chosenPitch}
                  </span>
                </div>
                <div>
                  Available Voices ({ttsDiag.availableVoices.length}):{' '}
                  <span className="text-slate-500">
                    {ttsDiag.availableVoices
                      .slice(0, 6)
                      .map((v) => `${v.name} [${v.lang}]`)
                      .join(', ') || 'None'}
                    {ttsDiag.availableVoices.length > 6 ? ' ...' : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Local Storage Backup & Reset */}
          <div className="space-y-3 pt-4 border-t border-slate-800/70">
            <div className="text-slate-200 font-semibold text-sm">
              Local Workspace Backup & Data
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportAllJson}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#070B16] hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export Backup (.json)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#070B16] hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-violet-400" />
                <span>Restore Backup (.json)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJsonFile}
                className="hidden"
              />

              <button
                type="button"
                onClick={onClearAllData}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/60 text-rose-300 font-medium transition-colors cursor-pointer ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Local Data</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
