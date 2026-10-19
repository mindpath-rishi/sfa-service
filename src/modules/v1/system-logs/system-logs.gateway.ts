import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { Public } from 'src/core/decorators/public.decorator';
import { isSuperAdmin } from 'src/core/guards/super-admin.guard';
import { registerSocketCounter } from 'src/core/metrics/app-metrics';
import { logSink, StoredLog } from 'src/core/logger/log-sink';
import { JwtPayload } from 'src/shared/interfaces/jwt-payload.interface';

const EMIT_INTERVAL_MS = 500;
const MAX_PER_EMIT = 300;
const LEVELS: Record<string, number> = { debug: 20, info: 30, warn: 40, error: 50 };

type LiveFilter = {
  level?: string;
  flow?: string;
  userId?: string;
  search?: string;
};

/**
 * Live log tail for MIS. Entries are batched every 500 ms and filtered per
 * socket on the server, so a busy API does not flood the browser.
 */
@WebSocketGateway({
  namespace: '/system-logs',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
@Public()
export class SystemLogsGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SystemLogsGateway.name);

  @WebSocketServer()
  private readonly server!: Namespace;

  private pending: StoredLog[] = [];
  private timer?: NodeJS.Timeout;
  private readonly onEntry = (entry: StoredLog) => {
    // Only buffer while someone is watching.
    if (this.server?.sockets.size) {
      this.pending.push(entry);
      if (this.pending.length > MAX_PER_EMIT * 4) this.pending.shift();
    }
  };

  constructor(private readonly jwtService: JwtService) {}

  onModuleInit() {
    registerSocketCounter('systemLogs', () => this.server?.sockets.size ?? 0);
    logSink.on('entry', this.onEntry);
    this.timer = setInterval(() => this.flush(), EMIT_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    logSink.off('entry', this.onEntry);
    if (this.timer) clearInterval(this.timer);
  }

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
      if (!payload.sub || !isSuperAdmin(payload.role, payload.roleId)) {
        throw new Error('Not a Super Admin');
      }
      client.data.auth = payload;
      client.data.filter = {} as LiveFilter;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('logs:subscribe')
  subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() filter: LiveFilter = {},
  ) {
    if (!client.data.auth?.sub) return { success: false, statusCode: 401 };
    client.data.filter = {
      level: typeof filter?.level === 'string' ? filter.level : undefined,
      flow: typeof filter?.flow === 'string' ? filter.flow : undefined,
      userId: typeof filter?.userId === 'string' ? filter.userId : undefined,
      search:
        typeof filter?.search === 'string'
          ? filter.search.trim().toLowerCase().slice(0, 200)
          : undefined,
    } satisfies LiveFilter;
    return { success: true, statusCode: 200 };
  }

  private flush() {
    if (!this.pending.length || !this.server) return;
    const batch = this.pending;
    this.pending = [];

    try {
      for (const socket of this.server.sockets.values()) {
        if (!socket.data.auth) continue;
        const matches = batch.filter((entry) =>
          matchesFilter(entry, socket.data.filter ?? {}),
        );
        if (matches.length) {
          socket.emit('logs:batch', matches.slice(-MAX_PER_EMIT));
        }
      }
    } catch (error) {
      this.logger.warn(`Live log broadcast failed: ${(error as Error).message}`);
    }
  }
}

function matchesFilter(entry: StoredLog, filter: LiveFilter) {
  if (filter.level && entry.level < (LEVELS[filter.level] ?? 0)) return false;
  if (filter.flow && entry.flow !== filter.flow) return false;
  if (filter.userId && entry.userId !== filter.userId) return false;
  if (filter.search) {
    const haystack = [
      entry.msg,
      entry.url,
      entry.errorMessage,
      entry.err?.message,
      entry.reqId,
      entry.userId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(filter.search)) return false;
  }
  return true;
}
