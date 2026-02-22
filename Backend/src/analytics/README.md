# Real-Time Analytics Service

## Overview

The Analytics module provides comprehensive real-time analytics capabilities for the Stellara AI platform. It collects, processes, and visualizes platform metrics, user engagement data, and system performance information for administrators and stakeholders.

## Features

### 📊 Real-Time Metrics Collection
- **Multi-category metrics**: System, Business, User, Performance, and Security metrics
- **Flexible metric types**: Counter, Gauge, Histogram, and Summary
- **Multi-tenancy support**: Tenant-specific metric isolation
- **Real-time streaming**: WebSocket-based live metric updates

### 🚨 Alerting System
- **Configurable alert rules**: Define thresholds and conditions
- **Multiple severity levels**: Low, Medium, High, Critical
- **Alert lifecycle management**: Triggered → Acknowledged → Resolved
- **Automatic alert triggering**: Based on metric conditions

### 📈 Data Aggregation
- **Time-based aggregation**: Hourly and daily summaries
- **Automated scheduling**: Cron-based aggregation jobs
- **Performance optimization**: Efficient data storage and retrieval
- **Historical analysis**: Trend analysis and reporting

### 🎯 Admin Dashboard
- **Comprehensive overview**: System health, business metrics, user engagement
- **Real-time updates**: Live data streaming to dashboard
- **Customizable views**: Filter by tenant, time range, and metric types
- **Alert notifications**: Real-time alert displays

## Architecture

```
Analytics Module
├── Entities
│   ├── AnalyticsMetric    # Core metric data structure
│   └── AnalyticsAlert     # Alert rules and notifications
├── Services
│   ├── AnalyticsService   # Core analytics functionality
│   ├── AlertingService    # Alert management and triggering
│   └── DataAggregationService # Data aggregation and processing
├── Controllers
│   └── AnalyticsController # REST API endpoints
├── Gateways
│   └── AnalyticsGateway   # WebSocket real-time streaming
└── Module
    └── AnalyticsModule    # Module configuration
```

## API Endpoints

### Metrics Management
- `GET /analytics/health` - System health metrics
- `GET /analytics/business` - Business performance metrics
- `GET /analytics/engagement` - User engagement metrics
- `GET /analytics/metrics/:category` - Metrics by category
- `GET /analytics/metrics/latest/:name` - Latest metrics for specific name
- `GET /analytics/metrics/aggregated/:name` - Aggregated metrics over time
- `POST /analytics/metrics` - Record new metric

### Alert Management
- `GET /analytics/alerts` - Get all alerts
- `GET /analytics/alerts/:id` - Get specific alert
- `POST /analytics/alerts` - Create new alert rule
- `POST /analytics/alerts/:id/acknowledge` - Acknowledge alert
- `POST /analytics/alerts/:id/resolve` - Resolve alert

### Dashboard & Aggregation
- `GET /analytics/dashboard` - Comprehensive dashboard data
- `GET /analytics/aggregation/status` - Aggregation status
- `POST /analytics/aggregation/trigger` - Trigger manual aggregation

## WebSocket Events

### Real-Time Streaming
- `subscribeMetrics` - Subscribe to specific metrics
- `unsubscribeMetrics` - Unsubscribe from metrics
- `getDashboardStream` - Get real-time dashboard updates
- `stopDashboardStream` - Stop dashboard streaming

### Events Received
- `metricUpdate` - Real-time metric updates
- `dashboardUpdate` - Dashboard data updates
- `alertNotification` - Alert notifications
- `dashboardMetricUpdate` - Specific dashboard metric updates

## Data Models

### AnalyticsMetric
```typescript
{
  id: string;              // UUID
  name: string;            // Metric identifier
  type: MetricType;        // counter | gauge | histogram | summary
  category: MetricCategory; // system | business | user | performance | security
  value: number;           // Metric value
  labels: Record<string, string>; // Optional labels
  tenantId: string | null; // Multi-tenancy support
  userId: string | null;   // User association
  timestamp: Date;         // Creation time
  updatedAt: Date;         // Last update
}
```

### AnalyticsAlert
```typescript
{
  id: string;              // UUID
  name: string;            // Alert name
  description: string;     // Alert description
  severity: AlertSeverity; // low | medium | high | critical
  status: AlertStatus;     // triggered | acknowledged | resolved | silenced
  metricName: string;      // Associated metric
  condition: {             // Alert condition
    operator: string;      // >, <, >=, <=, ==, !=
    threshold: number;     // Threshold value
    duration?: number;     // Duration in seconds
  };
  currentValue: any;       // Current metric value
  tenantId: string | null; // Multi-tenancy support
  userId: string | null;   // User association
  createdAt: Date;         // Creation time
  acknowledgedAt: Date | null; // Acknowledgment time
  resolvedAt: Date | null;     // Resolution time
  acknowledgedBy: string | null; // User who acknowledged
  updatedAt: Date;         // Last update
}
```

## Usage Examples

### Recording Metrics
```typescript
// Record a system metric
await analyticsService.recordMetric(
  'cpu_usage',
  75.5,
  MetricType.GAUGE,
  MetricCategory.SYSTEM,
  { server: 'web-01' },
  'tenant-123'
);

// Record a business metric
await analyticsService.recordMetric(
  'revenue',
  1250.75,
  MetricType.COUNTER,
  MetricCategory.BUSINESS,
  { currency: 'USD' }
);
```

### Creating Alert Rules
```typescript
// Create CPU usage alert
await alertingService.createAlertRule(
  'High CPU Usage',
  'CPU usage exceeds 80%',
  AlertSeverity.HIGH,
  'cpu_usage',
  {
    operator: '>',
    threshold: 80,
    duration: 300 // 5 minutes
  },
  'tenant-123'
);
```

### Real-Time Dashboard
```typescript
// Subscribe to dashboard updates
socket.emit('getDashboardStream', { tenantId: 'tenant-123' });

// Subscribe to specific metrics
socket.emit('subscribeMetrics', {
  metricNames: ['active_users', 'revenue'],
  tenantId: 'tenant-123'
});
```

## Configuration

### Environment Variables
```env
# Analytics Configuration
ANALYTICS_ENABLED=true
ANALYTICS_RETENTION_DAYS=30
ANALYTICS_AGGREGATION_INTERVAL=3600  # 1 hour in seconds
```

### Database Setup
The module requires PostgreSQL with the following tables:
- `analytics_metrics` - Stores metric data
- `analytics_alerts` - Stores alert rules and notifications

Run migrations:
```bash
npm run migration:run
```

## Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (ADMIN, SUPERADMIN)
- Multi-tenancy isolation
- Audit logging for all operations

### Data Protection
- Tenant data isolation
- Secure WebSocket connections
- Input validation and sanitization
- Rate limiting on API endpoints

## Performance Considerations

### Optimization Strategies
- **Database indexing**: Optimized indexes on timestamp, tenantId, and category
- **Data aggregation**: Pre-aggregated metrics for faster queries
- **Caching**: Redis caching for frequently accessed data
- **Batch processing**: Bulk metric recording capabilities
- **Connection pooling**: Efficient database connection management

### Scalability
- **Horizontal scaling**: Multiple instances supported
- **Load balancing**: WebSocket connections can be load balanced
- **Database sharding**: Tenant-based data sharding options
- **Message queuing**: Asynchronous processing for high-volume metrics

## Monitoring & Maintenance

### Health Checks
- System health endpoint (`/analytics/health`)
- Aggregation status monitoring
- Alert system health checks
- Connection monitoring for WebSocket gateway

### Maintenance Tasks
- **Data cleanup**: Automatic removal of old resolved alerts
- **Aggregation jobs**: Scheduled data aggregation
- **Performance tuning**: Query optimization and indexing
- **Capacity planning**: Monitoring storage and performance metrics

## Integration Points

### With Existing Services
- **Observability module**: Integration with existing metrics
- **Auth module**: User and tenant context
- **Queue module**: Asynchronous processing
- **Logging module**: Structured logging integration

### External Integrations
- **Grafana**: Dashboard visualization
- **Prometheus**: Metrics export
- **Alerting systems**: Integration with external alerting tools
- **Data warehouses**: Export to analytics platforms

## Testing

### Unit Tests
```bash
npm run test src/analytics/analytics.service.spec.ts
```

### Integration Tests
```bash
npm run test:e2e -- --grep="Analytics"
```

## Deployment

### Production Considerations
- **Database sizing**: Plan for metric storage growth
- **Connection limits**: WebSocket connection scaling
- **Backup strategy**: Regular data backups
- **Monitoring setup**: Production monitoring and alerting
- **Performance tuning**: Production-specific optimizations

### Rollout Strategy
1. Deploy to staging environment
2. Run migration scripts
3. Verify functionality with test data
4. Gradual production rollout
5. Monitor performance and errors
6. Full production deployment

## Troubleshooting

### Common Issues
- **Database connection errors**: Check database connectivity and credentials
- **WebSocket connection issues**: Verify CORS configuration and network settings
- **Performance degradation**: Check database indexes and query performance
- **Missing metrics**: Verify metric recording and aggregation jobs

### Debugging
- Enable debug logging: `DEBUG=analytics:*`
- Check database query performance
- Monitor WebSocket connection health
- Review aggregation job status

## Future Enhancements

### Planned Features
- **Advanced analytics**: Machine learning-based anomaly detection
- **Custom dashboards**: User-defined dashboard layouts
- **Export capabilities**: Data export to various formats
- **Mobile support**: Mobile-optimized dashboard views
- **Advanced alerting**: Complex alert conditions and correlations

### Performance Improvements
- **Real-time processing**: Stream processing for immediate insights
- **Data compression**: Efficient storage of historical data
- **Query optimization**: Advanced database optimization techniques
- **Caching strategies**: Multi-level caching for improved performance