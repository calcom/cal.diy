import sharp from "sharp";

// Maximum allowed size for SVG data (5MB)
const MAX_SVG_SIZE = 5 * 1024 * 1024;

const JPEG = "image/jpeg";
const PNG = "image/png";
const WEBP = "image/webp";
const AVIF = "image/avif";
const GIF = "image/gif";
const SVG = "image/svg+xml";

/**
 * Converts an SVG image to PNG format
 * @param data Base64 encoded image data
 * @returns Base64 encoded PNG data or a placeholder image if conversion fails
 */
export const convertSvgToPng = async (data: string) => {
  if (data.startsWith("data:image/svg+xml;base64,")) {
    try {
      const base64Data = data.replace(/^data:image\/svg\+xml;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Check if the SVG data exceeds the size limit
      if (buffer.length > MAX_SVG_SIZE) {
        throw new Error("SVG data exceeds maximum allowed size");
      }

      const pngBuffer = await sharp(buffer).png().toBuffer();
      return `data:image/png;base64,${pngBuffer.toString("base64")}`;
    } catch (error) {
      console.error("Error converting SVG to PNG", error);
      // Return a 1x1 transparent PNG as placeholder
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    }
  }
  return data;
};

/**
 * Detect content type from image buffer.
 * Simplified version of Next.js image optimizer's detectContentType function (https://github.com/vercel/next.js/blob/9436dce61f1a3ff9478261dc2eba47e0527acf3d/packages/next/src/server/image-optimizer.ts#L160).
 * Supports common web image formats (JPEG, PNG, GIF, WEBP, AVIF, SVG) and drops
 * irrelevant formats like PDF, ICO, TIFF, etc. that aren't used for logos.
 */
export async function detectContentType(buffer: Buffer): Promise<string | null> {
  if ([0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
    return JPEG;
  }
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buffer[i] === b)) {
    return PNG;
  }
  if ([0x47, 0x49, 0x46, 0x38].every((b, i) => buffer[i] === b)) {
    return GIF;
  }
  if ([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50].every((b, i) => !b || buffer[i] === b)) {
    return WEBP;
  }
  if ([0x3c, 0x3f, 0x78, 0x6d, 0x6c].every((b, i) => buffer[i] === b)) {
    return SVG;
  }
  if ([0x3c, 0x73, 0x76, 0x67].every((b, i) => buffer[i] === b)) {
    return SVG;
  }
  if ([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every((b, i) => !b || buffer[i] === b)) {
    return AVIF;
  }

  // Fallback to sharp metadata detection
  try {
    const meta = await sharp(buffer).metadata();
    switch (meta?.format) {
      // libvips reports AVIF as the HEIF container; only the AV1-compressed variant is AVIF
      case "heif":
        return meta.compression === "av1" ? AVIF : null;
      case "webp":
        return WEBP;
      case "png":
        return PNG;
      case "jpeg":
        return JPEG;
      case "gif":
        return GIF;
      case "svg":
        return SVG;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Resize an image buffer while preserving the original format.
 * Simplified version of Next.js image optimizer's optimizeImage function (https://github.com/vercel/next.js/blob/9436dce61f1a3ff9478261dc2eba47e0527acf3d/packages/next/src/server/image-optimizer.ts#L640).
 * Supports common web image formats (JPEG, PNG, WEBP, AVIF) with format-specific
 * optimization settings. Drops advanced options like limitInputPixels, sequentialRead,
 * and timeout that aren't needed for logo processing. Uses failOnError: false for
 * better robustness with potentially malformed images.
 */
export async function resizeImage(params: {
  buffer: Buffer;
  width: number;
  height?: number;
  quality?: number;
  contentType?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { buffer, width, height, quality = 100 } = params;
  let { contentType } = params;

  // Auto-detect content type if not provided
  if (!contentType) {
    contentType = (await detectContentType(buffer)) ?? PNG;
  }

  const transformer = sharp(buffer).rotate();

  if (height) {
    transformer.resize(width, height);
  } else {
    transformer.resize(width, undefined, { withoutEnlargement: true });
  }

  // Apply format-specific optimization (preserving original format)
  if (contentType === AVIF) {
    transformer.avif({
      quality: Math.max(quality - 20, 1),
      effort: 3,
    });
  } else if (contentType === WEBP) {
    transformer.webp({ quality });
  } else if (contentType === PNG) {
    transformer.png({ quality });
  } else if (contentType === JPEG) {
    transformer.jpeg({ quality, mozjpeg: true });
  } else {
    // For unknown formats, default to PNG
    transformer.png({ quality });
    contentType = PNG;
  }

  const optimizedBuffer = await transformer.toBuffer();
  return { buffer: optimizedBuffer, contentType };
}
