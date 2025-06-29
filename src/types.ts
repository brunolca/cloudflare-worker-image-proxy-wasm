export interface ImageProxyOptions {
  width?: number;
  height?: number;
  format: "webp" | "jpeg" | "png" | "auto";
  quality: number;
  original: boolean;
}

export class HttpError extends Error {
  public readonly status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}