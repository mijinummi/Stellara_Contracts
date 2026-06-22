# Workflow Orchestration Engine

A comprehensive workflow orchestration engine for Stellara AI that coordinates multi-step, long-running backend operations with guaranteed exactly-once execution, idempotency, and failure recovery.

## 🎯 Features

### Core Capabilities
- **Stateful Workflows**: Explicit state machine-based workflow definitions
- **Idempotency Guarantees**: Deterministic idempotency keys prevent duplicate operations
- **Failure Recovery**: Safe resume, retry, and compensation logic
- **Persistence**: PostgreSQL-based workflow state persistence
- **Observability**: Admin endpoints for monitoring and control

### Workflow Types
- **Smart Contract Deployment**: Deploy → Index → Verify
- **Trade Execution**: Execute → Confirm → Portfolio Update
- **AI Job Chains**: STT → LLM → TTS processing
- **Indexing & Verification**: Blockchain data processing
- **Reward Grants**: User reward distribution

## 🏗️ Architecture

### Core Components

#### Workflow Engine
- **WorkflowExecutionService**: Main orchestration engine
- **WorkflowStateMachineService**: State transition management
- **IdempotencyService**: Idempotency key generation and validation
- **WorkflowService**: High-level workflow management API

#### Database Schema
```sql
workflows {
  id: uuid (primary key)
  idempotency_key: string (unique)
  type: enum (workflow_type)
  state: enum (workflow_state)
  user_id: string
  wallet_address: string
  input: jsonb
  output: jsonb
  context: jsonb
  current_step_index: integer
  total_steps: integer
  timestamps...
  retry_count: integer
  max_retries: integer
  requires_compensation: boolean
  is_compensated: boolean
}

workflow_steps {
  id: uuid (primary key)
  workflow_id: uuid (foreign key)
  step_name: string
  step_index: integer
  state: enum (step_state)
  input: jsonb
  output: jsonb
  config: jsonb
  timestamps...
  retry_count: integer
  max_retries: integer
  requires_compensation: boolean
  is_compensated: boolean
  is_idempotent: boolean
  idempotency_key: string
}
```

### State Machines

#### Workflow States
```
PENDING → RUNNING → COMPLETED
    ↓         ↓
CANCELLED  FAILED → COMPENSATING → COMPENSATED
```

#### Step States
```
PENDING → RUNNING → COMPLETED
    ↓         ↓
SKIPPED  FAILED → COMPENSATING → COMPENSATED
```

## 🚀 Getting Started

### 1. Database Setup

```bash
# Create PostgreSQL database
createdb stellara_workflows

# Set environment variables
export DB_HOST=localhost
export DB_PORT=5432
export DB_USERNAME=postgres
export DB_PASSWORD=password
export DB_DATABASE=stellara_workflows
```

### 2. Start the Application

```bash
npm install
npm run build
npm run start:dev
```

### 3. Basic Usage

```typescript
import { WorkflowService } from './workflow/services/workflow.service';

// Start a contract deployment workflow
const workflow = await workflowService.startWorkflow(
  'contract_deployment',
  {
    contractCode: '0x1234567890abcdef...',
    contractName: 'MyToken',
  },
  'user123',
  '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
);

console.log(`Workflow started: ${workflow.id}`);
```

## 📝 Workflow Definition

### Creating a Workflow

```typescript
import { WorkflowDefinition, StepDefinition } from './types';

const myWorkflow: WorkflowDefinition = {
  type: 'my_workflow_type',
  name: 'My Custom Workflow',
  description: 'Description of what this workflow does',
  requiresCompensation: true,
  maxRetries: 3,
  steps: [
    {
      name: 'step_one',
      isIdempotent: true,
      maxRetries: 2,
      execute: async (input: any, context: WorkflowContext) => {
        // Step implementation
        console.log(`Executing step for workflow: ${context.workflowId}`);
        
        // Business logic here
        const result = await doSomething(input);
        
        return { processedData: result };
      },
      compensate: async (input: any, output: any, context: WorkflowContext) => {
        // Compensation logic (optional)
        console.log(`Compensating step for workflow: ${context.workflowId}`);
        await undoSomething(output);
      },
    },
    // Add more steps...
  ],
};

// Register the workflow
workflowExecutionService.registerWorkflowDefinition(myWorkflow);
```

### Step Definition Interface

```typescript
interface StepDefinition {
  name: string;
  execute: (input: any, context: WorkflowContext) => Promise<any>;
  compensate?: (input: any, output: any, context: WorkflowContext) => Promise<any>;
  isIdempotent: boolean;
  maxRetries?: number;
  timeout?: number;
  config?: Record<string, any>;
}
```

## 🔒 Idempotency

### Idempotency Keys

The system generates deterministic idempotency keys to prevent duplicate operations:

```typescript
// Workflow-level idempotency
const workflowKey = idempotencyService.generateWorkflowIdempotencyKey(
  'contract_deployment',
  'user123',
  { contractCode: '0x...', contractName: 'Token' }
);
// Result: "workflow:contract_deployment:user123:a1b2c3d4..."

// Step-level idempotency
const stepKey = idempotencyService.generateStepIdempotencyKey(
  workflowKey,
  'deploy_contract',
  { contractAddress: '0x...' }
);
// Result: "step:deploy_contract:e5f6g7h8..."
```

### Idempotency Guarantees

- **Duplicate Prevention**: Same input generates same idempotency key
- **Safe Retries**: Failed operations can be retried safely
- **Audit Trail**: All operations tracked with unique identifiers
- **Cross-Service**: Keys work across service boundaries

## 🔄 Failure Recovery

### Retry Logic

```typescript
// Automatic retry with exponential backoff
const nextRetryTime = stateMachine.calculateNextRetryTime(retryCount, 1000);
// Returns: Date with exponential delay + jitter

// Check if retry should happen
const shouldRetry = stateMachine.shouldRetry(
  StepState.FAILED,
  currentRetryCount,
  maxRetries
);
```

### Compensation

```typescript
// Compensate a failed workflow
await workflowService.compensateWorkflow(workflowId);

// Compensation executes in reverse order
// Step 3: Compensate
// Step 2: Compensate  
// Step 1: Compensate
```

### Recovery Scenarios

1. **Service Restart**: Workflow state persisted in PostgreSQL
2. **Step Failure**: Automatic retry with exponential backoff
3. **Workflow Failure**: Manual retry or compensation
4. **Partial Execution**: Resume from last successful step

## 📊 Admin API

### Workflow Management

```typescript
// Get all workflows
GET /admin/workflows?page=1&limit=20&state=completed

// Get specific workflow
GET /admin/workflows/{id}

// Get workflow timeline
GET /admin/workflows/{id}/timeline

// Retry failed workflow
POST /admin/workflows/{id}/retry

// Cancel workflow
POST /admin/workflows/{id}/cancel

// Compensate workflow
POST /admin/workflows/{id}/compensate
```

### Monitoring

```typescript
// Get workflow statistics
GET /admin/workflows/stats/overview

// Search workflows
GET /admin/workflows/search?q=contract_deployment

// Get retryable workflows
GET /admin/workflows?state=failed
```

## 🧪 Testing

### Running Tests

```bash
# Run all workflow tests
npm test -- src/workflow

# Run with coverage
npm run test:cov -- src/workflow

# Run specific test file
npm test -- workflow.service.spec.ts
```

### Test Coverage

- ✅ Workflow lifecycle management
- ✅ State machine transitions
- ✅ Idempotency key generation
- ✅ Retry logic and backoff
- ✅ Compensation workflows
- ✅ Error handling scenarios
- ✅ Admin API endpoints

## 🔧 Configuration

### Environment Variables

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=stellara_workflows

# Application Configuration
NODE_ENV=development
PORT=3000

# Redis Configuration (for voice module)
REDIS_URL=redis://localhost:6379
```

### Workflow Configuration

```typescript
// Configure retry behavior
const workflowConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  jitterFactor: 0.1, // 10% jitter
};

// Configure cleanup
const cleanupConfig = {
  retentionDays: 30,
  cleanupInterval: 3600000, // 1 hour
};
```

## 📈 Performance

### Optimization Features

- **Database Indexing**: Optimized queries for workflow lookup
- **Connection Pooling**: Efficient database connections
- **Batch Operations**: Bulk processing for cleanup
- **Caching**: Redis-based caching for idempotency
- **Async Processing**: Non-blocking step execution

### Scaling Considerations

- **Horizontal Scaling**: Multiple service instances
- **Database Sharding**: Partition workflows by user/type
- **Queue Integration**: External job queue integration
- **Monitoring**: Metrics and alerting integration

## 🚨 Error Handling

### Error Categories

1. **Business Logic Errors**: Invalid input, validation failures
2. **Transient Errors**: Network issues, temporary unavailability
3. **System Errors**: Database failures, service unavailability
4. **Timeout Errors**: Step execution timeouts

### Error Recovery

```typescript
try {
  await workflowService.startWorkflow(type, input, userId);
} catch (error) {
  if (error.code === 'IDEMPOTENCY_VIOLATION') {
    // Handle duplicate request
    return existingWorkflow;
  } else if (error.code === 'VALIDATION_ERROR') {
    // Handle invalid input
    throw new BadRequestException(error.message);
  } else {
    // Handle system errors
    throw new InternalServerErrorException('Workflow service unavailable');
  }
}
```

## 🔮 Future Enhancements

### Planned Features

- **Visual Workflow Builder**: Drag-and-drop workflow designer
- **Workflow Templates**: Pre-built workflow templates
- **Advanced Scheduling**: Cron-based workflow scheduling
- **Distributed Tracing**: OpenTelemetry integration
- **Event Sourcing**: Event-based workflow state tracking
- **Workflow Analytics**: Advanced analytics and reporting

### Integration Points

- **Message Queues**: RabbitMQ, Kafka integration
- **Monitoring**: Prometheus, Grafana integration
- **Logging**: ELK stack integration
- **Security**: OAuth2, JWT authentication
- **API Gateway**: Kong, Ambassador integration

## 📚 Examples

### Contract Deployment Workflow

```typescript
// Start contract deployment
const workflow = await workflowService.startWorkflow(
  'contract_deployment',
  {
    contractCode: '0x1234567890abcdef...',
    contractName: 'MyToken',
    constructorArgs: ['1000000', 'MyToken', 'MTK'],
  },
  'user123',
  '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
);

// Monitor progress
const summary = await workflowService.getWorkflowExecutionSummary(workflow.id);
console.log(`Progress: ${summary.progress.completionPercentage}%`);
```

### Trade Execution Workflow

```typescript
// Execute trade
const workflow = await workflowService.startWorkflow(
  'trade_execution',
  {
    tokenA: 'ETH',
    tokenB: 'USDC',
    amount: 1.5,
    slippage: 0.01,
  },
  'user456',
  '0x8ba1f109551bD432803012645Hac136c'
);

// Handle completion
workflow.on('completed', (result) => {
  console.log(`Trade executed: ${result.output.tradeHash}`);
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add comprehensive tests
5. Submit a pull request

## 📄 License

This project is part of the Stellara AI ecosystem. See the main repository for licensing information.
