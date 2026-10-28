/*
 * public/transient-tips.js — tooltips opened by a tap must close on scroll and
 * on a press outside the chart (touch screens have no mouseleave).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../public/transient-tips.js"), "utf8");

function makeEnv() {
  const document = new EventTarget();
  document.documentElement = { contains: () => true };
  document.body = { contains: () => true };
  document.hidden = false;
  const window = new EventTarget();
  vm.runInNewContext(source, { window, document, globalThis: window });
  const fire = (type, target, init = {}) => {
    const event = new Event(type);
    Object.defineProperty(event, "target", { value: target });
    Object.assign(event, init);
    document.dispatchEvent(event);
  };
  return { window, document, fire, tips: window.transientTips };
}

// a minimal element: contains itself and its listed children
function element(children = []) {
  const node = { children };
  node.contains = (other) => other === node || children.includes(other);
  return node;
}

function tooltip(tips, owner) {
  const t = { open: true, closed: 0 };
  tips.register({ owner, hide: () => { t.open = false; t.closed += 1; }, isOpen: () => t.open });
  return t;
}

describe("transient tooltips", () => {
  test("a page scroll closes an open tooltip", () => {
    const { document, fire, tips } = makeEnv();
    const t = tooltip(tips, element());
    fire("scroll", document);
    expect(t.open).toBe(false);
  });

  test("a press outside the chart closes it, a press on the chart keeps it", () => {
    const { fire, tips } = makeEnv();
    const point = {};
    const canvas = element([point]);
    const t = tooltip(tips, canvas);
    fire("pointerdown", point);
    expect(t.open).toBe(true);
    fire("pointerdown", element());
    expect(t.open).toBe(false);
  });

  test("a scroll container without the chart (auto-scrolling log) does not close it", () => {
    const { fire, tips } = makeEnv();
    const canvas = element();
    const t = tooltip(tips, canvas);
    fire("scroll", element());
    expect(t.open).toBe(true);
    fire("scroll", element([canvas]));
    expect(t.open).toBe(false);
  });

  test("only the tooltip that is open is closed (charts share one tooltip element)", () => {
    const { document, fire, tips } = makeEnv();
    const shown = tooltip(tips, element());
    const idle = tooltip(tips, element());
    idle.open = false;
    fire("scroll", document);
    expect(shown.closed).toBe(1);
    expect(idle.closed).toBe(0);
  });

  test("owner may be a function (help tips follow the current anchor); resize closes all", () => {
    const { window, fire, tips } = makeEnv();
    const anchor = element();
    const t = tooltip(tips, () => anchor);
    fire("pointerdown", anchor);
    expect(t.open).toBe(true);
    window.dispatchEvent(new Event("resize"));
    expect(t.open).toBe(false);
  });
});
