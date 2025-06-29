import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";
import { HttpError, ImageProxyOptions } from "./types";
import { calculateDimensions, determineOutputFormat } from "./utils";

export function getImageBuffer(
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

export function applyTransformations(
  image: PhotonImage,
  options: ImageProxyOptions
): PhotonImage {
  if (!options.width && !options.height) {
    return image;
  }

  const originalWidth = image.get_width();
  const originalHeight = image.get_height();

  const { newWidth, newHeight } = calculateDimensions(
    originalWidth,
    originalHeight,
    options.width,
    options.height
  );

  if (newWidth === originalWidth && newHeight === originalHeight) {
    return image;
  }

  const resizedImage = resize(
    image,
    newWidth,
    newHeight,
    SamplingFilter.Nearest
  );

  return resizedImage;
}

export async function processImage(
  sourceResponse: Response,
  options: ImageProxyOptions
): Promise<Response> {
  const passThroughHeaders = {
    "Cache-Control": sourceResponse.headers.get("cache-control") || "",
    ETag: sourceResponse.headers.get("etag") || "",
    "Last-Modified": sourceResponse.headers.get("last-modified") || "",
  };

  if (options.original) {
    return new Response(sourceResponse.body, {
      status: 200,
      headers: {
        "Content-Type": sourceResponse.headers.get("content-type") || "",
        ...passThroughHeaders,
      },
    });
  }

  try {
    const outputFormat = determineOutputFormat(
      options.format,
      sourceResponse.headers.get("accept")
    );

    const imageBuffer = await sourceResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    const photonImage = PhotonImage.new_from_byteslice(uint8Array);
    const processedImage = applyTransformations(photonImage, options);

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
        ...passThroughHeaders,
      },
    });
  } catch (error) {
    console.error("Error processing image:", error);
    throw new HttpError("Failed to process image", 500);
  }
}