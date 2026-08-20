import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly redis: RedisService) {
    this.subscribeToRedisEvents();
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { room: string }) {
    client.join(data.room);
    this.logger.log(`Client ${client.id} joined room: ${data.room}`);
    return { event: 'joined', data: { room: data.room } };
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { room: string }) {
    client.leave(data.room);
    this.logger.log(`Client ${client.id} left room: ${data.room}`);
    return { event: 'left', data: { room: data.room } };
  }

  emitToRoom(room: string, event: string, data: unknown) {
    this.server?.to(room).emit(event, data);
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.emitToRoom(`tenant:${tenantId}`, event, data);
  }

  emitToBranch(branchId: string, event: string, data: unknown) {
    this.emitToRoom(`branch:${branchId}`, event, data);
  }

  emitToLocation(locationId: string, event: string, data: unknown) {
    this.emitToRoom(`location:${locationId}`, event, data);
  }

  emitToEmployee(employeeId: string, event: string, data: unknown) {
    this.emitToRoom(`employee:${employeeId}`, event, data);
  }

  broadcast(event: string, data: unknown) {
    this.server?.emit(event, data);
  }

  private subscribeToRedisEvents() {
    const channels = [
      'events:request:created',
      'events:request:assigned',
      'events:request:status_changed',
      'events:request:cancelled',
      'events:menu:item_updated',
      'events:catalog:updated',
      'events:order:new',
      'events:notification:escalation',
      'events:tenant:profile_updated',
    ];

    channels.forEach((channel) => {
      this.redis.subscribe(channel, (data: unknown) => {
        const event = data as { event?: string; branchId?: string; tenantId?: string; locationId?: string; employeeId?: string };
        if (event?.branchId) {
          this.emitToBranch(event.branchId, channel.replace('events:', ''), data);
        }
        if (event?.tenantId) {
          this.emitToTenant(event.tenantId, channel.replace('events:', ''), data);
        }
        if (event?.locationId) {
          this.emitToLocation(event.locationId, channel.replace('events:', ''), data);
        }
        if (event?.employeeId) {
          this.emitToEmployee(event.employeeId, channel.replace('events:', ''), data);
        }
      }).catch((err: Error) => {
        this.logger.warn(`Failed to subscribe to ${channel}: ${err.message}`);
      });
    });
  }
}
