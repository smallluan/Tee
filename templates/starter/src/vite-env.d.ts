/// <reference types="vite/client" />

declare module "*.tee" {
  import type { TagDef, TeeOptions } from "tee-framework";
  const mod: TagDef & TeeOptions;
  export default mod;
}
