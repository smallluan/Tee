import { describe, expect, it } from "vitest";
import App from "../bench/js-framework-benchmark/keyed/tee/src/App.tee";
import { Tee } from "tee";
import { mount, tick } from "./helpers";

function tags(root: Element, selector: string) {
  return [...root.querySelectorAll(selector)].map((el) => el.tagName.toLowerCase());
}

describe("js-framework-benchmark keyed app", () => {
  it("matches the required row HTML and stays keyed", async () => {
    const { app, host } = mount({ ...App });

    expect(host.querySelector("#run")?.id).toBe("run");
    expect(host.querySelector("#runlots")).toBeTruthy();
    expect(host.querySelector("#add")).toBeTruthy();
    expect(host.querySelector("#update")).toBeTruthy();
    expect(host.querySelector("#clear")).toBeTruthy();
    expect(host.querySelector("#swaprows")).toBeTruthy();
    expect(host.querySelector(".preloadicon")?.getAttribute("aria-hidden")).toBe("true");

    host.querySelector("#run")!.dispatchEvent(new Event("click"));
    await tick(app);

    const rows = [...host.querySelectorAll("tbody > tr")];
    expect(rows).toHaveLength(1000);
    expect(tags(rows[999], "*")).toEqual(["td", "td", "a", "td", "a", "span", "td"]);
    expect(rows[999].querySelector("td:nth-of-type(1)")?.className).toContain("col-md-1");
    expect(rows[999].querySelector("td:nth-of-type(2)")?.className).toContain("col-md-4");
    expect(rows[999].querySelector("td:nth-of-type(3)")?.className).toContain("col-md-1");
    expect(rows[999].querySelector("td:nth-of-type(4)")?.className).toContain("col-md-6");
    const icon = rows[999].querySelector("td:nth-of-type(3) > a > span");
    expect(icon?.classList.contains("glyphicon")).toBe(true);
    expect(icon?.classList.contains("glyphicon-remove")).toBe(true);
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(rows[0].querySelector("td")?.textContent).toBe("1");
    expect(rows[999].querySelector("td")?.textContent).toBe("1000");

    const second = rows[1];
    const lastSwap = rows[998];
    host.querySelector("#swaprows")!.dispatchEvent(new Event("click"));
    await tick(app);
    const afterSwap = [...host.querySelectorAll("tbody > tr")];
    expect(afterSwap[1]).toBe(lastSwap);
    expect(afterSwap[998]).toBe(second);

    const label = rows[0].querySelector("td:nth-of-type(2) a") as HTMLAnchorElement;
    const before = label.textContent;
    host.querySelector("#update")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(label.textContent).toBe(`${before} !!!`);
    expect(rows[0].querySelector("td:nth-of-type(2) a")).toBe(label);

    label.dispatchEvent(new Event("click"));
    await tick(app);
    expect(rows[0].classList.contains("danger")).toBe(true);
    expect(rows[1].classList.contains("danger")).toBe(false);

    const removed = afterSwap[1];
    removed.querySelector("td:nth-of-type(3) a")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.contains(removed)).toBe(false);
    expect(host.querySelectorAll("tbody > tr")).toHaveLength(999);

    host.querySelector("#add")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.querySelectorAll("tbody > tr")).toHaveLength(1999);

    host.querySelector("#clear")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.querySelectorAll("tbody > tr")).toHaveLength(0);
  });
});
