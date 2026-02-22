/**
 * QUEUE MODULE - BULLMQ INTEGRATION
 *
 * This module provides a resilient background job queue system using BullMQ
 * with Redis persistence. It supports retries, dead-letter queues (DLQ),
 * concurrency control, and comprehensive admin endpoints.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * - QueueService: Central service managing all queues and job operations
 * - Job Processors: Process specific job types (deploy-contract, process-tts, index-market-news)
 * - QueueAdminController: REST endpoints for queue management and monitoring
 * - Redis: Persistent storage for queue state and dead-letter queue
 *
 * ============================================================================
 * FEATURES
 * ============================================================================
 *
 * 1. RESILIENT JOB PROCESSING
 *    - Exponential backoff retries (configurable attempts)
 *    - Automatic job failure handling
 *    - Progress tracking for long-running jobs
 *    - Timeout control per job
 *
 * 2. DEAD-LETTER QUEUE (DLQ)
 *    - Automatic movement to DLQ when max retries exceeded
 *    - Manual inspection of failed jobs
 *    - Batch requeuing from DLQ with full data preservation
 *    - Configurable DLQ retention policies
 *
 * 3. CONCURRENCY CONTROL
 *    - Per-queue concurrency limits
 *    - Worker process management
 *    - Fair distribution of jobs
 *
 * 4. MONITORING & ADMIN
 *    - Real-time queue statistics
 *    - Job status tracking (pending, active, completed, failed, delayed)
 *    - Manual job requeue capability
 *    - Queue purge for maintenance
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * IMPORT IN MODULE:
 *
 *   import { QueueModule } from './queue/queue.module';
 *
 *   @Module({
 *     imports: [QueueModule],
 *   })
 *   export class AppModule {}
 *
 * INJECT IN SERVICE:
 *
 *   import { QueueService } from './queue';
 *
 *   @Injectable()
 *   export class MyService {
 *     constructor(private queueService: QueueService) {}
 *
 *     async deployContract(name: string, code: string) {
 *       const job = await this.queueService.addJob(
 *         'deploy-contract',
 *         'deploy',
 *         { contractName: name, contractCode: code, network: 'mainnet' },
 *         { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
 *       );
 *       return job;
 *     }
 *   }
 *
 * ============================================================================
 * API ENDPOINTS
 * ============================================================================
 *
 * QUEUE STATISTICS:
 *   GET /admin/queue/                    - Get all queue stats
 *   GET /admin/queue/stats/:queueName    - Get specific queue stats
 *
 * JOB MANAGEMENT:
 *   GET /admin/queue/:queueName/jobs          - List all jobs in queue
 *   GET /admin/queue/:queueName/jobs/:jobId   - Get specific job details
 *   POST /admin/queue/:queueName/jobs/:jobId/requeue  - Requeue failed job
 *
 * DEAD-LETTER QUEUE:
 *   GET /admin/queue/:queueName/dlq            - View DLQ items
 *   POST /admin/queue/:queueName/dlq/requeue   - Requeue items from DLQ
 *
 * MAINTENANCE:
 *   POST /admin/queue/:queueName/purge  - Purge queue
 *
 * ============================================================================
 * JOB TYPES
 * ============================================================================
 *
 * 1. DEPLOY-CONTRACT
 *    Queue: deploy-contract
 *    Data: { contractName, contractCode, network, initializer? }
 *    Timeout: 60 seconds
 *    Attempts: 3
 *    Use: Contract deployment to blockchain
 *
 * 2. PROCESS-TTS
 *    Queue: process-tts
 *    Data: { text, voiceId, language?, speed?, sessionId? }
 *    Timeout: 30 seconds
 *    Attempts: 2
 *    Use: Text-to-speech audio generation
 *
 * 3. INDEX-MARKET-NEWS
 *    Queue: index-market-news
 *    Data: { source, startDate?, endDate?, limit? }
 *    Timeout: 120 seconds
 *    Attempts: 3
 *    Use: Market news indexing and enrichment
 *
 * ============================================================================
 * RETRY CONFIGURATION
 * ============================================================================
 *
 * EXPONENTIAL BACKOFF:
 *   Attempt 1: Immediate
 *   Attempt 2: 2 seconds delay
 *   Attempt 3: 4 seconds delay
 *   (Doubles each time)
 *
 * BACKOFF TYPES:
 *   - 'exponential': Delay doubles with each retry (recommended)
 *   - 'fixed': Same delay for all retries
 *
 * CONFIGURATION:
 *   const options = {
 *     attempts: 3,                    // Total number of attempts
 *     backoff: {
 *       type: 'exponential',          // 'exponential' or 'fixed'
 *       delay: 2000                   // Initial delay in ms
 *     },
 *     timeout: 60000,                 // Job timeout in ms
 *     removeOnComplete: false,        // Keep completed jobs for history
 *     removeOnFail: false            // Keep failed jobs for analysis
 *   };
 *
 * ============================================================================
 * DEAD-LETTER QUEUE HANDLING
 * ============================================================================
 *
 * AUTOMATIC MOVEMENT TO DLQ:
 *   When a job fails after max retries:
 *   1. Final failure is recorded
 *   2. Job is moved to DLQ in Redis
 *   3. Full job data is preserved for inspection
 *   4. Error message and metadata are stored
 *
 * DLQ ITEM STRUCTURE:
 *   {
 *     id: string,                    // Job ID
 *     name: string,                  // Job name
 *     data: object,                  // Original job data
 *     error: string,                 // Failure reason
 *     attempts: number,              // Actual attempts made
 *     maxAttempts: number,           // Configured max attempts
 *     failedAt: string               // ISO timestamp
 *   }
 *
 * REQUEUE FROM DLQ:
 *   - Retrieves items from DLQ (with limit to prevent memory issues)
 *   - Creates new jobs with same data
 *   - Preserves attempt count in metadata
 *   - Trims DLQ after successful requeue
 *   - Handles partial failures gracefully
 *
 * ============================================================================
 * MONITORING & HEALTH CHECKS
 * ============================================================================
 *
 * QUEUE STATISTICS RESPONSE:
 *   {
 *     "active": 5,        // Currently processing
 *     "waiting": 15,      // Waiting to process
 *     "completed": 100,   // Successfully completed
 *     "failed": 10,       // Failed (before DLQ move)
 *     "delayed": 2        // Delayed (backoff retry)
 *   }
 *
 * HEALTH INDICATORS:
 *   - Failure Rate < 5%: Healthy
 *   - Failure Rate 5-10%: Warning
 *   - Failure Rate > 10%: Critical
 *
 * ============================================================================
 * TESTING
 * ============================================================================
 *
 * TEST FILES:
 *   - queue.service.spec.ts          - QueueService unit tests
 *   - deploy-contract.processor.spec.ts   - Deploy processor tests
 *   - process-tts.processor.spec.ts       - TTS processor tests
 *   - index-market-news.processor.spec.ts - News processor tests
 *   - queue-admin.controller.spec.ts      - Admin endpoint tests
 *   - queue.integration.spec.ts      - Integration tests (retries + DLQ)
 *
 * RUN TESTS:
 *   npm run test                    # All tests
 *   npm run test:watch              # Watch mode
 *   npm run test:cov                # Coverage report
 *
 * TEST COVERAGE:
 *   - Job queueing and processing
 *   - Retry logic and exponential backoff
 *   - Dead-letter queue operations
 *   - Admin endpoint validation
 *   - Error handling and edge cases
 *
 * ============================================================================
 * ENVIRONMENT VARIABLES
 * ============================================================================
 *
 * REDIS CONFIGURATION:
 *   REDIS_HOST=localhost           # Redis host (default: localhost)
 *   REDIS_PORT=6379                # Redis port (default: 6379)
 *   REDIS_QUEUE_DB=1               # Redis DB for queues (default: 1)
 *
 * ALTERNATIVE (connection string):
 *   REDIS_URL=redis://localhost:6379
 *
 * ============================================================================
 * PERFORMANCE CONSIDERATIONS
 * ============================================================================
 *
 * 1. CONCURRENCY LIMITS
 *    - Deploy-contract: 2 concurrent (heavy operation)
 *    - Process-TTS: 4 concurrent (moderate)
 *    - Index-market-news: 3 concurrent (moderate)
 *    - Adjustable in QueueModule based on server capacity
 *
 * 2. MEMORY MANAGEMENT
 *    - DLQ pagination (limit parameter) prevents memory overflow
 *    - Completed jobs removed after retention period
 *    - Failed jobs kept for analysis (configurable)
 *
 * 3. REDIS OPTIMIZATION
 *    - Separate Redis DB (db=1) for queues
 *    - Separate Redis instance for sessions/pub-sub
 *    - Keyspace optimization with TTL policies
 *
 * ============================================================================
 * TROUBLESHOOTING
 * ============================================================================
 *
 * JOBS NOT PROCESSING:
 *   1. Check Redis connection: REDIS_HOST, REDIS_PORT
 *   2. Verify processor is registered in QueueModule
 *   3. Check console for processor errors
 *   4. Monitor queue stats: GET /admin/queue/stats/:queueName
 *
 * HIGH FAILURE RATE:
 *   1. Check DLQ: GET /admin/queue/:queueName/dlq
 *   2. Review error messages in DLQ items
 *   3. Adjust timeout if needed
 *   4. Increase attempts for transient failures
 *
 * MEMORY ISSUES:
 *   1. Reduce removeOnComplete:false retention
 *   2. Implement cleanup job to trim old records
 *   3. Use DLQ pagination with smaller limits
 *   4. Monitor Redis memory usage
 *
 * ============================================================================
 * PRODUCTION CHECKLIST
 * ============================================================================
 *
 * [ ] Configure appropriate retry attempts per job type
 * [ ] Set realistic timeouts for job processing
 * [ ] Configure concurrency limits based on server capacity
 * [ ] Set up monitoring/alerting for queue health
 * [ ] Implement periodic DLQ cleanup/review process
 * [ ] Set up Redis persistence (AOF or RDB)
 * [ ] Configure Redis replication for HA
 * [ ] Implement job-specific error handling
 * [ ] Add comprehensive logging with correlation IDs
 * [ ] Document custom job types and processing requirements
 */
