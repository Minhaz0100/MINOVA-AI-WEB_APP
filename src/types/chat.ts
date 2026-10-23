export type MessageRole = 'user' | 'assistant';

export interface ApiConversationTurn {
  role: MessageRole;
  content: string;
}

export interface ChatRequestPayload {
  message: string;
  conversation: ApiConversationTurn[];
}

export interface ChatSuccessResponse {
  success: true;
  message: string;
  model?: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export interface BackendHealthResponse {
  success: boolean;
  service: string;
  status: 'healthy' | string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  imageGeneration?: {
    provider: string;
    configured: boolean;
    status: string;
    workerOrigin?: string;
    steps?: number;
    timeoutMs?: number;
    maxPromptLength?: number;
  };
}

export type DeliveryMode = 'stream' | 'standard';
export type ComposerMode = 'chat' | 'image';
export type WorkspaceTab = 'chat' | 'code' | 'learn' | 'files' | 'image';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  kind?: 'text' | 'image';
  imageUrl?: string;
  imagePrompt?: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorCode?: string;
  latencyMs?: number;
  deliveryMode?: DeliveryMode;
}

export interface ConversationThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  isPinned?: boolean;
  isArchived?: boolean;
}

export type ResponseStylePreset =
  | 'balanced'
  | 'concise'
  | 'detailed'
  | 'code_first';

export interface UserSettings {
  displayName: string;
  customInstructions: string;
  responseStyle: ResponseStylePreset;
  defaultDeliveryMode: DeliveryMode;
  autoSpeakResponses: boolean;
  speechRate: number;
}

export type LearnLanguageId =
  | 'auto'
  | 'bn'
  | 'en'
  | 'banglish'
  | 'ar'
  | 'hi'
  | 'ur'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'fr'
  | 'de'
  | 'es';

export type LearnSubjectCategory =
  | 'Computer Science & IT'
  | 'Programming & Software Engineering'
  | 'Mathematics'
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'English Language & Grammar'
  | 'Bangla Language & Literature'
  | 'Business & Economics'
  | 'Accounting & Finance'
  | 'History'
  | 'Geography'
  | 'General Knowledge'
  | 'BCS & Competitive Exam Preparation'
  | 'Engineering & Technology'
  | 'Other';

export interface LearnSessionPreferences {
  language: LearnLanguageId;
  subjectCategory: LearnSubjectCategory;
  customSubject: string;
  studyTopic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  studyFormat: 'deep_dive' | 'socratic' | 'cheatsheet' | 'exercises';
  studyContent: string;
  quizTopic: string;
  questionCount: number;
  flashcardTopic: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface SavedQuizResult {
  id: string;
  topic: string;
  difficulty: string;
  score: number;
  total: number;
  completedAt: string;
  language?: LearnLanguageId;
  subjectCategory?: LearnSubjectCategory;
  customSubject?: string;
}

export interface AuthUserProfile {
  id: string;
  displayName: string;
  email: string;
  createdAt?: string;
}

export interface AuthSession {
  user: AuthUserProfile;
  accessToken: string;
  expiresAt?: string;
  provider: 'minova-backend-jwt' | 'firebase-auth';
}

