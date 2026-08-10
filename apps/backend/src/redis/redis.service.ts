import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  /**
   * Store a value. Optionally set a TTL in seconds.
   * Values are JSON-serialized before storage.
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Retrieve a value by key and JSON-deserialize it.
   * Returns null if the key does not exist.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Check whether a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  /**
   * Store a value with an explicit TTL in seconds.
   * Convenience alias that mirrors the Redis SETEX command signature.
   */
  async setex(key: string, seconds: number, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.client.setex(key, seconds, serialized);
  }

  /**
   * Publish a message to a Redis channel.
   * The data is JSON-serialized before publishing.
   * Returns the number of subscribers that received the message.
   */
  async publish(channel: string, data: unknown): Promise<number> {
    const serialized = JSON.stringify(data);
    return this.client.publish(channel, serialized);
  }

  /**
   * Subscribe to a Redis channel and handle incoming messages.
   * Uses the dedicated subscriber client (ioredis requires a separate
   * connection for subscribe operations).
   */
  async subscribe(
    channel: string,
    handler: (data: unknown) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);

    this.subscriber.on('message', (receivedChannel: string, message: string) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          handler(data);
        } catch {
          // Pass the raw string if JSON parsing fails
          handler(message);
        }
      }
    });
  }

  /**
   * Unsubscribe from a Redis channel.
   */
  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  /**
   * Expose the raw publisher client for advanced operations.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Expose the raw subscriber client for advanced operations.
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    await this.subscriber.quit();
  }
}
