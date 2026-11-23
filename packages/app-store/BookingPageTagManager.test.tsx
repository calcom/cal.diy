import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import BookingPageTagManager, { handleEvent } from "./BookingPageTagManager";

// NOTE:  We don't intentionally mock appStoreMetadata as that also tests config.json and generated files for us for no cost. If it becomes a pain in future, we could just start mocking it.

vi.mock("next/script", () => {
  return {
    default: ({ ...props }) => {
      return <div {...props} />;
    },
  };
});

const windowProps: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOnWindow(prop: any, value: any) {
  window[prop] = value;
  windowProps.push(prop);
}

afterEach(() => {
  windowProps.forEach((prop) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-expect-error
    delete window[prop];
  });
  windowProps.splice(0);
  cleanup();
});

describe("BookingPageTagManager", () => {
  it("GTM App when enabled should have its scripts added with appropriate trackingID and $pushEvent replacement", () => {
    const GTM_CONFIG = {
      enabled: true,
      trackingId: "GTM-123",
    };
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: GTM_CONFIG,
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    const trackingScript = scripts[0];
    const pushEventScript = scripts[1];
    expect(trackingScript.innerHTML).toContain(GTM_CONFIG.trackingId);
    expect(pushEventScript.innerHTML).toContain("cal_analytics_app__gtm");
  });

  it("GTM App when disabled should not have its scripts added", () => {
    const GTM_CONFIG = {
      enabled: false,
      trackingId: "GTM-123",
    };
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: GTM_CONFIG,
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-gtm");
    expect(scripts.length).toBe(0);
  });

  it.each([
    // CVE-2026-57858: attempts to break out of the enclosing JS string literal
    "GTM-'});alert(document.cookie);//",
    // attempts to close the <script> element and open a new one
    "GTM-123</script><script>alert(document.cookie)</script>",
    // escape-sequence smuggling
    "GTM-\\u0027});alert(document.cookie);//",
  ])("GTM App must neutralize malicious trackingId %s", (trackingId) => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: {
                enabled: true,
                trackingId,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    const trackingScript = scripts[0];
    expect(trackingScript.innerHTML).not.toContain("</script>");
    expect(trackingScript.innerHTML).not.toContain("<script>");
    // the full escape sequence chain must be present in the rendered output
    expect(trackingScript.innerHTML).toContain(
      trackingId
        .replace(/\\/g, "\\\\")
        .replace(/</g, "\\u003C")
        .replace(/>/g, "\\u003E")
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
    );
  });

  it("GTM App trackingId containing $-patterns must be interpolated literally (replace() replacement patterns must not be expanded)", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              gtm: {
                enabled: true,
                trackingId: "GTM-$&-123",
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.getAllByTestId("cal-analytics-app-gtm");
    const trackingScript = scripts[0];
    // textContent because jsdom serializes `&` as `&amp;` in innerHTML
    expect(trackingScript.textContent).toContain("GTM-$&-123");
  });

  it("should not add scripts for an app that doesnt have tag defined(i.e. non-analytics app)", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              zoomvideo: {
                enabled: true,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-zoomvideo");
    expect(scripts.length).toBe(0);
  });

  it("should not crash for an app that doesnt exist", () => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              //@ts-expect-error Testing for non-existent app
              nonexistentapp: {
                enabled: true,
              },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    const scripts = screen.queryAllByTestId("cal-analytics-app-zoomvideo");
    expect(scripts.length).toBe(0);
  });
});

describe("handleEvent", () => {
  it("should not push internal events to analytics apps", () => {
    expect(
      handleEvent({
        detail: {
          // Internal event
          type: "__abc",
        },
      })
    ).toBe(false);

    expect(
      handleEvent({
        detail: {
          // Not an internal event
          type: "_abc",
        },
      })
    ).toBe(true);
  });

  it("should call the function on window with the event name and data", () => {
    const pushEventXyz = vi.fn();
    const pushEventAnything = vi.fn();
    const pushEventRandom = vi.fn();
    const pushEventNotme = vi.fn();

    setOnWindow("cal_analytics_app__xyz", pushEventXyz);
    setOnWindow("cal_analytics_app__anything", pushEventAnything);
    setOnWindow("cal_analytics_app_random", pushEventRandom);
    setOnWindow("cal_analytics_notme", pushEventNotme);

    handleEvent({
      detail: {
        type: "abc",
        key: "value",
      },
    });

    expect(pushEventXyz).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventAnything).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventRandom).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });

    expect(pushEventNotme).not.toHaveBeenCalled();
  });

  it("should not error if accidentally the value is not a function", () => {
    const pushEventNotAfunction = "abc";
    const pushEventAnything = vi.fn();
    setOnWindow("cal_analytics_app__notafun", pushEventNotAfunction);
    setOnWindow("cal_analytics_app__anything", pushEventAnything);

    handleEvent({
      detail: {
        type: "abc",
        key: "value",
      },
    });

    // No error for cal_analytics_app__notafun and pushEventAnything is called
    expect(pushEventAnything).toHaveBeenCalledWith({
      name: "abc",
      data: {
        key: "value",
      },
    });
  });
});
