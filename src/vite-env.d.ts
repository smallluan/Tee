/// <reference types="vite/client" />

declare module "*.tee" {
  import type { TeeComponent } from "tee-framework";
  const component: TeeComponent;
  export default component;
}
