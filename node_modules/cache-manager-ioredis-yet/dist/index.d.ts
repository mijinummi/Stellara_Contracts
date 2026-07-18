import Redis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
import type { Cache, Store, Config } from 'cache-manager';
export type RedisCache = Cache<RedisStore>;
export interface RedisStore extends Store {
    readonly isCacheable: (value: unknown) => boolean;
    get client(): Redis | Cluster;
}
export declare class NoCacheableError implements Error {
    message: string;
    name: string;
    constructor(message: string);
}
export declare const avoidNoCacheable: <T>(p: Promise<T>) => Promise<T | undefined>;
export interface RedisClusterConfig {
    nodes: ClusterNode[];
    options?: ClusterOptions;
}
export declare function redisStore(options?: (RedisOptions | {
    clusterConfig: RedisClusterConfig;
}) & Config): Promise<RedisStore>;
export declare function redisInsStore(redisCache: Redis | Cluster, options?: Config): RedisStore;
