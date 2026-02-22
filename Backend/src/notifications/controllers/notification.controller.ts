import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from '../services/notification.service';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import {
  NotificationStatus,
  NotificationType,
} from '../types/notification.types';

@ApiTags('Notifications')
@Controller('api/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
    type: Notification,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createNotification(
    @Body() createDto: CreateNotificationDto,
  ): Promise<Notification> {
    try {
      return await this.notificationService.createNotification(createDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notifications for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: NotificationStatus,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: NotificationType,
    description: 'Filter by type',
  })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'Show only unread notifications',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserNotifications(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: NotificationStatus,
    @Query('type') type?: NotificationType,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<{
    notifications: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pageNum = page ? parseInt(page, 10) || 1 : 1;
    const limitNum = limit ? parseInt(limit, 10) || 20 : 20;
    const unreadOnlyBool = unreadOnly === 'true';

    const result = await this.notificationService.getUserNotifications(
      userId,
      pageNum,
      limitNum,
      status,
      type,
      unreadOnlyBool,
    );

    return {
      ...result,
      page: pageNum,
      limit: limitNum,
    };
  }

  @Get('user/:userId/unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread notification count for user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved',
    type: Number,
  })
  async getUserUnreadCount(
    @Param('userId') userId: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.getUserUnreadCount(userId);
    return { count };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification retrieved successfully',
    type: Notification,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getNotification(@Param('id') id: string): Promise<Notification> {
    return this.notificationService.getNotificationById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification updated successfully',
    type: Notification,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async updateNotification(
    @Param('id') id: string,
    @Body() updateDto: UpdateNotificationDto,
  ): Promise<Notification> {
    return this.notificationService.updateNotification(id, updateDto);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    type: Notification,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(@Param('id') id: string): Promise<Notification> {
    return this.notificationService.markAsRead(id);
  }

  @Post('mark-multiple-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  @ApiResponse({ status: 200, description: 'Notifications marked as read' })
  async markMultipleAsRead(@Body() body: { ids: string[] }): Promise<void> {
    await this.notificationService.markMultipleAsRead(body.ids);
  }

  @Post('mark-all-read/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@Param('userId') userId: string): Promise<void> {
    await this.notificationService.markAllAsRead(userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(@Param('id') id: string): Promise<void> {
    await this.notificationService.deleteNotification(id);
  }

  @Post(':id/archive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification archived successfully',
    type: Notification,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async archiveNotification(@Param('id') id: string): Promise<Notification> {
    return this.notificationService.archiveNotification(id);
  }

  @Post('bulk-archive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive multiple notifications' })
  @ApiResponse({
    status: 200,
    description: 'Notifications archived successfully',
  })
  async bulkArchiveNotifications(
    @Body() body: { ids: string[] },
  ): Promise<void> {
    await this.notificationService.bulkArchiveNotifications(body.ids);
  }

  @Get('stats/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notification statistics for user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getNotificationStats(@Param('userId') userId: string): Promise<any> {
    return this.notificationService.getNotificationStats(userId);
  }

  @Get('preferences/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notification preferences for user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Preferences retrieved successfully',
    type: NotificationPreference,
  })
  async getNotificationPreferences(
    @Param('userId') userId: string,
  ): Promise<NotificationPreference> {
    return this.notificationService.getNotificationPreferences(userId);
  }

  @Put('preferences/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update notification preferences for user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
    type: NotificationPreference,
  })
  async updateNotificationPreferences(
    @Param('userId') userId: string,
    @Body() updateDto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    return this.notificationService.updateNotificationPreferences(
      userId,
      updateDto,
    );
  }

  @Post('toggle-type/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle notification type for user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification type toggled',
    type: NotificationPreference,
  })
  async toggleNotificationType(
    @Param('userId') userId: string,
    @Body() body: { type: NotificationType; enabled: boolean },
  ): Promise<NotificationPreference> {
    return this.notificationService.toggleNotificationType(
      userId,
      body.type,
      body.enabled,
    );
  }

  @Get('search/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search notifications for user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search term',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
  })
  async searchNotifications(
    @Param('userId') userId: string,
    @Query('q') searchTerm: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    notifications: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pageNum = page ? parseInt(page, 10) || 1 : 1;
    const limitNum = limit ? parseInt(limit, 10) || 20 : 20;

    const result = await this.notificationService.searchNotifications(
      userId,
      searchTerm,
      pageNum,
      limitNum,
    );

    return {
      ...result,
      page: pageNum,
      limit: limitNum,
    };
  }
}
