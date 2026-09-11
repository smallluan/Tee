import { Tee } from "tee";
import App from "./App.tee";

Tee.create({
  el: "#app",
  ...App,
});
