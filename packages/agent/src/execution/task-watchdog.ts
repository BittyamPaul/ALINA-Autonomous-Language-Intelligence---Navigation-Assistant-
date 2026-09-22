import { CanonicalTaskState } from '@alina/shared';

export interface TaskWatchdogConfig {
  planningTimeoutMs?: number;
  stepTimeoutMs?: number;
  retryingTimeoutMs?: number;
  taskTimeoutMs?: number;
  checkIntervalMs?: number;
}

export interface TrackedTaskEntry {
  taskId: string;
  state: CanonicalTaskState;
  stateStartedAt: number;
  lastHeartbeatAt: number;
  abortController: AbortController;
  customTimeoutMs?: number;
  onTimeout?: (taskId: string, state: CanonicalTaskState, reason: string) => Promise<void> | void;
}

export interface TimedOutTaskReport {
  taskId: string;
  state: CanonicalTaskState;
  elapsedMs: number;
  limitMs: number;
  reason: string;
}

/**
 * TaskWatchdog
 * 
 * Enforces ALINA's liveness invariant:
 * "No task may remain indefinitely in:
 *  PLANNING
 *  RUNNING
 *  RETRYING"
 */
export class TaskWatchdog {
  private config: Required<TaskWatchdogConfig>;
  private trackedTasks = new Map<string, TrackedTaskEntry>();
  private intervalTimer?: ReturnType<typeof setInterval>;

  constructor(config?: TaskWatchdogConfig) {
    this.config = {
      planningTimeoutMs: config?.planningTimeoutMs ?? 30000,
      stepTimeoutMs: config?.stepTimeoutMs ?? 60000,
      retryingTimeoutMs: config?.retryingTimeoutMs ?? 30000,
      taskTimeoutMs: config?.taskTimeoutMs ?? 300000,
      checkIntervalMs: config?.checkIntervalMs ?? 1000,
    };
  }

  /**
   * Registers a task in an active state for watchdog monitoring.
   */
  public register(
    taskId: string,
    state: CanonicalTaskState,
    options?: {
      abortController?: AbortController;
      customTimeoutMs?: number;
      onTimeout?: (taskId: string, state: CanonicalTaskState, reason: string) => Promise<void> | void;
    }
  ): AbortController {
    const abortController = options?.abortController ?? new AbortController();
    const now = Date.now();

    this.trackedTasks.set(taskId, {
      taskId,
      state,
      stateStartedAt: now,
      lastHeartbeatAt: now,
      abortController,
      customTimeoutMs: options?.customTimeoutMs,
      onTimeout: options?.onTimeout,
    });

    return abortController;
  }

  /**
   * Transitions a tracked task into a new state, resetting the state-specific timer.
   */
  public transitionState(taskId: string, newState: CanonicalTaskState): void {
    const entry = this.trackedTasks.get(taskId);
    if (!entry) return;

    // Terminal states or paused states are unmonitored by watchdog
    if (
      newState === 'COMPLETED' ||
      newState === 'FAILED' ||
      newState === 'CANCELLED' ||
      newState === 'WAITING_FOR_APPROVAL' ||
      newState === 'WAITING_FOR_NETWORK'
    ) {
      this.unregister(taskId);
      return;
    }

    const now = Date.now();
    entry.state = newState;
    entry.stateStartedAt = now;
    entry.lastHeartbeatAt = now;
  }

  /**
   * Emits a heartbeat signal, preventing step timeout during active long operations.
   */
  public heartbeat(taskId: string): void {
    const entry = this.trackedTasks.get(taskId);
    if (entry) {
      entry.lastHeartbeatAt = Date.now();
    }
  }

  /**
   * Unregisters a task from watchdog tracking upon completion, cancellation, or error.
   */
  public unregister(taskId: string): void {
    this.trackedTasks.delete(taskId);
  }

  /**
   * Checks all registered tasks for timeout violations.
   * Can be invoked manually (for testing/deterministic loops) or via polling interval.
   */
  public async checkTimeouts(): Promise<TimedOutTaskReport[]> {
    const now = Date.now();
    const violations: TimedOutTaskReport[] = [];

    for (const [taskId, entry] of Array.from(this.trackedTasks.entries())) {
      let limitMs: number;
      let elapsedMs: number;
      let stageName: string;

      switch (entry.state) {
        case 'PLANNING':
          limitMs = entry.customTimeoutMs ?? this.config.planningTimeoutMs;
          elapsedMs = now - entry.stateStartedAt;
          stageName = 'Planning stage';
          break;
        case 'RUNNING':
          limitMs = entry.customTimeoutMs ?? this.config.stepTimeoutMs;
          elapsedMs = now - entry.lastHeartbeatAt;
          stageName = 'Active execution step';
          break;
        case 'RETRYING':
          limitMs = entry.customTimeoutMs ?? this.config.retryingTimeoutMs;
          elapsedMs = now - entry.stateStartedAt;
          stageName = 'Retry backoff';
          break;
        default:
          continue;
      }

      if (elapsedMs > limitMs) {
        const reason = `Watchdog timeout violation: ${stageName} exceeded deadline of ${limitMs}ms (elapsed: ${elapsedMs}ms). Task aborted under liveness guarantee.`;
        
        violations.push({
          taskId,
          state: entry.state,
          elapsedMs,
          limitMs,
          reason,
        });

        // Trigger abort signal
        try {
          entry.abortController.abort(new Error(reason));
        } catch {
          // Ignore if already aborted
        }

        // Invoke custom timeout callback if provided
        if (entry.onTimeout) {
          try {
            await entry.onTimeout(taskId, entry.state, reason);
          } catch (err) {
            console.error(`[TaskWatchdog] onTimeout callback error for task ${taskId}:`, err);
          }
        }

        // Remove from tracking to prevent repeated firing
        this.trackedTasks.delete(taskId);
      }
    }

    return violations;
  }

  /**
   * Starts background interval timer for automated watchdog enforcement.
   */
  public startPolling(intervalMs?: number): void {
    if (this.intervalTimer) return;
    const interval = intervalMs ?? this.config.checkIntervalMs;
    this.intervalTimer = setInterval(() => {
      this.checkTimeouts().catch((err) => {
        console.error('[TaskWatchdog] Polling error:', err);
      });
    }, interval);
  }

  /**
   * Stops background polling timer.
   */
  public stopPolling(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }

  /**
   * Returns current count of monitored tasks.
   */
  public getActiveCount(): number {
    return this.trackedTasks.size;
  }

  /**
   * Checks whether a task is currently tracked.
   */
  public isTracked(taskId: string): boolean {
    return this.trackedTasks.has(taskId);
  }
}
