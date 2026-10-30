import { describe, expect, it } from "vitest";

import {
  App,
  constructAppImage,
  constructGenericImage,
  constructMeetingImage,
  Generic,
  getOGImageVersion,
  Meeting,
} from "./OgImages";

type ImgElementProps = {
  src?: string;
  width?: number | string;
  height?: number | string;
};

/**
 * Walks a React element tree, expanding plain function components (none of the
 * OG image components use hooks), and collects the props of every `<img>` element.
 */
const collectImgElements = (node: unknown): ImgElementProps[] => {
  if (node === null || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectImgElements(child));
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  const props = (element.props ?? {}) as Record<string, unknown>;
  if (typeof element.type === "function") {
    const component = element.type as (componentProps: Record<string, unknown>) => unknown;
    return collectImgElements(component(props));
  }
  if (element.type === "img") {
    return [
      {
        src: props.src as string | undefined,
        width: props.width as number | string | undefined,
        height: props.height as number | string | undefined,
      },
    ];
  }
  return collectImgElements(props.children);
};

describe("OgImages", () => {
  describe("getOGImageVersion", () => {
    it("returns a consistent hash for the same type", async () => {
      const version1 = await getOGImageVersion("generic");
      const version2 = await getOGImageVersion("generic");
      expect(version1).toBe(version2);
    });

    it("returns different hashes for different types", async () => {
      const meetingVersion = await getOGImageVersion("meeting");
      const appVersion = await getOGImageVersion("app");
      const genericVersion = await getOGImageVersion("generic");

      expect(meetingVersion).not.toBe(appVersion);
      expect(meetingVersion).not.toBe(genericVersion);
    });

    it("returns different hash when additionalInputs are provided", async () => {
      const base = await getOGImageVersion("app");
      const withInputs = await getOGImageVersion("app", { svgHash: "abc123" });
      expect(base).not.toBe(withInputs);
    });
  });

  describe("constructMeetingImage", () => {
    it("returns an encoded URL with meeting parameters", async () => {
      const result = await constructMeetingImage({
        title: "30min",
        profile: { name: "Test User" },
        users: [],
      });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("type=meeting");
      expect(decoded).toContain("title=30min");
      expect(decoded).toContain("meetingProfileName=Test+User");
    });

    it("includes meetingImage when profile has an image", async () => {
      const result = await constructMeetingImage({
        title: "30min",
        profile: { name: "Test User", image: "https://example.com/avatar.png" },
        users: [],
      });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("meetingImage=https%3A%2F%2Fexample.com%2Favatar.png");
    });
  });

  describe("constructAppImage", () => {
    it("returns an encoded URL with app parameters", async () => {
      const result = await constructAppImage({
        name: "TestApp",
        slug: "test-app",
        description: "A test app",
        logoUrl: "/app-store/test/icon.svg",
      });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("type=app");
      expect(decoded).toContain("name=TestApp");
      expect(decoded).toContain("slug=test-app");
    });
  });

  describe("constructGenericImage", () => {
    it("returns an encoded URL with generic parameters", async () => {
      const result = await constructGenericImage({
        title: "Login",
        description: "Sign in to your account",
      });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("type=generic");
      expect(decoded).toContain("title=Login");
      expect(decoded).toContain("description=Sign+in+to+your+account");
    });
  });

  describe("OG image branding uses configurable logo constants", () => {
    it("generic type uses LOGO_DARK (with LOGO fallback) for darker logo on light backgrounds", async () => {
      const genericVersion = await getOGImageVersion("generic");
      expect(genericVersion).toBeTruthy();
      expect(typeof genericVersion).toBe("string");
      expect(genericVersion.length).toBe(8);
    });

    it("meeting and app types use LOGO constant", async () => {
      const meetingVersion = await getOGImageVersion("meeting");
      const appVersion = await getOGImageVersion("app");
      expect(meetingVersion).toBeTruthy();
      expect(appVersion).toBeTruthy();
      expect(meetingVersion.length).toBe(8);
      expect(appVersion.length).toBe(8);
    });

    it("all three types produce distinct version hashes", async () => {
      const meetingVersion = await getOGImageVersion("meeting");
      const appVersion = await getOGImageVersion("app");
      const genericVersion = await getOGImageVersion("generic");

      expect(meetingVersion).not.toBe(appVersion);
      expect(meetingVersion).not.toBe(genericVersion);
      expect(appVersion).not.toBe(genericVersion);
    });

    it("self-hosters can override logos by replacing the referenced SVG files", async () => {
      const v1 = await getOGImageVersion("generic");
      const v2 = await getOGImageVersion("generic");
      expect(v1).toBe(v2);
    });
  });

  describe("Satori only renders <img> elements with numeric dimensions", () => {
    it("Meeting passes numeric width/height for the background, logo and avatars", () => {
      const imgs = collectImgElements(
        Meeting({
          title: "30min",
          profile: { name: "Jane Doe", image: "https://example.com/jane.png" },
          users: [{ name: "John Doe", username: "johndoe" }],
        })
      );

      expect(imgs).toHaveLength(3); // background, logo, avatar
      for (const img of imgs) {
        expect(typeof img.width).toBe("number");
      }
      expect(imgs.some((img) => img.width === 350)).toBe(true); // logo
      expect(imgs.some((img) => img.width === 160 && img.height === 160)).toBe(true); // avatar
      expect(imgs.some((img) => img.width === 1200 && img.height === 600)).toBe(true); // background
    });

    it("App passes numeric width/height for the background, logo and app icon", () => {
      const imgs = collectImgElements(
        App({
          name: "TestApp",
          description: "A test app",
          slug: "test-app",
          logoUrl: "/api/app-store/test-app/icon.svg",
        })
      );

      expect(imgs).toHaveLength(3); // background, logo, app icon
      for (const img of imgs) {
        expect(typeof img.width).toBe("number");
      }
      expect(imgs.some((img) => img.width === 150)).toBe(true); // logo
      expect(imgs.some((img) => img.width === 172 && img.height === 172)).toBe(true); // app icon
    });

    it("Generic passes numeric width/height for the background and logo", () => {
      const imgs = collectImgElements(Generic({ title: "Login", description: "Sign in" }));

      expect(imgs).toHaveLength(2); // background, logo
      for (const img of imgs) {
        expect(typeof img.width).toBe("number");
      }
      expect(imgs.some((img) => img.width === 350)).toBe(true); // logo
    });
  });
});
