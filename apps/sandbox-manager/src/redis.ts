import Redis from "ioredis";
import { v4 as uuid } from "uuid";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL);

export type RunJob = {
    type: "run";
    projectId: string;
    cmd: string;
    timeOutMs?: number;
}

export async function enqueueJob(projectId: string, payload: RunJob){
    const jobId = uuid()

    const job = {
        jobId,
        payload,
        createdAt: Date.now()
    }

    const queueKey = `jobs:project:${projectId}`
    await redis.rpush(queueKey, JSON.stringify(job))

    return jobId;
}

redis.on("connect", () => {
    console.log("Redis Connnected.")
})

redis.on("error", (err) => {
    console.error("Redis error", err)
})