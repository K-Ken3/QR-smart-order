import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * Creates an ioredis instance with exponential backoff retry strategy.
 * ioredis requires separate client instances for publish vs subscribe.
 */
function createRedisClient(url: string, label: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null, // required for blocking commands; null = infinite for compatibility
    retryStrategy(times: number): number | null {
      if (times > 10) {
        // Give up after 10 retries
        return null;
      }
      // Exponential backoff: 100ms, 200ms, 400ms … up to 30 s
      const delay = Math.min(100 * Math.pow(2, times - 1), 30_000);
      return delay;
    },
    reconnectOnError(err: Error): boolean | 1 | 2 {
      // Reconnect on READONLY errors (Redis Sentinel / Cluster failover)
      return err.message.includes('READONLY');
    },
    lazyConnect: false,
    enableReadyCheck: true,
  });

  client.on('connect', () => {
    console.log(`[Redis:${label}] Connected`);
  });

  client.on('ready', () => {
    console.log(`[Redis:${label}] Ready`);
  });

  client.on('error', (err: Error) => {
    console.error(`[Redis:${label}] Error:`, err.message);
  });

  client.on('close', () => {
    console.warn(`[Redis:${label}] Connection closed`);
  });

  client.on('reconnecting', (delay: number) => {
    console.log(`[Redis:${label}] Reconnecting in ${delay}ms`);
  });

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const url = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
        return createRedisClient(url, 'publisher');
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (configService: ConfigService): Redis => {
        const url = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
        return createRedisClient(url, 'subscriber');
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, RedisService],
})
export class RedisModule {}
