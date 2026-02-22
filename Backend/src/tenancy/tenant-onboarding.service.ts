import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import {
  TenantInvitation,
  InvitationStatus,
} from './entities/tenant-invitation.entity';
import { TenantStatus } from './entities/tenant.entity';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit/audit.service';

export interface OnboardingStep {
  id: string;
  name: string;
  completed: boolean;
  completedAt?: Date;
  data?: Record<string, any>;
}

export interface OnboardingProcess {
  tenantId: string;
  steps: OnboardingStep[];
  currentStep: number;
  isComplete: boolean;
  startedAt: Date;
  completedAt?: Date;
}

@Injectable()
export class TenantOnboardingService {
  private onboardingProcesses: Map<string, OnboardingProcess> = new Map();

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantInvitation)
    private readonly invitationRepository: Repository<TenantInvitation>,
    private readonly auditService: AuditService,
  ) {}

  private readonly ONBOARDING_STEPS: Omit<
    OnboardingStep,
    'completed' | 'completedAt' | 'data'
  >[] = [
    { id: 'tenant_setup', name: 'Tenant Setup' },
    { id: 'admin_invitation', name: 'Admin User Invitation' },
    { id: 'user_setup', name: 'User Account Setup' },
    { id: 'billing_setup', name: 'Billing Configuration' },
    { id: 'integration_setup', name: 'Integration Setup' },
    { id: 'verification', name: 'Verification and Activation' },
  ];

  async startOnboarding(
    tenantId: string,
    adminInfo: {
      email: string;
      name?: string;
      companyInfo?: any;
    },
  ): Promise<OnboardingProcess> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (tenant.status !== TenantStatus.PENDING) {
      throw new BadRequestException(
        'Tenant must be in pending status to start onboarding',
      );
    }

    // Create onboarding process
    const process: OnboardingProcess = {
      tenantId,
      steps: this.ONBOARDING_STEPS.map((step) => ({
        ...step,
        completed: false,
      })),
      currentStep: 0,
      isComplete: false,
      startedAt: new Date(),
    };

    this.onboardingProcesses.set(tenantId, process);

    // Create admin invitation
    await this.createAdminInvitation(tenantId, adminInfo);

    // Audit log
    await this.auditService.logAction(
      'tenant.onboarding.started',
      'system',
      tenantId,
      { adminInfo, process },
    );

    return process;
  }

  private async createAdminInvitation(
    tenantId: string,
    adminInfo: {
      email: string;
      name?: string;
    },
  ): Promise<TenantInvitation> {
    const invitation = this.invitationRepository.create({
      tenant: { id: tenantId } as Tenant,
      email: adminInfo.email,
      role: 'tenant-admin',
      status: InvitationStatus.PENDING,
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      metadata: {
        invitedByName: adminInfo.name,
        invitedBy: 'onboarding-process',
      },
    });

    return this.invitationRepository.save(invitation);
  }

  async getOnboardingStatus(
    tenantId: string,
  ): Promise<OnboardingProcess | null> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    return this.onboardingProcesses.get(tenantId) || null;
  }

  async completeStep(
    tenantId: string,
    stepId: string,
    stepData?: Record<string, any>,
  ): Promise<OnboardingProcess> {
    const process = this.onboardingProcesses.get(tenantId);
    if (!process) {
      throw new NotFoundException(
        'Onboarding process not found for this tenant',
      );
    }

    const step = process.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new BadRequestException(
        `Step ${stepId} not found in onboarding process`,
      );
    }

    if (step.completed) {
      throw new BadRequestException(`Step ${stepId} is already completed`);
    }

    // Mark step as completed
    step.completed = true;
    step.completedAt = new Date();
    if (stepData) {
      step.data = stepData;
    }

    // Move to next step
    process.currentStep = Math.min(
      process.currentStep + 1,
      process.steps.length - 1,
    );

    // Check if onboarding is complete
    const allStepsCompleted = process.steps.every((s) => s.completed);
    if (allStepsCompleted) {
      process.isComplete = true;
      process.completedAt = new Date();

      // Activate tenant
      await this.activateTenantAfterOnboarding(tenantId);
    }

    // Audit log
    await this.auditService.logAction(
      'tenant.onboarding.step_completed',
      'system',
      tenantId,
      { stepId, stepData, process },
    );

    return process;
  }

  private async activateTenantAfterOnboarding(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (tenant) {
      tenant.status = TenantStatus.ACTIVE;
      tenant.activatedAt = new Date();
      await this.tenantRepository.save(tenant);

      // Audit log
      await this.auditService.logAction(
        'tenant.activated',
        'system',
        tenantId,
        { activatedBy: 'onboarding-process' },
      );
    }
  }

  async getPendingInvitations(tenantId: string): Promise<TenantInvitation[]> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    return this.invitationRepository.find({
      where: {
        tenant: { id: tenantId },
        status: InvitationStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async acceptInvitation(
    token: string,
    userId: string,
  ): Promise<TenantInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: { token },
      relations: ['tenant'],
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation is no longer valid');
    }

    if (invitation.isExpired) {
      throw new BadRequestException('Invitation has expired');
    }

    // Update invitation status
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedAt = new Date();
    await this.invitationRepository.save(invitation);

    // Audit log
    await this.auditService.logAction(
      'tenant.invitation.accepted',
      userId,
      invitation.tenant.id,
      { invitationId: invitation.id, token },
    );

    return invitation;
  }

  async getOnboardingProgress(tenantId: string): Promise<{
    totalSteps: number;
    completedSteps: number;
    currentStep: number;
    completionPercentage: number;
  }> {
    const process = this.onboardingProcesses.get(tenantId);
    if (!process) {
      return {
        totalSteps: 0,
        completedSteps: 0,
        currentStep: 0,
        completionPercentage: 0,
      };
    }

    const totalSteps = process.steps.length;
    const completedSteps = process.steps.filter((s) => s.completed).length;
    const completionPercentage =
      totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    return {
      totalSteps,
      completedSteps,
      currentStep: process.currentStep,
      completionPercentage: Math.round(completionPercentage * 100) / 100,
    };
  }

  async cancelOnboarding(tenantId: string, reason?: string): Promise<void> {
    const process = this.onboardingProcesses.get(tenantId);
    if (!process) {
      throw new NotFoundException(
        'Onboarding process not found for this tenant',
      );
    }

    // Remove from active processes
    this.onboardingProcesses.delete(tenantId);

    // Update tenant status
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (tenant) {
      tenant.status = TenantStatus.INACTIVE;
      await this.tenantRepository.save(tenant);
    }

    // Audit log
    await this.auditService.logAction(
      'tenant.onboarding.cancelled',
      'system',
      tenantId,
      { reason, process },
    );
  }

  async getAllActiveOnboarding(): Promise<OnboardingProcess[]> {
    return Array.from(this.onboardingProcesses.values());
  }
}
