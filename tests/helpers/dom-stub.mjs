// DOM/window 打桩：app.js 及其依赖（ui/layout 等）在模块加载期访问 document
export function installDomStub() {
  // 事件监听要真的记录下来：否则“点击被拦截”这类断言会永远成立（handler 根本没跑）
  const fakeEl = () => {
    const listeners = {};
    return {
    style: {}, dataset: {}, value: '', checked: false, disabled: false,
    className: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {},
    appendChild() {}, remove() {}, setPointerCapture() {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    insertAdjacentHTML() {},
    dispatchEvent(e) { (listeners[e && e.type] || []).forEach(fn => fn(e)); return true; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 560 }; }
    };
  };
  const registry = {};
  const docListeners = {};
  globalThis.document = {
    getElementById: id => (registry[id] = registry[id] || fakeEl()),
    createElement: () => fakeEl(),
    querySelectorAll: () => [],
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    dispatchEvent(e) { (docListeners[e.type] || []).forEach(fn => fn(e)); return true; }
  };
  const winListeners = {};
  globalThis.window = {
    innerWidth: 1200, innerHeight: 800,
    addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
    dispatchEvent(e) { (winListeners[e.type] || []).forEach(fn => fn(e)); return true; }
  };
  registry['sel-teach'] = Object.assign(fakeEl(), { value: 'off' });
  registry['sel-mode'] = Object.assign(fakeEl(), { value: 'pvp' });
  registry['chk-show'] = Object.assign(fakeEl(), { checked: false });
  return registry;
}
