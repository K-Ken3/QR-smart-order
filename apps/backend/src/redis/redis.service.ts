import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('RedisService');
  private readonly available: boolean;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis | null,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis | null,
  ) {
    this.available = this.client !== null && this.subscriber !== null;
    if (!this.available) {
      this.logger.warn('Redis not configured — caching/pub-sub disabled');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.available) return;
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await this.client!.setex(key, ttlSeconds, serialized);
      } else {
        await this.client!.set(key, serialized);
      }
    } catch (err) {
      this.logger.warn(`Redis SET failed: ${(err as Error).message}`);
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.available) return null;
    try {
      const raw = await this.client!.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.client!.del(key);
    } catch {
      /* no-op */
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.available) return false;
    try {
      const count = await this.client!.exists(key);
      return count > 0;
    } catch {
      return false;
    }
  }

  async setex(key: string, seconds: number, value: unknown): Promise<void> {
    if (!this.available) return;
    try {
      const serialized = JSON.stringify(value);
      await this.client!.setex(key, seconds, serialized);
    } catch (err) {
      this.logger.warn(`Redis SETEX failed: ${(err as Error).message}`);
    }
  }

  async publish(channel: string, data: unknown): Promise<number> {
    if (!this.available) return 0;
    try {
      const serialized = JSON.stringify(data);
      return await this.client!.publish(channel, serialized);
    } catch {
      return 0;
    }
  }

  async subscribe(
    channel: string,
    handler: (data: unknown) => void,
  ): Promise<void> {
    if (!this.available) return;
    try {
      await this.subscriber!.subscribe(channel);
      this.subscriber!.on('message', (receivedChannel: string, message: string) => {
        if (receivedChannel === channel) {
          try {
            const data = JSON.parse(message);
            handler(data);
          } catch {
            handler(message);
          }
        }
      });
    } catch (err) {
      this.logger.warn(`Redis SUBSCRIBE failed: ${(err as Error).message}`);
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.subscriber!.unsubscribe(channel);
    } catch {
      /* no-op */
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  getSubscriber(): Redis | null {
    return this.subscriber;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.available) return;
    try {
      await this.client!.quit();
    } catch {
      this.client!.disconnect();
    }
    try {
      await this.subscriber!.quit();
    } catch {
      this.subscriber!.disconnect();
    }
  }
}
