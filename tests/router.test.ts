import { beforeEach, describe, expect, it } from "vitest";
import { setup } from "../src/tee/chart";
import { jsx } from "../src/tee/jsx";
import { Link, RouterView, router } from "../src/tee/router";
import { compileTSX } from "../src/tee/jsx-transform";
import { mount, tick } from "./helpers";

const Home = setup(function Home() {
  return jsx("h1", { children: "home" });
});

const About = setup(function About() {
  return jsx("h1", { children: "about" });
});

beforeEach(() => {
  location.hash = "#/";
});

describe("router", () => {
  it("switches pages with Link and does not rerun App setup", async () => {
    let apps = 0;
    const { app, host } = mount({
      ...setup(function App(self) {
        apps += 1;
        router(self, {
          routes: [
            { path: "/", component: Home },
            { path: "/about", component: About },
          ],
        });
        return jsx("main", {
          children: [jsx(Link, { to: "/about", children: "go" }), jsx(RouterView, {})],
        });
      }),
    });
    expect(host.querySelector("h1")?.textContent).toBe("home");
    expect(apps).toBe(1);
    host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await tick(app);
    expect(host.querySelector("h1")?.textContent).toBe("about");
    expect(selfPath(app)).toBe("/about");
    expect(apps).toBe(1);
  });

  it("reuses the page instance when only params change", async () => {
    let teas = 0;
    const Tea = setup(function Tea(self) {
      teas += 1;
      return jsx("h1", { children: () => self.id });
    });
    const { app, host } = mount({
      ...setup(function App(self) {
        router(self, {
          routes: [
            { path: "/", component: Home },
            { path: "/tea/:id", component: Tea },
          ],
        });
        return jsx("main", { children: jsx(RouterView, {}) });
      }),
    });
    app.data.$router.push("/tea/1");
    await tick(app);
    expect(host.querySelector("h1")?.textContent).toBe("1");
    expect(teas).toBe(1);
    app.data.$router.push("/tea/2");
    await tick(app);
    expect(host.querySelector("h1")?.textContent).toBe("2");
    expect(teas).toBe(1);
  });

  it("keeps query on $route and does not remount on same pattern", async () => {
    let teas = 0;
    const Tea = setup(function Tea(self) {
      teas += 1;
      return jsx("h1", { children: () => `${self.id}:${self.$route.query.tab ?? ""}` });
    });
    const { app, host } = mount({
      ...setup(function App(self) {
        router(self, {
          routes: [{ path: "/tea/:id", component: Tea }],
        });
        return jsx(RouterView, {});
      }),
    });
    app.data.$router.push("/tea/1?tab=leaf");
    await tick(app);
    expect(host.querySelector("h1")?.textContent).toBe("1:leaf");
    expect(app.data.$route.query.tab).toBe("leaf");
    expect(teas).toBe(1);
  });

  it("uses history.pathname when mode is history", async () => {
    history.replaceState(null, "", "/");
    location.hash = "";
    const { app, host } = mount({
      ...setup(function App(self) {
        router(self, {
          mode: "history",
          routes: [
            { path: "/", component: Home },
            { path: "/about", component: About },
          ],
        });
        return jsx(RouterView, {});
      }),
    });
    expect(host.querySelector("h1")?.textContent).toBe("home");
    app.data.$router.push("/about");
    await tick(app);
    expect(host.querySelector("h1")?.textContent).toBe("about");
    expect(app.data.$router.mode).toBe("history");
  });

  it("uses the * route when nothing else matches", async () => {
    const Miss = setup(function Miss() {
      return jsx("h1", { children: "miss" });
    });
    const { app, host } = mount({
      ...setup(function App(self) {
        router(self, {
          routes: [
            { path: "/", component: Home },
            { path: "*", component: Miss },
          ],
        });
        return jsx(RouterView, {});
      }),
    });
    app.data.$router.push("/nope");
    await tick(app);
    expect(host.querySelector("h1")?.textContent).toBe("miss");
  });

  it("injects Link and RouterView from jsx-runtime", () => {
    const js = compileTSX(
      `import { setup, router } from "tee-framework";
export default setup(function App(self) {
  router(self, { routes: [] });
  return <main><Link to="/">home</Link><RouterView /></main>;
});`,
      "App.tee",
    );
    expect(js).toMatch(/\bLink\b/);
    expect(js).toMatch(/\bRouterView\b/);
    expect(js).toContain("tee-framework/jsx-runtime");
  });
});

function selfPath(app: { data: Record<string, any> }): string {
  return app.data.$route.path;
}
