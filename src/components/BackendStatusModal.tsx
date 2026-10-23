import React from 'react';
import { X, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { BackendHealthResponse } from '../types/chat';
import { MINOVA_BACKEND_URL } from '../services/minovaApi';
import { MinovaLogo } from './MinovaLogo';

interface BackendStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: BackendHealthResponse | null;
  healthLatencyMs: number | null;
  isChecking: boolean;
  healthError: string | null;
  onRefreshHealth: () => void;
}

export const BackendStatusModal: React.FC<BackendStatusModalProps> = ({
  isOpen,
  onClose,
  health,
  healthLatencyMs,
  isChecking,
  healthError,
  onRefreshHealth,
}) => {
  if (!isOpen) return null;

  const routes = [
    {
      method: 'GET',
      path: '/api/health',
      description: 'Service health check, uptime & capability verification',
      status: 'Active',
      active: true,
    },
    {
      method: 'POST',
      path: '/api/chat/stream',
      description: 'Server-Sent Events (SSE) real-time token streaming',
      status: 'Active',
      active: true,
    },
    {
      method: 'POST',
      path: '/api/chat',
      description: 'Standard non-streaming conversation response',
      status: 'Active',
      active: true,
    },
    {
      method: 'POST',
      path: '/api/image/generate',
      description: 'Cloudflare Flux-1-Schnell image synthesis worker',
      status: health?.imageGeneration?.status === 'ready' ? 'Active' : 'Configured',
      active: true,
    },
    {
      method: 'POST',
      path: '/api/auth · /api/conversations · /api/files · /api/user',
      description: 'Reserved backend routes (explicit 501 Not Implemented on server)',
      status: '501 Not Implemented',
      active: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-[#0B1120] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800/80 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MinovaLogo size="sm" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                MINOVA AI — Service Contract
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">
                {MINOVA_BACKEND_URL}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshHealth}
              disabled={isChecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-cyan-400 ${isChecking ? 'animate-spin' : ''}`}
              />
              <span>Ping Health</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Live Health Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#070B16] border border-slate-800/80">
              <div className="text-slate-400 mb-1">Service Status</div>
              <div className="font-semibold text-white flex items-center gap-1.5">
                {health?.status === 'healthy' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400">Healthy</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-400">
                      {isChecking ? 'Checking...' : 'Unreachable'}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#070B16] border border-slate-800/80">
              <div className="text-slate-400 mb-1">Model Display</div>
              <div className="font-semibold text-cyan-300">MINOVA AI</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#070B16] border border-slate-800/80">
              <div className="text-slate-400 mb-1">Ping Latency</div>
              <div className="font-mono font-semibold text-white tabular-nums">
                {healthLatencyMs !== null ? `${healthLatencyMs} ms` : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#070B16] border border-slate-800/80">
              <div className="text-slate-400 mb-1">Server Uptime</div>
              <div className="font-mono font-semibold text-white tabular-nums">
                {health?.uptimeSeconds !== undefined ? `${health.uptimeSeconds}s` : '—'}
              </div>
            </div>
          </div>

          {healthError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
              {healthError}
            </div>
          )}

          {/* Verified Endpoints Table */}
          <div className="rounded-xl border border-slate-800/80 overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#070B16] border-b border-slate-800/80 text-slate-400">
                  <th className="py-2.5 px-3.5 font-medium">Method</th>
                  <th className="py-2.5 px-3.5 font-medium">Endpoint</th>
                  <th className="py-2.5 px-3.5 font-medium">Purpose</th>
                  <th className="py-2.5 px-3.5 font-medium text-right">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-[#080D1A]">
                {routes.map((r) => (
                  <tr key={r.path}>
                    <td className="py-2.5 px-3.5 font-mono font-semibold text-cyan-400">
                      {r.method}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-200">{r.path}</td>
                    <td className="py-2.5 px-3.5 text-slate-400">{r.description}</td>
                    <td className="py-2.5 px-3.5 text-right font-mono whitespace-nowrap">
                      {r.active ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1 justify-end">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{r.status}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 inline-flex items-center gap-1 justify-end">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{r.status}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
            <span>MINOVA AI · Developed by Minhaz</span>
            <span className="font-mono text-slate-500">
              Zero client-side API keys · Direct HTTPS & SSE integration
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
