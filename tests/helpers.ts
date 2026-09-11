import { Tee, type TeeOptions } from "tee";

export function mount(options: Omit<TeeOptions, "el"> & { el?: TeeOptions["el"] }) {
  const host = document.createElement("div");
  document.body.append(host);
  const app = Tee.create({ ...options, el: options.el ?? host });
  return { app, host };
}

export async function tick(app: { tick(): Promise<void> }) {
  await app.tick();
  await Promise.resolve();
}
