/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ARTWORKS: R2Bucket;
  WHISPER_RELAY?: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (url.pathname.startsWith("/family/") || url.pathname.startsWith("/api/family/")) {
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("referrer-policy", "no-referrer");
      headers.set("x-content-type-options", "nosniff");
      headers.set("x-frame-options", "DENY");
      headers.set("cross-origin-resource-policy", "same-origin");
      headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      headers.set("content-security-policy", "default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    // 나머지 경로에도 최소 방어선을 둔다. MIME sniffing과 참조 주소 유출은 어느 화면에서도
    // 이득이 없고, 학생·교사 화면을 iframe에 올릴 이유도 없다(clickjacking 차단).
    // 공개 랜딩(`/`)만 프레임 허용으로 남겨 호스팅 미리보기가 깨지지 않게 한다.
    // frame-ancestors 하나만 담은 CSP라 스크립트·스타일 로딩 정책은 건드리지 않는다.
    const secured = new Response(response.body, response);
    secured.headers.set("x-content-type-options", "nosniff");
    secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
    if (url.pathname !== "/") {
      secured.headers.set("x-frame-options", "DENY");
      secured.headers.set("content-security-policy", "frame-ancestors 'none'");
    }
    return secured;
  },
};

export default worker;
