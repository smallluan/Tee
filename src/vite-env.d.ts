/// <reference types="vite/client" />

declare module "*.tee" {
  import type { TeeOptions, TagDef } from "tee";
  const sfc: TagDef & TeeOptions;
  export default sfc;
}
