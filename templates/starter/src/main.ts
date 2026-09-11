import { Tee } from "tee-framework";
import App from "./App.tee";

Tee.create({
  el: "#app",
  ...App,
});
