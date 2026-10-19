import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { jwtConfig } from 'src/core/config/jwt.config';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsGateway } from './system-logs.gateway';
import { SystemLogsService } from './system-logs.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        ...jwtConfig,
      }),
    }),
  ],
  controllers: [SystemLogsController],
  providers: [SystemLogsService, SystemLogsGateway],
})
export class SystemLogsModule {}
