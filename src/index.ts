import { HttpError } from "./types";
import { fetchSourceImage, addCorsHeaders } from "./utils";
import { validateDomain, parseImageProxyOptions } from "./validation";
import { processImage } from "./image-processing";

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
