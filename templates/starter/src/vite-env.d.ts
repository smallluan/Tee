/// <reference types="vite/client" />

declare module "*.tee" {
  import type { TagDef, TeeOptions } from "tee";
  const sfc: TagDef & TeeOptions;
  export default sfc;
}
