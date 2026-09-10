import "../test/__mocks__/windowMatchMedia";

import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

import {
  EMBED_MODAL_IFRAME_SLOT_STALE_TIME,
  EMBED_MODAL_IFRAME_FORCE_RELOAD_THRESHOLD_MS,
  EMBED_MODAL_PRERENDER_PREVENT_THRESHOLD_MS,
} from "./constants";

vi.mock("./tailwindCss", () => ({
  default: "mockedTailwindCss",
}));

type ExpectedModalBoxAttrs = {
  theme: string;
  layout: string;
  pageType: string | null;
  state: "loading" | "loaded" | "failed" | "reopened" | "closed" | "prerendering" | "has-message" | null;
  uid?: string | null;
};

type ExpectedIframeUrlObject = {
  pathname: string;
  searchParams: URLSearchParams;
  origin: string | null;
};

function log(...args: any[]) {
  console.log("Test:", ...args);
}

function buildModalArg(arg: { calLink: string; config: Record<string, string> }) {
  return {
    ...arg,
    // Copies the config object so that we don't mutate the original one
    config: {
      ...arg.config,
    },
  };
}

function expectCalModalBoxToBeInDocument(expectedAttrs: ExpectedModalBoxAttrs) {
  const calModalBox = document.querySelector("cal-modal-box") as HTMLElement;
  expect(calModalBox).toBeTruthy();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const modalBox = calModalBox!;

  // Verify required attributes are present
  expect(modalBox.hasAttribute("uid")).toBe(true);

  // Verify data attributes exist (even if empty)
  expect(modalBox.getAttribute("data-theme")).toBe(expectedAttrs.theme);
  expect(modalBox.getAttribute("data-layout")).toBe(expectedAttrs.layout);
  // Verify expected attributes if provided
  expect(modalBox.getAttribute("state")).toBe(expectedAttrs.state);

  expect(modalBox.getAttribute("data-page-type")).toBe(expectedAttrs.pageType);
  if (expectedAttrs.uid) {
    expect(modalBox.getAttribute("uid")).toBe(expectedAttrs.uid);
  }

  return modalBox;
}

function compareUrlSearchParams(actual: URLSearchParams, expected: URLSearchParams) {
  // Create new URLSearchParams to avoid modifying the original
  const actualParams = new URLSearchParams(actual);
  actualParams.delete("embed");

  // Convert both to plain objects for comparison
  const actualObj = Object.fromEntries(actualParams.entries());
  const expectedObj = Object.fromEntries(expected.entries());

  if (JSON.stringify(actualObj) !== JSON.stringify(expectedObj)) {
    console.log({
      actual: actualObj,
      expected: expectedObj,
    });
  }
  expect(actualObj).toEqual(expectedObj);
}

function expectIframeToHaveMatchingUrl({
  element,
  expectedIframeUrlObject,
}: {
  element: HTMLElement;
  expectedIframeUrlObject: ExpectedIframeUrlObject;
}) {
  const iframe = element.querySelector("iframe") as HTMLIFrameElement;
  const actualUrl = new URL(iframe.src);
  const pathForEmbed = `${expectedIframeUrlObject.pathname}/embed`;
  expect(actualUrl.origin).toBe(expectedIframeUrlObject.origin || process.env.EMBED_PUBLIC_WEBAPP_URL || "");
  expect(actualUrl.pathname).toBe(pathForEmbed);
  compareUrlSearchParams(new URLSearchParams(actualUrl.search), expectedIframeUrlObject.searchParams);

  return iframe;
}

function expectCalModalBoxToBeInDocumentWithIframeHavingUrl({
  expectedModalBoxAttrs,
  expectedIframeUrlObject,
}: {
  expectedModalBoxAttrs: ExpectedModalBoxAttrs;
  expectedIframeUrlObject: ExpectedIframeUrlObject;
}) {
  const modalBox = expectCalModalBoxToBeInDocument({
    state: expectedModalBoxAttrs.state,
    theme: expectedModalBoxAttrs.theme,
    layout: expectedModalBoxAttrs.layout,
    pageType: expectedModalBoxAttrs.pageType,
  });

  const iframe = expectIframeToHaveMatchingUrl({
    element: modalBox,
    expectedIframeUrlObject: {
      ...expectedIframeUrlObject,
      origin: expectedIframeUrlObject.origin || process.env.EMBED_PUBLIC_WEBAPP_URL || "",
    },
  });

  return { modalBox, iframe };
}

describe("Cal", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CalClass: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let calInstance: any;

  function mockSearchParams(search: string) {
    Object.defineProperty(window, "location", {
      value: { search },
      writable: true,
    });
  }

  beforeAll(async () => {
    vi.stubEnv("EMBED_PUBLIC_WEBAPP_URL", "https://app.cal.com");
    // Mock window.Cal
    const mockWindowCal = {
      q: [],
      ns: {},
    };
    Object.defineProperty(window, "Cal", {
      value: mockWindowCal,
      writable: true,
    });

    // Import dynamicall so that we could mock/override certain things before loading the embed.ts as it has side effects
    CalClass = (await import("./embed")).Cal;
  });

  beforeEach(() => {
    vi.stubEnv("WEBAPP_URL", "https://app.cal.com");

    calInstance = new CalClass("test-namespace", []);
    // Reset the document body before each test
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("calInstance.createIframe", () => {
    describe("params handling with forwardQueryParams feature enabled", () => {
      beforeEach(() => {
        calInstance = new CalClass("test-namespace", []);
        window.Cal.config = { forwardQueryParams: true };
        // Mock the getConfig method
        calInstance.getConfig = vi.fn().mockReturnValue({ calOrigin: "https://app.cal.com" });
      });

      it("should merge query parameters from URL and explicit params", () => {
        mockSearchParams("?existingParam=value");

        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: { newParam: "newValue" },
          calOrigin: null,
        });

        expect(iframe.src).toContain("existingParam=value");
        expect(iframe.src).toContain("newParam=newValue");
      });

      it("should not lose duplicate params in page query", () => {
        mockSearchParams("?param1=value1&param1=value2");

        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: { param2: "value3" },
          calOrigin: null,
        });

        const urlParams = new URLSearchParams(new URL(iframe.src).search);
        const paramValues = urlParams.getAll("param1");
        expect(paramValues).toEqual(["value1", "value2"]);
      });

      it("should override the duplicate params in page if the same param exists in explicit config", () => {
        mockSearchParams("?param=value1&param=value2");

        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: { param: "value3" },
          calOrigin: null,
        });

        const urlParams = new URLSearchParams(new URL(iframe.src).search);
        const paramValues = urlParams.getAll("param");
        expect(paramValues).toEqual(["value3"]);
      });

      it("should exclude reserved params from the page URL(as these could be unintentional to pass these query params to embed, so better to exclude them and avoid crashing the booking page)", () => {
        mockSearchParams("?date=2023-05-01&duration=30&hello=world");

        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: {
            email: "test@example.com",
          },
          calOrigin: null,
        });

        expect(iframe.src).not.toContain("date=");
        expect(iframe.src).not.toContain("duration=");
        expect(iframe.src).toContain("hello=");
        expect(iframe.src).toContain("email=test%40example.com");
      });

      it("should allow configuring reserved params through config(as it is explicitly passed by user)", () => {
        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: {
            date: "2023-05-01",
            duration: "30",
            email: "test@example.com",
          },
          calOrigin: null,
        });

        expect(iframe.src).toContain("date=2023-05-01");
        expect(iframe.src).toContain("duration=30");
        expect(iframe.src).toContain("email=test%40example.com");
      });

      it("should allow configuring reserved params through direct URL params to embed calLink(as it is explicitly passed by user)", () => {
        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting?date=2023-05-01&duration=30&email=test@example.com",
          calOrigin: null,
        });

        expect(iframe.src).toContain("date=2023-05-01");
        expect(iframe.src).toContain("duration=30");
        expect(iframe.src).toContain("email=test%40example.com");
      });

      it("should set allow='payment' attribute by default to allow Payment Apps to acccept payments", () => {
        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: {},
          calOrigin: null,
        });

        expect(iframe.getAttribute("allow")).toBe("payment");
      });

      it("should set allow='payment' even when no config is provided", () => {
        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          calOrigin: null,
        });

        expect(iframe.getAttribute("allow")).toBe("payment");
      });

      it("should set allow='payment' when iframeAttrs is empty", () => {
        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: { iframeAttrs: {} },
          calOrigin: null,
        });

        expect(iframe.getAttribute("allow")).toBe("payment");
      });

      it("should only apply id from iframeAttrs and ignore other attributes", () => {
        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: {
            iframeAttrs: {
              id: "custom-id",
              "data-custom": "value",
              class: "custom-class",
            },
          },
          calOrigin: null,
        });

        expect(iframe.getAttribute("id")).toBe("custom-id");
        // Other attributes should not be applied
        expect(iframe.getAttribute("data-custom")).toBeNull();
        expect(iframe.getAttribute("class")).toBe("cal-embed");
        // Allow attribute should always be set
        expect(iframe.getAttribute("allow")).toBe("payment");
      });

      it("should respect forwardQueryParams setting to disable sending page query params but still send the ones in the config", () => {
        mockSearchParams("?param1=value");

        window.Cal.config = { forwardQueryParams: false };

        const iframe = calInstance.createIframe({
          calLink: "john-doe/meeting",
          config: { param2: "value" },
          calOrigin: null,
        });

        expect(iframe.src).not.toContain("param1=value");
        expect(iframe.src).toContain("param2=value");
      });
    });
  });

  /**
   * We don't mock the createIframe method as it could update the 'this' objects which could affect the test, so we avoid mocking it
   */
  describe("calInstance.api.modal", () => {
    const initialStateOfModal = "loading";
    const baseModalArgs = {
      calLink: "john-doe/meeting",
      config: {
        theme: "light",
        layout: "modern",
      },
    };
    beforeEach(() => {
      vi.spyOn(calInstance, "doInIframe");
    });

    it("should create a new modal when none exists", () => {
      calInstance.api.modal(baseModalArgs);

      const modalBox = expectCalModalBoxToBeInDocument({
        theme: "light",
        layout: "modern",
        pageType: null,
        state: initialStateOfModal,
      });

      expectIframeToHaveMatchingUrl({
        element: modalBox,
        expectedIframeUrlObject: {
          pathname: `/${baseModalArgs.calLink}`,
          searchParams: new URLSearchParams({
            ...baseModalArgs.config,
            embedType: "modal",
          }),
          origin: process.env.EMBED_PUBLIC_WEBAPP_URL || "",
        },
      });
    });

    describe("Prerendering", () => {
      it("should create modal having iframe with correct attributes when in prerendering mode", () => {
        const modalArg = {
          ...baseModalArgs,
          config: {
            ...baseModalArgs.config,
            "cal.embed.pageType": "doesntmatter",
          },
          calOrigin: null,
          __prerender: true,
        };
        calInstance.api.modal(modalArg);
        expect(calInstance.isPrerendering).toBe(true);

        const modalBox = expectCalModalBoxToBeInDocument({
          state: "prerendering",
          pageType: modalArg.config["cal.embed.pageType"],
          theme: modalArg.config.theme,
          layout: modalArg.config.layout,
        });

        // Verify that the embedRenderStartTime and embedConfig are set, which are used by getNextActionForModal to decide if the modal should be reused or not
        expect(calInstance.embedRenderStartTime).toBeGreaterThan(0);
        expect(calInstance.embedConfig).toBeDefined();

        expectIframeToHaveMatchingUrl({
          element: modalBox,
          expectedIframeUrlObject: {
            pathname: `/${modalArg.calLink}`,
            searchParams: new URLSearchParams({
              ...modalArg.config,
              prerender: "true",
              embedType: "modal",
              "cal.skipSlotsFetch": "true",
            }),
            origin: null,
          },
        });
      });

      it("should create modal having iframe with queueFormResponse=true param when prerendering headless router", () => {
        const modalArg = {
          ...baseModalArgs,
          calLink: "router?form=123&email=john@example.com",
          config: {
            ...baseModalArgs.config,
            "cal.embed.pageType": "doesntmatter",
          },
          calOrigin: null,
          __prerender: true,
        };
        calInstance.api.modal(modalArg);

        const modalBox = expectCalModalBoxToBeInDocument({
          state: "prerendering",
          pageType: modalArg.config["cal.embed.pageType"],
          theme: modalArg.config.theme,
          layout: modalArg.config.layout,
        });

        expectIframeToHaveMatchingUrl({
          element: modalBox,
          expectedIframeUrlObject: {
            pathname: `${new URL(modalArg.calLink, "http://example.com").pathname}`,
            searchParams: new URLSearchParams({
              ...modalArg.config,
              prerender: "true",
              embedType: "modal",
              "cal.queueFormResponse": "true",
              email: "john@example.com",
              form: "123",
            }),
            origin: null,
          },
        });
      });

      it("Accidental repeat prerender prevention", async () => {
        const modalArg = {
          ...baseModalArgs,
          calLink: "router?form=123&email=john@example.com",
        };

        const { status: status1 } = await calInstance.api.modal({
          ...modalArg,
          __prerender: true,
        });
        expect(status1).toBe("created");
        const embedRenderStartTime = calInstance.embedRenderStartTime;

        const { status: status2 } = await calInstance.api.modal({
          ...modalArg,
          __prerender: true,
        });
        expect(status2).toBe("prerender-prevented");
        // embedRenderStartTime should not be updated prerender did not happen
        expect(calInstance.embedRenderStartTime).toBe(embedRenderStartTime);
      });

      it("should allow repeat prerender after threshold time has passed", async () => {
        vi.useFakeTimers();
        const modalArg = {
          ...baseModalArgs,
          calLink: "router?form=123&email=john@example.com",
        };

        // First prerender
        const { status: status1 } = await calInstance.api.modal({
          ...modalArg,
          __prerender: true,
        });
        expect(status1).toBe("created");

        // Mock time passage beyond threshold
        vi.advanceTimersByTime(EMBED_MODAL_PRERENDER_PREVENT_THRESHOLD_MS + 1000);

        // Second prerender after threshold - should be ALLOWED
        const { status: status2 } = await calInstance.api.modal({
          ...modalArg,
          __prerender: true,
        });

        expect(status2).toBe("created");

        vi.useRealTimers();
      });

      it("Prerender with non-headless router link and then CTA click with headless router is not allowed", async () => {
        const modalArg = {
          ...baseModalArgs,
          calLink: "john-doe/meeting",
        };

        const { status: status1 } = await calInstance.api.modal({
          ...modalArg,
          __prerender: true,
        });
        expect(status1).toBe("created");

        await expect(
          calInstance.api.modal({
            ...modalArg,
            calLink: "router?form=123&email=john@example.com",
          })
        ).rejects.toThrow("`prerender` instruction should have been fired with headless router path");
      });

      describe("Modal State Transitions", () => {
        it(`should handle prerender -> open(with prefill) -> reopen(with re-submission) scenario`, () => {
          // Prerender the modal
          const modalArg = {
            ...baseModalArgs,
            calLink: "router?form=FORM_ID&routingField1=value1&routingField2=value2",
          };

          const { modalBoxUid, expectedConfig } = (function prerender(): {
            modalBoxUid: string | null;
            expectedConfig: Record<string, string>;
          } {
            log("Prerendering the modal");
            calInstance.api.modal({ ...buildModalArg(modalArg), __prerender: true });
            expect(calInstance.isPrerendering).toBe(true);
            const expectedConfig = {
              ...modalArg.config,
              embedType: "modal",
            };

            const { modalBox } = expectCalModalBoxToBeInDocumentWithIframeHavingUrl({
              expectedModalBoxAttrs: {
                state: "prerendering",
                theme: modalArg.config.theme,
                layout: modalArg.config.layout,
                pageType: null,
              },
              expectedIframeUrlObject: {
                pathname: `${new URL(modalArg.calLink, "https://baseurl.example").pathname}`,
                searchParams: new URLSearchParams({
                  ...expectedConfig,
                  prerender: "true",
                  form: "FORM_ID",
                  "cal.queueFormResponse": "true",
                  routingField1: "value1",
                  routingField2: "value2",
                }),
                origin: null,
              },
            });

            const modalBoxUid = modalBox.getAttribute("uid");
            return { modalBoxUid, expectedConfig };
          })();

          const { modalArgWithPrefilledConfig, expectedConfigAfterPrefilling } = (function prefill() {
            log("Opening the modal with prefill config");
            const modalArgWithPrefilledConfig = {
              ...modalArg,
              config: { ...modalArg.config, name: "John Doe", email: "john@example.com" },
            };
            // Second modal call with additional config value for prefilling
            calInstance.api.modal(modalArgWithPrefilledConfig);

            const expectedConfigAfterPrefilling = {
              ...expectedConfig,
              name: modalArgWithPrefilledConfig.config.name,
              email: modalArgWithPrefilledConfig.config.email,
            };

            expectCalModalBoxToBeInDocumentWithIframeHavingUrl({
              expectedModalBoxAttrs: {
                // Expect the modal to go to loading state - which starts the loader animation
                state: "loading",
                theme: modalArg.config.theme,
                layout: modalArg.config.layout,
                pageType: null,
                uid: modalBoxUid,
              },
              expectedIframeUrlObject: {
                pathname: `${new URL(modalArg.calLink, "https://baseurl.example").pathname}`,
                searchParams: new URLSearchParams({
                  ...expectedConfig,
                  // It remains because internally we remove prerender=true in iframe, as it is connect mode
                  prerender: "true",
                  form: "FORM_ID",
                  "cal.queueFormResponse": "true",
                  routingField1: "value1",
                  routingField2: "value2",
                }),
                origin: null,
              },
            });

            // Right now we allow re-submission of the same form data, for which we need to connect again
            expect(calInstance.doInIframe).toHaveBeenCalledWith({
              method: "connect",
              arg: {
                config: {
                  "cal.embed.noSlotsFetchOnConnect": "true",
                  ...expectedConfigAfterPrefilling,
                },
                params: {
                  routingField1: "value1",
                  routingField2: "value2",
                  form: "FORM_ID",
                },
              },
            });

            vi.mocked(calInstance.doInIframe).mockClear();
            return { modalArgWithPrefilledConfig, expectedConfigAfterPrefilling };
          })();

          (function reopen() {
            log("Reopening the same modal without any changes");
            calInstance.api.modal(modalArgWithPrefilledConfig);
            expect(calInstance.isPrerendering).toBe(false);

            // Connect won't happen again
            expect(calInstance.doInIframe).toHaveBeenCalledWith(
              expect.objectContaining({
                method: "connect",
                arg: {
                  config: {
                    "cal.embed.noSlotsFetchOnConnect": "true",
                    embedType: "modal",
                    ...expectedConfigAfterPrefilling,
                  },
                  params: {
                    routingField1: "value1",
                    routingField2: "value2",
                    form: "FORM_ID",
                  },
                },
              })
            );

            // expectCalModalBoxToBeInDocumentWithIframeHavingUrl({
            //   expectedModalBoxAttrs: {
            //     // Expect the modal to just go to "reopened" state
            //     state: "reopened",
            //     theme: modalArg.config.theme,
            //     layout: modalArg.config.layout,
            //     pageType: null,
            //     uid: modalBoxUid,
            //   },
            //   expectedIframeUrlObject: {
            //     pathname: `/${modalArg.calLink}`,
            //     searchParams: new URLSearchParams({
            //       ...expectedConfig,
            //       // It remains because we are just reopening the same modal
            //       prerender: "true",
            //       "cal.skipSlotsFetch": "true",
            //     }),
            //     origin: null,
            //   },
            // });

            expect(document.querySelectorAll("cal-modal-box").length).toBe(1);
          })();
        });
      });
    });

    describe("Reopening a non-prerendered modal", () => {
      // Reopening a non-prerendered modal is disabled at the moment and instead it creates a new modal
      it.skip("should reuse the same modal", () => {
        // Preloaded modal
        const modalArg = {
          calLink: "john-doe/meeting",
          config: {
            theme: "light",
            layout: "modern",
          },
        };

        calInstance.api.modal(modalArg);

        const prerenderedModalBox = expectCalModalBoxToBeInDocument({
          state: null,
          theme: modalArg.config.theme,
          layout: modalArg.config.layout,
          pageType: null,
        });

        const prerenderedModalBoxUid = prerenderedModalBox.getAttribute("uid");

        // Second modal creation with same conditions
        calInstance.api.modal(modalArg);

        expectCalModalBoxToBeInDocument({
          state: null,
          theme: modalArg.config.theme,
          layout: modalArg.config.layout,
          pageType: null,
          uid: prerenderedModalBoxUid,
        });
        expect(document.querySelectorAll("cal-modal-box").length).toBe(1);
      });
    });
  });

  describe("__reloadInitiated behavior - ensures correct bookerViewed vs bookerReloaded event firing", () => {
    /**
     * These tests verify that __reloadInitiated is sent correctly via doInIframe,
     * which determines whether bookerViewed or bookerReloaded fires in the iframe.
     * 
     * - If __reloadInitiated is sent → iframe sets reloadInitiated=true → bookerReloaded fires
     * - If __reloadInitiated is NOT sent → iframe has reloadInitiated=false → bookerViewed fires
     */
    beforeEach(() => {
      calInstance = new CalClass("test-namespace", []);
      window.Cal.config = { forwardQueryParams: false };
      vi.spyOn(calInstance, "doInIframe");
    });

    it("should send __reloadInitiated when fullReload action is taken (bookerReloaded should fire)", async () => {
      const baseModalArgs = {
        calLink: "john-doe/meeting",
        config: { theme: "light", layout: "modern" },
      };

      // 1. First modal open - creates new modal (no __reloadInitiated)
      await calInstance.api.modal({ ...baseModalArgs, __prerender: true });
      expect(calInstance.doInIframe).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: "__reloadInitiated" })
      );

      vi.mocked(calInstance.doInIframe).mockClear();

      // 2. Open modal with DIFFERENT calLink - triggers fullReload
      // This should send __reloadInitiated because it's a reload scenario
      await calInstance.api.modal({
        ...baseModalArgs,
        calLink: "jane-doe/meeting",
      });

      expect(calInstance.doInIframe).toHaveBeenCalledWith({
        method: "__reloadInitiated",
        arg: {},
      });
    });

    it("should NOT send __reloadInitiated when creating a new modal (bookerViewed should fire)", async () => {
      const baseModalArgs = {
        calLink: "john-doe/meeting",
        config: { theme: "light", layout: "modern" },
      };

      // Create a new modal - should NOT send __reloadInitiated
      await calInstance.api.modal(baseModalArgs);

      expect(calInstance.doInIframe).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: "__reloadInitiated" })
      );
    });

    it("should NOT send __reloadInitiated when connect action is taken (bookerViewed should fire)", async () => {
      const baseModalArgs = {
        calLink: "john-doe/meeting",
        config: { theme: "light", layout: "modern" },
      };

      // 1. Prerender the modal
      await calInstance.api.modal({ ...baseModalArgs, __prerender: true });
      vi.mocked(calInstance.doInIframe).mockClear();

      // 2. Open modal with same calLink but different config - triggers connect (not fullReload)
      await calInstance.api.modal({
        ...baseModalArgs,
        config: { ...baseModalArgs.config, name: "John Doe" },
      });

      // Should call connect, NOT __reloadInitiated
      expect(calInstance.doInIframe).toHaveBeenCalledWith(
        expect.objectContaining({ method: "connect" })
      );
      expect(calInstance.doInIframe).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: "__reloadInitiated" })
      );
    });

    it("should clear stale __reloadInitiated from queue when loadInIframe is called again", () => {
      // This tests the queue clearing behavior that prevents stale __reloadInitiated
      // from causing bookerReloaded to fire incorrectly
      
      // 1. Create iframe
      const iframe = calInstance.createIframe({
        calLink: "john-doe/meeting",
        config: {},
        calOrigin: null,
      });

      // 2. Simulate __reloadInitiated being queued (happens during fullReload)
      calInstance.doInIframe({ method: "__reloadInitiated", arg: {} });
      expect(calInstance.iframeDoQueue).toHaveLength(1);
      expect(calInstance.iframeDoQueue[0].method).toBe("__reloadInitiated");

      // 3. loadInIframe is called again (e.g., another fullReload before iframe ready)
      // This should clear the queue, removing the stale __reloadInitiated
      calInstance.loadInIframe({
        calLink: "jane-doe/meeting",
        config: {},
        calOrigin: null,
        iframe,
      });

      // 4. Queue should be cleared - stale __reloadInitiated removed
      // This ensures the new iframe won't receive the old __reloadInitiated
      expect(calInstance.iframeDoQueue).toHaveLength(0);
    });
  });

  describe("regression: __iframeReady handler should not throw when iframe is absent (#30130)", () => {
    it("should not throw when __iframeReady fires and this.iframe is null", () => {
      // Before the fix, __iframeReady set iframeReady=true then called doInIframe()
      // without guarding on this.iframe. doInIframe's own queue-and-return was disabled
      // by iframeReady being true, so it fell through to the throw.
      expect(calInstance.iframe).toBeFalsy();
      expect(() => {
        calInstance.actionManager.fire("__iframeReady", { isPrerendering: false });
      }).not.toThrow("iframe doesn't exist. `createIframe` must be called before `doInIframe`");
    });
  });

  describe("getNextActionForModal", () => {
    const baseArgs = {
      pathWithQueryToLoad: "john-doe/meeting",
      modal: {
        uid: "test-uid",
        element: document.querySelector("cal-modal-box") as HTMLElement,
        calOrigin: "https://app.cal.com",
      },
      stateData: {
        embedConfig: { theme: "light" },
        previousEmbedConfig: { theme: "light" },
        isConnectionInitiated: true,
        previousEmbedRenderStartTime: Date.now() - 1000, // 1 second ago
        embedRenderStartTime: Date.now(),
      },
    };

    beforeEach(() => {
      calInstance = new CalClass("test-namespace", []);
      calInstance.iframe = {
        src: "https://app.cal.com/john-doe/meeting",
        dataset: {
          calLink: "john-doe/meeting",
        },
      };
      // Initialize config
      calInstance.__config = {
        calOrigin: "https://app.cal.com",
      };
      // Reset document.querySelector mock before each test
      vi.restoreAllMocks();
      // Mock document.querySelector to return null by default (no existing modal)
      // This prevents isInFailedState from being true
      vi.spyOn(document, "querySelector").mockReturnValue(null);
    });

    it("should return fullReload when cal link is different", () => {
      calInstance.iframe.dataset.calLink = "jane-doe/meeting";
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
      });
      expect(result).toBe("fullReload");
    });

    it("should return fullReload when in failed state", () => {
      // Mock document.querySelector to simulate a failed modal
      document.querySelector = vi.fn().mockReturnValue({
        getAttribute: () => "failed",
      });

      const result = calInstance.getNextActionForModal(baseArgs);
      expect(result).toBe("fullReload");
    });

    it("should return fullReload when threshold time has passed", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          previousEmbedRenderStartTime: Date.now() - EMBED_MODAL_IFRAME_FORCE_RELOAD_THRESHOLD_MS - 1, // Much older timestamp
          embedRenderStartTime: Date.now(),
        },
      });
      expect(result).toBe("fullReload");
    });

    it("should return connect when config is different", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          embedConfig: { theme: "dark" },
          previousEmbedConfig: { theme: "light" },
        },
      });
      expect(result).toBe("connect");
    });

    it("should return connect when config prop type is different", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          embedConfig: { param: 1 },
          previousEmbedConfig: { param: { a: 1 } },
        },
      });
      expect(result).toBe("connect");
    });

    test("for same config, if number of props are different, it should return connect", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          embedConfig: { param1: "value1", param2: "value2" },
          previousEmbedConfig: { param1: "value1" },
        },
      });
      expect(result).toBe("connect");
    });

    it("should return connect when config.guests change", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          embedConfig: { guests: ["john@example.com", "jane@example.com"] },
          previousEmbedConfig: { guests: ["john@example.com"] },
        },
      });
      expect(result).toBe("connect");
    });

    it("should return noAction when config.guests are same", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          embedConfig: { guests: ["john@example.com", "jane@example.com"] },
          previousEmbedConfig: { guests: ["jane@example.com", "john@example.com"] },
        },
      });
      expect(result).toBe("noAction");
    });

    it("should return connect when query params are different", () => {
      calInstance.iframe.src = "https://app.cal.com/john-doe/meeting?param2=value2";
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        pathWithQueryToLoad: "john-doe/meeting?param1=value1",
      });
      expect(result).toBe("connect");
    });

    it("should return connect when connection is not initiated", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          isConnectionInitiated: false,
        },
      });
      expect(result).toBe("connect");
    });

    it("should return noAction when everything is the same", () => {
      // Mock document.querySelector to simulate a non-failed modal
      document.querySelector = vi.fn().mockReturnValue({
        getAttribute: () => "loaded",
      });

      const result = calInstance.getNextActionForModal(baseArgs);
      expect(result).toBe("noAction");
    });

    it("should return connect-no-slots-fetch when backgroundSlotsFetch is true and slots are not stale", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          prerenderOptions: {
            backgroundSlotsFetch: true,
          },
        },
      });
      expect(result).toBe("connect-no-slots-fetch");
    });

    it("should return connect when backgroundSlotsFetch is true but slots are stale", () => {
      const result = calInstance.getNextActionForModal({
        ...baseArgs,
        stateData: {
          ...baseArgs.stateData,
          prerenderOptions: {
            backgroundSlotsFetch: true,
          },
          previousEmbedRenderStartTime: Date.now() - EMBED_MODAL_IFRAME_SLOT_STALE_TIME - 1,
          embedRenderStartTime: Date.now(),
        },
      });
      expect(result).toBe("connect");
    });
  });
});
