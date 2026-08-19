/**
 * `@/…` 경로 별칭을 Node에서도 풀어 주는 ESM 훅.
 *
 * 앱 코드는 tsconfig의 `@/* → ./*` 별칭을 쓰는데, `node --test`는 tsconfig를 모른다.
 * 이 훅이 있어야 테스트가 `db/runtime.ts` 같은 앱 모듈을 그대로 불러 실제 코드를 검증한다.
 * (확장자 없는 상대 경로는 Node 타입 스트리핑이 거부하므로 후보 확장자를 붙여 본다.)
 */
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.mjs"];

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

// Next가 번들 경계를 표시하려고 쓰는 표식 패키지. 실행 시 동작이 없으므로 빈 모듈로 바꾼다.
const MARKER_PACKAGES = new Set(["server-only", "client-only"]);
const EMPTY_MODULE = new URL("./empty-module.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (MARKER_PACKAGES.has(specifier)) return { url: EMPTY_MODULE, shortCircuit: true };
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const base = path.join(ROOT, specifier.slice(2));
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (isFile(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
  }
  throw new Error(`별칭 경로를 찾지 못했어요: ${specifier}`);
}
