import { Injectable, Logger } from '@nestjs/common';
import { WorkflowState } from '../types/workflow-state.enum';
import { StepState } from '../types/step-state.enum';

@Injectable()
export class WorkflowStateMachineService {
  private readonly logger = new Logger(WorkflowStateMachineService.name);

  private readonly workflowTransitions: Record<WorkflowState, WorkflowState[]> =
    {
      [WorkflowState.PENDING]: [WorkflowState.RUNNING, WorkflowState.CANCELLED],
      [WorkflowState.RUNNING]: [
        WorkflowState.COMPLETED,
        WorkflowState.FAILED,
        WorkflowState.CANCELLED,
        WorkflowState.COMPENSATING,
      ],
      [WorkflowState.COMPLETED]: [WorkflowState.COMPENSATING],
      [WorkflowState.FAILED]: [
        WorkflowState.RUNNING,
        WorkflowState.CANCELLED,
        WorkflowState.COMPENSATING,
      ],
      [WorkflowState.CANCELLED]: [WorkflowState.COMPENSATING],
      [WorkflowState.COMPENSATING]: [
        WorkflowState.COMPENSATED,
        WorkflowState.FAILED,
      ],
      [WorkflowState.COMPENSATED]: [], // Terminal state
    };

  private readonly stepTransitions: Record<StepState, StepState[]> = {
    [StepState.PENDING]: [StepState.RUNNING, StepState.SKIPPED],
    [StepState.RUNNING]: [
      StepState.COMPLETED,
      StepState.FAILED,
      StepState.SKIPPED,
    ],
    [StepState.COMPLETED]: [StepState.COMPENSATING],
    [StepState.FAILED]: [
      StepState.RUNNING,
      StepState.SKIPPED,
      StepState.COMPENSATING,
    ],
    [StepState.SKIPPED]: [StepState.COMPENSATING],
    [StepState.COMPENSATING]: [StepState.COMPENSATED, StepState.FAILED],
    [StepState.COMPENSATED]: [], // Terminal state
  };

  canTransitionWorkflow(from: WorkflowState, to: WorkflowState): boolean {
    return this.workflowTransitions[from]?.includes(to) ?? false;
  }

  canTransitionStep(from: StepState, to: StepState): boolean {
    return this.stepTransitions[from]?.includes(to) ?? false;
  }

  transitionWorkflow(
    currentState: WorkflowState,
    newState: WorkflowState,
  ): { success: boolean; error?: string } {
    if (!this.canTransitionWorkflow(currentState, newState)) {
      const error = `Invalid workflow state transition from ${currentState} to ${newState}`;
      this.logger.error(error);
      return { success: false, error };
    }

    this.logger.debug(
      `Workflow state transition: ${currentState} -> ${newState}`,
    );
    return { success: true };
  }

  transitionStep(
    currentState: StepState,
    newState: StepState,
  ): { success: boolean; error?: string } {
    if (!this.canTransitionStep(currentState, newState)) {
      const error = `Invalid step state transition from ${currentState} to ${newState}`;
      this.logger.error(error);
      return { success: false, error };
    }

    this.logger.debug(`Step state transition: ${currentState} -> ${newState}`);
    return { success: true };
  }

  getValidWorkflowTransitions(currentState: WorkflowState): WorkflowState[] {
    return this.workflowTransitions[currentState] || [];
  }

  getValidStepTransitions(currentState: StepState): StepState[] {
    return this.stepTransitions[currentState] || [];
  }

  isWorkflowTerminal(state: WorkflowState): boolean {
    return (
      state === WorkflowState.COMPLETED ||
      state === WorkflowState.CANCELLED ||
      state === WorkflowState.COMPENSATED
    );
  }

  isStepTerminal(state: StepState): boolean {
    return (
      state === StepState.COMPLETED ||
      state === StepState.SKIPPED ||
      state === StepState.COMPENSATED
    );
  }

  isWorkflowRecoverable(state: WorkflowState): boolean {
    return state === WorkflowState.FAILED;
  }

  isStepRecoverable(state: StepState): boolean {
    return state === StepState.FAILED;
  }

  canWorkflowCompensate(state: WorkflowState): boolean {
    return [
      WorkflowState.COMPLETED,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED,
    ].includes(state);
  }

  canStepCompensate(state: StepState): boolean {
    return [StepState.COMPLETED, StepState.FAILED, StepState.SKIPPED].includes(
      state,
    );
  }

  shouldRetry(
    state: WorkflowState | StepState,
    retryCount: number,
    maxRetries: number,
  ): boolean {
    if (state === WorkflowState.FAILED || state === StepState.FAILED) {
      return retryCount < maxRetries;
    }
    return false;
  }

  calculateNextRetryTime(retryCount: number, baseDelay: number = 1000): Date {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const totalDelay = exponentialDelay + jitter;

    return new Date(Date.now() + totalDelay);
  }
}
