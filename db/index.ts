import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { bindings } from "./runtime";

export function getDb() {
  return drizzle(bindings().DB, { schema });
}
