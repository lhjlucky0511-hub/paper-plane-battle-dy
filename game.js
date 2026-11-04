// 抖音小游戏入口文件
// 关键：tt.createCanvas() 第一次调用返回上屏画布，后续返回离屏画布
// 必须在这里（所有 require 之前）调用，确保获取上屏画布
if (typeof tt !== 'undefined') {
  globalThis.__rawCanvas = tt.createCanvas();
  globalThis.__rawCtx = globalThis.__rawCanvas.getContext('2d');
}

require('./js/main.js');
