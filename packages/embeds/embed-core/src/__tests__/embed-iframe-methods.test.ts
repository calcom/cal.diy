import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCurrentDocumentUrl, nextTick } from "../embed-iframe/__tests__/test-utils";

describe("embed-iframe.methods", async () => {
    let methods: typeof import("../embed-iframe").methods;
    let embedStore: typeof import("../embed-iframe/lib/embedStore").embedStore;
    let isLinkReadyMock: ReturnType<typeof vi.fn> | undefined;
    let isBookerReadyMock: ReturnType<typeof vi.fn> | undefined;
    let ensureQueryParamsInUrlMock: ReturnType<typeof vi.fn> | undefined;
    beforeEach(async () => {
        vi.useRealTimers();
        fakeCurrentDocumentUrl();
        vi.doMock("../embed-iframe/lib/utils", async (importOriginal) => {
            const actual = await importOriginal<typeof import("../embed-iframe/lib/utils")>();
            return {
                ...actual,
                isLinkReady: isLinkReadyMock,
                isBookerReady: isBookerReadyMock,
            };
        });
        vi.doMock("../embed-iframe/lib/embedStore", async (importOriginal) => {
            const actual = await importOriginal<typeof import("../embed-iframe/lib/embedStore")>();

            return {
                ...actual,
                embedStore: {
                    __MOCKED__: true,
                    ...actual.embedStore,
                    router: {
                        ensureQueryParamsInUrl: ensureQueryParamsInUrlMock,
                    },
                },
            };
        });
        isLinkReadyMock = vi.fn();
        isBookerReadyMock = vi.fn();
        ensureQueryParamsInUrlMock = vi.fn().mockImplementation(() => {
            console.log("Fake ensureQueryParamsInUrl called");
            return {
                stopEnsuringQueryParamsInUrl: vi.fn(),
            };
        });
        ({ methods } = await import("../embed-iframe"));
        ({ embedStore } = await import("../embed-iframe/lib/embedStore"));
    });
    afterEach(() => {
        vi.resetAllMocks();
        vi.resetModules();
        console.log("After each of first describe");
    });

    describe("methods.connect", async () => {
        it("should ensure that 'cal.embed.connectVersion' is incremented in query params", async () => {
            embedStore.renderState = "completed";
            const currentConnectVersion = 1;
            embedStore.connectVersion = currentConnectVersion;
            fakeCurrentDocumentUrl({ params: { "cal.embed.connectVersion": "1" } });
            isLinkReadyMock?.mockReturnValue(true);
            isBookerReadyMock?.mockReturnValue(true);
            await methods.connect({
                config: {},
                params: {},
            });
            expect(ensureQueryParamsInUrlMock).toHaveBeenCalledWith({
                toBeThereParams: {
                    "cal.embed.connectVersion": (currentConnectVersion + 1).toString(),
                },
                toRemoveParams: ["preload", "prerender", "cal.skipSlotsFetch"],
            });
        });

        it("should ensure that 'cal.embed.connectVersion' is not incremented in query params when 'cal.embed.noSlotsFetchOnConnect' is true", async () => {
            embedStore.renderState = "completed";
            const currentConnectVersion = 1;
            embedStore.connectVersion = currentConnectVersion;
            fakeCurrentDocumentUrl({ params: { "cal.embed.connectVersion": "1" } });
            isLinkReadyMock?.mockReturnValue(true);
            isBookerReadyMock?.mockReturnValue(true);
            await methods.connect({
                config: {
                    "cal.embed.noSlotsFetchOnConnect": "true",
                },
                params: {},
            });
            expect(embedStore.router.ensureQueryParamsInUrl).toHaveBeenCalledWith({
                toBeThereParams: {
                    "cal.embed.connectVersion": currentConnectVersion.toString(),
                },
                toRemoveParams: ["preload", "prerender", "cal.skipSlotsFetch"],
            });
        });
    });

    describe("methods.parentKnowsIframeReady", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("should set renderState to 'completed' on link ready", () => {
            isLinkReadyMock?.mockReturnValue(true);
            methods.parentKnowsIframeReady({});
            expect(embedStore.renderState).not.toBe("completed");
            nextTick();
            expect(embedStore.renderState).toBe("completed");
        });
    });

    describe("methods.ui", () => {
        it("should merge disableAutofocus and compact settings into embedStore.uiConfig", () => {
            methods.ui({
                disableAutofocus: true,
                compact: true,
            });
            expect(embedStore.uiConfig?.disableAutoScroll).toBe(true);
            expect(embedStore.uiConfig?.disableAutofocus).toBe(true);
            expect(embedStore.uiConfig?.compact).toBe(true);
        });

        it("should merge autofocus: false and unpadded settings into embedStore.uiConfig", () => {
            methods.ui({
                autofocus: false,
                unpadded: true,
            });
            expect(embedStore.uiConfig?.disableAutoScroll).toBe(true);
            expect(embedStore.uiConfig?.compact).toBe(true);
        });

        it("should allow disabling then re-enabling autofocus/scroll and restoring default padding across two separate ui() calls", () => {
            methods.ui({
                disableAutofocus: true,
                compact: true,
            });
            expect(embedStore.uiConfig?.disableAutoScroll).toBe(true);
            expect(embedStore.uiConfig?.disableAutofocus).toBe(true);
            expect(embedStore.uiConfig?.compact).toBe(true);

            methods.ui({
                autofocus: true,
                padding: "default",
            });
            expect(embedStore.uiConfig?.disableAutoScroll).toBe(false);
            expect(embedStore.uiConfig?.disableAutofocus).toBe(false);
            expect(embedStore.uiConfig?.compact).toBe(false);
        });
    });
});
