import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PresenceService } from './presence.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly presenceService: PresenceService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    await this.presenceService.userConnected(userId, client.id);
  }

  async handleDisconnect(client: Socket) {
    const userId = client.handshake.auth.userId;
    await this.presenceService.userDisconnected(userId);
  }

  @SubscribeMessage('join-room')
  async joinRoom(client: Socket, roomId: string) {
    const userId = client.handshake.auth.userId;

    await this.presenceService.joinRoom(userId, roomId);
    client.join(roomId);

    this.server.to(roomId).emit('presence:update', {
      roomId,
      users: await this.presenceService.getRoomUsers(roomId),
    });
  }

  @SubscribeMessage('message')
  async handleMessage(
    client: Socket,
    payload: { roomId: string; message: string },
  ) {
    this.server.to(payload.roomId).emit('message', payload);
  }
}
