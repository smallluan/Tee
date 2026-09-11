/// <reference types="vite/client" />

declare module "*.tee" {
  import type { TagDef, TeeOptions } from "tee-framework";
  const sfc: TagDef & TeeOptions;
  export default sfc;
}
