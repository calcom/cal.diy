import type { Logger } from "tslog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IdGenerator } from "./index";
import { DistributedTracing } from "./index";

describe("DistributedTracing", () => {
  let idCounter: number;
  let mockIdGenerator: IdGenerator;
  let mockLogger: Logger<unknown>;
  let tracing: DistributedTracing;

  beforeEach(() => {
    idCounter = 0;
    mockIdGenerator = {
      generate: () => {
        idCounter++;
        return `id_${idCounter}`;
      },
    };

    mockLogger = {
      getSubLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      }),
    } as unknown as Logger<unknown>;

    tracing = new DistributedTracing(mockIdGenerator, mockLogger);
  });

  describe("createTrace", () => {
    it("should create a new trace with generated IDs when no context is provided", () => {
      const result = tracing.createTrace("test_operation");

      expect(result).toEqual({
        traceId: "trace_id_1",
        spanId: "span_id_2",
        parentSpanId: undefined,
        operation: "test_operation",
        meta: undefined,
      });
    });

    it("should preserve existing traceId when provided in context", () => {
      const result = tracing.createTrace("test_operation", {
        traceId: "existing_trace_123",
      });

      expect(result.traceId).toBe("existing_trace_123");
      expect(result.spanId).toBe("span_id_1");
      expect(result.operation).toBe("test_operation");
    });

    it("should set parentSpanId to incoming spanId when provided", () => {
      const result = tracing.createTrace("child_operation", {
        spanId: "parent_span_456",
      });

      expect(result.parentSpanId).toBe("parent_span_456");
      expect(result.spanId).toMatch(/^span_id_\d+$/);
      expect(result.spanId).not.toBe(result.parentSpanId);
    });

    it("should preserve meta when provided in context", () => {
      const meta = {
        userId: "123",
        requestId: "req_456",
      };

      const result = tracing.createTrace("test_operation", { meta });

      expect(result.meta).toEqual(meta);
    });

    it("should NOT allow context to override the new operation", () => {
      const contextWithOperation = {
        operation: "old_operation",
      };
      const result = tracing.createTrace("new_operation", contextWithOperation);

      expect(result.operation).toBe("new_operation");
    });

    it("should NOT allow context to override the new parentSpanId", () => {
      const contextWithParentSpan = {
        spanId: "correct_parent_span",
        parentSpanId: "incorrect_parent_span",
      };
      const result = tracing.createTrace("test_operation", contextWithParentSpan);

      expect(result.parentSpanId).toBe("correct_parent_span");
    });

    it("should handle complex context with multiple properties", () => {
      const result = tracing.createTrace("complex_operation", {
        traceId: "trace_999",
        spanId: "span_888",
        meta: {
          env: "production",
          version: "1.2.3",
        },
      });

      expect(result).toEqual({
        traceId: "trace_999",
        spanId: "span_id_1",
        parentSpanId: "span_888",
        operation: "complex_operation",
        meta: {
          env: "production",
          version: "1.2.3",
        },
      });
    });

    it("should generate new traceId when traceId is explicitly undefined", () => {
      const result = tracing.createTrace("test_operation", {
        traceId: undefined,
      });

      expect(result.traceId).toBe("trace_id_1");
    });

    it("should handle empty context object", () => {
      const result = tracing.createTrace("test_operation", {});

      expect(result).toEqual({
        traceId: "trace_id_1",
        spanId: "span_id_2",
        parentSpanId: undefined,
        operation: "test_operation",
        meta: undefined,
      });
    });
  });

  describe("createSpan", () => {
    it("should create a child span from parent context", () => {
      const parentContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "parent_operation",
        meta: {
          userId: "user_789",
        },
      };

      const result = tracing.createSpan(parentContext, "child_operation");

      expect(result).toEqual({
        traceId: "trace_123",
        spanId: "span_id_1",
        parentSpanId: "span_456",
        operation: "child_operation",
        meta: {
          userId: "user_789",
        },
      });
    });

    it("should merge additional meta with parent meta", () => {
      const parentContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "parent_operation",
        meta: {
          userId: "user_789",
        },
      };

      const result = tracing.createSpan(parentContext, "child_operation", {
        requestId: "req_999",
      });

      expect(result.meta).toEqual({
        userId: "user_789",
        requestId: "req_999",
      });
    });

    it("should allow additional meta to override parent meta keys", () => {
      const parentContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "parent_operation",
        meta: {
          userId: "old_user",
          env: "staging",
        },
      };

      const result = tracing.createSpan(parentContext, "child_operation", {
        userId: "new_user",
      });

      expect(result.meta).toEqual({
        userId: "new_user",
        env: "staging",
      });
    });

    it("should handle parent context without meta", () => {
      const parentContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "parent_operation",
      };

      const result = tracing.createSpan(parentContext, "child_operation");

      expect(result.meta).toEqual({});
    });
  });

  describe("getTracingLogger", () => {
    it("should create logger with correct prefixes for basic context", () => {
      const context = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
      };

      tracing.getTracingLogger(context);

      expect(mockLogger.getSubLogger).toHaveBeenCalledWith({
        prefix: ["distributed-trace", "trace:trace_123", "span:span_456", "op:test_operation"],
      });
    });

    it("should include meta in prefixes when provided", () => {
      const context = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "user_789",
          requestId: "req_999",
        },
      };

      tracing.getTracingLogger(context);

      expect(mockLogger.getSubLogger).toHaveBeenCalledWith({
        prefix: [
          "distributed-trace",
          "trace:trace_123",
          "span:span_456",
          "op:test_operation",
          "userId:user_789",
          "requestId:req_999",
        ],
      });
    });

    it("should skip undefined meta values", () => {
      const context = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "user_789",
          requestId: undefined,
        },
      };

      tracing.getTracingLogger(context);

      expect(mockLogger.getSubLogger).toHaveBeenCalledWith({
        prefix: [
          "distributed-trace",
          "trace:trace_123",
          "span:span_456",
          "op:test_operation",
          "userId:user_789",
        ],
      });
    });

    it("should skip null meta values", () => {
      const context = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "user_789",
          requestId: null,
        } as Record<string, string>,
      };

      tracing.getTracingLogger(context);

      expect(mockLogger.getSubLogger).toHaveBeenCalledWith({
        prefix: [
          "distributed-trace",
          "trace:trace_123",
          "span:span_456",
          "op:test_operation",
          "userId:user_789",
        ],
      });
    });
  });

  describe("extractTraceFromPayload", () => {
    it("should extract trace context from valid JSON payload", () => {
      const traceContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
      };

      const payload = JSON.stringify({
        _traceContext: traceContext,
        otherData: "value",
      });

      const result = tracing.extractTraceFromPayload(payload);

      expect(result).toEqual(traceContext);
    });

    it("should return null for payload without trace context", () => {
      const payload = JSON.stringify({
        otherData: "value",
      });

      const result = tracing.extractTraceFromPayload(payload);

      expect(result).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      const payload = "invalid json {";

      const result = tracing.extractTraceFromPayload(payload);

      expect(result).toBeNull();
    });

    it("should return null for payload with _traceContext but no traceId", () => {
      const payload = JSON.stringify({
        _traceContext: {
          spanId: "span_456",
        },
      });

      const result = tracing.extractTraceFromPayload(payload);

      expect(result).toBeNull();
    });
  });

  describe("injectTraceIntoPayload", () => {
    it("should inject trace context into payload", () => {
      const payload = {
        data: "value",
      };

      const traceContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
      };

      const result = tracing.injectTraceIntoPayload(payload, traceContext);

      expect(result).toEqual({
        data: "value",
        _traceContext: traceContext,
      });
    });

    it("should return original payload when no trace context provided", () => {
      const payload = {
        data: "value",
      };

      const result = tracing.injectTraceIntoPayload(payload);

      expect(result).toEqual(payload);
    });

    it("should return original payload when trace context is undefined", () => {
      const payload = {
        data: "value",
      };

      const result = tracing.injectTraceIntoPayload(payload, undefined);

      expect(result).toEqual(payload);
    });
  });

  describe("updateTrace", () => {
    it("should update trace context with additional meta", () => {
      const traceContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "user_789",
        },
      };

      const result = tracing.updateTrace(traceContext, {
        requestId: "req_999",
      });

      expect(result).toEqual({
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "user_789",
          requestId: "req_999",
        },
      });
    });

    it("should override existing meta keys", () => {
      const traceContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "old_user",
        },
      };

      const result = tracing.updateTrace(traceContext, {
        userId: "new_user",
      });

      expect(result.meta).toEqual({
        userId: "new_user",
      });
    });

    it("should handle trace context without meta", () => {
      const traceContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
      };

      const result = tracing.updateTrace(traceContext, {
        userId: "user_789",
      });

      expect(result.meta).toEqual({
        userId: "user_789",
      });
    });

    it("should handle undefined additional meta", () => {
      const traceContext = {
        traceId: "trace_123",
        spanId: "span_456",
        operation: "test_operation",
        meta: {
          userId: "user_789",
        },
      };

      const result = tracing.updateTrace(traceContext);

      expect(result.meta).toEqual({
        userId: "user_789",
      });
    });
  });
});
