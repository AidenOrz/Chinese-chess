// DOM/window 打桩：app.js 及其依赖（ui/layout 等）在模块加载期访问 document
export function installDomStub() {
  // 事件监听要真的记录下来：否则“点击被拦截”这类断言会永远成立（handler 根本没跑）。
  // classList / children / innerHTML 同样要记账：否则“卡片被收起”“数字挪到边缘”这类
  // 断言写出来永远是绿的——假的打桩会让回归测试形同虚设。
  const fakeEl = () => {
    const listeners = {};
    const classes = new Set();
    const children = [];
    let html = '';
    const el = {
      style: {}, dataset: {}, value: '', checked: false, disabled: false,
      textContent: '',
      children,
      classList: {
        add(...cs) { for (const c of cs) classes.add(c); },
        remove(...cs) { for (const c of cs) classes.delete(c); },
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : !!force;
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
        contains(c) { return classes.has(c); }
      },
      setAttribute() {}, removeAttribute() {},
      appendChild(c) { children.push(c); return c; },
      remove() {}, setPointerCapture() {},
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      insertAdjacentHTML() {},
      dispatchEvent(e) { (listeners[e && e.type] || []).forEach(fn => fn(e)); return true; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      scrollIntoView() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 560 }; }
    };
    // className 与 classList 共用同一个集合（与真实 DOM 语义一致）
    Object.defineProperty(el, 'className', {
      get() { return [...classes].join(' '); },
      set(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); }
    });
    // 重设 innerHTML 时子节点一并清空（真实 DOM 行为）
    Object.defineProperty(el, 'innerHTML', {
      get() { return html; },
      set(v) { html = String(v); children.length = 0; }
    });
    return el;
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
