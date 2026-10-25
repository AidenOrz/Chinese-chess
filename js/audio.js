/* =====================================================================
 * 音效（Web Audio 合成，无外部文件；首次用户交互后创建 AudioContext）
 * 棋子声合成方式：低通噪声瞬态（棋子与棋盘的接触“嗒”声）
 *               + 低频正弦快速衰减（木质棋盘的空腔共鸣“闷响”）
 * ===================================================================== */
let audioCtx = null;
let masterGain = null;
let noiseBuf = null;
let soundOn = true;
try { soundOn = localStorage.getItem('xq-sound') !== '0'; } catch (e) { /* 无 localStorage 环境忽略 */ }

export function isSoundOn() { return soundOn; }
export function setSoundOn(v) {
  soundOn = v;
  try { localStorage.setItem('xq-sound', v ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

function audio() {
  if (!soundOn) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { audioCtx = new AC(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
// 总输出节点（懒创建，统一控制整体音量）
function master(ctx) {
  if (!masterGain || masterGain.context !== ctx) {
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);
  }
  return masterGain;
}
// 预生成白噪声缓冲（敲击瞬态声源）
function getNoise(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
// 一次“棋子敲击”：v=力度(0~1)，bodyFreq=木质共鸣基频(Hz)，delay/dur=延迟与衰减时长(秒)
// 每次敲击的频率带轻微随机，避免机械重复感
function knock(v, bodyFreq, delay, dur) {
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + (delay || 0);
  const d = dur || 0.09;
  // ① 接触瞬态：白噪声 → 低通滤波（沉闷“嗒”）
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1000 + Math.random() * 500;
  lp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.5 * v, t0);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(0.05, d * 0.6));
  src.connect(lp); lp.connect(ng); ng.connect(master(ctx));
  src.start(t0); src.stop(t0 + 0.08);
  // ② 木质共鸣：低频正弦下滑、快速衰减（“闷”的厚度）
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const bf = bodyFreq * (0.96 + Math.random() * 0.08);
  osc.frequency.setValueAtTime(bf, t0);
  osc.frequency.exponentialRampToValueAtTime(bf * 0.55, t0 + d);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.5 * v, t0 + 0.005);
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  osc.connect(og); og.connect(master(ctx));
  osc.start(t0); osc.stop(t0 + d + 0.05);
}
// 柔和音符（仅胜负/和棋旋律使用）
function tone(freq, dur, type, vol, delay) {
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.09, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master(ctx));
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}
export const snd = {
  move()    { knock(0.8, 170, 0, 0.09); },                                            // 落子：中低“嗒”
  capture() { knock(1, 120, 0, 0.14); knock(0.45, 150, 0.06, 0.08); },                // 吃子：重击 + 二次轻碰
  check()   { knock(0.7, 215, 0, 0.09); knock(0.8, 270, 0.15, 0.1); },                // 将军：木质“叩叩”提醒
  illegal() { knock(0.6, 95, 0, 0.13); knock(0.55, 80, 0.12, 0.15); },                // 非法：低沉“闷闷”两声
  undo()    { knock(0.4, 250, 0, 0.06); },                                            // 悔棋：轻拿棋子
  win()     { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.22, 'sine', 0.09, i * 0.15)); },
  lose()    { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, 'sine', 0.09, i * 0.17)); },
  draw()    { tone(330, 0.3, 'sine', 0.09); tone(330, 0.4, 'sine', 0.09, 0.35); }
};
