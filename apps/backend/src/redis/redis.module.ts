import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import { RedisService } from './redis.service';

const logger = new Logger('RedisModule');

function createRedisClient(url: string, label: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    retryStrategy(times: number): number | null {
      if (times > 5) {
        logger.warn(`[Redis:${label}] Giving up after ${times - 1} retries`);
        return null;
      }
      const delay = Math.min(100 * Math.pow(2, times - 1), 30_000);
      return delay;
    },
    reconnectOnError(err: Error): boolean | 1 | 2 {
      return err.message.includes('READONLY');
    },
    lazyConnect: true,
    enableReadyCheck: true,
    connectTimeout: 5000,
  });

  client.on('connect', () => logger.log(`[Redis:${label}] Connected`));
  client.on('ready', () => logger.log(`[Redis:${label}] Ready`));
  client.on('error', (err: Error) => {
    if (!err.message.includes('ECONNREFUSED')) {
      logger.error(`[Redis:${label}] Error: ${err.message}`);
    }
  });
  client.on('close', () => logger.warn(`[Redis:${label}] Connection closed`));

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis | null => {
        const url = configService.get<string>('REDIS_URL');
        if (!url || url === 'redis://localhost:6379') {
          logger.log('[Redis:publisher] No REDIS_URL — running without Redis');
          return null;
        }
        return createRedisClient(url, 'publisher');
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (configService: ConfigService): Redis | null => {
        const url = configService.get<string>('REDIS_URL');
        if (!url || url === 'redis://localhost:6379') {
          logger.log('[Redis:subscriber] No REDIS_URL — running without Redis');
          return null;
        }
        return createRedisClient(url, 'subscriber');
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, RedisService],
})
export class RedisModule {}
