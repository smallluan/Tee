import { Tee } from "tee-framework";
import { appOptions } from "./app.js";

Tee.create({
  el: "#main",
  ...appOptions,
});
