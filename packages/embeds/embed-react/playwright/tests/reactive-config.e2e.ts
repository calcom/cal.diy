import { expect } from "@playwright/test";

import { getEmbedIframe } from "@calcom/embed-core/playwright/lib/testUtils";

import { test } from "@calcom/web/playwright/lib/fixtures";

test.describe("React Embed", () => {
  test.describe("Inline", () => {
    test("should update config theme after initial mount", async ({ page, embeds }) => {
      const calNamespace = "inline";
      await embeds.gotoPlayground({ url: "/inline.html", calNamespace });

      const embedIframe = await getEmbedIframe({ calNamespace, page, pathname: "/pro" });
      await expect(page.locator(`iframe[name="cal-embed=${calNamespace}"]`).last()).toBeVisible();
      if (!embedIframe) {
        throw new Error("Embed iframe not found");
      }

      const beforeTheme = await embedIframe.evaluate(() => window.CalEmbed.embedStore.theme);
      expect(beforeTheme).toBe("dark");

      await page.getByTestId("toggle-theme").click();

      await expect
        .poll(async () =>
          embedIframe.evaluate(() => window.CalEmbed.embedStore.theme)
        )
        .toBe("light");
    });

    test("should verify that the iframe got created with correct URL - namespaced", async ({
      page,
      embeds,
    }) => {
      const calNamespace = "inline";
      await embeds.gotoPlayground({ url: "/inline.html", calNamespace });
      const embedIframe = await getEmbedIframe({ calNamespace, page, pathname: "/pro" });
      await expect(embedIframe).toBeEmbedCalLink(calNamespace, embeds.getActionFiredDetails, {
        pathname: "/pro",
        searchParams: {
          theme: "dark",
        },
      });
    });
  });

  test.describe("Floating button Popup", () => {
    test("should verify that the iframe got created with correct URL - namespaced", async ({
      page,
      embeds,
    }) => {
      const calNamespace = "floating";
      await page.waitForLoadState();
      await embeds.gotoPlayground({ url: "/floating.html", calNamespace });

      await page.click("text=Book my Cal");

      const embedIframe = await getEmbedIframe({ calNamespace, page, pathname: "/pro" });
      await expect(embedIframe).toBeEmbedCalLink(calNamespace, embeds.getActionFiredDetails, {
        pathname: "/pro",
        searchParams: {
          theme: "dark",
        },
      });
    });
  });

  // TODO: This test is extremely flaky and has been failing a lot, blocking many PRs. Fix this.
  test.describe.skip("Element Click Popup", () => {
    test("should verify that the iframe got created with correct URL - namespaced", async ({
      page,
      embeds,
    }) => {
      const calNamespace = "element-click";
      await embeds.gotoPlayground({ url: "/element-click.html", calNamespace });
      await page.waitForLoadState();
      await page.click("text=Click me");

      const embedIframe = await getEmbedIframe({ calNamespace, page, pathname: "/pro" });
      await expect(embedIframe).toBeEmbedCalLink(calNamespace, embeds.getActionFiredDetails, {
        pathname: "/pro",
        searchParams: {
          theme: "dark",
        },
      });
    });
  });
});
