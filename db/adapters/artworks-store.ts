/**
 * R2 호환 작품 파일 저장소.
 *
 * 호출부가 쓰는 R2Bucket 표면은 put(key, bytes, {httpMetadata, customMetadata}) /
 * get(key) → { size, httpMetadata?.contentType, arrayBuffer() } | null / delete(key) 셋뿐이다.
 * 운영은 기존 R2 버킷을 S3 호환 API로 계속 쓰고(이미지 이전 없음), 로컬 개발·테스트는
 * 자격증명 없이 파일 저장소로 동작한다. 아이 그림은 어떤 구현에서도 공개 URL을 만들지 않는다.
 */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

type PutOptions = {
  httpMetadata?: { contentType?: string; cacheControl?: string };
  customMetadata?: Record<string, string>;
};

export type StoredObject = {
  size: number;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export interface ArtworksStore {
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: PutOptions): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  // 완성 저장이 후보 키의 존재·크기만 확인할 때 3.5MB 본문을 내려받지 않게 한다.
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

function toUint8(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

const SAFE_KEY = /^[A-Za-z0-9._/-]+$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.startsWith("/") || key.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("저장 키 형식이 올바르지 않아요.");
  }
}

export class S3ArtworksStore implements ArtworksStore {
  private readonly aws: AwsClient;
  private readonly endpoint: string;
  private readonly bucket: string;

  constructor(endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string) {
    this.endpoint = endpoint;
    this.bucket = bucket;
    this.aws = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  }

  private objectUrl(key: string): string {
    assertSafeKey(key);
    const encoded = key.split("/").map((part) => encodeURIComponent(part)).join("/");
    return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${encoded}`;
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView, options?: PutOptions): Promise<void> {
    const headers: Record<string, string> = {};
    if (options?.httpMetadata?.contentType) headers["content-type"] = options.httpMetadata.contentType;
    if (options?.httpMetadata?.cacheControl) headers["cache-control"] = options.httpMetadata.cacheControl;
    for (const [name, metaValue] of Object.entries(options?.customMetadata ?? {})) headers[`x-amz-meta-${name.toLowerCase()}`] = metaValue;
    const body = toUint8(value);
    // 서명은 aws4fetch로 하되 전송은 원본 버퍼로 다시 만든다. aws.fetch()는 본문을
    // Request 객체(스트림)로 감싸는데, Next 서버 런타임의 fetch는 스트림 본문을
    // Content-Length 없이(chunked) 보내고 R2는 그런 PUT을 411로 거절한다
    // (2026-08-19 운영에서 1KB 초과 업로드 전멸로 실측 — 독립 Node에서는 재현 안 됨).
    const signed = await this.aws.sign(this.objectUrl(key), { method: "PUT", headers, body: body as unknown as BodyInit });
    const response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: body as unknown as BodyInit });
    if (!response.ok) throw new Error(`작품 파일 저장에 실패했어요. (S3 ${response.status})`);
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.aws.fetch(this.objectUrl(key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`작품 파일 조회에 실패했어요. (S3 ${response.status})`);
    const bytes = await response.arrayBuffer();
    const customMetadata: Record<string, string> = {};
    response.headers.forEach((headerValue, name) => {
      if (name.startsWith("x-amz-meta-")) customMetadata[name.slice("x-amz-meta-".length)] = headerValue;
    });
    return {
      size: bytes.byteLength,
      httpMetadata: {
        contentType: response.headers.get("content-type") ?? undefined,
        cacheControl: response.headers.get("cache-control") ?? undefined,
      },
      customMetadata,
      arrayBuffer: async () => bytes,
    };
  }

  async head(key: string): Promise<{ size: number } | null> {
    const response = await this.aws.fetch(this.objectUrl(key), { method: "HEAD" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`작품 파일 확인에 실패했어요. (S3 ${response.status})`);
    return { size: Number(response.headers.get("content-length") ?? 0) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.aws.fetch(this.objectUrl(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`작품 파일 삭제에 실패했어요. (S3 ${response.status})`);
  }
}

export class FsArtworksStore implements ArtworksStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private resolveKey(key: string): string {
    assertSafeKey(key);
    const resolved = path.resolve(this.baseDir, key);
    if (!resolved.startsWith(path.resolve(this.baseDir) + path.sep)) throw new Error("저장 키 형식이 올바르지 않아요.");
    return resolved;
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView, options?: PutOptions): Promise<void> {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, toUint8(value));
    await writeFile(`${filePath}.meta.json`, JSON.stringify({ httpMetadata: options?.httpMetadata ?? {}, customMetadata: options?.customMetadata ?? {} }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const filePath = this.resolveKey(key);
    let bytes: Buffer;
    try {
      bytes = await readFile(filePath);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw cause;
    }
    let meta: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> } = {};
    try {
      meta = JSON.parse(await readFile(`${filePath}.meta.json`, "utf8")) as typeof meta;
    } catch {
      meta = {};
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return {
      size: bytes.byteLength,
      httpMetadata: meta.httpMetadata,
      customMetadata: meta.customMetadata,
      arrayBuffer: async () => buffer,
    };
  }

  async head(key: string): Promise<{ size: number } | null> {
    const filePath = this.resolveKey(key);
    try {
      return { size: (await stat(filePath)).size };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw cause;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await rm(filePath, { force: true });
    await rm(`${filePath}.meta.json`, { force: true });
  }
}

export function createArtworksStore(): ArtworksStore {
  const endpoint = process.env.R2_S3_ENDPOINT;
  const bucket = process.env.R2_S3_BUCKET;
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY;
  if (endpoint && bucket && accessKeyId && secretAccessKey) return new S3ArtworksStore(endpoint, bucket, accessKeyId, secretAccessKey);
  // 통합 테스트는 프로덕션 빌드를 그대로 띄우므로(next start) NODE_ENV가 production이다.
  // ARTWORKS_FS_DIR을 명시한 경우에만 파일 저장소를 허용하고, 실제 배포(VERCEL)에서는
  // 그 변수가 있어도 거부한다 — 자격증명 누락이 임시 디스크로 조용히 굴러가면 안 된다.
  const fsDir = process.env.ARTWORKS_FS_DIR;
  if (process.env.NODE_ENV === "production" && (!fsDir || process.env.VERCEL)) {
    throw new Error("R2 S3 자격증명(R2_S3_*)이 설정되지 않았어요.");
  }
  return new FsArtworksStore(path.resolve(fsDir || ".data/artworks-store"));
}
