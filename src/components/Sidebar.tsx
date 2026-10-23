import React, { useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Trash2,
  Edit3,
  Check,
  X,
  Download,
  Server,
  PanelLeftClose,
  Pin,
  Archive,
  ArchiveRestore,
  Settings,
  Code2,
  GraduationCap,
  FileText,
  Image as ImageIcon,
  LogIn,
  UserPlus,
  LogOut,
  UserCheck,
  User,
} from 'lucide-react';
import { AuthSession, ConversationThread, WorkspaceTab } from '../types/chat';
import { MinovaLogo } from './MinovaLogo';

interface SidebarProps {
  threads: ConversationThread[];
  activeThreadId: string;
  activeWorkspace: WorkspaceTab;
  isOpenMobile: boolean;
  isCollapsedDesktop: boolean;
  authSession: AuthSession | null;
  guestDisplayName?: string;
  onSelectThread: (id: string) => void;
  onSelectWorkspace: (tab: WorkspaceTab) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (id: string, newTitle: string) => void;
  onTogglePinThread: (id: string) => void;
  onToggleArchiveThread: (id: string) => void;
  onExportCurrentThread: () => void;
  onOpenBackendModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenAuthModal: (mode: 'signin' | 'signup') => void;
  onSignOut: () => void;
  onCloseMobile: () => void;
  onToggleCollapseDesktop: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  activeWorkspace,
  isOpenMobile,
  isCollapsedDesktop,
  authSession,
  guestDisplayName,
  onSelectThread,
  onSelectWorkspace,
  onNewThread,
  onDeleteThread,
  onRenameThread,
  onTogglePinThread,
  onToggleArchiveThread,
  onExportCurrentThread,
  onOpenBackendModal,
  onOpenSettingsModal,
  onOpenAuthModal,
  onSignOut,
  onCloseMobile,
  onToggleCollapseDesktop,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<'active' | 'archived'>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const activeCount = threads.filter((t) => !t.isArchived).length;
  const archivedCount = threads.filter((t) => Boolean(t.isArchived)).length;

  const filteredThreads = threads
    .filter((t) => (viewFilter === 'archived' ? Boolean(t.isArchived) : !t.isArchived))
    .filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const inTitle = t.title.toLowerCase().includes(q);
      const inMessages = t.messages.some((m) => m.content.toLowerCase().includes(q));
      return inTitle || inMessages;
    })
    .sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const startEditing = (thread: ConversationThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(thread.id);
    setEditingTitle(thread.title);
  };

  const saveEditing = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      onRenameThread(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const formatShortDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const workspaceItems: Array<{
    id: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'chat', label: 'AI Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'code', label: 'Code Workspace', icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: 'learn', label: 'Learn & Quizzes', icon: <GraduationCap className="w-3.5 h-3.5" /> },
    { id: 'files', label: 'AI File Studio', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'image', label: 'Image Studio', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  ];

  const sidebarContent = (
    <aside className="flex flex-col h-full w-[284px] bg-[#080D1A] border-r border-slate-800/80 select-none shrink-0">
      {/* Sidebar Brand & Collapse Row */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <MinovaLogo size="md" />
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-white truncate">
              MINOVA AI
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Developed by Minhaz
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isOpenMobile) {
              onCloseMobile();
            } else {
              onToggleCollapseDesktop();
            }
          }}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer shrink-0"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Action: New Chat + Workspace Switcher */}
      <div className="p-3 space-y-2.5 border-b border-slate-800/60">
        <button
          type="button"
          onClick={() => {
            onNewThread();
            onSelectWorkspace('chat');
            onCloseMobile();
          }}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Conversation</span>
          </span>
          <span className="font-mono text-[11px] text-slate-900/80">Ctrl+K</span>
        </button>

        {/* Mobile & Quick Workspace Switcher */}
        <div className="grid grid-cols-2 gap-1 pt-0.5">
          {workspaceItems.map((item) => {
            const active = activeWorkspace === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectWorkspace(item.id);
                  onCloseMobile();
                }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#0D1527] border border-transparent'
                } ${item.id === 'chat' ? 'col-span-2' : ''}`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative pt-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-7 py-2 rounded-lg bg-[#0D1527] border border-slate-800/90 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
              aria-label="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Active vs Archived Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B1222] border border-slate-800/80">
          <button
            type="button"
            onClick={() => setViewFilter('active')}
            className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              viewFilter === 'active'
                ? 'bg-[#14203A] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setViewFilter('archived')}
            className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              viewFilter === 'archived'
                ? 'bg-[#14203A] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1">
        {filteredThreads.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-slate-500">
            {searchQuery
              ? 'No matching conversations found.'
              : viewFilter === 'archived'
              ? 'No archived conversations.'
              : 'No active conversations. Start a new chat above.'}
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isActive = thread.id === activeThreadId && activeWorkspace === 'chat';
            const isEditing = editingId === thread.id;

            return (
              <div
                key={thread.id}
                onClick={() => {
                  onSelectThread(thread.id);
                  onSelectWorkspace('chat');
                  onCloseMobile();
                }}
                className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#121D35] text-white border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#0D1526] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {thread.isPinned ? (
                    <Pin className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                  ) : (
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-400'
                      }`}
                    />
                  )}
                  {isEditing ? (
                    <form
                      onSubmit={(e) => saveEditing(thread.id, e)}
                      className="flex items-center gap-1 flex-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        autoFocus
                        className="w-full px-1.5 py-0.5 rounded bg-slate-900 border border-cyan-500/60 text-xs text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="p-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        title="Save title"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{thread.title}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 tabular-nums">
                        {thread.isPinned && (
                          <>
                            <span className="text-cyan-400/90">Pinned</span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span>{thread.messages.length} msgs</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatShortDate(thread.updatedAt)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinThread(thread.id);
                      }}
                      className={`p-1 rounded-md hover:bg-slate-800/80 transition-colors cursor-pointer ${
                        thread.isPinned ? 'text-cyan-400' : 'text-slate-400 hover:text-white'
                      }`}
                      title={thread.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                      aria-label={thread.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => startEditing(thread, e)}
                      className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                      title="Rename conversation"
                      aria-label="Rename conversation"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchiveThread(thread.id);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-violet-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
                      title={
                        thread.isArchived ? 'Restore conversation' : 'Archive conversation'
                      }
                      aria-label={
                        thread.isArchived ? 'Restore conversation' : 'Archive conversation'
                      }
                    >
                      {thread.isArchived ? (
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Workspace Controls, Account Status & Attribution */}
      <div className="p-3 border-t border-slate-800/80 space-y-2 bg-[#060A14]/60">
        {/* Account / Guest Status Card */}
        <div className="p-2.5 rounded-xl bg-[#0B1222] border border-slate-800/90 space-y-2">
          {authSession ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">
                      {authSession.user.displayName}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate font-mono">
                      {authSession.user.email}
                    </div>
                  </div>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300 shrink-0">
                  Signed In
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenAuthModal('signin');
                    onCloseMobile();
                  }}
                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#070B16] hover:bg-slate-800 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
                >
                  Account Info
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] font-medium text-rose-300 transition-colors cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="font-medium text-slate-200 truncate">
                    {guestDisplayName?.trim()
                      ? `${guestDisplayName.trim()} (Guest)`
                      : 'Guest Workspace'}
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300 shrink-0">
                  Local Only
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenAuthModal('signin');
                    onCloseMobile();
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-[11px] font-semibold text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogIn className="w-3 h-3" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenAuthModal('signup');
                    onCloseMobile();
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-[11px] font-semibold text-violet-300 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Create Account</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Settings & Personalization</span>
          </button>

          <button
            type="button"
            onClick={onExportCurrentThread}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Export Conversation (.md)</span>
          </button>

          <button
            type="button"
            onClick={onOpenBackendModal}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Server className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>Backend Service Contract</span>
          </button>
        </div>

        <div className="pt-2 px-3 border-t border-slate-800/50 flex items-center justify-between text-[11px] text-slate-400">
          <span>MINOVA AI</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-300 font-medium">Developed by Minhaz</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden lg:block h-full ${isCollapsedDesktop ? 'hidden' : 'block'}`}>
        {sidebarContent}
      </div>

      {/* Mobile Slide-Over Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
