import {
  ApiConversationTurn,
  BackendHealthResponse,
  ChatRequestPayload,
} from '../types/chat';
import { buildUnifiedConversationContext } from '../utils/languageContext';

/**
 * Verified existing production backend for MINOVA AI.
 * No API keys or secrets are stored or used in browser code.
 */
export const MINOVA_BACKEND_URL = (
  (import.meta as any).env?.VITE_MINOVA_BACKEND_URL || 'https://minova-ai-backend.ai.studio'
).replace(/\/+$/, '');

const FALLBACK_PROXY_PREFIX = '/minova-proxy';

/**
 * Executes a fetch against the verified MINOVA AI backend (https://minova-ai-backend.ai.studio).
 * In development mode only, falls back to the local Vite proxy if a browser extension
 * blocks cross-origin requests.
 */
async function fetchWithCorsFallback(
  endpointPath: string,
  init?: RequestInit
): Promise<Response> {
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const directUrl = `${MINOVA_BACKEND_URL}${normalizedPath}`;

  try {
    return await fetch(directUrl, {
      ...init,
      mode: 'cors',
      credentials: 'omit',
    });
  } catch (err) {
    // Do not retry if explicitly aborted by the user
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    if ((err as { name?: string })?.name === 'AbortError') {
      throw err;
    }
    // Only use Vite dev server proxy fallback in local development
    if ((import.meta as any).env?.DEV) {
      return await fetch(`${FALLBACK_PROXY_PREFIX}${normalizedPath}`, init);
    }
    throw new Error(
      'Unable to connect to MINOVA AI backend (https://minova-ai-backend.ai.studio). Please check your internet connection and try again.'
    );
  }
}

/**
 * GET /api/health
 * Verifies backend health, uptime, and image generation readiness.
 */
export async function checkBackendHealth(
  signal?: AbortSignal
): Promise<{ data: BackendHealthResponse; latencyMs: number }> {
  const start = performance.now();
  const response = await fetchWithCorsFallback('/api/health', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const latencyMs = Math.round(performance.now() - start);

  if (!response.ok) {
    throw new Error(`Health check returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as BackendHealthResponse;
  return { data, latencyMs };
}

/**
 * Normalizes conversation history into the exact format expected by
 * POST /api/chat and POST /api/chat/stream:
 * { role: "user" | "assistant", content: string }
 * Ensures the unified MINOVA AI language & quality context is included once.
 */
export function buildConversationPayload(
  history: ApiConversationTurn[]
): ApiConversationTurn[] {
  return buildUnifiedConversationContext(history);
}

/**
 * Normalizes backend error codes and messages for user-facing display so that
 * internal provider names never replace MINOVA AI branding in the UI.
 */
function normalizeBrandError(
  rawCode?: string,
  rawMessage?: string,
  fallbackStatus?: number
): { isTransientDemand: boolean; uiCode: string; uiMessage: string } {
  const code = rawCode || (fallbackStatus ? `HTTP_${fallbackStatus}` : 'SERVICE_ERROR');
  const isTransientDemand =
    code === 'GEMINI_UNAVAILABLE' || fallbackStatus === 503 || fallbackStatus === 429;

  const uiCode = code === 'GEMINI_UNAVAILABLE' ? 'MINOVA_HIGH_DEMAND' : code;
  const uiMessage = rawMessage
    ? rawMessage.replace(/Gemini AI service/gi, 'MINOVA AI service').replace(/Google's Gemini AI/gi, 'MINOVA AI')
    : `MINOVA AI request failed${fallbackStatus ? ` (HTTP ${fallbackStatus})` : ''}.`;

  return { isTransientDemand, uiCode, uiMessage };
}

/**
 * POST /api/chat
 * Standard non-streaming conversation endpoint.
 */
export async function sendChatMessage(
  message: string,
  conversation: ApiConversationTurn[],
  signal?: AbortSignal
): Promise<{ reply: string; latencyMs: number }> {
  const start = performance.now();
  const payload: ChatRequestPayload = {
    message: message.trim(),
    conversation: buildConversationPayload(conversation),
  };

  let lastError: Error | null = null;

  // Up to 2 attempts in case backend experiences momentary high demand
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Request aborted by user', 'AbortError');
    }

    const response = await fetchWithCorsFallback('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      throw new Error(`Unexpected response format (HTTP ${response.status})`);
    }

    if (response.ok && body?.success && typeof body.message === 'string') {
      return {
        reply: body.message,
        latencyMs: Math.round(performance.now() - start),
      };
    }

    const normalized = normalizeBrandError(
      body?.error?.code,
      body?.error?.message,
      response.status
    );
    const err = new Error(normalized.uiMessage) as Error & { code?: string };
    err.code = normalized.uiCode;
    lastError = err;

    // Only retry automatically on transient demand/unavailable errors
    if (attempt === 0 && normalized.isTransientDemand) {
      await new Promise((r) => setTimeout(r, 900));
      continue;
    }

    throw err;
  }

  throw lastError || new Error('Failed to communicate with MINOVA AI backend.');
}

/**
 * POST /api/chat/stream
 * Server-Sent Events (SSE) token streaming endpoint.
 * Parses `data: {"chunk":"..."}`, `event: done`, and `event: error`.
 * If the stream encounters a pre-token transient demand spike, seamlessly falls back to POST /api/chat.
 */
export async function streamChatMessage(
  message: string,
  conversation: ApiConversationTurn[],
  onChunk: (deltaText: string, accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<{ reply: string; latencyMs: number; modeUsed: 'stream' | 'standard' }> {
  const start = performance.now();
  const payload: ChatRequestPayload = {
    message: message.trim(),
    conversation: buildConversationPayload(conversation),
  };

  const response = await fetchWithCorsFallback('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  // If the endpoint returned a non-200 JSON error before opening SSE stream
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || contentType.includes('application/json')) {
    let errBody: any = null;
    try {
      errBody = await response.json();
    } catch {
      // ignore parse failure
    }
    const normalized = normalizeBrandError(
      errBody?.error?.code,
      errBody?.error?.message,
      response.status
    );
    // Seamless fallback to standard endpoint on transient high demand
    if (normalized.isTransientDemand) {
      const fallback = await sendChatMessage(message, conversation, signal);
      onChunk(fallback.reply, fallback.reply);
      return {
        reply: fallback.reply,
        latencyMs: Math.round(performance.now() - start),
        modeUsed: 'standard',
      };
    }

    const error = new Error(normalized.uiMessage) as Error & { code?: string };
    error.code = normalized.uiCode;
    throw error;
  }

  if (!response.body) {
    // Fallback if ReadableStream is unavailable
    const fallback = await sendChatMessage(message, conversation, signal);
    onChunk(fallback.reply, fallback.reply);
    return {
      reply: fallback.reply,
      latencyMs: Math.round(performance.now() - start),
      modeUsed: 'standard',
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let currentEvent = 'message';
  let streamError: (Error & { code?: string }) | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(':')) {
          continue;
        }

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (currentEvent === 'error' || parsed.success === false || parsed.error) {
              const normalized = normalizeBrandError(
                parsed?.error?.code || 'STREAM_ERROR',
                parsed?.error?.message || 'MINOVA AI encountered a stream interruption.'
              );
              const err = new Error(normalized.uiMessage) as Error & { code?: string };
              err.code = normalized.uiCode;
              streamError = err;
              break;
            }

            if (typeof parsed.chunk === 'string') {
              accumulated += parsed.chunk;
              onChunk(parsed.chunk, accumulated);
            }
          } catch {
            // Ignore malformed keep-alive frames
          }
          currentEvent = 'message';
        }
      }

      if (streamError) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // If stream failed before producing any tokens, try standard /api/chat once
  if (streamError && accumulated.length === 0) {
    try {
      const fallback = await sendChatMessage(message, conversation, signal);
      onChunk(fallback.reply, fallback.reply);
      return {
        reply: fallback.reply,
        latencyMs: Math.round(performance.now() - start),
        modeUsed: 'standard',
      };
    } catch {
      throw streamError;
    }
  }

  if (streamError && accumulated.length > 0) {
    throw streamError;
  }

  return {
    reply: accumulated,
    latencyMs: Math.round(performance.now() - start),
    modeUsed: 'stream',
  };
}

/**
 * POST /api/image/generate
 * Generates an image using the verified MINOVA AI backend image worker.
 * Returns a persistent Data URL (JPEG) for rendering and downloading in the browser.
 */
export async function generateMinovaImage(
  prompt: string,
  signal?: AbortSignal
): Promise<{ imageUrl: string; latencyMs: number }> {
  const start = performance.now();
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error('Please provide a descriptive image prompt.');
  }

  const response = await fetchWithCorsFallback('/api/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'image/jpeg, image/png, application/json',
    },
    body: JSON.stringify({ prompt: trimmedPrompt }),
    signal,
  });

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok || contentType.includes('application/json')) {
    let errBody: any = null;
    try {
      errBody = await response.json();
    } catch {
      // ignore
    }
    const err = new Error(
      errBody?.error?.message || `Image generation failed (HTTP ${response.status})`
    ) as Error & { code?: string };
    err.code = errBody?.error?.code || `HTTP_${response.status}`;
    throw err;
  }

  const rawBlob = await response.blob();
  if (rawBlob.size === 0) {
    throw new Error('MINOVA AI backend returned an empty image payload.');
  }

  const jpegBlob =
    rawBlob.type && rawBlob.type.startsWith('image/')
      ? rawBlob
      : new Blob([rawBlob], { type: 'image/jpeg' });

  const imageUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to decode generated JPEG image blob.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read generated JPEG image data.'));
    reader.readAsDataURL(jpegBlob);
  });

  return {
    imageUrl,
    latencyMs: Math.round(performance.now() - start),
  };
}
