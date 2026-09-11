import "./style.css";
import "./tags/mini-counter.tee";
import "./tags/app-window.tee";
import "./tags/tea-card.tee";
import "./tags/less-chip.tee";
import App from "./App.tee";
import { Tee } from "tee";

const app = Tee.create({
  el: "#app",
  ...App,
});

function paintMaps() {
  const snap = app.maps();
  const forward = snap.forward
    .slice(0, 28)
    .map((row) => `${row.prop}\n  → ${row.sites.map((s) => `#${s.id}:${s.kind}`).join(", ")}`)
    .join("\n\n");
  const reverse = snap.reverse
    .filter((site) => site.kind !== "computed" && site.kind !== "watch")
    .slice(0, 28)
    .map((site) => `#${site.id} ${site.kind} ${site.label}\n  ← ${(site.debugProps.join(", ") || site.props.join(", "))}\n  ${site.node}`)
    .join("\n\n");
  const forwardEl = document.getElementById("forward-map");
  const reverseEl = document.getElementById("reverse-map");
  const countEl = document.getElementById("site-count");
  if (forwardEl) forwardEl.textContent = forward || "（暂无）";
  if (reverseEl) reverseEl.textContent = reverse || "（暂无）";
  if (countEl) countEl.textContent = String(snap.reverse.length);
  const stats = app.stats();
  const runEl = document.getElementById("stat-run");
  const clockEl = document.getElementById("stat-clock");
  const equalEl = document.getElementById("stat-equal");
  const patchEl = document.getElementById("stat-patch");
  if (runEl) runEl.textContent = String(stats.run);
  if (clockEl) clockEl.textContent = String(stats.skipClock);
  if (equalEl) equalEl.textContent = String(stats.skipEqual);
  if (patchEl) patchEl.textContent = String(stats.patch);
}

app.onFlush(paintMaps);
paintMaps();
