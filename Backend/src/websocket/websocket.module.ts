import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { PresenceService } from './presence.service';

@Module({
  providers: [WebsocketGateway, PresenceService],
})
export class WebsocketModule {}
