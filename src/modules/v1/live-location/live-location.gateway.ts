import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Public } from 'src/core/decorators/public.decorator';
import { JwtPayload } from 'src/shared/interfaces/jwt-payload.interface';
import { TrackLiveLocationDto } from './dto/track-live-location.dto';
import { LiveLocationService } from './live-location.service';

const MANAGER_ROOM = 'live-location-managers';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
@Public()
export class LiveLocationGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly liveLocationService: LiveLocationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const authorization = client.handshake.headers.authorization;
      const token =
        client.handshake.auth?.token ||
        (authorization?.startsWith('Bearer ')
          ? authorization.slice(7)
          : undefined);
      if (!token) throw new Error('Missing access token');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload.sub) throw new Error('Invalid access token');
      client.data.auth = payload;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('live-location:subscribe')
  subscribe(@ConnectedSocket() client: Socket) {
    if (!client.data.auth?.sub) return { success: false, statusCode: 401 };
    void client.join(MANAGER_ROOM);
    return { success: true, statusCode: 200 };
  }

  @SubscribeMessage('live-location:track')
  async track(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TrackLiveLocationDto,
  ) {
    const auth = client.data.auth as JwtPayload | undefined;
    if (!auth?.sub) return { success: false, statusCode: 401 };

    try {
      // Real-time delivery must not wait for MongoDB.  Persistence is sampled
      // independently every five minutes by the service.
      const data = this.liveLocationService.createRealtimeUpdate(
        payload,
        auth.sub,
        auth.vanId,
      );
      this.server.to(MANAGER_ROOM).emit('live-location:update', data);
      void this.liveLocationService.persistThrottled(data).catch((error) => {
        console.error(
          '[LiveLocation] Failed to persist sampled location',
          error,
        );
      });
      return {
        success: true,
        statusCode: 200,
        message: 'Location broadcast',
        data,
      };
    } catch (error) {
      const statusCode =
        typeof (error as { getStatus?: () => number })?.getStatus === 'function'
          ? (error as { getStatus: () => number }).getStatus()
          : 500;
      return {
        success: false,
        statusCode,
        message:
          error instanceof Error ? error.message : 'Location upload failed',
      };
    }
  }
}
