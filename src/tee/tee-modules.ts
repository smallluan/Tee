export {};

declare module "*.tee" {
  import type { TeeComponent } from "./chart";
  const component: TeeComponent;
  export default component;
}
