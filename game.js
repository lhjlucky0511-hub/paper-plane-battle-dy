// 抖音小游戏入口文件
// 关键：tt.createCanvas() 第一次调用返回上屏画布，后续返回离屏画布
// 必须在这里（所有 require 之前）调用，确保获取上屏画布
if (typeof tt !== 'undefined') {
  globalThis.__rawCanvas = tt.createCanvas();
  globalThis.__rawCtx = globalThis.__rawCanvas.getContext('2d');

  // 立即预渲染背景，消除 Canvas 默认白底闪烁
  (function preSplash() {
    const c = globalThis.__rawCanvas;
    const ctx = globalThis.__rawCtx;
    const w = c.width || 890;
    const h = c.height || 400;
    const cx = w / 2, cy = h / 2;

    // 深蓝夜空渐变（与 _renderLoading 背景一致）
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#2a3f5f');
    bg.addColorStop(0.6, '#1a2538');
    bg.addColorStop(1, '#0d1320');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 固定星点（和 _renderLoading 里的位置一致）
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4})`;
      ctx.beginPath();
      ctx.arc((i * 137) % w, (i * 241) % h, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 标题（静态预画）
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(h * 0.09)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('纸飞机大战', cx, cy - 50);
    ctx.fillStyle = '#9ab';
    ctx.font = `${Math.round(h * 0.032)}px sans-serif`;
    ctx.fillText('Paper Plane Battle', cx, cy - 50 + h * 0.045);
  })();
}

require('./js/main.js');
