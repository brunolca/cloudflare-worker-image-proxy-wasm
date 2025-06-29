import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";
import { z } from "zod";

// Custom error class with status codes
class HttpError extends Error {
  public readonly status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function createImageProxyOptionsSchema(env: Env) {
  const maxWidth = parseInt(env.MAX_WIDTH, 10);
  const maxHeight = parseInt(env.MAX_HEIGHT, 10);

  return z.object({
    width: z.coerce.number().int().positive().max(maxWidth).optional(),
    height: z.coerce.number().int().positive().max(maxHeight).optional(),
    format: z.enum(["webp", "jpeg", "png", "auto"]).default("auto"),
    quality: z.coerce.number().int().min(1).max(100).default(85),
    original: z.boolean().default(false),
  });
}

export type ImageProxyOptions = {
  width?: number;
  height?: number;
  format: "webp" | "jpeg" | "png" | "auto";
  quality: number;
  original: boolean;
};

// Security functions

function validateDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    const domains = allowedDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain.length > 0);

    if (domains.length === 0) {
      return true;
    }

    return domains.some((domain) => {
      if (domain.startsWith("*.")) {
        const baseDomain = domain.substring(2);
        return hostname === baseDomain || hostname.endsWith("." + baseDomain);
      }
      return hostname === domain;
    });
  } catch {
    return false;
  }
}

// Operations parsing using Zod transforms
function createOptionsStringSchema(env: Env) {
  const maxWidth = parseInt(env.MAX_WIDTH, 10);
  const maxHeight = parseInt(env.MAX_HEIGHT, 10);

  return z
    .string()
    .transform((optionsStr) => {
      // Handle special case for original image
      if (optionsStr === "_") {
        return { original: true };
      }

      const candidate: any = {};
      const parts = optionsStr.split(",");

      for (const part of parts) {
        const trimmed = part.trim();

        if (trimmed.startsWith("w_")) {
          const width = parseInt(trimmed.substring(2), 10);
          if (!isNaN(width) && width > 0 && width <= maxWidth) {
            candidate.width = width;
          }
        } else if (trimmed.startsWith("h_")) {
          const height = parseInt(trimmed.substring(2), 10);
          if (!isNaN(height) && height > 0 && height <= maxHeight) {
            candidate.height = height;
          }
        } else if (trimmed.startsWith("s_")) {
          const sizeMatch = trimmed.substring(2).match(/^(\d+)x(\d+)$/);
          if (sizeMatch) {
            const width = parseInt(sizeMatch[1], 10);
            const height = parseInt(sizeMatch[2], 10);
            if (
              !isNaN(width) &&
              !isNaN(height) &&
              width > 0 &&
              height > 0 &&
              width <= maxWidth &&
              height <= maxHeight
            ) {
              candidate.width = width;
              candidate.height = height;
            }
          }
        } else if (trimmed.startsWith("f_")) {
          const format = trimmed.substring(2);
          if (["webp", "jpeg", "png", "auto"].includes(format)) {
            candidate.format = format;
          }
        } else if (trimmed.startsWith("q_")) {
          const quality = parseInt(trimmed.substring(2), 10);
          if (!isNaN(quality) && quality >= 1 && quality <= 100) {
            candidate.quality = quality;
          }
        }
      }

      return candidate;
    })
    .pipe(createImageProxyOptionsSchema(env));
}

function parseImageProxyOptions(
  optionsStr: string,
  env: Env
): ImageProxyOptions {
  const schema = createOptionsStringSchema(env);
  try {
    return schema.parse(optionsStr);
  } catch (error: any) {
    throw new HttpError(
      `Invalid options: ${error?.message || "Unknown error"}`,
      400
    );
  }
}

async function fetchSourceImage(
  sourceUrl: string,
  request: Request
): Promise<Response> {
  const sourceResponse = await fetch(sourceUrl, {
    headers: request.headers,
  });

  if (!sourceResponse.ok) {
    throw new HttpError(
      `Failed to fetch source image: ${sourceResponse.status}`,
      sourceResponse.status
    );
  }

  const contentType = sourceResponse.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new HttpError("Source is not an image", 400);
  }

  return sourceResponse;
}

// Image processing functions
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  targetWidth?: number,
  targetHeight?: number
): { newWidth: number; newHeight: number } {
  if (!targetWidth && !targetHeight) {
    return { newWidth: originalWidth, newHeight: originalHeight };
  }

  const aspectRatio = originalWidth / originalHeight;

  // Always use embed behavior (maintain aspect ratio, fit within bounds)
  if (targetWidth && targetHeight) {
    const targetAspectRatio = targetWidth / targetHeight;

    if (aspectRatio > targetAspectRatio) {
      return {
        newWidth: targetWidth,
        newHeight: Math.round(targetWidth / aspectRatio),
      };
    } else {
      return {
        newWidth: Math.round(targetHeight * aspectRatio),
        newHeight: targetHeight,
      };
    }
  }

  if (targetWidth) {
    return {
      newWidth: targetWidth,
      newHeight: Math.round(targetWidth / aspectRatio),
    };
  }

  if (targetHeight) {
    return {
      newWidth: Math.round(targetHeight * aspectRatio),
      newHeight: targetHeight,
    };
  }

  return { newWidth: originalWidth, newHeight: originalHeight };
}

function determineOutputFormat(
  requestedFormat?: string,
  acceptHeader?: string | null
): "webp" | "jpeg" | "png" {
  if (requestedFormat && requestedFormat !== "auto") {
    return requestedFormat as "webp" | "jpeg" | "png";
  }

  if (acceptHeader && acceptHeader.includes("image/webp")) {
    return "webp";
  }

  return "jpeg";
}

function getImageBuffer(
  image: PhotonImage,
  format: "webp" | "jpeg" | "png",
  quality?: number
): Uint8Array {
  switch (format) {
    case "webp":
      return image.get_bytes_webp();
    case "png":
      return image.get_bytes();
    case "jpeg":
    default:
      if (quality !== undefined) {
        return image.get_bytes_jpeg(quality);
      }
      return image.get_bytes_jpeg(85);
  }
}

function applyTransformations(
  image: PhotonImage,
  options: ImageProxyOptions
): PhotonImage {
  let processedImage = image;

  if (options.width || options.height) {
    const originalWidth = processedImage.get_width();
    const originalHeight = processedImage.get_height();

    const { newWidth, newHeight } = calculateDimensions(
      originalWidth,
      originalHeight,
      options.width,
      options.height
    );

    if (newWidth !== originalWidth || newHeight !== originalHeight) {
      const resizedImage = resize(
        processedImage,
        newWidth,
        newHeight,
        SamplingFilter.Lanczos3
      );
      if (processedImage !== image) {
        processedImage.free();
      }
      processedImage = resizedImage;
    }
  }

  return processedImage;
}

async function processImage(
  sourceResponse: Response,
  options: ImageProxyOptions
): Promise<Response> {
  try {
    const contentType = sourceResponse.headers.get("content-type") || "";

    if (options.original) {
      return new Response(sourceResponse.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": sourceResponse.headers.get("cache-control") || "",
          ETag: sourceResponse.headers.get("etag") || "",
          "Last-Modified": sourceResponse.headers.get("last-modified") || "",
        },
      });
    }

    const imageBuffer = await sourceResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);

    let photonImage: PhotonImage;
    try {
      photonImage = PhotonImage.new_from_byteslice(uint8Array);
    } catch (error) {
      throw new HttpError("Invalid or unsupported image format", 400);
    }

    try {
      const processedImage = applyTransformations(photonImage, options);
      const outputFormat = determineOutputFormat(
        options.format,
        sourceResponse.headers.get("accept")
      );
      const outputBuffer = getImageBuffer(
        processedImage,
        outputFormat,
        options.quality
      );

      processedImage.free();

      return new Response(outputBuffer, {
        status: 200,
        headers: {
          "Content-Type": `image/${outputFormat}`,
          "Cache-Control": sourceResponse.headers.get("cache-control") || "",
          ETag: sourceResponse.headers.get("etag") || "",
          "Last-Modified": sourceResponse.headers.get("last-modified") || "",
        },
      });
    } catch (error) {
      photonImage.free();
      throw error;
    }
  } catch (error) {
    console.error("Error processing image:", error);
    throw new HttpError("Failed to process image", 500);
  }
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Main worker handler
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/" || path === "/health") {
        return new Response("Image Proxy Worker", { status: 200 });
      }

      const match = path.match(/^\/([^\/]+)\/(.+)$/);
      if (!match) {
        throw new HttpError(
          "Invalid URL format. Expected: /{operations}/{source_url}",
          400
        );
      }

      const [, operationsStr, sourceUrl] = match;

      if (!validateDomain(sourceUrl, env.ALLOWED_DOMAINS)) {
        throw new HttpError("Domain not allowed", 403);
      }

      const options = parseImageProxyOptions(operationsStr, env);

      const cache = await caches.open("default");
      let response = await cache.match(request);

      if (response) {
        return response;
      }

      const sourceResponse = await fetchSourceImage(sourceUrl, request);
      response = await processImage(sourceResponse, options);

      if (response.ok) {
        ctx.waitUntil(cache.put(request, response.clone()));
      }

      return addCorsHeaders(response);
    } catch (error) {
      console.error("Error processing request:", error);

      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof Error ? error.message : "Internal Server Error";

      return new Response(message, {
        status,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },
};
