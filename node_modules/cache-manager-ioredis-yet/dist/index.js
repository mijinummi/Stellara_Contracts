"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.avoidNoCacheable = exports.NoCacheableError = void 0;
exports.redisStore = redisStore;
exports.redisInsStore = redisInsStore;
const ioredis_1 = __importDefault(require("ioredis"));
const telejson = __importStar(require("telejson"));
const stringify = (value) => telejson.stringify({ v: value }, { maxDepth: Infinity }).slice(5, -1);
const parse = (value) => telejson.parse('{"v":' + value + '}')?.v;
const getVal = (value) => stringify(value);
class NoCacheableError {
    message;
    name = 'NoCacheableError';
    constructor(message) {
        this.message = message;
    }
}
exports.NoCacheableError = NoCacheableError;
const avoidNoCacheable = async (p) => {
    try {
        return await p;
    }
    catch (e) {
        if (!(e instanceof NoCacheableError))
            throw e;
    }
};
exports.avoidNoCacheable = avoidNoCacheable;
function builder(redisCache, reset, keys, options) {
    const isCacheable = options?.isCacheable || ((value) => value !== undefined && value !== null);
    return {
        async get(key) {
            const val = await redisCache.get(key);
            if (val === undefined || val === null)
                return undefined;
            else
                return parse(val);
        },
        async set(key, value, ttl) {
            if (!isCacheable(value))
                throw new NoCacheableError(`"${value}" is not a cacheable value`);
            const t = ttl === undefined ? options?.ttl : ttl;
            if (t !== undefined && t !== 0)
                await redisCache.set(key, getVal(value), 'PX', t);
            else
                await redisCache.set(key, getVal(value));
        },
        async mset(args, ttl) {
            const t = ttl === undefined ? options?.ttl : ttl;
            if (t !== undefined && t !== 0) {
                const multi = redisCache.multi();
                for (const [key, value] of args) {
                    if (!isCacheable(value))
                        throw new NoCacheableError(`"${getVal(value)}" is not a cacheable value`);
                    multi.set(key, getVal(value), 'PX', t);
                }
                await multi.exec();
            }
            else
                await redisCache.mset(args.flatMap(([key, value]) => {
                    if (!isCacheable(value))
                        throw new Error(`"${getVal(value)}" is not a cacheable value`);
                    return [key, getVal(value)];
                }));
        },
        mget: (...args) => redisCache
            .mget(args)
            .then((x) => x.map((x) => x === null || x === undefined ? undefined : parse(x))),
        async mdel(...args) {
            await redisCache.del(args);
        },
        async del(key) {
            await redisCache.del(key);
        },
        ttl: async (key) => redisCache.pttl(key),
        keys: (pattern = '*') => keys(pattern),
        reset,
        isCacheable,
        get client() {
            return redisCache;
        },
    };
}
async function redisStore(options) {
    options ||= {};
    const redisCache = 'clusterConfig' in options
        ? new ioredis_1.default.Cluster(options.clusterConfig.nodes, options.clusterConfig.options)
        : new ioredis_1.default(options);
    return redisInsStore(redisCache, options);
}
function redisInsStore(redisCache, options) {
    const reset = async () => {
        await redisCache.flushdb();
    };
    const keys = (pattern) => redisCache.keys(pattern);
    return builder(redisCache, reset, keys, options);
}
//# sourceMappingURL=index.js.map