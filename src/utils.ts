import { HttpError } from "./types";

export function calculateDimensions(
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

export function determineOutputFormat(
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

export async function fetchSourceImage(
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

export function addCorsHeaders(response: Response): Response {
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