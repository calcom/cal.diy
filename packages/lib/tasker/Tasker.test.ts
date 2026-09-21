import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ILogger } from "./types";

vi.mock("@trigger.dev/sdk", () => ({
  configure: vi.fn(),
}));

vi.mock("../constants", () => ({
  ENABLE_ASYNC_TASKER: true,
}));

vi.mock("../redactError", () => ({
  redactError: (err: unknown) => err,
}));

const createMockLogger = (): ILogger => ({
  log: vi.fn(),
  silly: vi.fn(),
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getSubLogger: vi.fn(),
});

interface MockTaskerInterface {
  taskWithParams: (param1: string, param2: number, param3: { nested: boolean }) => Promise<string>;
  simpleTask: () => Promise<void>;
  taskThatFails: () => Promise<string>;
}

describe("Tasker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("when async tasker is enabled", () => {
    beforeEach(() => {
      process.env.TRIGGER_SECRET_KEY = "test-secret-key";
      process.env.TRIGGER_API_URL = "https://test-trigger-api.com";
    });

    it("should pass params correctly to the async tasker method", async () => {
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("async failed")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-fallback-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      const param1 = "test-string";
      const param2 = 42;
      const param3 = { nested: true };

      const result = await tasker.dispatch("taskWithParams", param1, param2, param3);

      expect(mockAsyncTasker.taskWithParams).toHaveBeenCalledTimes(1);
      expect(mockAsyncTasker.taskWithParams).toHaveBeenCalledWith(param1, param2, param3);
      expect(result).toBe("async-result");
      expect(mockSyncTasker.taskWithParams).not.toHaveBeenCalled();
    });

    it("should pass multiple params in correct order", async () => {
      const { Tasker } = await import("./Tasker");

      const receivedParams: unknown[] = [];
      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockImplementation((...args) => {
          receivedParams.push(...args);
          return Promise.resolve("result");
        }),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("failed")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      await tasker.dispatch("taskWithParams", "first", 123, { nested: false });

      expect(receivedParams).toEqual(["first", 123, { nested: false }]);
    });

    it("should fall back to sync tasker when async tasker fails", async () => {
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("async tasker error")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-fallback-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      const result = await tasker.dispatch("taskThatFails");

      expect(mockAsyncTasker.taskThatFails).toHaveBeenCalledTimes(1);
      expect(mockSyncTasker.taskThatFails).toHaveBeenCalledTimes(1);
      expect(result).toBe("sync-fallback-result");
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith("Trying again with SyncTasker for 'taskThatFails'.");
    });

    it("should pass params to sync tasker fallback when async fails", async () => {
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockRejectedValue(new Error("async failed")),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("failed")),
      };

      const syncReceivedParams: unknown[] = [];
      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockImplementation((...args) => {
          syncReceivedParams.push(...args);
          return Promise.resolve("sync-result");
        }),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      const param1 = "fallback-test";
      const param2 = 999;
      const param3 = { nested: true };

      await tasker.dispatch("taskWithParams", param1, param2, param3);

      expect(syncReceivedParams).toEqual([param1, param2, param3]);
    });

    it("should throw error when both async and sync taskers fail", async () => {
      const { Tasker } = await import("./Tasker");

      const syncError = new Error("sync tasker also failed");
      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("async tasker error")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(syncError),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      await expect(tasker.dispatch("taskThatFails")).rejects.toThrow("sync tasker also failed");
      expect(mockAsyncTasker.taskThatFails).toHaveBeenCalledTimes(1);
      expect(mockSyncTasker.taskThatFails).toHaveBeenCalledTimes(1);
    });

    it("should log dispatch information with args", async () => {
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("failed")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();
      const args = ["test", 123, { nested: true }] as const;

      await tasker.dispatch("taskWithParams", ...args);

      expect(mockLogger.info).toHaveBeenCalledWith("Safely Dispatching task 'taskWithParams'", {
        args: ["test", 123, { nested: true }],
      });
    });
  });

  describe("when async tasker is disabled (missing env vars)", () => {
    beforeEach(() => {
      delete process.env.TRIGGER_SECRET_KEY;
      delete process.env.TRIGGER_API_URL;
    });

    it("should use sync tasker when TRIGGER_SECRET_KEY is missing", async () => {
      vi.resetModules();
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("failed")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      const result = await tasker.dispatch("taskWithParams", "test", 1, { nested: true });

      expect(result).toBe("sync-result");
      expect(mockSyncTasker.taskWithParams).toHaveBeenCalledWith("test", 1, { nested: true });
    });

    it("should throw immediately when sync tasker fails (no fallback to itself)", async () => {
      vi.resetModules();
      const { Tasker } = await import("./Tasker");

      const syncError = new Error("sync tasker failed");
      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("failed")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(syncError),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      await expect(tasker.dispatch("taskThatFails")).rejects.toThrow("sync tasker failed");
      expect(mockSyncTasker.taskThatFails).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("Trying again with SyncTasker")
      );
    });

    it("should log warning about missing env vars", async () => {
      vi.resetModules();
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(new Error("failed")),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      new TestTasker();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Missing env variables TRIGGER_SECRET_KEY or TRIGGER_API_URL, falling back to Sync tasker."
      );
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      process.env.TRIGGER_SECRET_KEY = "test-secret-key";
      process.env.TRIGGER_API_URL = "https://test-trigger-api.com";
    });

    it("should log error details when async tasker fails", async () => {
      const { Tasker } = await import("./Tasker");

      const asyncError = new Error("async error message");
      asyncError.name = "AsyncError";

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue(asyncError),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      await tasker.dispatch("taskThatFails");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "AsyncTasker failed for 'taskThatFails'. (baseURL: https://test-trigger-api.com)",
        expect.objectContaining({
          name: "AsyncError",
          message: "async error message",
        })
      );
    });

    it("should handle non-Error objects thrown by taskers", async () => {
      const { Tasker } = await import("./Tasker");

      const mockAsyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("async-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockRejectedValue("string error"),
      };

      const mockSyncTasker: MockTaskerInterface = {
        taskWithParams: vi.fn().mockResolvedValue("sync-result"),
        simpleTask: vi.fn().mockResolvedValue(undefined),
        taskThatFails: vi.fn().mockResolvedValue("sync-result"),
      };

      const mockLogger = createMockLogger();

      class TestTasker extends Tasker<MockTaskerInterface> {
        constructor() {
          super({
            asyncTasker: mockAsyncTasker,
            syncTasker: mockSyncTasker,
            logger: mockLogger,
          });
        }
      }

      const tasker = new TestTasker();

      const result = await tasker.dispatch("taskThatFails");

      expect(result).toBe("sync-result");
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("AsyncTasker failed"),
        expect.objectContaining({ message: "string error" })
      );
    });
  });
});
