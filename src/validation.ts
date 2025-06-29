import { z } from "zod";
import { HttpError, ImageProxyOptions } from "./types";

export function validateDomain(url: string, allowedDomains: string[]): boolean {
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

function createOptionsStringSchema(env: Env) {
  return z
    .string()
    .transform((optionsStr) => {
      // Handle special case for original image
      if (optionsStr === "_") {
        return { original: true };
      }

      const candidate: any = {};
      const parts = optionsStr.split(",");

      const keyToOption: Record<string, keyof ImageProxyOptions> = {
        w: "width",
        h: "height",
        f: "format",
        q: "quality",
      };

      for (const part of parts) {
        const trimmed = part.trim();
        const [key, value] = trimmed.split("_");
        const option = keyToOption[key];
        if (option) {
          candidate[option] = value;
        }
      }

      return candidate;
    })
    .pipe(createImageProxyOptionsSchema(env));
}

export function parseImageProxyOptions(
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
