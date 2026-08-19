// node --import ./tests/harness/register.mjs 로 별칭 훅을 켠다.
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
