import type { Worker } from "node:worker_threads";
import type { ConfigService } from "@nestjs/config";
import { SlotsWorkerService_2024_04_15 } from "./slots-worker.service";

/**
 * Builds a ConfigService stub that keeps the worker pool empty on construction
 * (enableSlotsWorkers = false) so each test can populate the pool deterministically.
 */
function createConfigStub(): ConfigService {
  return {
    get: (key: string) => {
      if (key === "enableSlotsWorkers") return false;
      if (key === "slotsWorkerPoolSize") return 0;
      if (key === "e2e") return false;
      return undefined;
    },
  } as unknown as ConfigService;
}

function createFakeWorker(threadId: number): Worker {
  return {
    threadId,
    terminate: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    postMessage: jest.fn(),
  } as unknown as Worker;
}

type ServiceInternals = {
  workerPool: Worker[];
  availableWorkers: Worker[];
  createNewWorker: () => void;
  handleWorkerFailure: (worker: Worker) => void;
};

describe("SlotsWorkerService_2024_04_15", () => {
  let service: SlotsWorkerService_2024_04_15;
  let internals: ServiceInternals;
  let createdReplacements: Worker[];

  beforeEach(() => {
    service = new SlotsWorkerService_2024_04_15(createConfigStub());
    internals = service as unknown as ServiceInternals;
    createdReplacements = [];

    // Stub replacement creation so tests never spawn real worker threads.
    jest.spyOn(internals, "createNewWorker").mockImplementation(() => {
      const replacement = createFakeWorker(1000 + createdReplacements.length);
      createdReplacements.push(replacement);
      internals.workerPool.push(replacement);
      internals.availableWorkers.push(replacement);
    });
  });

  describe("handleWorkerFailure", () => {
    it("removes the failed worker and creates exactly one replacement", () => {
      const failed = createFakeWorker(1);
      const healthy = createFakeWorker(2);
      internals.workerPool.push(failed, healthy);
      internals.availableWorkers.push(failed, healthy);

      internals.handleWorkerFailure(failed);

      expect(internals.workerPool).not.toContain(failed);
      expect(internals.availableWorkers).not.toContain(failed);
      expect(internals.workerPool).toContain(healthy);
      expect(internals.createNewWorker).toHaveBeenCalledTimes(1);
      expect(internals.workerPool).toHaveLength(2);
      expect(failed.terminate).toHaveBeenCalledTimes(1);
    });

    it("is idempotent when the same worker emits both 'error' and 'exit'", () => {
      const failed = createFakeWorker(1);
      const healthy = createFakeWorker(2);
      internals.workerPool.push(failed, healthy);
      internals.availableWorkers.push(failed, healthy);

      // A crashing worker fires both lifecycle events for the same worker.
      internals.handleWorkerFailure(failed);
      internals.handleWorkerFailure(failed);

      // The healthy worker must survive (no stray splice(-1, 1) eviction)...
      expect(internals.workerPool).toContain(healthy);
      // ...the failed worker must be gone and terminated only once...
      expect(internals.workerPool).not.toContain(failed);
      expect(failed.terminate).toHaveBeenCalledTimes(1);
      // ...and the pool must not be inflated by a second replacement.
      expect(internals.createNewWorker).toHaveBeenCalledTimes(1);
      expect(internals.workerPool).toHaveLength(2);
      expect(new Set(internals.workerPool).size).toBe(internals.workerPool.length);
    });
  });
});
