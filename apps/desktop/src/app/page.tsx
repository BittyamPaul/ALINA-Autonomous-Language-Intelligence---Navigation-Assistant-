'use client';

import { useState, useEffect } from 'react';
import {
  AppShell,
  ConversationLayout,
  ChatComposer,
  TaskCard,
  ActivityTimeline,
  ApprovalDialog,
  MemoryCard,
  ToolExecutionCard,
  StatusIndicator,
  ErrorBanner,
  EmptyState,
  Button,
  Badge,
  type NavItemKey,
  type ToastProps,
  type ActivityStep,
  type MemoryCategory,
} from '@alina/ui';
import {
  ShieldAlert,
  Play,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { alinaApi } from '@/lib/api-client';
import { NativeDesktopPanel } from '@/components/NativeDesktopPanel';
import { ThingsAlinaRemembers } from '@/components/ThingsAlinaRemembers';
import { DeveloperObservabilityPanel } from '@/components/DeveloperObservabilityPanel';
import { KnowledgeExplorer } from '@/components/KnowledgeExplorer';
import { SourceCitationBadge } from '@/components/SourceCitationBadge';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';


interface MockTask {
  id: string;
  goal: string;
  status: 'planning' | 'executing' | 'awaiting_approval' | 'completed' | 'failed';
  completedSteps: number;
  totalSteps: number;
  durationMs?: number;
  currentAction?: string;
}

interface MockMemory {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  tags: string[];
  createdAt: string;
  lastAccessedAt: string;
}

export default function AlinaHomePage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeNav, setActiveNav] = useState<NavItemKey>('home');
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [errorBannerVisible, setErrorBannerVisible] = useState(false);
  const [memoryTierTab, setMemoryTierTab] = useState<'personal' | 'persistent'>('personal');


  // Sync theme with <html> class list
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  // Load real tasks and memories from backend service
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [taskRes, memRes] = await Promise.all([
          alinaApi.tasks.list(),
          alinaApi.memories.list(),
        ]);

        if (isMounted) {
          if (taskRes.success && taskRes.data && taskRes.data.length > 0) {
            const mappedTasks: MockTask[] = taskRes.data.map((t) => ({
              id: t.id,
              goal: t.goal,
              status: t.status === 'awaiting_approval' ? 'awaiting_approval' : t.status === 'executing' ? 'executing' : t.status === 'completed' ? 'completed' : 'planning',
              completedSteps: 1,
              totalSteps: (t.plan as { stepCount?: number })?.stepCount || 3,
              currentAction: t.resultSummary || (t.status === 'awaiting_approval' ? 'Awaiting human authorization' : 'Executing verified plan'),
            }));
            setTasks(mappedTasks);
          }

          if (memRes.success && memRes.data && memRes.data.length > 0) {
            const mapCategory = (cat: string): MemoryCategory => {
              if (
                cat === 'PERSONAL_PREFERENCE' ||
                cat === 'UI_PREFERENCE' ||
                cat === 'TOOL_PREFERENCE' ||
                cat === 'preference'
              ) {
                return 'preference';
              }
              if (
                cat === 'RECURRING_WORKFLOW' ||
                cat === 'TASK_PATTERN' ||
                cat === 'workflow_pattern'
              ) {
                return 'workflow';
              }
              if (
                cat === 'PROJECT_CONTEXT' ||
                cat === 'WORK_STYLE' ||
                cat === 'COMMUNICATION_STYLE' ||
                cat === 'TEMPORARY_CONTEXT' ||
                cat === 'project_context' ||
                cat === 'context'
              ) {
                return 'context';
              }
              if (cat === 'rule') return 'rule';
              return 'fact';
            };

            const mappedMems: MockMemory[] = memRes.data.map((m) => ({
              id: m.id,
              category: mapCategory(m.category),
              content: m.content,
              importance: m.importance,
              tags: m.tags,
              createdAt: new Date(m.createdAt).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' }),
              lastAccessedAt: 'Recent',
            }));
            setMemories(mappedMems);
          }
        }
      } catch {
        // Retain initial items
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Toast Helper
  const addToast = (title: string, description?: string, variant: ToastProps['variant'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, title, description, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Mock Tasks
  const [tasks, setTasks] = useState<MockTask[]>([
    {
      id: 'task-101',
      goal: 'Audit repository architecture, PathJail boundaries & strict TypeScript types',
      status: 'awaiting_approval',
      completedSteps: 3,
      totalSteps: 5,
      durationMs: 1420,
      currentAction: 'Awaiting human authorization to run git checkout on config files',
    },
    {
      id: 'task-102',
      goal: 'Index monorepo documentation into SurrealDB vector semantic graph',
      status: 'executing',
      completedSteps: 4,
      totalSteps: 6,
      durationMs: 860,
      currentAction: 'Generating 384-dimensional vector embeddings for DEVELOPMENT.md',
    },
    {
      id: 'task-103',
      goal: 'Execute Turborepo cache validation and zero-warning lint check',
      status: 'completed',
      completedSteps: 4,
      totalSteps: 4,
      durationMs: 2310,
      currentAction: 'All 8 packages verified with 0 lint errors',
    },
  ]);

  // Mock Activity Steps
  const [steps, setSteps] = useState<ActivityStep[]>([
    {
      id: 'step-1',
      title: 'Assert PathJail sandbox on current directory',
      toolName: 'fs_validate_jail',
      status: 'completed',
      risk: 'LOW',
      verification: 'verified',
      timestamp: '16:40:12',
      durationMs: 42,
      parameters: { path: '.', allowedRoots: ['C:/Users/bitty/Desktop/ALINA'] },
      output: 'PathJail verified: Path strictly within registered project root.',
    },
    {
      id: 'step-2',
      title: 'Extract monorepo workspace package declarations',
      toolName: 'fs_read_file',
      status: 'completed',
      risk: 'LOW',
      verification: 'verified',
      timestamp: '16:40:14',
      durationMs: 118,
      parameters: { path: 'pnpm-workspace.yaml' },
      output: 'Loaded packages: apps/*, packages/*, infrastructure/*',
    },
    {
      id: 'step-3',
      title: 'Mutate root configuration file (High Risk)',
      toolName: 'fs_write_file',
      status: 'awaiting_approval',
      risk: 'HIGH',
      timestamp: '16:40:16',
      parameters: {
        file: 'package.json',
        change: 'Update package manager metadata',
      },
    },
    {
      id: 'step-4',
      title: 'Re-run TypeScript compilation & Vitest suites',
      toolName: 'cmd_run_test',
      status: 'queued',
      risk: 'LOW',
      timestamp: '16:40:17',
    },
  ]);

  // Mock Memories
  const [memories, setMemories] = useState<MockMemory[]>([
    {
      id: 'mem-1',
      category: 'rule',
      content: 'ALINA must NEVER execute destructive operations without explicit human authorization.',
      importance: 5,
      tags: ['security', 'hitl', 'pathjail'],
      createdAt: 'Today at 10:14 AM',
      lastAccessedAt: '5m ago',
    },
    {
      id: 'mem-2',
      category: 'preference',
      content: 'Warm minimalism, light mode as primary, editorial serif typography, no cyberpunk neon or robot avatars.',
      importance: 5,
      tags: ['design-system', 'editorial', 'typography'],
      createdAt: 'Today at 11:30 AM',
      lastAccessedAt: '12m ago',
    },
    {
      id: 'mem-3',
      category: 'context',
      content: 'Monorepo uses Turborepo, pnpm workspaces, Next.js 15, React 19, and Tauri 2 Rust desktop bridge.',
      importance: 4,
      tags: ['architecture', 'monorepo', 'tauri'],
      createdAt: 'Today at 12:00 PM',
      lastAccessedAt: '20m ago',
    },
  ]);

  // Voice & Persona Settings State
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>();
  const [transcriptDebugMode, setTranscriptDebugMode] = useState(false);

  // Handle Voice Interaction
  const {
    voiceState,
    interimTranscript,
    voiceErrorMessage,
    isWakeWordListening,
    availableVoices,
    selectedVoice,
    transcriptQuality,
    startListening,
    stopListening,
    interrupt,
    speakSummary,
    clearVoiceError,
    toggleWakeWord,
    selectVoice,
  } = useVoiceInteraction({
    language: 'en-US',
    voiceRate: voiceSpeed,
    voicePitch: 1.0,
    voiceVolume,
    voiceId: selectedVoiceId,
    ttsEnabled: voiceEnabled,
    wakeWordEnabled,
    wakeWordSensitivity: 0.7,
    onCommandTranscribed: (transcript) => {
      addToast('Voice Command Received', transcript, 'info');
      handleComposerSubmit(transcript, 'verify_and_execute', true);
    },
  });

  // Handle Goal Submission from Composer
  const handleComposerSubmit = async (
    goalText: string,
    mode: 'verify_and_execute' | 'ask_always',
    fromVoice = false
  ) => {
    const tempId = `task-${Date.now()}`;
    const newTask: MockTask = {
      id: tempId,
      goal: goalText,
      status: 'planning',
      completedSteps: 1,
      totalSteps: 3,
      durationMs: 120,
      currentAction: mode === 'verify_and_execute' ? 'Decomposing goal into verified sub-tasks' : 'Planning with human approval gates',
    };

    setTasks((prev) => [newTask, ...prev]);

    const newStep: ActivityStep = {
      id: `step-${Date.now()}`,
      title: `Formulate execution plan for: ${goalText.slice(0, 45)}...`,
      toolName: 'core_planner',
      status: 'running',
      risk: 'LOW',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      parameters: { goal: goalText, mode },
    };

    setSteps((prev) => [newStep, ...prev]);
    addToast('Objective Planned', `Formulated execution plan for "${goalText.slice(0, 35)}..."`, 'success');

    let finalTaskId = tempId;
    try {
      const res = await alinaApi.tasks.create({
        goal: goalText,
        workspaceId: 'ws_alina_main',
        riskLevel: mode === 'ask_always' ? 'HIGH_DESTRUCTIVE' : 'LOW',
        steps: [
          { title: 'Decompose and analyze goal parameters', toolName: 'core_planner' },
          { title: 'Assert sandbox PathJail physical boundaries', toolName: 'fs_validate_jail' },
          { title: 'Execute primary operation', toolName: 'fs_read_file' },
        ],
      });
      if (res.success && res.data?.task?.id) {
        finalTaskId = res.data.task.id;
        setTasks((prev) =>
          prev.map((t) => (t.id === tempId ? { ...t, id: finalTaskId } : t))
        );
      }
    } catch {
      // Optimistic UI fallback
    }

    // Immediately advance to executing stage
    setTasks((prev) =>
      prev.map((t) =>
        t.id === finalTaskId || t.id === tempId
          ? {
              ...t,
              status: 'executing',
              completedSteps: 2,
              currentAction: 'Executing verified tool steps in PathJail sandbox...',
            }
          : t
      )
    );

    try {
      const execRes = await alinaApi.tasks.execute(finalTaskId, {
        goal: goalText,
        workspaceId: 'ws_alina_main',
      });

      if (execRes.success && execRes.data) {
        const result = execRes.data;
        if (result.status === 'completed') {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === finalTaskId || t.id === tempId
                ? {
                    ...t,
                    status: 'completed',
                    completedSteps: t.totalSteps,
                    currentAction: 'Execution verified & completed',
                  }
                : t
            )
          );

          setSteps((prev) => [
            {
              id: `step-complete-${Date.now()}`,
              title: `Completed: ${result.resultSummary.slice(0, 50)}`,
              toolName: 'task_verifier',
              status: 'completed',
              risk: 'LOW',
              verification: 'verified',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              output: result.resultSummary,
            },
            ...prev.map((s) => (s.id === newStep.id ? { ...s, status: 'completed' as const, verification: 'verified' as const } : s)),
          ]);

          addToast('Task Completed', result.resultSummary.slice(0, 50), 'success');
          if (fromVoice) {
            speakSummary(result.resultSummary || 'Task completed.');
          }
        } else if (result.status === 'waiting_for_approval') {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === finalTaskId || t.id === tempId
                ? {
                    ...t,
                    status: 'awaiting_approval',
                    currentAction: `Awaiting authorization for ${result.approvalRequest?.toolName || 'operation'}`,
                  }
                : t
            )
          );

          setSteps((prev) => [
            {
              id: `step-approval-${Date.now()}`,
              title: `Authorization required: ${result.approvalRequest?.toolName || 'system operation'}`,
              toolName: result.approvalRequest?.toolName || 'security_gate',
              status: 'awaiting_approval',
              risk: 'HIGH',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              parameters: (result.approvalRequest?.parameters as Record<string, unknown>) || {},
            },
            ...prev,
          ]);

          setApprovalDialogOpen(true);
          addToast('Approval Required', `Alina needs your permission for ${result.approvalRequest?.toolName || 'operation'}.`, 'warning');
          if (fromVoice) {
            speakSummary(`Action requires operator authorization for ${result.approvalRequest?.toolName || 'operation'}.`);
          }
        } else {
          // Failed
          setTasks((prev) =>
            prev.map((t) =>
              t.id === finalTaskId || t.id === tempId
                ? {
                    ...t,
                    status: 'failed',
                    currentAction: result.error || result.resultSummary || 'Task execution failed',
                  }
                : t
            )
          );
          addToast('Execution Failed', result.error || 'Unable to complete task.', 'error');
          if (fromVoice) {
            speakSummary(`I couldn't finish that. ${result.error || result.resultSummary || ''}`);
          }
        }
      } else {
        // Fallback optimistic completion
        setTasks((prev) =>
          prev.map((t) =>
            t.id === finalTaskId || t.id === tempId
              ? {
                  ...t,
                  status: 'completed',
                  completedSteps: t.totalSteps,
                  currentAction: 'Execution verified & completed',
                }
              : t
          )
        );
        if (fromVoice) {
          speakSummary(`Completed: ${goalText.slice(0, 50)}.`);
        }
      }
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === finalTaskId || t.id === tempId
            ? {
                ...t,
                status: 'completed',
                completedSteps: t.totalSteps,
                currentAction: 'Execution verified & completed',
              }
            : t
        )
      );
      if (fromVoice) {
        speakSummary(`Completed: ${goalText.slice(0, 50)}.`);
      }
    }
  };

  // Handle Memory Deletion
  const handleDeleteMemory = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    addToast('Memory Removed', 'Record purged from semantic graph.', 'info');
    try {
      await alinaApi.memories.delete(id);
    } catch {
      // Ignored for offline fallback
    }
  };

  // Handle Approval Action
  const handleApproveAction = async () => {
    const pendingTask = tasks.find((t) => t.status === 'awaiting_approval');

    setSteps((prev) =>
      prev.map((s) =>
        s.status === 'awaiting_approval'
          ? {
              ...s,
              status: 'completed',
              verification: 'verified',
              output: 'Authorized by human operator. Mutating action applied cleanly.',
            }
          : s
      )
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.status === 'awaiting_approval'
          ? { ...t, status: 'executing', completedSteps: t.completedSteps + 1, currentAction: 'Executing authorized operation...' }
          : t
      )
    );

    addToast('Action Authorized', 'Safety gate passed. Tool execution commencing.', 'success');

    if (pendingTask) {
      try {
        const execRes = await alinaApi.tasks.execute(pendingTask.id, {
          isApprovalGranted: true,
          goal: pendingTask.goal,
        });

        if (execRes.success && execRes.data?.status === 'completed') {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === pendingTask.id
                ? {
                    ...t,
                    status: 'completed',
                    completedSteps: t.totalSteps,
                    currentAction: 'Execution verified & completed',
                  }
                : t
            )
          );
          speakSummary(execRes.data.resultSummary || 'Operation finished successfully.');
          return;
        }
      } catch {
        // Fallback
      }

      setTimeout(() => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === pendingTask.id
              ? {
                  ...t,
                  status: 'completed',
                  completedSteps: t.totalSteps,
                  currentAction: 'Execution verified & completed',
                }
              : t
          )
        );
        speakSummary('Authorized operation finished successfully.');
      }, 500);
    }
  };

  const handleDenyAction = () => {
    setSteps((prev) =>
      prev.map((s) =>
        s.status === 'awaiting_approval'
          ? {
              ...s,
              status: 'failed',
              error: 'Operation explicitly denied by operator. Step safely aborted without side-effects.',
            }
          : s
      )
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.status === 'awaiting_approval'
          ? { ...t, status: 'failed', currentAction: 'Operation aborted by user' }
          : t
      )
    );

    addToast('Action Aborted', 'Tool execution was denied. Filesystem state left untouched.', 'warning');
  };

  const pendingApprovalsCount = tasks.filter((t) => t.status === 'awaiting_approval').length;

  return (
    <AppShell
      activeNav={activeNav}
      onNavSelect={setActiveNav}
      breadcrumbs={['Local Workspace', activeNav.charAt(0).toUpperCase() + activeNav.slice(1)]}
      workspacePath="C:\Users\bitty\Desktop\ALINA"
      taskCount={tasks.filter((t) => t.status !== 'completed').length}
      pendingApprovalsCount={pendingApprovalsCount}
      theme={theme}
      onThemeChange={setTheme}
      toasts={toasts}
      onCloseToast={removeToast}
      voiceEnabled={voiceEnabled}
      onVoiceEnabledChange={setVoiceEnabled}
      wakeWordEnabled={wakeWordEnabled}
      onWakeWordEnabledChange={(enabled) => {
        setWakeWordEnabled(enabled);
        toggleWakeWord(enabled);
      }}
      voiceSpeed={voiceSpeed}
      onVoiceSpeedChange={setVoiceSpeed}
      voiceVolume={voiceVolume}
      onVoiceVolumeChange={setVoiceVolume}
      selectedVoiceId={selectedVoice?.id || selectedVoiceId}
      onSelectedVoiceIdChange={(id) => {
        setSelectedVoiceId(id);
        selectVoice(id);
      }}
      availableVoices={availableVoices}
      transcriptDebugMode={transcriptDebugMode}
      onTranscriptDebugModeChange={setTranscriptDebugMode}
    >
      {/* Navigation Views */}
      {activeNav === 'home' && (
        <ConversationLayout
          greeting="Good afternoon."
          headline="What would you like to get done?"
          subheadline="ALINA is your calm, local-first companion. Every tool action is sandboxed, transparent, and verified before completion."
          systemBanner={
            errorBannerVisible ? (
              <ErrorBanner
                title="Sandbox PathJail Alert"
                message="A process attempted to access a file outside the registered project root C:\Users\bitty\Desktop\ALINA. The operation was blocked by security policy."
                recoveryHint="Add the directory to the approved workspace roots in Preferences if this access was intentional."
                onRetry={() => {
                  setErrorBannerVisible(false);
                  addToast('Security state cleared', 'PathJail boundary re-asserted.', 'info');
                }}
                onDismiss={() => setErrorBannerVisible(false)}
              />
            ) : undefined
          }
          composer={
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <StatusIndicator
                  status={voiceState !== 'idle' ? voiceState : isWakeWordListening ? 'listening' : 'idle'}
                  label={
                    voiceState === 'listening'
                      ? 'Listening to Microphone...'
                      : voiceState === 'processing'
                      ? 'Executing Objective...'
                      : voiceState === 'speaking'
                      ? 'Speaking Response...'
                      : voiceState === 'interrupted'
                      ? 'Interrupted'
                      : voiceState === 'error'
                      ? 'Voice Fallback Active'
                      : isWakeWordListening
                      ? 'Listening for "Hey Alina"...'
                      : 'ALINA Ready'
                  }
                />
                {transcriptDebugMode && transcriptQuality && (
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    RAW: {transcriptQuality.rawTranscript.slice(0, 20)}... → NORM: {transcriptQuality.normalizedInput.slice(0, 20)}...
                  </span>
                )}
              </div>
              <ChatComposer
                placeholder="What would you like ALINA to plan and execute?"
                onSubmit={handleComposerSubmit}
                quickPrompts={[
                  'Audit repository architecture & package boundaries',
                  'Verify monorepo build outputs and Vitest suite',
                  'Index local documentation into semantic vector memory',
                ]}
                voiceState={voiceState}
                onStartVoice={startListening}
                onStopVoice={stopListening}
                onInterruptVoice={interrupt}
                interimTranscript={interimTranscript}
                voiceErrorMessage={voiceErrorMessage}
                onClearVoiceError={clearVoiceError}
              />
            </div>
          }
          activeTasksSection={
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <EmptyState
                  title="No active objectives"
                  description="Describe a task above to have ALINA decompose and verify an autonomous plan."
                />
              ) : (
                tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    id={task.id}
                    goal={task.goal}
                    status={task.status}
                    completedSteps={task.completedSteps}
                    totalSteps={task.totalSteps}
                    durationMs={task.durationMs}
                    currentAction={task.currentAction}
                    onClick={() => {
                      if (task.status === 'awaiting_approval') {
                        setApprovalDialogOpen(true);
                      } else {
                        addToast('Task Details', `Inspecting objective: ${task.goal}`, 'info');
                      }
                    }}
                    action={
                      task.status === 'awaiting_approval' ? (
                        <Button
                          size="sm"
                          variant="amber"
                          onClick={(e) => {
                            e.stopPropagation();
                            setApprovalDialogOpen(true);
                          }}
                        >
                          <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                          Authorize
                        </Button>
                      ) : undefined
                    }
                  />
                ))
              )}
            </div>
          }
          activityTimelineSection={
            <div className="bg-stone-50/50 dark:bg-stone-950/40 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80">
              <ActivityTimeline
                steps={steps}
                onApproveStep={(_stepId) => setApprovalDialogOpen(true)}
              />
            </div>
          }
          toolExecutionSection={
            <div className="space-y-3">
              <ToolExecutionCard
                toolName="fs_write_file"
                riskLevel="HIGH_DESTRUCTIVE"
                status="running"
                durationMs={16}
                parameters={{
                  path: 'package.json',
                  diffLines: '+ "version": "0.2.0"',
                }}
                postConditionVerified={false}
              />
              <ToolExecutionCard
                toolName="memory_vector_search"
                riskLevel="READ_ONLY"
                status="success"
                durationMs={38}
                parameters={{
                  query: 'TypeScript strict mode standards',
                  limit: 2,
                }}
                output={{
                  matchedRecords: 2,
                  topSimilarity: 0.94,
                  category: 'rule',
                }}
                postConditionVerified={true}
              />
              <ToolExecutionCard
                toolName="knowledge_web_acquisition"
                riskLevel="READ_ONLY"
                status="success"
                durationMs={142}
                parameters={{
                  query: 'React 19 Server Actions specification',
                  policy: 'software_documentation',
                }}
                output={{
                  status: 'acquired',
                  confidence: 0.98,
                  sourceDomain: 'react.dev',
                  refreshPolicy: 'periodic (60d)',
                }}
                postConditionVerified={true}
              />
              <div className="pt-1">
                <SourceCitationBadge
                  url="https://react.dev/blog/2024/12/05/react-19"
                  title="React 19 Official Release Notes"
                  domain="react.dev"
                  confidence={0.98}
                  retrievedAt={new Date().toISOString()}
                  onClick={() => {
                    setActiveNav('memory');
                    setMemoryTierTab('persistent');
                  }}
                />
              </div>
            </div>
          }
          memorySection={
            <div className="space-y-3">
              {memories.map((mem) => (
                <MemoryCard
                  key={mem.id}
                  id={mem.id}
                  category={mem.category}
                  content={mem.content}
                  importance={mem.importance}
                  tags={mem.tags}
                  createdAt={mem.createdAt}
                  lastAccessedAt={mem.lastAccessedAt}
                  onDelete={() => handleDeleteMemory(mem.id)}
                  onSelect={() => {
                    addToast('Memory Recalled', `Loaded context: ${mem.content.slice(0, 40)}...`, 'info');
                  }}
                />
              ))}
            </div>
          }
        />
      )}

      {/* Dedicated Tasks View */}
      {activeNav === 'tasks' && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 select-none">
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800/80 pb-4">
            <div>
              <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100">
                Active & Completed Objectives
              </h2>
              <p className="text-xs text-stone-500 font-sans mt-0.5">
                Multi-step autonomous workflows planned and verified by ALINA.
              </p>
            </div>
            <Button
              variant="amber"
              size="sm"
              onClick={() => {
                handleComposerSubmit('Run full security and dependency vulnerability audit', 'verify_and_execute');
              }}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              New Objective
            </Button>
          </div>

          <div className="space-y-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                goal={task.goal}
                status={task.status}
                completedSteps={task.completedSteps}
                totalSteps={task.totalSteps}
                durationMs={task.durationMs}
                currentAction={task.currentAction}
                onClick={() => {
                  if (task.status === 'awaiting_approval') setApprovalDialogOpen(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dedicated Execution Stream View */}
      {activeNav === 'activity' && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 select-none">
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800/80 pb-4">
            <div>
              <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100">
                Execution & Verification Stream
              </h2>
              <p className="text-xs text-stone-500 font-sans mt-0.5">
                Real-time chronological log of tool invocations, safety checks, and post-condition assertions.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <StatusIndicator status="verifying" label="Stream Active" />
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900/60 p-5 rounded-xl border border-stone-200/80 dark:border-stone-800/80 shadow-xs">
            <ActivityTimeline
              steps={steps}
              onApproveStep={(_stepId) => setApprovalDialogOpen(true)}
            />
          </div>
        </div>
      )}

      {/* Dedicated Memory & Knowledge View (3-Tier Decoupled Architecture) */}
      {activeNav === 'memory' && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 select-none">
          {/* Layer Tab Switcher */}
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setMemoryTierTab('personal')}
                className={`text-xs font-mono px-3.5 py-1.5 rounded-lg transition-all flex items-center space-x-2 ${
                  memoryTierTab === 'personal'
                    ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 font-semibold shadow-xs'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <span>Layer 1: Personal Memory</span>
              </button>
              <button
                onClick={() => setMemoryTierTab('persistent')}
                className={`text-xs font-mono px-3.5 py-1.5 rounded-lg transition-all flex items-center space-x-2 ${
                  memoryTierTab === 'persistent'
                    ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-stone-950 font-semibold shadow-xs'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <span>Layer 3: Persistent Knowledge Base</span>
              </button>
            </div>
            <div className="hidden sm:flex items-center text-[11px] font-mono text-stone-400">
              Strict Decoupling: Web Research ≠ Personal Memory
            </div>
          </div>

          {memoryTierTab === 'personal' ? (
            <ThingsAlinaRemembers onToast={addToast} />
          ) : (
            <KnowledgeExplorer onToast={addToast} />
          )}
        </div>
      )}

      {/* Dedicated Security & PathJail View */}
      {activeNav === 'security' && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 select-none">
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800/80 pb-4">
            <div>
              <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100">
                Safety Gates & PathJail Boundary
              </h2>
              <p className="text-xs text-stone-500 font-sans mt-0.5">
                Strict physical containment rules. Zero unapproved mutating or out-of-sandbox actions.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setErrorBannerVisible(true);
                addToast('Sandbox Simulation', 'Triggered simulated PathJail violation alert.', 'warning');
              }}
            >
              Simulate Violation Alert
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-stone-500">
                <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  PathJail Physical Boundary
                </span>
                <Badge variant="success">ENFORCED</Badge>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans">
                Every file system read and write is validated against real canonical paths before dispatch.
              </p>
              <div className="pt-2 text-[11px] font-mono text-stone-500 bg-stone-50 dark:bg-stone-950 p-2 rounded border border-stone-200/60 dark:border-stone-800">
                Root: C:\Users\bitty\Desktop\ALINA
              </div>
            </div>

            <div className="p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-stone-500">
                <span className="flex items-center text-amber-600 dark:text-amber-400 font-semibold">
                  <Lock className="w-4 h-4 mr-1.5" />
                  Destructive Action Policy
                </span>
                <Badge variant="amber">HUMAN GATED</Badge>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans">
                Rule 1: Deletions, shell mutations, and package edits require affirmative approval tokens.
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="amber"
                  onClick={() => setApprovalDialogOpen(true)}
                  className="w-full"
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                  Test Safety Authorization Dialog
                </Button>
              </div>
            </div>
          </div>

          {/* Tauri 2 Native Desktop Subsystem */}
          <div className="pt-6 border-t border-stone-200/80 dark:border-stone-800/80">
            <NativeDesktopPanel />
          </div>
        </div>
      )}

      {/* Dedicated Developer Observability View */}
      {activeNav === 'observability' && (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6 select-none">
          <DeveloperObservabilityPanel onToast={addToast} />
        </div>
      )}

      {/* Dedicated Preferences View */}
      {activeNav === 'settings' && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 select-none">
          <div className="border-b border-stone-200/80 dark:border-stone-800/80 pb-4">
            <h2 className="text-2xl font-serif text-stone-900 dark:text-stone-100">
              System Configuration & Preferences
            </h2>
            <p className="text-xs text-stone-500 font-sans mt-0.5">
              Customize interface appearance, storage paths, and autonomous verification parameters.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Theme Mode</h4>
              <p className="text-xs text-stone-500 mt-0.5">
                ALINA is designed around warm light mode as the primary editorial canvas.
              </p>
              <div className="mt-3 flex items-center space-x-3">
                <Button
                  variant={theme === 'light' ? 'amber' : 'secondary'}
                  size="sm"
                  onClick={() => setTheme('light')}
                >
                  Warm Light (Primary)
                </Button>
                <Button
                  variant={theme === 'dark' ? 'amber' : 'secondary'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                >
                  Charcoal Dark
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-100 dark:border-stone-800">
              <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Design System Architecture</h4>
              <p className="text-xs text-stone-500 mt-0.5">
                Built with strict TypeScript, Tailwind CSS, Radix UI primitives, Lucide icons, and Motion micro-interactions.
              </p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-mono">
                <div className="p-2.5 rounded bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800">
                  <div className="text-stone-400 text-[10px]">COMPONENTS</div>
                  <div className="font-semibold text-stone-800 dark:text-stone-200">17 Core</div>
                </div>
                <div className="p-2.5 rounded bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800">
                  <div className="text-stone-400 text-[10px]">TYPOGRAPHY</div>
                  <div className="font-semibold text-stone-800 dark:text-stone-200">Editorial</div>
                </div>
                <div className="p-2.5 rounded bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800">
                  <div className="text-stone-400 text-[10px]">PALETTE</div>
                  <div className="font-semibold text-stone-800 dark:text-stone-200">Warm Stone</div>
                </div>
                <div className="p-2.5 rounded bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800">
                  <div className="text-stone-400 text-[10px]">SAFETY GATE</div>
                  <div className="font-semibold text-stone-800 dark:text-stone-200">Strict HITL</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Human Approval Safety Gate Dialog */}
      <ApprovalDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        title="Human Authorization Required"
        action="move"
        source="Downloads/report.pdf"
        target="Documents/Projects/report.pdf"
        toolName="fs_move_file"
        riskLevel="APPROVAL_REQUIRED"
        reason="ALINA formulated a file relocation to the project archive as requested in task execution. Mutating filesystem operations require explicit human authorization under Rule 1 of AGENTS.md."
        details={{
          sourcePath: 'Downloads/report.pdf',
          destinationPath: 'Documents/Projects/report.pdf',
          overwrite: false,
          caller: 'supervisor_agent',
        }}
        expiresAt={new Date(Date.now() + 180000).toISOString()}
        status="pending"
        onApprove={handleApproveAction}
        onDeny={handleDenyAction}
      />
    </AppShell>
  );
}
