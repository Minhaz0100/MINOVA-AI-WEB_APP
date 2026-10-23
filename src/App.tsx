/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Send,
  Square,
  Copy,
  Check,
  RotateCcw,
  Edit2,
  Download,
  Image as ImageIcon,
  MessageSquare,
  PanelLeftOpen,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  Paperclip,
  LogIn,
  UserCheck,
} from 'lucide-react';
import {
  ApiConversationTurn,
  AuthSession,
  BackendHealthResponse,
  ChatMessage,
  ComposerMode,
  ConversationThread,
  DeliveryMode,
  UserSettings,
  WorkspaceTab,
} from './types/chat';
import {
  checkBackendHealth,
  generateMinovaImage,
  sendChatMessage,
  streamChatMessage,
} from './services/minovaApi';
import {
  isAuthSessionExpired,
  restoreAuthSession,
  signOutMinova,
  subscribeToAuthChanges,
} from './services/authService';
import {
  createSpeechRecognitionInstance,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from './utils/speech';
import {
  ExtractedFileResult,
  exportDocumentAsPdf,
  extractTextFromFile,
} from './utils/documentFiles';
import { buildUnifiedConversationContext } from './utils/languageContext';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { Sidebar } from './components/Sidebar';
import { EmptyStateWelcome } from './components/EmptyStateWelcome';
import { BackendStatusModal } from './components/BackendStatusModal';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal, AuthModalMode } from './components/AuthModal';
import { CodeWorkspace } from './components/CodeWorkspace';
import { LearnMode } from './components/LearnMode';
import { FileStudio } from './components/FileStudio';
import { MinovaLogo } from './components/MinovaLogo';

const STORAGE_KEY = 'minova_ai_web_threads_v1';
const ACTIVE_THREAD_KEY = 'minova_ai_web_active_thread_v1';
const SETTINGS_STORAGE_KEY = 'minova_ai_web_settings_v1';

const DEFAULT_SETTINGS: UserSettings = {
  displayName: '',
  customInstructions: '',
  responseStyle: 'balanced',
  defaultDeliveryMode: 'stream',
  autoSpeakResponses: false,
  speechRate: 1.0,
};

function loadSettingsFromStorage(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function createInitialThread(): ConversationThread {
  const now = new Date().toISOString();
  return {
    id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: 'New Conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
    isPinned: false,
    isArchived: false,
  };
}

function loadThreadsFromStorage(): ConversationThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createInitialThread()];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((t: ConversationThread) => ({
        ...t,
        messages: Array.isArray(t.messages)
          ? t.messages.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            )
          : [],
      }));
    }
  } catch {
    // ignore storage errors
  }
  return [createInitialThread()];
}

function saveThreadsToStorage(threads: ConversationThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // If large base64 JPEG images exceed the 5MB localStorage quota, preserve all text history
    try {
      const compactThreads = threads.map((t) => ({
        ...t,
        messages: t.messages.map((m) =>
          m.kind === 'image' && m.imageUrl && m.imageUrl.length > 64000
            ? { ...m, imageUrl: undefined }
            : m
        ),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compactThreads));
    } catch {
      // ignore if storage is completely disabled
    }
  }
}

function deriveTitleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New Conversation';
  return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
}

const IMAGE_STYLE_PRESETS = [
  'Photorealistic 8k studio lighting',
  'Cybernetic midnight navy & electric cyan concept',
  'Clean isometric 3D architectural render',
  'Minimalist dark-mode UI/UX product showcase',
  'Cinematic sci-fi wide-angle atmosphere',
];

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(() =>
    loadSettingsFromStorage()
  );
  const [threads, setThreads] = useState<ConversationThread[]>(() =>
    loadThreadsFromStorage()
  );
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(ACTIVE_THREAD_KEY);
      if (savedId) return savedId;
    } catch {
      // ignore
    }
    return '';
  });

  // Navigation & UI panels
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>('chat');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isBackendModalOpen, setIsBackendModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Authentication & Guest state
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    restoreAuthSession()
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('signin');

  // Composer & mode state
  const [inputPrompt, setInputPrompt] = useState('');
  const [composerMode, setComposerMode] = useState<ComposerMode>('chat');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    () => loadSettingsFromStorage().defaultDeliveryMode
  );
  const [isGenerating, setIsGenerating] = useState(false);

  // Voice Input & TTS state
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceErrorToast, setVoiceErrorToast] = useState<string | null>(null);
  const [attachedChatFile, setAttachedChatFile] =
    useState<ExtractedFileResult | null>(null);
  const [isExtractingChatFile, setIsExtractingChatFile] = useState(false);

  // Editing previous user message
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Backend health state
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLatencyMs, setHealthLatencyMs] = useState<number | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const speechRecognitionRef = useRef<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);

  // Ensure activeThread always resolves and activeThreadId stays synchronized
  const activeThread =
    threads.find((t) => t.id === activeThreadId) || threads[0];

  useEffect(() => {
    if (activeThread && activeThread.id !== activeThreadId) {
      setActiveThreadId(activeThread.id);
    }
  }, [activeThread, activeThreadId]);

  // Persist threads, activeThreadId, and settings to localStorage
  useEffect(() => {
    saveThreadsToStorage(threads);
  }, [threads]);

  useEffect(() => {
    if (!activeThreadId) return;
    try {
      localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
    } catch {
      // ignore
    }
  }, [activeThreadId]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Subscribe to Firebase Authentication state changes for automatic session restoration
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((session) => {
      setAuthSession(session);
    });
    return () => unsubscribe();
  }, []);

  // Automatically check and clear expired auth sessions without erasing guest data
  useEffect(() => {
    const checkSession = () => {
      if (authSession && isAuthSessionExpired(authSession)) {
        void signOutMinova();
        setAuthSession(null);
      }
    };
    window.addEventListener('focus', checkSession);
    return () => window.removeEventListener('focus', checkSession);
  }, [authSession]);

  const handleOpenAuthModal = (mode: AuthModalMode = 'signin') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleSignOut = () => {
    void signOutMinova();
    setAuthSession(null);
  };

  // Verify backend health on mount
  const handleVerifyHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    setHealthError(null);
    try {
      const result = await checkBackendHealth();
      setHealth(result.data);
      setHealthLatencyMs(result.latencyMs);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : 'Unable to reach MINOVA AI backend.'
      );
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    handleVerifyHealth();
  }, [handleVerifyHealth]);

  // Auto-scroll when messages update in chat
  useEffect(() => {
    if (activeWorkspace === 'chat' || activeWorkspace === 'image') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread?.messages.length, isGenerating, activeWorkspace]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputPrompt]);

  // Keyboard shortcut Ctrl/Cmd + K for New Conversation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleNewThread();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const updateThreadMessages = useCallback(
    (
      threadId: string,
      updater: (prevMessages: ChatMessage[], currentTitle: string) => {
        messages: ChatMessage[];
        title?: string;
      }
    ) => {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          const result = updater(t.messages, t.title);
          return {
            ...t,
            title: result.title ?? t.title,
            updatedAt: new Date().toISOString(),
            messages: result.messages,
          };
        })
      );
    },
    []
  );

  const handleNewThread = () => {
    if (isGenerating) {
      abortControllerRef.current?.abort();
      setIsGenerating(false);
    }
    stopSpeaking();
    setSpeakingMessageId(null);
    const fresh = createInitialThread();
    setThreads((prev) => [fresh, ...prev]);
    setActiveThreadId(fresh.id);
    setInputPrompt('');
    setComposerMode('chat');
    setActiveWorkspace('chat');
    textareaRef.current?.focus();
  };

  const handleDeleteThread = (id: string) => {
    if (isGenerating && id === activeThread.id) {
      abortControllerRef.current?.abort();
      setIsGenerating(false);
    }
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        const fresh = createInitialThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (id === activeThread.id) {
        setActiveThreadId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleRenameThread = (id: string, newTitle: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t))
    );
  };

  const handleTogglePinThread = (id: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isPinned: !t.isPinned } : t))
    );
  };

  const handleToggleArchiveThread = (id: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isArchived: !t.isArchived } : t))
    );
  };

  const handleClearCurrentThread = () => {
    if (!activeThread || activeThread.messages.length === 0) return;
    if (isGenerating) {
      abortControllerRef.current?.abort();
      setIsGenerating(false);
    }
    stopSpeaking();
    setSpeakingMessageId(null);
    updateThreadMessages(activeThread.id, () => ({
      messages: [],
      title: 'New Conversation',
    }));
  };

  const handleExportCurrentThread = () => {
    if (!activeThread) return;
    const lines: string[] = [
      `# ${activeThread.title}`,
      `Product: MINOVA AI · Developed by Minhaz`,
      `Exported: ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
    ];

    for (const msg of activeThread.messages) {
      const speaker =
        msg.role === 'user' ? settings.displayName || 'User' : 'MINOVA AI';
      lines.push(`### ${speaker}`);
      lines.push(msg.content);
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeThread.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'minova-ai-chat'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
  };

  // Voice Input (Speech-to-Text) handler
  const handleToggleVoiceInput = () => {
    if (isListeningVoice) {
      speechRecognitionRef.current?.stop();
      setIsListeningVoice(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setVoiceErrorToast(
        'Voice input (Web Speech API) is not supported in this browser. Try Chrome or Edge.'
      );
      setTimeout(() => setVoiceErrorToast(null), 4000);
      return;
    }

    const recognition = createSpeechRecognitionInstance();
    if (!recognition) return;

    speechRecognitionRef.current = recognition;
    const baseText = inputPrompt ? `${inputPrompt.trim()} ` : '';

    recognition.onstart = () => {
      setIsListeningVoice(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputPrompt(`${baseText}${transcript}`);
    };

    recognition.onerror = () => {
      setIsListeningVoice(false);
    };

    recognition.onend = () => {
      setIsListeningVoice(false);
    };

    recognition.start();
  };

  // Text-to-Speech handler
  const handleToggleSpeakMessage = (msg: ChatMessage) => {
    if (speakingMessageId === msg.id) {
      stopSpeaking();
      setSpeakingMessageId(null);
      return;
    }
    setVoiceErrorToast(null);
    setSpeakingMessageId(msg.id);
    speakText(msg.content, settings.speechRate, {
      onEnd: () => {
        setSpeakingMessageId((curr) => (curr === msg.id ? null : curr));
      },
      onError: (userMessage) => {
        setSpeakingMessageId((curr) => (curr === msg.id ? null : curr));
        setVoiceErrorToast(userMessage);
      },
    });
  };

  // Quick local PDF / DOCX / Text / Code file attach into chat composer
  const handleQuickAttachTextFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsExtractingChatFile(true);
    setVoiceErrorToast(null);
    try {
      const extracted = await extractTextFromFile(file);
      setAttachedChatFile(extracted);
      textareaRef.current?.focus();
    } catch (err) {
      setVoiceErrorToast(
        err instanceof Error
          ? err.message
          : 'Unable to extract text from the selected file.'
      );
      setTimeout(() => setVoiceErrorToast(null), 5000);
    } finally {
      setIsExtractingChatFile(false);
    }
  };

  // Build unified personalized + language quality conversation context from UserSettings
  const buildPersonalizedConversation = (
    rawHistory: ApiConversationTurn[]
  ): ApiConversationTurn[] => {
    return buildUnifiedConversationContext(rawHistory, settings);
  };

  /**
   * Core execution function for sending a chat message or image generation prompt
   * to the verified MINOVA AI backend.
   */
  const executeSubmission = async (
    rawPrompt: string,
    modeOverride?: ComposerMode,
    baseHistoryOverride?: ChatMessage[]
  ) => {
    const trimmed = rawPrompt.trim();
    if ((!trimmed && !attachedChatFile) || isGenerating || !activeThread) return;

    const isImagineCommand = /^\/(imagine|image)\s+/i.test(trimmed);
    const effectiveMode: ComposerMode = isImagineCommand
      ? 'image'
      : modeOverride ?? (activeWorkspace === 'image' ? 'image' : composerMode);

    let effectivePrompt = isImagineCommand
      ? trimmed.replace(/^\/(imagine|image)\s+/i, '').trim()
      : trimmed || `Analyze the attached file (${attachedChatFile?.fileName}) and summarize its key points.`;

    const fileSnapshot = attachedChatFile;
    if (fileSnapshot && effectiveMode === 'chat' && !baseHistoryOverride) {
      const snippet =
        fileSnapshot.content.length > 28000
          ? `${fileSnapshot.content.slice(0, 28000)}\n...[Truncated]`
          : fileSnapshot.content;
      effectivePrompt = `${effectivePrompt}\n\n[Attached File: ${
        fileSnapshot.fileName
      } (${fileSnapshot.fileType.toUpperCase()}, ${
        fileSnapshot.wordCount
      } words)]\n\`\`\`\n${snippet}\n\`\`\``;
      setAttachedChatFile(null);
    }

    if (!effectivePrompt) return;

    const targetThreadId = activeThread.id;
    const priorMessages = baseHistoryOverride ?? activeThread.messages;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content:
        effectiveMode === 'image'
          ? `Generate image: ${effectivePrompt}`
          : effectivePrompt,
      timestamp: new Date().toISOString(),
      kind: 'text',
    };

    const assistantMsgId = `msg_${Date.now() + 1}_a`;
    const placeholderAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      kind: effectiveMode === 'image' ? 'image' : 'text',
      imagePrompt: effectiveMode === 'image' ? effectivePrompt : undefined,
      isStreaming: true,
      deliveryMode: effectiveMode === 'chat' ? deliveryMode : undefined,
    };

    const nextTitle =
      priorMessages.length === 0
        ? deriveTitleFromPrompt(effectivePrompt)
        : activeThread.title;

    updateThreadMessages(targetThreadId, () => ({
      messages: [...priorMessages, userMsg, placeholderAssistantMsg],
      title: nextTitle,
    }));

    setInputPrompt('');
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (effectiveMode === 'image') {
        const result = await generateMinovaImage(
          effectivePrompt,
          controller.signal
        );
        updateThreadMessages(targetThreadId, (msgs) => ({
          messages: msgs.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  kind: 'image',
                  content: `Generated image for: "${effectivePrompt}"`,
                  imageUrl: result.imageUrl,
                  imagePrompt: effectivePrompt,
                  isStreaming: false,
                  latencyMs: result.latencyMs,
                }
              : m
          ),
        }));
      } else {
        const rawConversation: ApiConversationTurn[] = priorMessages
          .filter(
            (m) => !m.isError && m.kind !== 'image' && m.content.trim().length > 0
          )
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        const apiConversation = buildPersonalizedConversation(rawConversation);

        if (deliveryMode === 'stream') {
          const result = await streamChatMessage(
            effectivePrompt,
            apiConversation,
            (_delta, accumulated) => {
              updateThreadMessages(targetThreadId, (msgs) => ({
                messages: msgs.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: accumulated,
                        isStreaming: true,
                      }
                    : m
                ),
              }));
            },
            controller.signal
          );

          const finalReply = result.reply || 'No response content returned.';
          updateThreadMessages(targetThreadId, (msgs) => ({
            messages: msgs.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: finalReply,
                    isStreaming: false,
                    latencyMs: result.latencyMs,
                    deliveryMode: result.modeUsed,
                  }
                : m
            ),
          }));

          if (settings.autoSpeakResponses) {
            setSpeakingMessageId(assistantMsgId);
            speakText(finalReply, settings.speechRate, {
              onEnd: () => setSpeakingMessageId(null),
              onError: (userMessage) => {
                setSpeakingMessageId(null);
                setVoiceErrorToast(userMessage);
              },
            });
          }
        } else {
          const result = await sendChatMessage(
            effectivePrompt,
            apiConversation,
            controller.signal
          );

          updateThreadMessages(targetThreadId, (msgs) => ({
            messages: msgs.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: result.reply,
                    isStreaming: false,
                    latencyMs: result.latencyMs,
                    deliveryMode: 'standard',
                  }
                : m
            ),
          }));

          if (settings.autoSpeakResponses) {
            setSpeakingMessageId(assistantMsgId);
            speakText(result.reply, settings.speechRate, {
              onEnd: () => setSpeakingMessageId(null),
              onError: (userMessage) => {
                setSpeakingMessageId(null);
                setVoiceErrorToast(userMessage);
              },
            });
          }
        }
      }
    } catch (err) {
      const isAborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err as { name?: string })?.name === 'AbortError';

      if (isAborted) {
        updateThreadMessages(targetThreadId, (msgs) => ({
          messages: msgs.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: m.content
                    ? `${m.content}\n\n*[Generation stopped by user]*`
                    : '*Generation stopped by user.*',
                  isStreaming: false,
                }
              : m
          ),
        }));
      } else {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Unable to complete request to MINOVA AI backend.';
        const errorCode = (err as { code?: string })?.code || 'API_ERROR';

        updateThreadMessages(targetThreadId, (msgs) => ({
          messages: msgs.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: errorMsg,
                  isStreaming: false,
                  isError: true,
                  errorCode,
                }
              : m
          ),
        }));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Handler when CodeWorkspace, LearnMode, or FileStudio sends a turn into the active Chat
  const handleSendWorkspaceResultToChat = (
    promptText: string,
    assistantReply?: string
  ) => {
    setActiveWorkspace('chat');
    setComposerMode('chat');

    if (assistantReply && activeThread) {
      const now = new Date().toISOString();
      const uMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: promptText,
        timestamp: now,
        kind: 'text',
      };
      const aMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}_a`,
        role: 'assistant',
        content: assistantReply,
        timestamp: now,
        kind: 'text',
      };
      updateThreadMessages(activeThread.id, (prev, title) => ({
        messages: [...prev, uMsg, aMsg],
        title:
          prev.length === 0 ? deriveTitleFromPrompt(promptText) : title,
      }));
    } else {
      executeSubmission(promptText, 'chat');
    }
  };

  const handleRegenerateFromIndex = (assistantMsgIndex: number) => {
    if (isGenerating || !activeThread) return;
    const msgs = activeThread.messages;
    let userMsgIndex = assistantMsgIndex - 1;
    while (userMsgIndex >= 0 && msgs[userMsgIndex].role !== 'user') {
      userMsgIndex--;
    }
    if (userMsgIndex < 0) return;

    const targetUserMsg = msgs[userMsgIndex];
    const targetAssistantMsg = msgs[assistantMsgIndex];
    const historyBeforeUser = msgs.slice(0, userMsgIndex);

    const isImageTurn = targetAssistantMsg?.kind === 'image';
    const rawPrompt = isImageTurn
      ? targetAssistantMsg.imagePrompt ||
        targetUserMsg.content.replace(/^Generate image:\s*/i, '')
      : targetUserMsg.content;

    executeSubmission(
      rawPrompt,
      isImageTurn ? 'image' : 'chat',
      historyBeforeUser
    );
  };

  const handleSaveEditedUserMessage = (userMsgIndex: number) => {
    if (!editingMessageContent.trim() || isGenerating || !activeThread) return;
    const historyBeforeUser = activeThread.messages.slice(0, userMsgIndex);
    const updatedContent = editingMessageContent.trim();
    setEditingMessageId(null);
    setEditingMessageContent('');
    executeSubmission(updatedContent, 'chat', historyBeforeUser);
  };

  const handleCopyMessage = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMessageId(msg.id);
    setTimeout(() => setCopiedMessageId(null), 1800);
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const countWords = (text: string) => {
    const clean = text.trim();
    if (!clean) return 0;
    return clean.split(/\s+/).length;
  };

  const handleSelectWorkspaceTab = (tab: WorkspaceTab) => {
    setActiveWorkspace(tab);
    if (tab === 'image') {
      setComposerMode('image');
    } else if (tab === 'chat') {
      setComposerMode('chat');
    }
  };

  // All generated images across threads for quick browsing in Image Studio
  const generatedImagesList = threads.flatMap((t) =>
    t.messages.filter((m) => m.kind === 'image' && Boolean(m.imageUrl))
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060A14] text-slate-100">
      {/* Left Navigation Sidebar */}
      <Sidebar
        threads={threads}
        activeThreadId={activeThread.id}
        activeWorkspace={activeWorkspace}
        isOpenMobile={isMobileSidebarOpen}
        isCollapsedDesktop={isDesktopSidebarCollapsed}
        authSession={authSession}
        guestDisplayName={settings.displayName}
        onSelectThread={(id) => setActiveThreadId(id)}
        onSelectWorkspace={handleSelectWorkspaceTab}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        onTogglePinThread={handleTogglePinThread}
        onToggleArchiveThread={handleToggleArchiveThread}
        onExportCurrentThread={handleExportCurrentThread}
        onOpenBackendModal={() => setIsBackendModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenAuthModal={handleOpenAuthModal}
        onSignOut={handleSignOut}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onToggleCollapseDesktop={() =>
          setIsDesktopSidebarCollapsed((prev) => !prev)
        }
      />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#060A14]">
        {/* Top Bar Contract: 3 Clean Zones separated by gap-8 */}
        <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3 border-b border-slate-800/80 bg-[#080D1A]/90 backdrop-blur-md shrink-0">
          {/* Zone 1: Brand Title & Geometric Logo (Single Line) */}
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setIsMobileSidebarOpen(true);
                } else {
                  setIsDesktopSidebarCollapsed((prev) => !prev);
                }
              }}
              className={`p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer shrink-0 ${
                !isDesktopSidebarCollapsed ? 'lg:hidden' : ''
              }`}
              title="Toggle Conversations Sidebar"
              aria-label="Toggle Conversations Sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNewThread}
              className="flex items-center gap-2.5 text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MinovaLogo size="sm" />
              <span>MINOVA AI</span>
            </button>
          </div>

          {/* Zone 2: 5 Concise Single-Line Workspace Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <button
              type="button"
              onClick={() => handleSelectWorkspaceTab('chat')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeWorkspace === 'chat'
                  ? 'text-cyan-400 underline underline-offset-8 decoration-cyan-400'
                  : ''
              }`}
            >
              AI Chat
            </button>
            <button
              type="button"
              onClick={() => handleSelectWorkspaceTab('code')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeWorkspace === 'code'
                  ? 'text-cyan-400 underline underline-offset-8 decoration-cyan-400'
                  : ''
              }`}
            >
              Code Workspace
            </button>
            <button
              type="button"
              onClick={() => handleSelectWorkspaceTab('learn')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeWorkspace === 'learn'
                  ? 'text-cyan-400 underline underline-offset-8 decoration-cyan-400'
                  : ''
              }`}
            >
              Learn Mode
            </button>
            <button
              type="button"
              onClick={() => handleSelectWorkspaceTab('files')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeWorkspace === 'files'
                  ? 'text-cyan-400 underline underline-offset-8 decoration-cyan-400'
                  : ''
              }`}
            >
              File Studio
            </button>
            <button
              type="button"
              onClick={() => handleSelectWorkspaceTab('image')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeWorkspace === 'image'
                  ? 'text-violet-400 underline underline-offset-8 decoration-violet-400'
                  : ''
              }`}
            >
              Image Studio
            </button>
          </nav>

          {/* Zone 3: Primary Action & Account Status */}
          <div className="flex items-center gap-2 shrink-0">
            {authSession ? (
              <button
                type="button"
                onClick={() => handleOpenAuthModal('signin')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title={`Signed in as ${authSession.user.email}`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {authSession.user.displayName}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenAuthModal('signin')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0D1527] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Sign In or Create Account (Currently in Guest Mode)"
              >
                <LogIn className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sign In</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer shrink-0"
              title="Settings & Personalization"
              aria-label="Settings & Personalization"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNewThread}
              className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* Secondary Workspace Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 border-b border-slate-800/50 bg-[#070B16] text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="font-medium text-slate-200 truncate max-w-[140px] sm:max-w-xs">
              {activeWorkspace === 'chat'
                ? activeThread.title
                : activeWorkspace === 'code'
                ? 'Code Workspace & Debugger'
                : activeWorkspace === 'learn'
                ? 'Learn Mode & Quizzes'
                : activeWorkspace === 'files'
                ? 'AI File Studio'
                : 'Image Synthesis Studio'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-400 font-semibold whitespace-nowrap">
              MINOVA AI
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline text-slate-400 whitespace-nowrap">
              Developed by Minhaz
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {(activeWorkspace === 'chat' || activeWorkspace === 'image') &&
              composerMode === 'chat' && (
                <div
                  className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0D1527] border border-slate-800"
                  role="group"
                  aria-label="Response delivery mode"
                >
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('stream')}
                    className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      deliveryMode === 'stream'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SSE Stream
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('standard')}
                    className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      deliveryMode === 'standard'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Standard
                  </button>
                </div>
              )}

            {(activeWorkspace === 'chat' || activeWorkspace === 'image') &&
              activeThread.messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCurrentThread}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Clear messages in current thread"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}
          </div>
        </div>

        {/* Main Workspace Body */}
        {activeWorkspace === 'code' ? (
          <main className="flex-1 overflow-y-auto">
            <CodeWorkspace onSendToChat={handleSendWorkspaceResultToChat} />
          </main>
        ) : activeWorkspace === 'learn' ? (
          <main className="flex-1 overflow-y-auto">
            <LearnMode onSendToChat={handleSendWorkspaceResultToChat} />
          </main>
        ) : activeWorkspace === 'files' ? (
          <main className="flex-1 overflow-y-auto">
            <FileStudio onSendToChat={handleSendWorkspaceResultToChat} />
          </main>
        ) : (
          <>
            {/* Scrollable Chat / Image Studio Viewport */}
            <main className="flex-1 overflow-y-auto">
              {/* Image Studio Header & Style Presets when in Image tab */}
              {activeWorkspace === 'image' && (
                <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-2 space-y-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1222] border border-violet-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-violet-400">
                          MINOVA AI · Image Synthesis Studio
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
                          Generate High-Resolution Visuals
                        </h2>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        Flux-1-Schnell
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {IMAGE_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setComposerMode('image');
                            setInputPrompt((prev) =>
                              prev
                                ? `${prev.replace(/,\s*$/, '')}, ${preset}`
                                : `${preset}: `
                            );
                            textareaRef.current?.focus();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#070B16] hover:bg-violet-500/15 border border-slate-800 hover:border-violet-500/40 text-[11px] text-slate-300 hover:text-violet-200 transition-colors cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generated Image Gallery if images exist */}
                  {generatedImagesList.length > 0 &&
                    activeThread.messages.length === 0 && (
                      <div className="space-y-2.5">
                        <div className="text-xs font-semibold text-slate-400">
                          Recent Generated Images in Browser
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {generatedImagesList.slice(0, 6).map((imgMsg) => (
                            <div
                              key={imgMsg.id}
                              className="rounded-xl overflow-hidden border border-slate-800 bg-[#080D1A] flex flex-col justify-between"
                            >
                              <img
                                src={imgMsg.imageUrl}
                                alt={imgMsg.imagePrompt || 'MINOVA AI Image'}
                                referrerPolicy="no-referrer"
                                className="w-full h-36 object-cover"
                              />
                              <div className="p-2.5 flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-slate-300 truncate">
                                  {imgMsg.imagePrompt}
                                </span>
                                <a
                                  href={imgMsg.imageUrl}
                                  download={`minova-ai-${imgMsg.id}.jpg`}
                                  className="text-violet-400 hover:text-violet-300 shrink-0"
                                  title="Download JPEG"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {activeThread.messages.length === 0 ? (
                <EmptyStateWelcome
                  onSelectPrompt={(prompt, mode) => {
                    setComposerMode(mode);
                    executeSubmission(prompt, mode);
                  }}
                  imageGenerationReady={
                    health?.imageGeneration?.status === 'ready' || true
                  }
                />
              ) : (
                <div className="max-w-3xl mx-auto px-3 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
                  {activeThread.messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const isEditingThis = editingMessageId === msg.id;
                    const isSpeakingThis = speakingMessageId === msg.id;

                    return (
                      <motion.article
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.2,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className={`animate-message-enter rounded-2xl p-4 sm:p-5 border transition-colors ${
                          isUser
                            ? 'bg-[#0C1426] border-slate-800/80'
                            : msg.isError
                            ? 'bg-rose-950/20 border-rose-800/60'
                            : 'bg-[#090F1E] border-slate-800/60'
                        }`}
                      >
                        {/* Message Header: Unboxed Metadata with · separators */}
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-3">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            {!isUser && <MinovaLogo size="xs" />}
                            <span
                              className={`font-semibold ${
                                isUser ? 'text-slate-200' : 'text-cyan-400'
                              }`}
                            >
                              {isUser
                                ? settings.displayName.trim() || 'You'
                                : 'MINOVA AI'}
                            </span>
                            {!isUser && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-400">
                                  Developed by Minhaz
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-slate-500">
                              {formatTime(msg.timestamp)}
                            </span>
                            {!isUser && msg.latencyMs !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-slate-500">
                                  {(msg.latencyMs / 1000).toFixed(2)}s
                                </span>
                              </>
                            )}
                            {!isUser &&
                              msg.kind !== 'image' &&
                              !msg.isStreaming &&
                              !msg.isError &&
                              msg.content && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums text-slate-500">
                                    {countWords(msg.content)} words
                                  </span>
                                </>
                              )}
                          </div>

                          {/* Message Action Controls */}
                          {!msg.isStreaming && (
                            <div className="flex items-center gap-1 shrink-0">
                              {isUser && !isEditingThis && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditingMessageContent(
                                      msg.content.replace(
                                        /^Generate image:\s*/i,
                                        ''
                                      )
                                    );
                                  }}
                                  disabled={isGenerating}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer disabled:opacity-40"
                                  title="Edit and resubmit prompt"
                                  aria-label="Edit prompt"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {!isUser &&
                                msg.kind === 'image' &&
                                msg.imageUrl && (
                                  <a
                                    href={msg.imageUrl}
                                    download={`minova-ai-${msg.id}.jpg`}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-xs"
                                    title="Download generated image"
                                  >
                                    <Download className="w-3.5 h-3.5 text-violet-400" />
                                    <span>Download</span>
                                  </a>
                                )}

                              {!isUser &&
                                msg.kind !== 'image' &&
                                !msg.isError &&
                                msg.content &&
                                isSpeechSynthesisSupported() && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSpeakMessage(msg)}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      isSpeakingThis
                                        ? 'text-cyan-400 bg-cyan-500/15'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                                    }`}
                                    title={
                                      isSpeakingThis
                                        ? 'Stop reading aloud'
                                        : 'Read response aloud (TTS)'
                                    }
                                    aria-label="Read response aloud"
                                  >
                                    {isSpeakingThis ? (
                                      <VolumeX className="w-3.5 h-3.5" />
                                    ) : (
                                      <Volume2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}

                              {msg.kind !== 'image' && msg.content && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                                  title="Copy message"
                                  aria-label="Copy message"
                                >
                                  {copiedMessageId === msg.id ? (
                                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}

                              {!isUser &&
                                msg.kind !== 'image' &&
                                !msg.isError &&
                                msg.content && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      exportDocumentAsPdf(
                                        activeThread.title || 'MINOVA AI Response',
                                        msg.content,
                                        `minova-response-${msg.id}`
                                      )
                                    }
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                                    title="Export response as PDF"
                                    aria-label="Export response as PDF"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                )}

                              {!isUser && (
                                <button
                                  type="button"
                                  onClick={() => handleRegenerateFromIndex(idx)}
                                  disabled={isGenerating}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800/80 transition-colors cursor-pointer disabled:opacity-40"
                                  title="Regenerate response"
                                  aria-label="Regenerate response"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Message Content Body */}
                        {isEditingThis ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingMessageContent}
                              onChange={(e) =>
                                setEditingMessageContent(e.target.value)
                              }
                              rows={3}
                              className="w-full p-3 rounded-xl bg-[#070B16] border border-cyan-500/60 text-sm text-white focus:outline-none"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingMessageId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditedUserMessage(idx)}
                                className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Save & Resubmit
                              </button>
                            </div>
                          </div>
                        ) : msg.isError ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-rose-200">
                            <div className="flex items-start gap-2.5">
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                              <div>
                                <div className="font-medium">{msg.content}</div>
                                {msg.errorCode && (
                                  <div className="text-xs font-mono text-rose-400/80 mt-0.5">
                                    Code: {msg.errorCode}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRegenerateFromIndex(idx)}
                              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                            >
                              Retry Request
                            </button>
                          </div>
                        ) : msg.kind === 'image' ? (
                          <div className="space-y-3">
                            {msg.isStreaming ? (
                              <div className="flex items-center gap-3 py-8 px-4 rounded-xl bg-[#060A14] border border-slate-800/80 text-sm text-slate-300">
                                <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0" />
                                <span>
                                  MINOVA AI is synthesizing your image via
                                  Flux-1-Schnell...
                                </span>
                              </div>
                            ) : msg.imageUrl ? (
                              <div className="space-y-2.5">
                                <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#050811] w-full max-w-md sm:max-w-lg">
                                  <img
                                    src={msg.imageUrl}
                                    alt={
                                      msg.imagePrompt ||
                                      'Generated by MINOVA AI'
                                    }
                                    referrerPolicy="no-referrer"
                                    className="w-full max-h-[380px] sm:max-h-[460px] object-contain block mx-auto"
                                  />
                                </div>
                                <p className="text-xs text-slate-400 break-words">
                                  Prompt: &ldquo;{msg.imagePrompt}&rdquo;
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : isUser ? (
                          <div className="text-[15px] leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        ) : (
                          <div>
                            {msg.content ? (
                              <MarkdownRenderer content={msg.content} />
                            ) : (
                              <div className="flex items-center gap-2.5 py-2 text-sm text-slate-400">
                                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                                <span>MINOVA AI is thinking...</span>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.article>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </main>

            {/* Bottom Composer Area */}
            <footer className="px-4 sm:px-6 pt-2 pb-4 bg-[#060A14] border-t border-slate-800/70 shrink-0">
              <div className="max-w-3xl mx-auto">
                {voiceErrorToast && (
                  <div className="mb-2 px-3.5 py-2 rounded-xl bg-amber-950/50 border border-amber-700/60 text-xs text-amber-200 flex items-center justify-between">
                    <span>{voiceErrorToast}</span>
                    <button
                      type="button"
                      onClick={() => setVoiceErrorToast(null)}
                      className="text-amber-300 hover:text-white ml-2 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {attachedChatFile && (
                  <div className="mb-2 px-3.5 py-2 rounded-xl bg-[#0D1527] border border-cyan-500/40 text-xs text-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 font-mono">
                      <span className="text-cyan-400 font-semibold truncate">
                        {attachedChatFile.fileName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{attachedChatFile.fileType.toUpperCase()}</span>
                      <span aria-hidden="true">·</span>
                      <span>{attachedChatFile.wordCount} words</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedChatFile(null)}
                      className="text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                )}

                <div
                  className={`rounded-2xl bg-[#0B1222] border transition-colors p-3 ${
                    composerMode === 'image' || activeWorkspace === 'image'
                      ? 'border-violet-500/50 focus-within:border-violet-400'
                      : 'border-slate-800 focus-within:border-cyan-500/60'
                  }`}
                >
                  {/* Mode Selector Bar inside Composer */}
                  <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/70 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setComposerMode('chat');
                          if (activeWorkspace === 'image') {
                            setActiveWorkspace('chat');
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          composerMode === 'chat' &&
                          activeWorkspace !== 'image'
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>MINOVA AI Chat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setComposerMode('image')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          composerMode === 'image' ||
                          activeWorkspace === 'image'
                            ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Image Studio</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Attach PDF / DOCX / Text / Code File Button */}
                      <button
                        type="button"
                        onClick={() => quickFileInputRef.current?.click()}
                        disabled={isExtractingChatFile}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer disabled:opacity-50"
                        title="Attach PDF, DOCX, text, or code file for analysis"
                      >
                        {isExtractingChatFile ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        ) : (
                          <Paperclip className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {isExtractingChatFile
                            ? 'Reading File...'
                            : 'Attach PDF/DOCX/Code'}
                        </span>
                      </button>
                      <input
                        ref={quickFileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.tsv,.ts,.tsx,.js,.jsx,.py,.kt,.kts,.java,.cpp,.c,.h,.rs,.go,.sql,.xml,.yaml,.yml,.html,.css,.log,.sh,.gradle"
                        onChange={handleQuickAttachTextFile}
                        className="hidden"
                      />

                      <span className="font-mono text-[11px] text-slate-500 tabular-nums hidden sm:inline">
                        {inputPrompt.length} chars
                      </span>
                    </div>
                  </div>

                  {/* Prompt Input + Voice Mic + Primary Send / Stop Button */}
                  <div className="flex items-end gap-2 sm:gap-3">
                    <textarea
                      ref={textareaRef}
                      value={inputPrompt}
                      onChange={(e) => setInputPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          executeSubmission(inputPrompt);
                        }
                      }}
                      rows={1}
                      placeholder={
                        composerMode === 'image' || activeWorkspace === 'image'
                          ? 'Describe the image you want MINOVA AI to generate...'
                          : 'Ask MINOVA AI anything, attach a PDF/DOCX, or type /imagine <prompt>...'
                      }
                      disabled={isGenerating}
                      className="flex-1 bg-transparent text-sm sm:text-[15px] text-white placeholder:text-slate-500 focus:outline-none resize-none max-h-44 leading-relaxed py-1"
                    />

                    {/* Voice Input Button */}
                    <button
                      type="button"
                      onClick={handleToggleVoiceInput}
                      disabled={isGenerating}
                      className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                        isListeningVoice
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                          : 'bg-[#070B16] hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title={
                        isListeningVoice
                          ? 'Stop voice dictation'
                          : 'Voice input (Browser Speech-to-Text)'
                      }
                      aria-label="Voice input"
                    >
                      {isListeningVoice ? (
                        <MicOff className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>

                    {isGenerating ? (
                      <button
                        type="button"
                        onClick={handleStopGenerating}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        title="Stop generation"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => executeSubmission(inputPrompt)}
                        disabled={!inputPrompt.trim() && !attachedChatFile}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                          composerMode === 'image' ||
                          activeWorkspace === 'image'
                            ? 'bg-violet-500 hover:bg-violet-400 text-white'
                            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {composerMode === 'image' ||
                          activeWorkspace === 'image'
                            ? 'Generate'
                            : 'Send'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Quiet Footer Attribution Line */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-300 font-medium">
                      MINOVA AI
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Developed by Minhaz</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span>Enter to send</span>
                    <span aria-hidden="true">·</span>
                    <span>Shift+Enter for new line</span>
                  </div>
                </div>
              </div>
            </footer>
          </>
        )}
      </div>

      {/* Backend Service Contract & Live Health Modal */}
      <BackendStatusModal
        isOpen={isBackendModalOpen}
        onClose={() => setIsBackendModalOpen(false)}
        health={health}
        healthLatencyMs={healthLatencyMs}
        isChecking={isCheckingHealth}
        healthError={healthError}
        onRefreshHealth={handleVerifyHealth}
      />

      {/* Settings & Personalization Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={(next) => {
          setSettings(next);
          setDeliveryMode(next.defaultDeliveryMode);
        }}
        threads={threads}
        onImportThreads={(imported) => {
          setThreads(imported);
          if (imported[0]?.id) {
            setActiveThreadId(imported[0].id);
          }
        }}
        onClearAllData={() => {
          stopSpeaking();
          const fresh = createInitialThread();
          setThreads([fresh]);
          setActiveThreadId(fresh.id);
          setSettings(DEFAULT_SETTINGS);
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(ACTIVE_THREAD_KEY);
          localStorage.removeItem(SETTINGS_STORAGE_KEY);
          setIsSettingsModalOpen(false);
        }}
      />

      {/* Sign In / Create Account Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        authSession={authSession}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(session) => {
          setAuthSession(session);
        }}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
