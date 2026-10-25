// DOM/window 打桩：app.js 及其依赖（ui/layout 等）在模块加载期访问 document
export function installDomStub() {
  const fakeEl = () => ({
    style: {}, dataset: {}, value: '', checked: false, disabled: false,
    className: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, remove() {}, addEventListener() {}, setPointerCapture() {},
    querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 560 }; }
  });
  const registry = {};
  globalThis.document = {
    getElementById: id => (registry[id] = registry[id] || fakeEl()),
    createElement: () => fakeEl()
  };
  globalThis.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };
  registry['sel-teach'] = Object.assign(fakeEl(), { value: 'off' });
  registry['sel-mode'] = Object.assign(fakeEl(), { value: 'pvp' });
  registry['chk-show'] = Object.assign(fakeEl(), { checked: false });
  return registry;
}
