import { render, screen, cleanup } from "@testing-library/react";
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
    //@ts-ignore
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

  const renderApp = (appId: string, appData: Record<string, unknown>) => {
    render(
      <BookingPageTagManager
        eventType={{
          metadata: {
            apps: {
              [appId]: { enabled: true, ...appData },
            },
          },
          price: 0,
          currency: "USD",
        }}
      />
    );
    return screen
      .getAllByTestId(`cal-analytics-app-${appId}`)
      .map((script) => script.textContent)
      .join("\n");
  };

  // posthog is covered by the same code path but is not asserted through the DOM here: its
  // template contains a bare `<` (`n<o.length`), which the div that stands in for next/script
  // in this file parses as markup, so textContent stops before the substituted value.
  it.each([
    ["gtm", { trackingId: "GTM-X');alert(1);//" }, "GTM-X');alert(1);//"],
    ["ga4", { trackingId: "G-X'});alert(1);gtag('config',('" }, "G-X'});alert(1);gtag('config',('"],
    ["matomo", { MATOMO_URL: "https://x", SITE_ID: "1'-alert(1)-'" }, "1'-alert(1)-'"],
    ["metapixel", { trackingId: "1');alert(1);//" }, "1');alert(1);//"],
  ])("%s keeps app data inside the JS string literal it is substituted into", (appId, appData, value) => {
    const source = renderApp(appId, appData);

    // The raw value would close the literal; only its escaped form may appear.
    expect(source).not.toContain(value);
    expect(source).toContain(value.replace(/'/g, "\\'"));
  });

  it("escapes characters that would end the inline script element", () => {
    const source = renderApp("gtm", { trackingId: "GTM-X</script><script>alert(1)</script>" });

    expect(source).not.toContain("</script>");
    expect(source).toContain("\\x3C/script\\x3E");
  });

  it("escapes the interpolation opener so a value cannot interpolate in a template literal", () => {
    const source = renderApp("gtm", { trackingId: "GTM-X${alert(1)}" });

    // No shipped template delimits its literals with backticks today, but a value that carries
    // the opener must not become active interpolation if one ever does.
    expect(source).not.toContain("GTM-X${alert(1)}");
    expect(source).toContain("GTM-X\\${alert(1)}");
  });

  it("leaves a legitimate tracking id untouched", () => {
    const source = renderApp("gtm", { trackingId: "GTM-ABC123" });

    expect(source).toContain("'GTM-ABC123'");
    expect(source).not.toContain("\\");
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
