import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { WorkflowState } from '../types/workflow-state.enum';
import { StepState } from '../types/step-state.enum';

describe('WorkflowStateMachineService', () => {
  let service: WorkflowStateMachineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowStateMachineService],
    }).compile();

    service = module.get<WorkflowStateMachineService>(
      WorkflowStateMachineService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Workflow State Transitions', () => {
    describe('canTransitionWorkflow', () => {
      it('should allow valid transitions from PENDING', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.PENDING,
            WorkflowState.RUNNING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.PENDING,
            WorkflowState.CANCELLED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.PENDING,
            WorkflowState.COMPLETED,
          ),
        ).toBe(false);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.PENDING,
            WorkflowState.FAILED,
          ),
        ).toBe(false);
      });

      it('should allow valid transitions from RUNNING', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.RUNNING,
            WorkflowState.COMPLETED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.RUNNING,
            WorkflowState.FAILED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.RUNNING,
            WorkflowState.CANCELLED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.RUNNING,
            WorkflowState.COMPENSATING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.RUNNING,
            WorkflowState.PENDING,
          ),
        ).toBe(false);
      });

      it('should allow valid transitions from COMPLETED', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPLETED,
            WorkflowState.COMPENSATING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPLETED,
            WorkflowState.RUNNING,
          ),
        ).toBe(false);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPLETED,
            WorkflowState.FAILED,
          ),
        ).toBe(false);
      });

      it('should allow valid transitions from FAILED', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.FAILED,
            WorkflowState.RUNNING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.FAILED,
            WorkflowState.CANCELLED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.FAILED,
            WorkflowState.COMPENSATING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.FAILED,
            WorkflowState.COMPLETED,
          ),
        ).toBe(false);
      });

      it('should allow valid transitions from CANCELLED', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.CANCELLED,
            WorkflowState.COMPENSATING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.CANCELLED,
            WorkflowState.RUNNING,
          ),
        ).toBe(false);
      });

      it('should allow valid transitions from COMPENSATING', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPENSATING,
            WorkflowState.COMPENSATED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPENSATING,
            WorkflowState.FAILED,
          ),
        ).toBe(true);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPENSATING,
            WorkflowState.RUNNING,
          ),
        ).toBe(false);
      });

      it('should not allow transitions from COMPENSATED', () => {
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPENSATED,
            WorkflowState.RUNNING,
          ),
        ).toBe(false);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPENSATED,
            WorkflowState.FAILED,
          ),
        ).toBe(false);
        expect(
          service.canTransitionWorkflow(
            WorkflowState.COMPENSATED,
            WorkflowState.PENDING,
          ),
        ).toBe(false);
      });
    });

    describe('transitionWorkflow', () => {
      it('should succeed with valid transition', () => {
        const result = service.transitionWorkflow(
          WorkflowState.PENDING,
          WorkflowState.RUNNING,
        );

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should fail with invalid transition', () => {
        const result = service.transitionWorkflow(
          WorkflowState.PENDING,
          WorkflowState.COMPLETED,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Invalid workflow state transition');
      });
    });

    describe('getValidWorkflowTransitions', () => {
      it('should return valid transitions for PENDING', () => {
        const transitions = service.getValidWorkflowTransitions(
          WorkflowState.PENDING,
        );
        expect(transitions).toEqual([
          WorkflowState.RUNNING,
          WorkflowState.CANCELLED,
        ]);
      });

      it('should return valid transitions for RUNNING', () => {
        const transitions = service.getValidWorkflowTransitions(
          WorkflowState.RUNNING,
        );
        expect(transitions).toEqual([
          WorkflowState.COMPLETED,
          WorkflowState.FAILED,
          WorkflowState.CANCELLED,
          WorkflowState.COMPENSATING,
        ]);
      });

      it('should return empty array for COMPENSATED', () => {
        const transitions = service.getValidWorkflowTransitions(
          WorkflowState.COMPENSATED,
        );
        expect(transitions).toEqual([]);
      });
    });
  });

  describe('Step State Transitions', () => {
    describe('canTransitionStep', () => {
      it('should allow valid transitions from PENDING', () => {
        expect(
          service.canTransitionStep(StepState.PENDING, StepState.RUNNING),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.PENDING, StepState.SKIPPED),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.PENDING, StepState.COMPLETED),
        ).toBe(false);
        expect(
          service.canTransitionStep(StepState.PENDING, StepState.FAILED),
        ).toBe(false);
      });

      it('should allow valid transitions from RUNNING', () => {
        expect(
          service.canTransitionStep(StepState.RUNNING, StepState.COMPLETED),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.RUNNING, StepState.FAILED),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.RUNNING, StepState.SKIPPED),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.RUNNING, StepState.PENDING),
        ).toBe(false);
      });

      it('should allow valid transitions from COMPLETED', () => {
        expect(
          service.canTransitionStep(
            StepState.COMPLETED,
            StepState.COMPENSATING,
          ),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.COMPLETED, StepState.RUNNING),
        ).toBe(false);
        expect(
          service.canTransitionStep(StepState.COMPLETED, StepState.FAILED),
        ).toBe(false);
      });

      it('should allow valid transitions from FAILED', () => {
        expect(
          service.canTransitionStep(StepState.FAILED, StepState.RUNNING),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.FAILED, StepState.SKIPPED),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.FAILED, StepState.COMPENSATING),
        ).toBe(true);
        expect(
          service.canTransitionStep(StepState.FAILED, StepState.COMPLETED),
        ).toBe(false);
      });

      it('should not allow transitions from COMPENSATED', () => {
        expect(
          service.canTransitionStep(StepState.COMPENSATED, StepState.RUNNING),
        ).toBe(false);
        expect(
          service.canTransitionStep(StepState.COMPENSATED, StepState.FAILED),
        ).toBe(false);
        expect(
          service.canTransitionStep(StepState.COMPENSATED, StepState.PENDING),
        ).toBe(false);
      });
    });

    describe('transitionStep', () => {
      it('should succeed with valid transition', () => {
        const result = service.transitionStep(
          StepState.PENDING,
          StepState.RUNNING,
        );

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should fail with invalid transition', () => {
        const result = service.transitionStep(
          StepState.PENDING,
          StepState.COMPLETED,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Invalid step state transition');
      });
    });

    describe('getValidStepTransitions', () => {
      it('should return valid transitions for PENDING', () => {
        const transitions = service.getValidStepTransitions(StepState.PENDING);
        expect(transitions).toEqual([StepState.RUNNING, StepState.SKIPPED]);
      });

      it('should return valid transitions for RUNNING', () => {
        const transitions = service.getValidStepTransitions(StepState.RUNNING);
        expect(transitions).toEqual([
          StepState.COMPLETED,
          StepState.FAILED,
          StepState.SKIPPED,
        ]);
      });

      it('should return empty array for COMPENSATED', () => {
        const transitions = service.getValidStepTransitions(
          StepState.COMPENSATED,
        );
        expect(transitions).toEqual([]);
      });
    });
  });

  describe('State Classification', () => {
    describe('isWorkflowTerminal', () => {
      it('should return true for terminal states', () => {
        expect(service.isWorkflowTerminal(WorkflowState.COMPLETED)).toBe(true);
        expect(service.isWorkflowTerminal(WorkflowState.CANCELLED)).toBe(true);
        expect(service.isWorkflowTerminal(WorkflowState.COMPENSATED)).toBe(
          true,
        );
      });

      it('should return false for non-terminal states', () => {
        expect(service.isWorkflowTerminal(WorkflowState.PENDING)).toBe(false);
        expect(service.isWorkflowTerminal(WorkflowState.RUNNING)).toBe(false);
        expect(service.isWorkflowTerminal(WorkflowState.FAILED)).toBe(false);
        expect(service.isWorkflowTerminal(WorkflowState.COMPENSATING)).toBe(
          false,
        );
      });
    });

    describe('isStepTerminal', () => {
      it('should return true for terminal states', () => {
        expect(service.isStepTerminal(StepState.COMPLETED)).toBe(true);
        expect(service.isStepTerminal(StepState.SKIPPED)).toBe(true);
        expect(service.isStepTerminal(StepState.COMPENSATED)).toBe(true);
      });

      it('should return false for non-terminal states', () => {
        expect(service.isStepTerminal(StepState.PENDING)).toBe(false);
        expect(service.isStepTerminal(StepState.RUNNING)).toBe(false);
        expect(service.isStepTerminal(StepState.FAILED)).toBe(false);
        expect(service.isStepTerminal(StepState.COMPENSATING)).toBe(false);
      });
    });

    describe('isWorkflowRecoverable', () => {
      it('should return true only for FAILED state', () => {
        expect(service.isWorkflowRecoverable(WorkflowState.FAILED)).toBe(true);
        expect(service.isWorkflowRecoverable(WorkflowState.PENDING)).toBe(
          false,
        );
        expect(service.isWorkflowRecoverable(WorkflowState.RUNNING)).toBe(
          false,
        );
        expect(service.isWorkflowRecoverable(WorkflowState.COMPLETED)).toBe(
          false,
        );
      });
    });

    describe('isStepRecoverable', () => {
      it('should return true only for FAILED state', () => {
        expect(service.isStepRecoverable(StepState.FAILED)).toBe(true);
        expect(service.isStepRecoverable(StepState.PENDING)).toBe(false);
        expect(service.isStepRecoverable(StepState.RUNNING)).toBe(false);
        expect(service.isStepRecoverable(StepState.COMPLETED)).toBe(false);
      });
    });

    describe('canWorkflowCompensate', () => {
      it('should return true for compensable states', () => {
        expect(service.canWorkflowCompensate(WorkflowState.COMPLETED)).toBe(
          true,
        );
        expect(service.canWorkflowCompensate(WorkflowState.FAILED)).toBe(true);
        expect(service.canWorkflowCompensate(WorkflowState.CANCELLED)).toBe(
          true,
        );
      });

      it('should return false for non-compensable states', () => {
        expect(service.canWorkflowCompensate(WorkflowState.PENDING)).toBe(
          false,
        );
        expect(service.canWorkflowCompensate(WorkflowState.RUNNING)).toBe(
          false,
        );
        expect(service.canWorkflowCompensate(WorkflowState.COMPENSATING)).toBe(
          false,
        );
        expect(service.canWorkflowCompensate(WorkflowState.COMPENSATED)).toBe(
          false,
        );
      });
    });

    describe('canStepCompensate', () => {
      it('should return true for compensable states', () => {
        expect(service.canStepCompensate(StepState.COMPLETED)).toBe(true);
        expect(service.canStepCompensate(StepState.FAILED)).toBe(true);
        expect(service.canStepCompensate(StepState.SKIPPED)).toBe(true);
      });

      it('should return false for non-compensable states', () => {
        expect(service.canStepCompensate(StepState.PENDING)).toBe(false);
        expect(service.canStepCompensate(StepState.RUNNING)).toBe(false);
        expect(service.canStepCompensate(StepState.COMPENSATING)).toBe(false);
        expect(service.canStepCompensate(StepState.COMPENSATED)).toBe(false);
      });
    });
  });

  describe('Retry Logic', () => {
    describe('shouldRetry', () => {
      it('should return true for failed state with retries remaining', () => {
        expect(service.shouldRetry(WorkflowState.FAILED, 1, 3)).toBe(true);
        expect(service.shouldRetry(StepState.FAILED, 2, 3)).toBe(true);
      });

      it('should return false for failed state with no retries remaining', () => {
        expect(service.shouldRetry(WorkflowState.FAILED, 3, 3)).toBe(false);
        expect(service.shouldRetry(StepState.FAILED, 4, 3)).toBe(false);
      });

      it('should return false for non-failed states', () => {
        expect(service.shouldRetry(WorkflowState.RUNNING, 1, 3)).toBe(false);
        expect(service.shouldRetry(StepState.COMPLETED, 1, 3)).toBe(false);
      });
    });

    describe('calculateNextRetryTime', () => {
      it('should calculate exponential backoff with jitter', () => {
        const baseTime = Date.now();
        const retryTime1 = service.calculateNextRetryTime(0, 1000);
        const retryTime2 = service.calculateNextRetryTime(1, 1000);
        const retryTime3 = service.calculateNextRetryTime(2, 1000);

        expect(retryTime1.getTime()).toBeGreaterThan(baseTime + 1000);
        expect(retryTime2.getTime()).toBeGreaterThan(baseTime + 2000);
        expect(retryTime3.getTime()).toBeGreaterThan(baseTime + 4000);

        // Should be within reasonable range (with jitter)
        expect(retryTime1.getTime()).toBeLessThan(baseTime + 1100);
        expect(retryTime2.getTime()).toBeLessThan(baseTime + 2200);
        expect(retryTime3.getTime()).toBeLessThan(baseTime + 4400);
      });

      it('should use default base delay when not specified', () => {
        const baseTime = Date.now();
        const retryTime = service.calculateNextRetryTime(1);

        expect(retryTime.getTime()).toBeGreaterThan(baseTime + 2000);
        expect(retryTime.getTime()).toBeLessThan(baseTime + 2200);
      });
    });
  });
});
