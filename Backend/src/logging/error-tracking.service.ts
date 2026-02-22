import { Injectable } from '@nestjs/common';
import { StructuredLogger } from './structured-logger.service';
import { MetricsService } from './metrics.service';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface TrackedError {
  message: string;
  stack?: string;
  category?: string;
  severity?: ErrorSeverity;
  correlationId?: string;
  extra?: Record<string, any>;
}

/**
 * Stub service responsible for sending errors to a centralized tracking
 * system (Sentry, Datadog, etc.) and triggering alerts on critical issues.
 *
 * In production this would be wired to an SDK provided by the vendor.
 */
@Injectable()
export class ErrorTrackingService {
  private readonly logger = new StructuredLogger(ErrorTrackingService.name);

  constructor(private readonly metrics: MetricsService) {}

  async track(error: TrackedError) {
    // attach correlation id if not provided
    if (!error.correlationId) {
      const RequestContext = require('./request-context').RequestContext;
      error.correlationId = RequestContext.get('correlationId');
    }

    // increment metric by severity/category
    this.metrics.incrementError(
      error.severity || ErrorSeverity.MEDIUM,
      error.category || 'general',
    );

    // for now just log the object; in real world we'd send to remote
    this.logger.error(
      'Tracked error',
      JSON.stringify(error),
      ErrorTrackingService.name,
    );

    if (error.severity === ErrorSeverity.CRITICAL) {
      // fire alert, e.g. slack, pagerduty etc.
      this.logger.warn(
        'Critical error alert triggered',
        ErrorTrackingService.name,
      );
    }
  }
}
