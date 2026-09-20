import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { SatoriOptions } from "satori";
import { z, ZodError } from "zod";

import { Meeting, App, Generic, getOGImageVersion } from "@calcom/lib/OgImages";
import { WEBAPP_URL, WEBAPP_URL_INTERNAL } from "@calcom/lib/constants";

export const runtime = "edge";

const meetingSchema = z.object({
  imageType: z.literal("meeting"),
  title: z.string(),
  names: z.string().array(),
  usernames: z.string().array(),
  meetingProfileName: z.string(),
  meetingImage: z.string().nullable().optional(),
});

const appSchema = z.object({
  imageType: z.literal("app"),
  name: z.string(),
  description: z.string(),
  slug: z.string(),
  logoUrl: z.string(),
});

const genericSchema = z.object({
  imageType: z.literal("generic"),
  title: z.string(),
  description: z.string(),
});

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const imageType = searchParams.get("type");

  try {
    const fontResults = await Promise.allSettled([
      fetch(new URL("/fonts/cal.ttf", WEBAPP_URL_INTERNAL || WEBAPP_URL)).then((res) => res.arrayBuffer()),
      fetch(new URL("/fonts/Inter-Regular.ttf", WEBAPP_URL_INTERNAL || WEBAPP_URL)).then((res) => res.arrayBuffer()),
      fetch(new URL("/fonts/Inter-Medium.ttf", WEBAPP_URL_INTERNAL || WEBAPP_URL)).then((res) => res.arrayBuffer()),
    ]);

    const fonts: SatoriOptions["fonts"] = [];

    if (fontResults[1].status === "fulfilled") {
      fonts.push({ name: "inter", data: fontResults[1].value, weight: 400 });
    }

    if (fontResults[2].status === "fulfilled") {
      fonts.push({ name: "inter", data: fontResults[2].value, weight: 500 });
    }

    if (fontResults[0].status === "fulfilled") {
      fonts.push({ name: "cal", data: fontResults[0].value, weight: 400 });
      fonts.push({ name: "cal", data: fontResults[0].value, weight: 600 });
    }

    const ogConfig = {
      width: 1200,
      height: 630,
      fonts,
    };

    switch (imageType) {
      case "meeting": {
        try {
          const { names, usernames, title, meetingProfileName, meetingImage } = meetingSchema.parse({
            names: searchParams.getAll("names"),
            usernames: searchParams.getAll("usernames"),
            title: searchParams.get("title"),
            meetingProfileName: searchParams.get("meetingProfileName"),
            meetingImage: searchParams.get("meetingImage"),
            imageType,
          });

          const etag = await getOGImageVersion("meeting");
          const img = new ImageResponse(
            <Meeting
              title={title}
              profile={{ name: meetingProfileName, image: meetingImage }}
              users={names.map((name, index) => ({ name, username: usernames[index] }))}
            />,
            ogConfig
          );

          return new Response(img.body, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control":
                "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=31536000",
              ETag: `"${etag}"`,
            },
          });
        } catch (error) {
          if (error instanceof ZodError) {
            return new Response(
              JSON.stringify({
                error: "Invalid parameters for meeting image",
                message:
                  "Required parameters: title, meetingProfileName. Optional: names, usernames, meetingImage",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          throw error;
        }
      }
      case "app": {
        try {
          const { name, description, slug, logoUrl } = appSchema.parse({
            name: searchParams.get("name"),
            description: searchParams.get("description"),
            slug: searchParams.get("slug"),
            logoUrl: searchParams.get("logoUrl"),
            imageType,
          });

          // Get SVG hash for the app
          const svgHashesModule = await import("@calcom/web/public/app-store/svg-hashes.json");
          const SVG_HASHES = svgHashesModule.default ?? {};
          const svgHash = SVG_HASHES[slug] ?? undefined;

          const etag = await getOGImageVersion("app", { svgHash });
          const img = new ImageResponse(
            <App name={name} description={description} slug={slug} logoUrl={logoUrl} />,
            ogConfig
          );

          return new Response(img.body, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control":
                "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=31536000",
              ETag: `"${etag}"`,
            },
          });
        } catch (error) {
          if (error instanceof ZodError) {
            return new Response(
              JSON.stringify({
                error: "Invalid parameters for app image",
                message: "Required parameters: name, description, slug",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          throw error;
        }
      }

      case "generic": {
        try {
          const { title, description } = genericSchema.parse({
            title: searchParams.get("title"),
            description: searchParams.get("description"),
            imageType,
          });

          const etag = await getOGImageVersion("generic");
          const img = new ImageResponse(<Generic title={title} description={description} />, ogConfig);

          return new Response(img.body, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control":
                "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=31536000",
              ETag: `"${etag}"`,
            },
          });
        } catch (error) {
          if (error instanceof ZodError) {
            return new Response(
              JSON.stringify({
                error: "Invalid parameters for generic image",
                message: "Required parameters: title, description",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
          throw error;
        }
      }

      default:
        return new Response("Wrong image type", { status: 404 });
    }
  } catch {
    return new Response("Internal server error", { status: 500 });
  }
}

export { handler as GET };
