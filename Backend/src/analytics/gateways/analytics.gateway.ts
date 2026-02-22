import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';

@WebSocketGateway({
  namespace: '/analytics',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class AnalyticsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AnalyticsGateway.name);
  private connectedClients = new Map<string, string>();

  constructor(private readonly analyticsService: AnalyticsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, client.id);
    
    // Send initial connection confirmation
    client.emit('connected', {
      clientId: client.id,
      timestamp: new Date(),
      message: 'Connected to analytics real-time stream',
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('subscribeMetrics')
  handleSubscribeMetrics(client: Socket, payload: { metricNames: string[]; tenantId?: string }) {
    this.logger.log(`Client ${client.id} subscribed to metrics: ${payload.metricNames.join(', ')}`);
    
    // Join rooms for each metric
    payload.metricNames.forEach(metricName => {
      const roomName = `metric:${metricName}${payload.tenantId ? `:${payload.tenantId}` : ''}`;
      client.join(roomName);
    });

    client.emit('subscriptionConfirmed', {
      metricNames: payload.metricNames,
      tenantId: payload.tenantId,
      timestamp: new Date(),
    });

    // Send initial data
    this.sendInitialMetrics(client, payload.metricNames, payload.tenantId);
  }

  @SubscribeMessage('unsubscribeMetrics')
  handleUnsubscribeMetrics(client: Socket, payload: { metricNames: string[] }) {
    payload.metricNames.forEach(metricName => {
      client.leave(`metric:${metricName}`);
    });

    client.emit('unsubscriptionConfirmed', {
      metricNames: payload.metricNames,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('getDashboardStream')
  handleDashboardStream(client: Socket, payload: { tenantId?: string }) {
    this.logger.log(`Client ${client.id} requested dashboard stream`);
    
    const dashboardRoom = `dashboard${payload.tenantId ? `:${payload.tenantId}` : ''}`;
    client.join(dashboardRoom);

    // Send initial dashboard data
    this.sendDashboardData(client, payload.tenantId);

    client.emit('dashboardStreamStarted', {
      roomId: dashboardRoom,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('stopDashboardStream')
  handleStopDashboardStream(client: Socket) {
    // Leave all dashboard rooms
    const rooms = Array.from(client.rooms);
    rooms.forEach(room => {
      if (room.startsWith('dashboard')) {
        client.leave(room);
      }
    });

    client.emit('dashboardStreamStopped', {
      timestamp: new Date(),
    });
  }

  /**
   * Send real-time metric update to subscribed clients
   */
  async sendMetricUpdate(metricName: string, value: number, tenantId?: string) {
    const roomName = `metric:${metricName}${tenantId ? `:${tenantId}` : ''}`;
    
    this.server.to(roomName).emit('metricUpdate', {
      metricName,
      value,
      tenantId,
      timestamp: new Date(),
    });

    // Also update dashboard rooms if relevant
    this.updateDashboardForMetric(metricName, value, tenantId);
  }

  /**
   * Send dashboard updates to all connected clients
   */
  async sendDashboardUpdate(tenantId?: string) {
    const dashboardData = await this.getDashboardData(tenantId);
    const roomName = `dashboard${tenantId ? `:${tenantId}` : ''}`;
    
    this.server.to(roomName).emit('dashboardUpdate', {
      data: dashboardData,
      timestamp: new Date(),
    });
  }

  /**
   * Send alert notification to all connected clients
   */
  sendAlertNotification(alert: any) {
    const roomName = alert.tenantId ? `dashboard:${alert.tenantId}` : 'dashboard';
    
    this.server.to(roomName).emit('alertNotification', {
      alert,
      timestamp: new Date(),
    });
  }

  /**
   * Get number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(): Array<{clientId: string; rooms: string[]}> {
    const subscriptions = [];
    
    this.server.sockets.sockets.forEach(socket => {
      const rooms = Array.from(socket.rooms);
      subscriptions.push({
        clientId: socket.id,
        rooms: rooms.filter(room => room !== socket.id),
      });
    });

    return subscriptions;
  }

  private async sendInitialMetrics(client: Socket, metricNames: string[], tenantId?: string) {
    for (const metricName of metricNames) {
      try {
        const latestMetrics = await this.analyticsService.getLatestMetrics(metricName, 10, tenantId);
        client.emit('initialMetrics', {
          metricName,
          data: latestMetrics,
          tenantId,
        });
      } catch (error) {
        this.logger.error(`Failed to fetch initial metrics for ${metricName}:`, error);
      }
    }
  }

  private async sendDashboardData(client: Socket, tenantId?: string) {
    try {
      const dashboardData = await this.getDashboardData(tenantId);
      client.emit('dashboardData', {
        data: dashboardData,
        tenantId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to fetch dashboard data:', error);
      client.emit('dashboardError', {
        error: error.message,
        timestamp: new Date(),
      });
    }
  }

  private async updateDashboardForMetric(metricName: string, value: number, tenantId?: string) {
    // Update specific dashboard metrics in real-time
    const updates = this.getDashboardMetricUpdates(metricName, value);
    
    if (Object.keys(updates).length > 0) {
      const roomName = `dashboard${tenantId ? `:${tenantId}` : ''}`;
      
      this.server.to(roomName).emit('dashboardMetricUpdate', {
        updates,
        metricName,
        value,
        tenantId,
        timestamp: new Date(),
      });
    }
  }

  private getDashboardMetricUpdates(metricName: string, value: number): Record<string, any> {
    const updates: Record<string, any> = {};

    // Map metric names to dashboard fields
    switch (metricName) {
      case 'active_users':
        updates.currentActiveUsers = value;
        break;
      case 'revenue':
        updates.currentRevenue = value;
        break;
      case 'transactions_total':
        updates.currentTransactions = value;
        break;
      case 'http_requests_total':
        updates.currentRequests = value;
        break;
      case 'error_rate':
        updates.currentErrorRate = value;
        break;
    }

    return updates;
  }

  private async getDashboardData(tenantId?: string) {
    const [systemHealth, businessMetrics, userEngagement] = await Promise.all([
      this.analyticsService.getSystemHealthMetrics(),
      this.analyticsService.getBusinessMetrics(tenantId),
      this.analyticsService.getUserEngagementMetrics(tenantId),
    ]);

    return {
      systemHealth,
      businessMetrics,
      userEngagement,
      timestamp: new Date(),
    };
  }
}