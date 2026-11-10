import { getEnv } from "@/env";
import type { AppConfig } from "./type";

const loadConfig = (): AppConfig => {
  const env = getEnv("NODE_ENV", "development");
  const apiPort = Number(getEnv("API_PORT", "5555"));
  const apiUrl = getEnv("API_URL", "http://localhost");
  let portSuffix = "";
  if (process.env.API_PORT && env === "development") {
    portSuffix = `:${apiPort}`;
  }

  return {
    env: {
      type: env,
    },
    api: {
      port: apiPort,
      path: apiUrl,
      url: `${apiUrl}${portSuffix}/v2`,
      keyPrefix: getEnv("API_KEY_PREFIX", "cal_"),
      licenseKey: getEnv("CALCOM_LICENSE_KEY", ""),
      licenseKeyUrl: getEnv("GET_LICENSE_KEY_URL", "https://console.cal.com/api/license"),
    },
    db: {
      readUrl: getEnv("DATABASE_READ_URL"),
      writeUrl: getEnv("DATABASE_WRITE_URL"),
      readPoolMax: getEnv("DATABASE_READ_POOL_MAX", 9),
      writePoolMax: getEnv("DATABASE_WRITE_POOL_MAX", 7),
      workerReadPoolMax: getEnv("DATABASE_READ_WORKER_POOL_MAX", 4),
      workerWritePoolMax: getEnv("DATABASE_WRITE_WORKER_POOL_MAX", 6),
      redisUrl: getEnv("REDIS_URL"),
      usePool: getEnv("USE_POOL", "true") === "true",
    },
    next: {
      authSecret: getEnv("NEXTAUTH_SECRET"),
    },
    app: {
      baseUrl: getEnv("WEB_APP_URL", "https://app.cal.com"),
    },
    e2e: getEnv("IS_E2E", "false") === "true",
    enableSlotsWorkers: getEnv("ENABLE_SLOTS_WORKERS", "true") === "true",
    slotsWorkerPoolSize: Number(getEnv("SLOTS_WORKER_POOL_SIZE", "4")),
    vercel: getEnv("VERCEL", "false") === "true",
    enableAsyncTasker: getEnv("ENABLE_ASYNC_TASKER", "false") === "true",
  };
};

export default loadConfig;
