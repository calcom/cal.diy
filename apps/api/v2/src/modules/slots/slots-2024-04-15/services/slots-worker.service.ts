import path from "node:path";
import { Worker } from "node:worker_threads";
import type { GetScheduleOptions } from "@calcom/platform-libraries/slots";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TimeSlots } from "./slots-output.service";

/**
 * Interface to define the structure of messages sent to the worker.
 */
interface WorkerMessage {
  input: GetScheduleOptions["input"];
  ctx?: {
    req?: {
      cookies?: Record<string, string>;
      headers?: Record<string, string | string[]>;
    };
  };
}

/**
 * Interface to define the structure of results received from the worker.
 */
interface WorkerResult {
  success: boolean;
  data?: TimeSlots;
  error?: Error;
}

@Injectable()
export class SlotsWorkerService_2024_04_15 implements OnModuleDestroy {
  private readonly logger = new Logger("SlotsWorkerService_2024_04_15");
  private readonly workerPool: Worker[] = [];
  private readonly maxWorkers: number;
  private readonly taskQueue: Array<{
    resolve: (value: TimeSlots) => void;
    reject: (reason: Error) => void;
    options: GetScheduleOptions;
  }> = [];
  private availableWorkers: Worker[] = [];

  constructor(private readonly config: ConfigService) {
    this.maxWorkers = this.config.get<number>("slotsWorkerPoolSize") ?? 4;
    if (!this.config.get<boolean>("enableSlotsWorkers")) {
      this.maxWorkers = 0;
    }

    // Workers are not initialized in E@E
    if (!this.config.get<boolean>("e2e") && this.maxWorkers > 0) {
      this.initializeWorkerPool();
    }
  }

  /**
   * Initializes the worker pool by creating a fixed number of worker threads.
   * Each worker is set up with persistent event listeners for errors and exits.
   */
  private initializeWorkerPool(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createNewWorker();
    }
  }

  /**
   * Creates a new worker thread and configures its essential, persistent event listeners.
   * Adds the new worker to the pool and available workers list.
   */
  private createNewWorker(): void {
    const worker = new Worker(path.join(__dirname, "../workers/slots.worker.js"));

    // These 'on' listeners are for the worker's overall lifecycle (crashes, exits).
    // They are persistent and responsible for calling handleWorkerFailure.
    worker.on("error", (err: Error) => {
      this.logger.error(`Worker experienced a persistent error: ${err.message}`, err.stack);
      this.handleWorkerFailure(worker);
    });

    worker.on("exit", (code: number) => {
      if (code !== 0) {
        this.logger.error(`Worker exited with code ${code}.`);
      }
      this.handleWorkerFailure(worker);
    });

    this.workerPool.push(worker);
    this.availableWorkers.push(worker);
  }

  /**
   * Handles the failure of a worker by removing it from pools and creating a new one.
   * This ensures the worker pool remains at the desired size and healthy.
   * @param failedWorker The worker that failed or exited.
   */
  private handleWorkerFailure(failedWorker: Worker): void {
    const poolIndex = this.workerPool.indexOf(failedWorker);
    // A crashing worker commonly emits both "error" and "exit", so this can be
    // invoked twice for the same worker. If it has already been handled it is no
    // longer in the pool, in which case bail out: otherwise splice(-1, 1) would
    // drop a healthy worker and createNewWorker() would over-inflate the pool.
    if (poolIndex === -1) {
      return;
    }

    // Remove the failed worker from both pools
    this.logger.error(`Handling Worker ${failedWorker.threadId} failure`);
    this.workerPool.splice(poolIndex, 1);
    this.availableWorkers = this.availableWorkers.filter((w) => w !== failedWorker);

    try {
      failedWorker
        .terminate()
        .then(() => {
          this.logger.log(`Terminated failed worker ${failedWorker.threadId}`);
        })
        .catch((err) => {
          this.logger.error(`Error terminating failed worker ${failedWorker.threadId}: ${err?.message}`);
        });
    } catch (error) {
      let errorMessage = String(error);
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      this.logger.error(
        `Failed to invoke terminate method on failed worker ${failedWorker.threadId}: ${errorMessage}`
      );
    }

    // Attempt to create a new worker to replace the failed one
    try {
      this.createNewWorker();
    } catch (error) {
      let errorMessage = String(error);
      let errorStack: string | undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack;
      }

      this.logger.error(`Failed to create replacement worker after failure: ${errorMessage}`, errorStack);
    }

    // After a worker fails, process the next task in case there are queued tasks
    this.processNextTask();
  }

  /**
   * Converts the request context into a serializable format for worker communication.
   * @param ctx The context from GetScheduleOptions containing request data.
   * @returns A serializable context object with cookies and headers, or undefined.
   */
  private getSerializableContext(ctx: GetScheduleOptions["ctx"]): WorkerMessage["ctx"] {
    if (!ctx) {
      return undefined;
    }

    let reqData: NonNullable<NonNullable<WorkerMessage["ctx"]>["req"]> | undefined;

    if (ctx.req) {
      reqData = {
        cookies: (ctx.req.cookies as Record<string, string>) || {},
        headers: (ctx.req.headers as Record<string, string>) || {},
      };
    }

    return {
      req: reqData,
    };
  }

  /**
   * Processes the next task in the queue if there are available workers.
   * Assigns a task to an available worker and sets up 'once' listeners for its specific result.
   */
  private processNextTask(): void {
    if (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift();
      const worker = this.availableWorkers.shift();

      if (!task || !worker) {
        // This should theoretically not happen if the checks above pass, but good for type narrowing.
        return;
      }

      // Prepare context for serialization
      const serializableCtx = this.getSerializableContext(task.options.ctx);

      try {
        // Use 'once' listeners for task-specific responses and errors.
        // 'once' listeners automatically remove themselves after being invoked, preventing leaks.
        const messageListener = (result: WorkerResult): void => {
          this.availableWorkers.push(worker); // Return worker to the available pool
          if (result.success) {
            task.resolve(result.data as TimeSlots);
          } else {
            task.reject(result.error ?? new Error("An error occurred in the worker thread."));
          }
          this.processNextTask(); // Attempt to process the next task
        };

        const errorListener = (err: Error): void => {
          this.availableWorkers.push(worker); // Ensure worker is returned
          task.reject(new Error(`Worker thread error during task execution: ${err.message}`));
          this.processNextTask(); // Attempt to process the next task
        };

        worker.once("message", messageListener); // Use 'once' for task results
        worker.once("error", errorListener); // Use 'once' for task-specific errors

        worker.postMessage({
          input: task.options.input,
          ctx: serializableCtx,
        } as WorkerMessage);
      } catch (error) {
        // If posting the message itself fails (e.g., serialization error)
        this.availableWorkers.push(worker); // Ensure worker is returned to pool

        let errorMessage = String(error);
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        task.reject(new Error(`Failed to dispatch task to worker: ${errorMessage}`));
        this.processNextTask(); // Try to process next task if available
      }
    }
  }

  /**
   * Public method to request available time slots, offloading the computation to a worker thread.
   * Returns a Promise that resolves with the TimeSlots or rejects with an Error.
   * @param options The GetScheduleOptions to pass to the worker.
   * @returns A Promise resolving to TimeSlots.
   */
  public async getAvailableSlotsInWorker(options: GetScheduleOptions): Promise<TimeSlots> {
    return new Promise<TimeSlots>((resolve, reject) => {
      this.taskQueue.push({
        resolve,
        reject,
        options,
      });
      this.processNextTask(); // Attempt to process immediately
    });
  }

  onModuleDestroy(): void {
    this.logger.log("Terminating worker pool...");
    for (const worker of this.workerPool) {
      worker.terminate();
    }
    this.logger.log("Worker pool terminated.");
  }
}
