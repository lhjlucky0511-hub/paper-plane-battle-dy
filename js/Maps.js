// 地图主题系统 - 每个章节对应一张不同的战场地图
// 所有装饰形状用固定种子生成，保证每帧一致（不会闪烁）

// 简单确定性随机（mulberry32 变体）
function makeRandom(seed) {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = (t ^ (t >>> 15)) * (t | 1)
    t ^= t + (t ^ (t >>> 7)) * (t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 生成不规则岩石多边形
function makeRock(rnd, radius) {
  const angle = rnd() * Math.PI * 2
  const dist = Math.sqrt(rnd()) * radius * 0.86
  const cx = Math.cos(angle) * dist
  const cy = Math.sin(angle) * dist
  const size = 16 + rnd() * 42
  const points = []
  const sides = 5 + Math.floor(rnd() * 3)
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + rnd() * 0.4
    const r = size * (0.7 + rnd() * 0.5)
    points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return { points, tone: rnd() }
}

function drawPolygon(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

// ============ 3D 绘制辅助（教室地图使用）============

// 把已投影的屏幕坐标点连成闭合路径
function tracePoly(ctx, pts) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

// 空间多边形：pts 为世界坐标 [[x,y,z]...]
function fillPoly3D(ctx, project, pts, fill, stroke, lw) {
  const sp = []
  for (let i = 0; i < pts.length; i++) {
    sp.push(project(pts[i][0], pts[i][1], pts[i][2]))
  }
  tracePoly(ctx, sp)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw || 1
    ctx.stroke()
  }
}

// 空间四边形：a/b/c/d 为 [x, y, z]
function fillQuad3D(ctx, project, a, b, c, d, fill, stroke, lw) {
  fillPoly3D(ctx, project, [a, b, c, d], fill, stroke, lw)
}

// 带朝向的立方体：侧面按远近排序，顶面最后画
function drawBoxRot3D(ctx, project, cx, cy, w, d, z0, z1, yaw, cols) {
  const co = Math.cos(yaw)
  const si = Math.sin(yaw)
  const hw = w / 2
  const hd = d / 2
  const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
  const base = []
  for (let i = 0; i < 4; i++) {
    const lx = local[i][0]
    const ly = local[i][1]
    base.push([cx + lx * co - ly * si, cy + lx * si + ly * co])
  }

  const faces = []
  for (let i = 0; i < 4; i++) {
    const a = base[i]
    const b = base[(i + 1) % 4]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const front = -dy / len > 0.45   // 外法线朝相机（-y 方向）→ 正面
    faces.push({ a, b, front, mid: (a[1] + b[1]) * 0.5 })
  }
  faces.sort((p, q) => q.mid - p.mid)
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i]
    fillQuad3D(ctx, project,
      [f.a[0], f.a[1], z0], [f.b[0], f.b[1], z0],
      [f.b[0], f.b[1], z1], [f.a[0], f.a[1], z1],
      f.front ? cols.front : cols.side)
  }

  const topPts = []
  for (let i = 0; i < 4; i++) topPts.push(project(base[i][0], base[i][1], z1))
  tracePoly(ctx, topPts)
  ctx.fillStyle = cols.top
  ctx.fill()
  if (cols.edge) {
    ctx.strokeStyle = cols.edge
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

// 圆柱：近端侧面 + 顶面椭圆（垃圾桶 / 花盆 / 灯罩）
function drawCylinder3D(ctx, project, cx, cy, r, z0, z1, top, side, rim) {
  const n = 18
  const topPts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    topPts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1])
  }

  const sidePts = []
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI * 2
    sidePts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1])
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + (i / n) * Math.PI * 2
    sidePts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0])
  }
  fillPoly3D(ctx, project, sidePts, side)
  fillPoly3D(ctx, project, topPts, top, rim, 1)
}

// 地面旋转矩形阴影（阳光斜向右下）
function shadowQuad3D(ctx, project, cx, cy, w, d, yaw, alpha, offX, offY) {
  const co = Math.cos(yaw)
  const si = Math.sin(yaw)
  const hw = w / 2
  const hd = d / 2
  const pts = []
  const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
  for (let i = 0; i < 4; i++) {
    const lx = local[i][0]
    const ly = local[i][1]
    pts.push(project(cx + lx * co - ly * si + offX, cy + lx * si + ly * co + offY, 0.5))
  }
  tracePoly(ctx, pts)
  ctx.fillStyle = 'rgba(18, 11, 5, ' + alpha + ')'
  ctx.fill()
}

// 地面圆形阴影
function shadowEllipse3D(ctx, project, cx, cy, rad, alpha) {
  const p = project(cx, cy, 0.5)
  const px = project(cx + rad, cy, 0.5)
  const py = project(cx, cy + rad, 0.5)
  const rx = Math.max(2, Math.abs(px.x - p.x))
  const ry = Math.max(1.5, Math.abs(py.y - p.y))
  ctx.fillStyle = 'rgba(16, 10, 5, ' + alpha + ')'
  ctx.beginPath()
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

// 老式绿色木课桌（原版 VintageDeskBuilder）：绿漆骨架 + 橡木厚桌面 + 书格
function drawVintageDesk3D(ctx, project, U, cx, cy, yawDeg, scale, hasProps) {
  const k = U * scale
  const yaw = yawDeg * Math.PI / 180
  const co = Math.cos(yaw)
  const si = Math.sin(yaw)
  const at = (lx, ly) => [cx + (lx * co - ly * si) * k, cy + (lx * si + ly * co) * k]
  const pt3 = (lx, ly, lz) => {
    const q = at(lx, ly)
    return [q[0], q[1], lz * k]
  }
  const box = (lx, ly, w, d, z0, z1, cols) => {
    const q = at(lx, ly)
    drawBoxRot3D(ctx, project, q[0], q[1], w * k, d * k, z0 * k, z1 * k, yaw, cols)
  }

  // 桌子落在木地板上的接触阴影（阳光从窗内斜照，影偏右下）
  shadowQuad3D(ctx, project, cx, cy, 16 * k, 7.4 * k, yaw, 0.30, 2.2 * k, -1.6 * k)

  const green = { top: '#4d6f56', front: '#3f5d47', side: '#334b3a' }
  const greenDark = { top: '#405b47', front: '#354d3d', side: '#2b4032' }
  const cubby = { top: '#6a5238', front: '#463424', side: '#392a1c' }

  // 四条方腿
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(sx * 7.2, sz * 3.1, 0.78, 0.78, 0, 5.1, greenDark)
    }
  }
  // 左右侧板
  box(-7.3, 0, 0.3, 5.4, 1.3, 4.6, green)
  box(7.3, 0, 0.3, 5.4, 1.3, 4.6, green)
  // 桌下四周横梁
  box(0, 3.08, 14.9, 0.42, 4.7, 5.75, green)
  box(0, -3.08, 14.9, 0.42, 4.7, 5.75, greenDark)
  box(-7.28, 0, 0.42, 5.8, 4.7, 5.75, greenDark)
  box(7.28, 0, 0.42, 5.8, 4.7, 5.75, greenDark)
  // 书格：底板 / 背板 / 中间隔板
  box(0, -0.05, 14.3, 5.7, 2.6, 2.9, cubby)
  box(0, -2.9, 14.5, 0.25, 2.9, 4.75, cubby)
  box(-2.3, -0.05, 0.3, 5.5, 2.9, 4.75, cubby)
  // 前横撑
  box(0, 3.1, 13.4, 0.38, 1.0, 1.45, greenDark)
  // 桌面（橡木做旧）
  box(0, 0, 16, 7.4, 5.695, 6.445, {
    top: '#ab8559', front: '#8d6a44', side: '#7a5837', edge: 'rgba(56, 36, 20, 0.75)'
  })

  // ---- 桌面木纹 / 磨损 / 刻痕 ----
  const topZ = 6.52
  for (let i = 0; i < 6; i++) {
    const ly = -2.9 + i * 1.18
    const a = project(at(-7.7, ly)[0], at(-7.7, ly)[1], topZ * k)
    const b = project(at(7.7, ly)[0], at(7.7, ly)[1], topZ * k)
    ctx.strokeStyle = i % 2 ? 'rgba(78, 52, 30, 0.28)' : 'rgba(226, 198, 152, 0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  // 桌面边缘高光（近侧受光）
  const nearL = project(at(-7.9, -3.7)[0], at(-7.9, -3.7)[1], topZ * k)
  const nearR = project(at(7.9, -3.7)[0], at(7.9, -3.7)[1], topZ * k)
  ctx.strokeStyle = 'rgba(246, 220, 178, 0.32)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(nearL.x, nearL.y)
  ctx.lineTo(nearR.x, nearR.y)
  ctx.stroke()

  // 桌面上刻的涂鸦（浅刻痕 + 铅笔线）
  ctx.strokeStyle = 'rgba(58, 40, 24, 0.32)'
  ctx.lineWidth = 1
  const doodle = [[-3.6, 0.8], [-3.1, 1.4], [-2.5, 0.9], [-2.9, 0.2], [-3.4, 0.6]]
  ctx.beginPath()
  for (let i = 0; i < doodle.length; i++) {
    const p = project(at(doodle[i][0], doodle[i][1])[0], at(doodle[i][0], doodle[i][1])[1], topZ * k)
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(40, 28, 16, 0.4)'
  ctx.beginPath()
  const seamA = project(at(-9, 3.55)[0], at(-9, 3.55)[1], topZ * k)
  const seamB = project(at(9, 3.55)[0], at(9, 3.55)[1], topZ * k)
  ctx.moveTo(seamA.x, seamA.y)
  ctx.lineTo(seamB.x, seamB.y)
  ctx.stroke()

  // 桌上的铅笔（黄杆长铅笔 + 红短铅笔）与纸团
  const pencil = (x0, y0, x1, y1, color, wLocal) => {
    const a = project(at(x0, y0)[0], at(x0, y0)[1], (topZ + 0.12) * k)
    const b = project(at(x1, y1)[0], at(x1, y1)[1], (topZ + 0.12) * k)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, wLocal * k * (a.s + b.s) * 0.5)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  pencil(1.2, -1.6, 5.4, -0.9, 'rgba(238, 196, 84, 0.95)', 0.24)
  pencil(-1.4, 2.5, 1.0, 2.2, 'rgba(206, 92, 70, 0.9)', 0.2)

  const ballP = project(at(4.6, 2.3)[0], at(4.6, 2.3)[1], (topZ + 0.4) * k)
  const ballR = Math.max(1.5, 0.55 * k * ballP.s)
  ctx.fillStyle = '#eee8d8'
  ctx.beginPath()
  ctx.arc(ballP.x, ballP.y, ballR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120, 110, 92, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(ballP.x - ballR * 0.2, ballP.y + ballR * 0.2, ballR * 0.7, Math.PI * 0.9, Math.PI * 1.7)
  ctx.stroke()

  if (!hasProps) return

  // ---- 讲台桌面物件：台灯 + 书堆 + 文件夹 ----
  // 台灯底盘
  drawCylinder3D(ctx, project,
    at(-4.2, -0.4)[0], at(-4.2, -0.4)[1], 0.85 * k, 6.45 * k, 6.9 * k,
    '#33443a', '#2a3830', 'rgba(170, 178, 170, 0.5)')
  // 灯臂
  const armA = project(at(-4.2, -0.4)[0], at(-4.2, -0.4)[1], 6.9 * k)
  const armB = project(at(-2.6, -0.1)[0], at(-2.6, -0.1)[1], 10.1 * k)
  ctx.strokeStyle = '#2e3d33'
  ctx.lineWidth = Math.max(1, 0.16 * k * armB.s)
  ctx.beginPath()
  ctx.moveTo(armA.x, armA.y)
  ctx.lineTo(armB.x, armB.y)
  ctx.stroke()
  // 灯罩（斜向下的梯形）
  const shTopL = pt3(-3.4, -0.1, 10.1)
  const shTopR = pt3(-1.6, -0.1, 10.1)
  const shBotR = pt3(-1.3, -0.1, 9.1)
  const shBotL = pt3(-3.7, -0.1, 9.1)
  fillQuad3D(ctx, project, shTopL, shTopR, shBotR, shBotL, '#31503d', 'rgba(18, 26, 20, 0.7)', 1)
  // 暖光
  const glow = project(at(-2.6, -0.1)[0], at(-2.6, -0.1)[1], 8.8 * k)
  ctx.fillStyle = 'rgba(255, 219, 152, 0.16)'
  ctx.beginPath()
  ctx.ellipse(glow.x, glow.y + 2, 2.4 * k * glow.s, 1.5 * k * glow.s, 0, 0, Math.PI * 2)
  ctx.fill()

  // 书堆（三本）
  const bookCols = ['#39543a', '#7a3b32', '#b09b52']
  for (let i = 0; i < 3; i++) {
    box(3.2, 0.9, 2.6 + i * 0.15, 3.6 + i * 0.1, 6.45 + i * 0.36, 6.8 + i * 0.36, {
      top: bookCols[i], front: '#cfc4a8', side: '#b3a789'
    })
  }
  // 文件夹
  box(5.8, 1.5, 1.8, 2.6, 6.45, 6.85, {
    top: '#36506b', front: '#2c4257', side: '#263a4c', edge: 'rgba(20, 30, 42, 0.6)'
  })
}

// 绿植（左后角）：陶盆 + 立体叶片
function drawPlant3D(ctx, project, U, cx, cy) {
  const k = U
  shadowEllipse3D(ctx, project, cx, cy, 2.6 * k, 0.24)

  // 陶盆
  drawCylinder3D(ctx, project, cx, cy, 2.1 * k, 0, 2.5 * k,
    '#7c4a30', '#6a3d28', 'rgba(242, 214, 184, 0.28)')
  const soil = project(cx, cy, 2.5 * k)
  ctx.fillStyle = 'rgba(42, 30, 20, 0.85)'
  ctx.beginPath()
  ctx.ellipse(soil.x, soil.y, 1.85 * k * soil.s, 1.1 * k * soil.s, 0, 0, Math.PI * 2)
  ctx.fill()

  // 叶片（按远端先画）
  const leaves = [
    { ang: -2.1, len: 3.4, h: 7.2, w: 1.5, tone: '#2d5936' },
    { ang: -1.2, len: 3.0, h: 9.6, w: 1.3, tone: '#386b41' },
    { ang: -0.4, len: 2.4, h: 12.5, w: 1.1, tone: '#2a5232' },
    { ang: 0.4, len: 4.2, h: 11.0, w: 1.6, tone: '#39703f' },
    { ang: 1.1, len: 3.8, h: 8.0, w: 1.5, tone: '#2f5c38' },
    { ang: 1.9, len: 3.2, h: 6.2, w: 1.3, tone: '#24482c' },
    { ang: 2.8, len: 4.0, h: 9.0, w: 1.4, tone: '#35663c' },
    { ang: -2.7, len: 2.8, h: 5.4, w: 1.2, tone: '#294f31' }
  ]
  leaves.sort((a, b) => Math.sin(b.ang) - Math.sin(a.ang))
  for (const lf of leaves) {
    const bx = cx + Math.cos(lf.ang) * 0.8 * k
    const by = cy + Math.sin(lf.ang) * 0.8 * k
    const tx = cx + Math.cos(lf.ang) * lf.len * k
    const ty = cy + Math.sin(lf.ang) * lf.len * k
    const mx = (bx + tx) * 0.5
    const my = (by + ty) * 0.5
    const px = -Math.sin(lf.ang) * lf.w * k
    const py = Math.cos(lf.ang) * lf.w * k
    fillPoly3D(ctx, project, [
      [bx, by, 2.3 * k],
      [mx + px, my + py, lf.h * 0.55 * k],
      [tx, ty, lf.h * k],
      [mx - px, my - py, lf.h * 0.55 * k]
    ], lf.tone, 'rgba(18, 32, 20, 0.45)', 1)
    const tip = project(tx, ty, lf.h * k)
    const base = project(bx, by, 2.3 * k)
    ctx.strokeStyle = 'rgba(120, 168, 118, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(base.x, base.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
  }
}

// 铁皮垃圾桶（普通 / 生锈）
function drawTrash3D(ctx, project, U, cx, cy, rusty) {
  const k = U
  const r = 1.9 * k
  const h = 3.4 * k
  shadowEllipse3D(ctx, project, cx, cy, r * 1.15, 0.28)

  drawCylinder3D(ctx, project, cx, cy, r, 0, h,
    rusty ? '#8a5f47' : '#9aa0a1',
    rusty ? '#75503c' : '#82898a',
    rusty ? 'rgba(226, 196, 170, 0.35)' : 'rgba(235, 240, 240, 0.45)')

  // 桶口内圈
  const top = project(cx, cy, h)
  ctx.fillStyle = 'rgba(26, 28, 28, 0.55)'
  ctx.beginPath()
  ctx.ellipse(top.x, top.y, r * top.s * 0.84, r * top.s * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // 竖向棱线
  ctx.strokeStyle = rusty ? 'rgba(56, 36, 24, 0.4)' : 'rgba(52, 58, 60, 0.35)'
  ctx.lineWidth = 1
  for (let i = 1; i < 5; i++) {
    const a = Math.PI + (i / 5) * Math.PI
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    const p0 = project(x, y, h * 0.88)
    const p1 = project(x, y, h * 0.14)
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
  }

  // 生锈斑块
  if (rusty) {
    ctx.fillStyle = 'rgba(126, 74, 40, 0.45)'
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + 0.5 + i * 0.55
      const q = project(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, h * (0.3 + i * 0.14))
      ctx.beginPath()
      ctx.ellipse(q.x, q.y, 3.2 * q.s, 2.1 * q.s, 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // 桶里探出的皱纸
    const paper = project(cx - r * 0.3, cy + r * 0.15, h * 1.04)
    ctx.fillStyle = '#efe9d9'
    ctx.beginPath()
    ctx.arc(paper.x, paper.y, Math.max(1.5, 0.5 * k * paper.s), 0, Math.PI * 2)
    ctx.fill()
  }
}

// 气球（红 / 黄）：立体高光球 + 下垂绳
function drawBalloon3D(ctx, project, U, cx, cy, zLocal, rLocal, color, dark, phase) {
  const k = U
  const p = project(cx, cy, zLocal * k)
  const r = Math.max(3.5, rLocal * k * p.s)

  // 绳子（从球结垂到地面）
  const a = project(cx, cy, (zLocal - rLocal * 0.95) * k)
  const m = project(cx + Math.sin(phase) * 0.9 * k, cy - 1.1 * k, (zLocal - rLocal) * 0.4 * k)
  const b = project(cx + Math.sin(phase) * 1.5 * k, cy - 2.0 * k, 0.8)
  ctx.strokeStyle = 'rgba(238, 236, 226, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.quadraticCurveTo(m.x, m.y, b.x, b.y)
  ctx.stroke()

  // 球体
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.beginPath()
  ctx.ellipse(p.x - r * 0.32, p.y - r * 0.34, r * 0.3, r * 0.2, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30, 20, 20, 0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.stroke()
  // 球结
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(p.x - r * 0.16, p.y + r * 0.94)
  ctx.lineTo(p.x + r * 0.16, p.y + r * 0.94)
  ctx.lineTo(p.x, p.y + r * 1.14)
  ctx.closePath()
  ctx.fill()
}

// 中央吊扇：吊杆 + 电机 + 旋转叶片（叶片半透明，避免遮住下方漩涡）
function drawCeilingFan3D(ctx, project, U, t) {
  const k = U
  const bladeZ = 16 * k
  const rodTop = 22 * k
  const spin = t * 2.6

  // 地面叶片影子
  for (let i = 0; i < 5; i++) {
    const ang = spin + i * Math.PI * 0.4
    const cosA = Math.cos(ang)
    const sinA = Math.sin(ang)
    const shadowPts = [
      [cosA * 2.6 * k + 1.2 * k, sinA * 2.6 * k - 0.8 * k, 0.6],
      [Math.cos(ang - 0.15) * 11.5 * k + 1.2 * k, Math.sin(ang - 0.15) * 11.5 * k - 0.8 * k, 0.6],
      [Math.cos(ang + 0.15) * 11.5 * k + 1.2 * k, Math.sin(ang + 0.15) * 11.5 * k - 0.8 * k, 0.6],
      [Math.cos(ang) * 2.6 * k + 1.2 * k, Math.sin(ang) * 2.6 * k - 0.8 * k, 0.6]
    ]
    fillPoly3D(ctx, project, shadowPts, 'rgba(18, 12, 6, 0.10)')
  }

  // 吊杆
  const rodA = project(0, 0, rodTop)
  const rodB = project(0, 0, bladeZ + 2.2 * k)
  ctx.strokeStyle = 'rgba(44, 40, 34, 0.9)'
  ctx.lineWidth = Math.max(1, 0.5 * k * rodB.s)
  ctx.beginPath()
  ctx.moveTo(rodA.x, rodA.y)
  ctx.lineTo(rodB.x, rodB.y)
  ctx.stroke()

  // 电机外壳
  drawCylinder3D(ctx, project, 0, 0, 2.0 * k, bladeZ + 1.0 * k, bladeZ + 3.2 * k,
    '#5a5147', '#443c34', 'rgba(190, 184, 172, 0.4)')

  // 残余叶片（运动残影）
  for (let g = 3; g >= 1; g--) {
    for (let i = 0; i < 5; i++) {
      const ang = spin - g * 0.32 + i * Math.PI * 0.4
      fillPoly3D(ctx, project, [
        [Math.cos(ang - 0.14) * 2.6 * k, Math.sin(ang - 0.14) * 2.6 * k, bladeZ],
        [Math.cos(ang - 0.14) * 11.3 * k, Math.sin(ang - 0.14) * 11.3 * k, bladeZ - 1.6 * k],
        [Math.cos(ang + 0.14) * 11.3 * k, Math.sin(ang + 0.14) * 11.3 * k, bladeZ - 1.6 * k],
        [Math.cos(ang + 0.14) * 2.6 * k, Math.sin(ang + 0.14) * 2.6 * k, bladeZ]
      ], 'rgba(46, 40, 34, 0.10)')
    }
  }

  // 主叶片
  for (let i = 0; i < 5; i++) {
    const ang = spin + i * Math.PI * 0.4
    fillPoly3D(ctx, project, [
      [Math.cos(ang - 0.15) * 2.6 * k, Math.sin(ang - 0.15) * 2.6 * k, bladeZ],
      [Math.cos(ang - 0.15) * 11.3 * k, Math.sin(ang - 0.15) * 11.3 * k, bladeZ - 1.8 * k],
      [Math.cos(ang + 0.15) * 11.3 * k, Math.sin(ang + 0.15) * 11.3 * k, bladeZ - 1.8 * k],
      [Math.cos(ang + 0.15) * 2.6 * k, Math.sin(ang + 0.15) * 2.6 * k, bladeZ]
    ], 'rgba(56, 47, 39, 0.66)', 'rgba(28, 24, 20, 0.4)', 1)
  }

  // 中心轴
  drawCylinder3D(ctx, project, 0, 0, 1.5 * k, bladeZ, bladeZ + 1.2 * k,
    '#7a7f7e', '#565b5a', 'rgba(230, 234, 232, 0.5)')
}

// 中央传送漩涡（竖直圆环，青紫发光）
function drawVortex3D(ctx, project, U, t) {
  const k = U
  const cz = 9 * k
  const R = 4.4 * k
  const pc = project(0, 0, cz)
  const pr = project(R, 0, cz)
  const pt = project(0, 0, cz + R)
  const rx = Math.abs(pr.x - pc.x)
  const ry = Math.abs(pc.y - pt.y)

  // 地面光晕
  const fp = project(0, 0, 1)
  ctx.fillStyle = 'rgba(78, 214, 255, 0.10)'
  ctx.beginPath()
  ctx.ellipse(fp.x, fp.y, 6.5 * k * fp.s, 3.4 * k * fp.s, 0, 0, Math.PI * 2)
  ctx.fill()

  // 脉冲环
  const pulse = (t % 2.2) / 2.2
  ctx.strokeStyle = 'rgba(120, 230, 255, ' + (0.34 * (1 - pulse)) + ')'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(pc.x, pc.y, rx * (1 + pulse * 0.45), ry * (1 + pulse * 0.45), 0, 0, Math.PI * 2)
  ctx.stroke()

  // 外环
  ctx.save()
  ctx.shadowColor = 'rgba(84, 220, 255, 0.9)'
  ctx.shadowBlur = 16
  ctx.strokeStyle = 'rgba(112, 228, 255, 0.92)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(pc.x, pc.y, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(228, 252, 255, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(pc.x, pc.y, rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // 内环
  ctx.strokeStyle = 'rgba(196, 140, 255, 0.7)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(pc.x, pc.y, rx * 0.53, ry * 0.53, 0, 0, Math.PI * 2)
  ctx.stroke()

  // 三条旋转螺旋臂
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      const a = arm * Math.PI * 2 / 3 + u * 2.4 + t * 1.3
      const rr = R * (0.94 - u * 0.66)
      const q = project(Math.cos(a) * rr, 0, cz + Math.sin(a) * rr)
      if (i === 0) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    }
    ctx.strokeStyle = 'rgba(178, 132, 255, 0.55)'
    ctx.lineWidth = 1.6
    ctx.stroke()
  }

  // 核心
  ctx.save()
  ctx.shadowColor = 'rgba(150, 244, 255, 0.95)'
  ctx.shadowBlur = 12
  ctx.fillStyle = 'rgba(214, 250, 255, 0.85)'
  ctx.beginPath()
  ctx.ellipse(pc.x, pc.y, Math.max(2, rx * 0.3), Math.max(2, ry * 0.3), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ============ 第1章：书桌战场（俯视教室：地砖 / 课桌椅 / 吊扇 / 白板）============
const CLASSROOM = {
  id: 'classroom',
  name: '书桌战场',
  bg: '#9aa1a1',
  border: '#7f8b82',
  grid: '#8f9697',
  // 固定种子布局，保证每帧一致
  _init() {
    if (this._desks) return
    const rnd = makeRandom(20240101)
    // 课桌按两列三排整齐摆放，全部朝向白板方向
    this._desks = []
    const deskCols = [-285, 285]
    const deskRows = [-235, 0, 235]
    for (let r = 0; r < deskRows.length; r++) {
      for (let c = 0; c < deskCols.length; c++) {
        this._desks.push({
          x: deskCols[c],
          y: deskRows[r],
          rot: 0,
          w: 150 + rnd() * 26,
          h: 54 + rnd() * 10,
          seed: rnd()
        })
      }
    }
    this._posters = []
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2
      const d = 250 + rnd() * 120
      this._posters.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        rot: (rnd() - 0.5) * 0.5,
        w: 54 + rnd() * 18,
        h: 66 + rnd() * 22
      })
    }
  },

  draw(ctx, radius, elapsed) {
    this._init()

    // 地砖网格
    const tile = 62
    ctx.strokeStyle = 'rgba(118,126,126,0.55)'
    ctx.lineWidth = 1
    for (let x = -radius; x <= radius; x += tile) {
      ctx.beginPath()
      ctx.moveTo(x, -radius)
      ctx.lineTo(x, radius)
      ctx.stroke()
    }
    for (let y = -radius; y <= radius; y += tile) {
      ctx.beginPath()
      ctx.moveTo(-radius, y)
      ctx.lineTo(radius, y)
      ctx.stroke()
    }
    // 砖面高光
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    for (let y = -radius; y <= radius; y += tile) {
      ctx.beginPath()
      ctx.moveTo(-radius, y + 1)
      ctx.lineTo(radius, y + 1)
      ctx.stroke()
    }

    // 白板（贴着战场边缘）
    ctx.save()
    ctx.translate(-radius * 0.5, -radius * 0.66)
    ctx.rotate(-0.06)
    ctx.fillStyle = '#dfe6e0'
    ctx.fillRect(-150, -46, 300, 92)
    ctx.strokeStyle = '#3b6e91'
    ctx.lineWidth = 5
    ctx.strokeRect(-150, -46, 300, 92)
    ctx.strokeStyle = 'rgba(90,120,110,0.35)'
    ctx.lineWidth = 2
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.moveTo(-130, -30 + i * 15)
      ctx.lineTo(110 - (i % 2) * 46, -30 + i * 15)
      ctx.stroke()
    }
    ctx.restore()

    // 课桌椅（绿色铁架 + 木色桌面）
    for (const desk of this._desks) {
      ctx.save()
      ctx.translate(desk.x, desk.y)
      ctx.rotate(desk.rot)

      // 椅子
      ctx.fillStyle = 'rgba(38,92,66,0.85)'
      ctx.fillRect(-22, desk.h / 2 + 10, 44, 34)
      ctx.fillStyle = 'rgba(60,120,86,0.85)'
      ctx.fillRect(-18, desk.h / 2 + 14, 36, 26)

      // 桌架
      ctx.fillStyle = 'rgba(34,84,60,0.9)'
      ctx.fillRect(-desk.w / 2, -desk.h / 2, desk.w, desk.h)
      // 桌面
      ctx.fillStyle = desk.seed > 0.5 ? '#c8a474' : '#bb9768'
      ctx.fillRect(-desk.w / 2 + 7, -desk.h / 2 + 7, desk.w - 14, desk.h - 14)
      // 木纹
      ctx.strokeStyle = 'rgba(120,88,52,0.35)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const yy = -desk.h / 2 + (desk.h / 4) * i
        ctx.beginPath()
        ctx.moveTo(-desk.w / 2 + 10, yy)
        ctx.lineTo(desk.w / 2 - 10, yy)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 墙上的纸张 / 海报
    for (const p of this._posters) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = 'rgba(238,240,232,0.9)'
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.strokeStyle = 'rgba(60,110,150,0.7)'
      ctx.lineWidth = 2
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.strokeStyle = 'rgba(110,120,120,0.35)'
      ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const yy = -p.h / 2 + 12 + i * 10
        ctx.beginPath()
        ctx.moveTo(-p.w / 2 + 6, yy)
        ctx.lineTo(p.w / 2 - 6, yy)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 垃圾桶
    ctx.save()
    ctx.translate(-radius * 0.72, radius * 0.18)
    ctx.fillStyle = 'rgba(120,126,124,0.9)'
    ctx.beginPath()
    ctx.arc(0, 0, 17, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(60,64,62,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 11, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    // 中央吊扇（缓慢旋转）
    ctx.save()
    const spin = (elapsed || 0) * 0.9
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    ctx.beginPath()
    ctx.arc(0, 0, 86, 0, Math.PI * 2)
    ctx.fill()
    ctx.rotate(spin)
    for (let i = 0; i < 4; i++) {
      ctx.save()
      ctx.rotate(i * Math.PI / 2)
      ctx.translate(58, 0)
      ctx.scale(1, 0.26)
      ctx.fillStyle = 'rgba(74,78,82,0.55)'
      ctx.beginPath()
      ctx.arc(0, 0, 54, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()

    // 吊扇中心轴
    ctx.fillStyle = 'rgba(56,60,64,0.9)'
    ctx.beginPath()
    ctx.arc(0, 0, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(150,156,160,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 13, 0, Math.PI * 2)
    ctx.stroke()

    // 掉在地上的铅笔
    ctx.strokeStyle = 'rgba(240,200,90,0.55)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-radius * 0.6, radius * 0.62)
    ctx.lineTo(-radius * 0.32, radius * 0.5)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(230,120,90,0.75)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-radius * 0.62, radius * 0.63)
    ctx.lineTo(-radius * 0.58, radius * 0.61)
    ctx.stroke()
  },

  // ============ 3D 教室（按原版 Unity ClassroomArenaBuilder 还原）============
  // 房间局部单位：半宽 44.6、墙高 22、木地板、绿墙裙、深绿黑板、左侧三扇窗、
  // 两张老式绿色课桌 + 讲台、垃圾桶、绿植、气球、中央吊扇与传送漩涡。
  draw3D(ctx, scene) {
    this._init()
    const project = scene.project
    const W = scene.width
    const H = scene.height
    const t = scene.elapsed || 0

    const U = 470 / 44.6          // Unity 局部单位 → 战场世界单位
    const HALF = 470              // 房间半宽（世界坐标）
    const WALL_H = 22 * U         // 墙高 ≈ 232
    const FAR = HALF
    const NEAR = -HALF
    const pj = (x, z, h) => project(x * U, -z * U, h * U)

    // ---------- 天花板外景 ----------
    const bgg = ctx.createLinearGradient(0, 0, 0, H)
    bgg.addColorStop(0, '#15181a')
    bgg.addColorStop(0.55, '#2b3031')
    bgg.addColorStop(1, '#191c1d')
    ctx.fillStyle = bgg
    ctx.fillRect(0, 0, W, H)
    const topGlow = ctx.createRadialGradient(W * 0.5, -H * 0.1, 8, W * 0.5, -H * 0.1, H * 0.55)
    topGlow.addColorStop(0, 'rgba(255, 235, 194, 0.15)')
    topGlow.addColorStop(1, 'rgba(255, 235, 194, 0)')
    ctx.fillStyle = topGlow
    ctx.fillRect(0, 0, W, H * 0.55)

    // ---------- 墙面（石膏 + 绿墙裙 + 木腰线 + 踢脚线） ----------
    // 远墙 = 黑板墙（Unity -Z）
    this._wall3D(ctx, project, [-HALF, FAR], [HALF, FAR], WALL_H, '#c6bba5', '#8f8573', '#51795f')
    // 左墙 = 窗墙（背光，略暗）
    this._wall3D(ctx, project, [-HALF, NEAR], [-HALF, FAR], WALL_H, '#b2a995', '#827a69', '#4b6f58')
    // 右墙 = 宣传栏墙（受窗光，最亮）
    this._wall3D(ctx, project, [HALF, NEAR], [HALF, FAR], WALL_H, '#d0c5ae', '#98907e', '#56806a')

    // 远墙转角处压暗，强调房间纵深
    fillQuad3D(ctx, project,
      [-HALF, FAR, 0], [-HALF + 16, FAR, 0], [-HALF + 16, FAR, WALL_H], [-HALF, FAR, WALL_H],
      'rgba(28, 22, 15, 0.16)')
    fillQuad3D(ctx, project,
      [HALF - 16, FAR, 0], [HALF, FAR, 0], [HALF, FAR, WALL_H], [HALF - 16, FAR, WALL_H],
      'rgba(28, 22, 15, 0.16)')

    // ---------- 木地板（Unity 0.75m 板宽，沿 x 方向铺板） ----------
    const floorPts = [
      project(-HALF, NEAR, 0),
      project(HALF, NEAR, 0),
      project(HALF, FAR, 0),
      project(-HALF, FAR, 0)
    ]
    const floorGrad = ctx.createLinearGradient(0, H * 0.98, 0, floorPts[2].y)
    floorGrad.addColorStop(0, '#8d6a46')
    floorGrad.addColorStop(0.45, '#a07a50')
    floorGrad.addColorStop(1, '#7b5c3d')

    ctx.save()
    tracePoly(ctx, floorPts)
    ctx.fillStyle = floorGrad
    ctx.fill()
    ctx.clip()

    const plank = 62
    for (let x = -HALF, i = 0; x < HALF; x += plank, i++) {
      const x2 = Math.min(HALF, x + plank)
      // 板面明暗交替 + 局部磨损
      if (i % 2 === 0) {
        fillQuad3D(ctx, project,
          [x, NEAR, 0], [x2, NEAR, 0], [x2, FAR, 0], [x, FAR, 0],
          'rgba(255, 238, 210, 0.05)')
      }
      if (i % 5 === 1) {
        fillQuad3D(ctx, project,
          [x, NEAR, 0], [x2, NEAR, 0], [x2, FAR, 0], [x, FAR, 0],
          'rgba(64, 42, 24, 0.05)')
      }
      // 板缝
      const a = project(x, NEAR, 0)
      const b = project(x, FAR, 0)
      ctx.strokeStyle = 'rgba(62, 41, 24, 0.42)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      // 错缝的板端接缝
      const jointStart = NEAR + (i * 137) % 260
      for (let y = jointStart; y < FAR; y += 260) {
        const p0 = project(x, y, 0)
        const p1 = project(x2, y, 0)
        ctx.strokeStyle = 'rgba(58, 38, 22, 0.30)'
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.stroke()
      }
    }

    // 地板上的旧渍
    const stains = [
      { x: -250, y: 150, r: 78 },
      { x: 180, y: -140, r: 58 },
      { x: 20, y: 300, r: 96 }
    ]
    for (const st of stains) {
      const p = project(st.x, st.y, 0.4)
      const pr = project(st.x + st.r, st.y, 0.4)
      const pt = project(st.x, st.y + st.r, 0.4)
      ctx.fillStyle = 'rgba(46, 30, 17, 0.16)'
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, Math.abs(pr.x - p.x), Math.abs(pt.y - p.y), 0.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 窗光在地板上的暖色光斑（日光从左侧窗户斜射进来）
    for (const zc of [-26, 0, 26]) {
      const yc = -zc * U
      fillPoly3D(ctx, project, [
        [-44.4 * U, yc - 4.8 * U, 0.6], [-44.4 * U, yc + 4.8 * U, 0.6],
        [-20.5 * U, yc + 9.0 * U, 0.6], [-20.5 * U, yc + 0.4 * U, 0.6]
      ], 'rgba(255, 233, 178, 0.11)')
      fillPoly3D(ctx, project, [
        [-42.5 * U, yc - 2.4 * U, 0.7], [-42.5 * U, yc + 2.4 * U, 0.7],
        [-29 * U, yc + 4.4 * U, 0.7], [-29 * U, yc + 0.6 * U, 0.7]
      ], 'rgba(255, 241, 200, 0.10)')
    }

    // 天花板格栅灯在地面上的淡光池（3×2 灯盘投影）
    for (const lx of [-26, 0, 26]) {
      for (const lz of [-22, 22]) {
        const p = project(lx * U, -lz * U, 0.4)
        const pr = project(lx * U + 7.5 * U, -lz * U, 0.4)
        const pt = project(lx * U, -lz * U + 4.5 * U, 0.4)
        ctx.fillStyle = 'rgba(255, 238, 196, 0.055)'
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, Math.abs(pr.x - p.x), Math.abs(pt.y - p.y), 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 地面碎屑：纸团 + 粉笔 + 铅笔
    const litter = [
      { x: -150, y: -60, r: 12 },
      { x: 120, y: 210, r: 10 },
      { x: -320, y: 320, r: 9 }
    ]
    for (const lt of litter) {
      const p = project(lt.x, lt.y, 0.8)
      ctx.fillStyle = '#efe9d8'
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, lt.r * p.s * 0.9, lt.r * p.s * 0.65, 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(110, 100, 84, 0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    const chalkA = project(-300, 400, 0.8)
    const chalkB = project(-250, 380, 0.8)
    ctx.strokeStyle = 'rgba(244, 242, 230, 0.75)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(chalkA.x, chalkA.y)
    ctx.lineTo(chalkB.x, chalkB.y)
    ctx.stroke()
    const pnA = project(-120, -330, 1)
    const pnB = project(-40, -280, 1)
    ctx.strokeStyle = 'rgba(232, 196, 86, 0.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(pnA.x, pnA.y)
    ctx.lineTo(pnB.x, pnB.y)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(214, 120, 90, 0.9)'
    ctx.beginPath()
    ctx.moveTo(pnA.x, pnA.y)
    ctx.lineTo(pnA.x + (pnB.x - pnA.x) * 0.18, pnA.y + (pnB.y - pnA.y) * 0.18)
    ctx.stroke()

    ctx.restore()

    // 墙脚接触阴影
    fillQuad3D(ctx, project,
      [-HALF, FAR - 26, 0.3], [HALF, FAR - 26, 0.3], [HALF, FAR, 0.3], [-HALF, FAR, 0.3],
      'rgba(20, 14, 8, 0.20)')
    fillQuad3D(ctx, project,
      [-HALF + 24, NEAR, 0.3], [-HALF, NEAR, 0.3], [-HALF, FAR, 0.3], [-HALF + 24, FAR, 0.3],
      'rgba(20, 14, 8, 0.18)')
    fillQuad3D(ctx, project,
      [HALF - 24, NEAR, 0.3], [HALF, NEAR, 0.3], [HALF, FAR, 0.3], [HALF - 24, FAR, 0.3],
      'rgba(20, 14, 8, 0.18)')

    // ---------- 远墙细节：黑板 / 插座 ----------
    const boardQuad = (x0, x1, h0, h1, fill, stroke, lw) => {
      const pts = [pj(x0, -44.05, h0), pj(x1, -44.05, h0), pj(x1, -44.05, h1), pj(x0, -44.05, h1)]
      tracePoly(ctx, pts)
      ctx.fillStyle = fill
      ctx.fill()
      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lw || 1
        ctx.stroke()
      }
    }
    // 木框
    boardQuad(-15, 15, 4.3, 17.0, '#5b4029', '#382514', 2)
    // 黑板面（深绿）
    const boardTop = pj(0, -43.9, 16)
    const boardBot = pj(0, -43.9, 5.3)
    const boardGrad = ctx.createLinearGradient(0, boardTop.y, 0, boardBot.y)
    boardGrad.addColorStop(0, '#224635')
    boardGrad.addColorStop(0.6, '#1d3c2d')
    boardGrad.addColorStop(1, '#254a39')
    const boardPts = [pj(-14, -43.88, 5.3), pj(14, -43.88, 5.3), pj(14, -43.88, 16), pj(-14, -43.88, 16)]
    tracePoly(ctx, boardPts)
    ctx.fillStyle = boardGrad
    ctx.fill()
    ctx.strokeStyle = 'rgba(10, 22, 16, 0.6)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 黑板擦痕（横向灰白粉笔灰）
    for (let i = 0; i < 4; i++) {
      const p = pj(-6.5 + i * 4.2, -43.8, 8.4 + i * 1.6)
      ctx.fillStyle = 'rgba(222, 232, 224, 0.07)'
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, 18 - i * 2.0, 3.2, 0.05, 0, Math.PI * 2)
      ctx.fill()
    }
    // 黑板上的粉笔画：纸飞机 + 虚线航迹
    ctx.strokeStyle = 'rgba(238, 242, 234, 0.55)'
    ctx.lineWidth = 1
    const plane1 = pj(-4.8, -43.8, 13.4)
    const plane2 = pj(-7.7, -43.8, 10.8)
    const plane3 = pj(-2.9, -43.8, 10.2)
    ctx.beginPath()
    ctx.moveTo(plane1.x, plane1.y)
    ctx.lineTo(plane2.x, plane2.y)
    ctx.lineTo(plane3.x, plane3.y)
    ctx.lineTo(plane1.x, plane1.y)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(238, 242, 234, 0.32)'
    for (let i = 0; i < 5; i++) {
      const a = pj(-8.5 + i * 1.2, -43.8, 8.2 + i * 0.5)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(a.x + 5, a.y + 1)
      ctx.stroke()
    }

    // 粉笔槽（凸出黑板的一条木托板）
    fillQuad3D(ctx, project,
      [-15 * U, -43.5 * U, 4.85 * U], [15 * U, -43.5 * U, 4.85 * U],
      [15 * U, -44.05 * U, 4.85 * U], [-15 * U, -44.05 * U, 4.85 * U],
      '#6d4d2e')
    fillQuad3D(ctx, project,
      [-15 * U, -43.5 * U, 4.25 * U], [15 * U, -43.5 * U, 4.25 * U],
      [15 * U, -43.5 * U, 4.85 * U], [-15 * U, -43.5 * U, 4.85 * U],
      '#4c3420')
    // 槽上的粉笔与板擦
    const chalk1 = pj(-9.5, -43.4, 4.95)
    const chalk2 = pj(2.8, -43.4, 4.95)
    ctx.fillStyle = 'rgba(246, 244, 232, 0.9)'
    ctx.beginPath()
    ctx.ellipse(chalk1.x, chalk1.y, 4, 1.4, 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(238, 214, 150, 0.9)'
    ctx.beginPath()
    ctx.ellipse(chalk2.x, chalk2.y, 3.4, 1.2, -0.1, 0, Math.PI * 2)
    ctx.fill()
    const eraser = pj(10.5, -43.35, 4.95)
    const eraserR = pj(12.6, -43.35, 4.95)
    ctx.fillStyle = '#30373a'
    ctx.fillRect(eraser.x, eraser.y - 2, Math.abs(eraserR.x - eraser.x), 4)
    ctx.fillStyle = '#9aa6a8'
    ctx.fillRect(eraser.x, eraser.y - 4, Math.abs(eraserR.x - eraser.x), 2)

    // 插座（远墙左右各一个）
    for (const sx of [-38.5, 38.5]) {
      boardQuad(sx - 1.1, sx + 1.1, 6.2, 8.0, '#ddd8c8', 'rgba(120, 118, 104, 0.5)', 1)
    }

    // ---------- 左墙细节：三扇窗（Unity z=-26 / 0 / 26） ----------
    for (const zc of [-26, 0, 26]) {
      const yc = -zc * U
      const xw = -44.5 * U
      const yl = yc - 4.8 * U
      const yr = yc + 4.8 * U
      const hb = 8.6 * U
      const ht = 17.4 * U
      // 窗框
      fillQuad3D(ctx, project, [xw, yl, hb], [xw, yr, hb], [xw, yr, ht], [xw, yl, ht], '#d9d8cf')
      // 玻璃
      const gl = yc - 4.2 * U
      const gr = yc + 4.2 * U
      const gh0 = 9.2 * U
      const gh1 = 16.8 * U
      fillQuad3D(ctx, project, [xw - 2, gl, gh0], [xw - 2, gr, gh0], [xw - 2, gr, gh1], [xw - 2, gl, gh1], 'rgba(120, 146, 158, 0.5)')
      const glTop = project(xw - 2, yc, gh1)
      const glBot = project(xw - 2, yc, gh0)
      const glGrad = ctx.createLinearGradient(0, glTop.y, 0, glBot.y)
      glGrad.addColorStop(0, '#e8f1f4')
      glGrad.addColorStop(0.6, '#cfdfe7')
      glGrad.addColorStop(1, '#b8ccd7')
      fillQuad3D(ctx, project, [xw - 3, gl, gh0], [xw - 3, gr, gh0], [xw - 3, gr, gh1], [xw - 3, gl, gh1], glGrad)
      // 天空反光斜条
      fillQuad3D(ctx, project,
        [xw - 4, yc - 3.0 * U, gh0 + 1.2 * U], [xw - 4, yc - 1.4 * U, gh0 + 1.2 * U],
        [xw - 4, yc + 1.2 * U, gh1 - 1.2 * U], [xw - 4, yc + 2.8 * U, gh1 - 1.2 * U],
        'rgba(255, 255, 255, 0.22)')
      // 十字窗棂
      fillQuad3D(ctx, project,
        [xw - 5, yc - 0.18 * U, gh0], [xw - 5, yc + 0.18 * U, gh0],
        [xw - 5, yc + 0.18 * U, gh1], [xw - 5, yc - 0.18 * U, gh1], '#e4e2d8')
      fillQuad3D(ctx, project,
        [xw - 5, gl, 12.75 * U], [xw - 5, gr, 12.75 * U],
        [xw - 5, gr, 13.15 * U], [xw - 5, gl, 13.15 * U], '#e4e2d8')
      // 窗台（凸进室内）
      fillQuad3D(ctx, project,
        [xw, yl - 0.3 * U, 8.85 * U], [-43.2 * U, yl - 0.3 * U, 8.85 * U],
        [-43.2 * U, yr + 0.3 * U, 8.85 * U], [xw, yr + 0.3 * U, 8.85 * U], '#e6e3d8')
      fillQuad3D(ctx, project,
        [-43.2 * U, yl - 0.3 * U, 8.45 * U], [-43.2 * U, yr + 0.3 * U, 8.45 * U],
        [-43.2 * U, yr + 0.3 * U, 8.85 * U], [-43.2 * U, yl - 0.3 * U, 8.85 * U], '#c7c3b4')
      // 蓝色窗帘盒
      fillQuad3D(ctx, project,
        [xw - 3, yl - 0.5 * U, ht], [xw - 3, yr + 0.5 * U, ht],
        [xw - 3, yr + 0.5 * U, 18.6 * U], [xw - 3, yl - 0.5 * U, 18.6 * U], '#8fa6bd')
      ctx.strokeStyle = 'rgba(96, 116, 136, 0.55)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const pa = project(xw - 4, yl - 0.5 * U + i * (yr - yl + U) / 4, ht)
        const pb = project(xw - 4, yl - 0.5 * U + i * (yr - yl + U) / 4, 18.6 * U)
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
      }
    }

    // ---------- 右墙细节：两块宣传栏（Unity z=-18 / +14） ----------
    for (const pk of [
      { z: -18, accent: '#b5524a' },
      { z: 14, accent: '#4a6f9b' }
    ]) {
      const yc = -pk.z * U
      const xw = 44.55 * U
      const yl = yc - 3.5 * U
      const yr = yc + 3.5 * U
      const hb = 7.6 * U
      const ht = 16.4 * U
      fillQuad3D(ctx, project, [xw, yl, hb], [xw, yr, hb], [xw, yr, ht], [xw, yl, ht], '#6d4a2d', 'rgba(40, 26, 14, 0.6)', 2)
      fillQuad3D(ctx, project,
        [xw - 2, yl + 0.5 * U, hb + 0.5 * U], [xw - 2, yr - 0.5 * U, hb + 0.5 * U],
        [xw - 2, yr - 0.5 * U, ht - 0.5 * U], [xw - 2, yl + 0.5 * U, ht - 0.5 * U], '#b7895c')
      ctx.strokeStyle = pk.accent
      ctx.lineWidth = 3
      const corners = [
        project(xw - 3, yl + 0.5 * U, hb + 0.5 * U), project(xw - 3, yr - 0.5 * U, hb + 0.5 * U),
        project(xw - 3, yr - 0.5 * U, ht - 0.5 * U), project(xw - 3, yl + 0.5 * U, ht - 0.5 * U)
      ]
      tracePoly(ctx, corners)
      ctx.stroke()
      // 钉在板上的纸
      for (let i = 0; i < 3; i++) {
        const py = yc - 2.2 * U + i * 2.1 * U
        fillQuad3D(ctx, project,
          [xw - 3, py, 9.2 * U], [xw - 3, py + 1.5 * U, 9.2 * U],
          [xw - 3, py + 1.5 * U, 12.4 * U], [xw - 3, py, 12.4 * U],
          'rgba(246, 244, 232, 0.95)')
        ctx.strokeStyle = 'rgba(110, 108, 96, 0.4)'
        ctx.lineWidth = 1
        for (let k = 1; k < 3; k++) {
          const a = project(xw - 4, py + 0.25 * U, 9.2 * U + k * 0.9 * U)
          const b = project(xw - 4, py + 1.25 * U, 9.2 * U + k * 0.9 * U)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }

    // ---------- 家具与道具（按纵深从远到近绘制）----------
    const items = []
    const add = (y, fn) => items.push({ y: y, draw: fn })

    // 远墙右角气球（Unity 26,-38）
    add(400.5, () => {
      shadowEllipse3D(ctx, project, 274, 400, 24, 0.15)
      drawBalloon3D(ctx, project, U, 26 * U, 38 * U, 9.0, 1.5, '#c8413c', '#8d2a27', 0.6)
      drawBalloon3D(ctx, project, U, 28 * U, 37 * U, 10.3, 1.35, '#e6c84a', '#a68d2c', 1.7)
    })
    // 讲台（Unity 14,-34，放大 1.4，带台灯/书堆/文件夹）
    add(358.3, () => drawVintageDesk3D(ctx, project, U, 14 * U, 34 * U, 0, 1.4, true))
    // 课桌 A（Unity -26,-20，yaw -12°）
    add(210.8, () => drawVintageDesk3D(ctx, project, U, -26 * U, 20 * U, -12, 1, false))
    // 绿植（Unity -40,-8）
    add(84.3, () => drawPlant3D(ctx, project, U, -40 * U, 8 * U))
    // 垃圾桶（Unity 34,-4）
    add(42.2, () => drawTrash3D(ctx, project, U, 34 * U, 4 * U, false))
    // 中央吊扇（Unity 0,22,0）
    add(0, () => drawCeilingFan3D(ctx, project, U, t))
    // 中央传送漩涡（Unity 0,9,0）
    add(0, () => drawVortex3D(ctx, project, U, t))
    // 课桌 B（Unity 24,18，yaw 35°）
    add(-189.7, () => drawVintageDesk3D(ctx, project, U, 24 * U, -18 * U, 35, 1, false))
    // 生锈垃圾桶（Unity -36,22）
    add(-231.8, () => drawTrash3D(ctx, project, U, -36 * U, -22 * U, true))

    items.sort((a, b) => b.y - a.y)
    for (let i = 0; i < items.length; i++) items[i].draw()

    // 轻微暗角，聚焦中央战场
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.28, W * 0.5, H * 0.55, H * 1.05)
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vig.addColorStop(0.72, 'rgba(0, 0, 0, 0)')
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.26)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)
  },

  // 单面墙：石膏渐变 + 绿墙裙 + 木腰线 + 踢脚线
  _wall3D(ctx, project, a, b, wallH, topColor, bottomColor, dadoColor) {
    const U = 470 / 44.6
    const hDado = 3.4 * U
    const hRail = 3.8 * U
    const hBase = 1.1 * U

    // 石膏墙（墙裙以上）
    const topMid = project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, wallH)
    const botMid = project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, hDado)
    const wallGrad = ctx.createLinearGradient(0, topMid.y, 0, botMid.y)
    wallGrad.addColorStop(0, topColor)
    wallGrad.addColorStop(0.7, topColor)
    wallGrad.addColorStop(1, bottomColor)
    fillQuad3D(ctx, project,
      [a[0], a[1], hDado], [b[0], b[1], hDado],
      [b[0], b[1], wallH], [a[0], a[1], wallH], wallGrad)

    // 绿墙裙（Unity paintGreen）
    fillQuad3D(ctx, project,
      [a[0], a[1], hBase], [b[0], b[1], hBase],
      [b[0], b[1], hDado], [a[0], a[1], hDado], dadoColor)
    fillQuad3D(ctx, project,
      [a[0], a[1], hBase], [b[0], b[1], hBase],
      [b[0], b[1], hBase + 5], [a[0], a[1], hBase + 5],
      'rgba(20, 34, 26, 0.28)')

    // 木质踢脚线
    fillQuad3D(ctx, project,
      [a[0], a[1], 0], [b[0], b[1], 0],
      [b[0], b[1], hBase], [a[0], a[1], hBase], '#40311f')

    // 木腰线
    fillQuad3D(ctx, project,
      [a[0], a[1], hDado], [b[0], b[1], hDado],
      [b[0], b[1], hRail], [a[0], a[1], hRail], '#6b4a2a')
    fillQuad3D(ctx, project,
      [a[0], a[1], hRail - 2], [b[0], b[1], hRail - 2],
      [b[0], b[1], hRail], [a[0], a[1], hRail], 'rgba(255, 238, 206, 0.20)')

    // 墙脚阴影
    fillQuad3D(ctx, project,
      [a[0], a[1], 0], [b[0], b[1], 0],
      [b[0], b[1], hBase + 2], [a[0], a[1], hBase + 2],
      'rgba(12, 9, 6, 0.12)')
  }
}

// ============ 第2章：遗迹迷途 ============
const CANYON = {
  id: 'canyon',
  name: '遗迹迷途',
  bg: '#161d1a',
  border: '#4e7a55',
  grid: '#22302a',
  draw(ctx, radius) {
    if (!this._rocks) {
      const rnd = makeRandom(77213)
      this._rocks = []
      for (let i = 0; i < 26; i++) this._rocks.push(makeRock(rnd, radius))
    }

    // 裂隙/路径
    ctx.strokeStyle = 'rgba(90,140,110,0.22)'
    ctx.lineWidth = 3
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius)
      ctx.stroke()
    }

    // 岩石
    for (const rock of this._rocks) {
      ctx.fillStyle = rock.tone > 0.5 ? 'rgba(58,72,58,0.55)' : 'rgba(44,56,46,0.55)'
      ctx.strokeStyle = 'rgba(120,150,120,0.30)'
      ctx.lineWidth = 1.5
      drawPolygon(ctx, rock.points)
    }

    // 中心遗迹符文环
    ctx.strokeStyle = 'rgba(120,208,160,0.45)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, 96, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 104, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ============ 第3章：星核决战 ============
const STAR_CORE = {
  id: 'starcore',
  name: '星核决战',
  bg: '#0a0818',
  border: '#6a5aa8',
  grid: '#191433',
  draw(ctx, radius) {
    if (!this._stars) {
      const rnd = makeRandom(993811)
      this._stars = []
      for (let i = 0; i < 90; i++) {
        const angle = rnd() * Math.PI * 2
        const dist = Math.sqrt(rnd()) * radius
        this._stars.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          r: 0.8 + rnd() * 1.8,
          a: 0.25 + rnd() * 0.6
        })
      }
      this._nebulae = []
      for (let i = 0; i < 4; i++) {
        const angle = rnd() * Math.PI * 2
        const dist = radius * (0.35 + rnd() * 0.45)
        this._nebulae.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          r: 60 + rnd() * 70
        })
      }
    }

    // 星云（同心圆叠加模拟柔光）
    for (const n of this._nebulae) {
      for (let i = 3; i >= 1; i--) {
        ctx.fillStyle = `rgba(120,90,220,${0.05 * i})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * (i / 3), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 星点
    for (const s of this._stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.a})`
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // 中心星核
    for (let i = 4; i >= 1; i--) {
      ctx.fillStyle = `rgba(140,110,255,${0.08 * i})`
      ctx.beginPath()
      ctx.arc(0, 0, 40 * i, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(180,160,255,0.45)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 78, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ============ 第4章：都市峡谷 ============
const CITY = {
  id: 'city',
  name: '都市峡谷',
  bg: '#131a26',
  border: '#3d6b96',
  grid: '#1c2836',
  draw(ctx, radius) {
    if (!this._blocks) {
      const rnd = makeRandom(550127)
      this._blocks = []
      // 环形街区：3 圈楼块，中间留出街道
      for (let ring = 0; ring < 3; ring++) {
        const ringR = 110 + ring * 110
        const count = 8 + ring * 3
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + ring * 0.35
          if (rnd() > 0.88) continue
          const w = 34 + rnd() * 40
          const h = 28 + rnd() * 34
          this._blocks.push({
            x: Math.cos(a) * ringR,
            y: Math.sin(a) * ringR,
            w, h,
            rot: a,
            tall: rnd()
          })
        }
      }
    }

    // 街道
    ctx.strokeStyle = 'rgba(70,120,170,0.20)'
    ctx.lineWidth = 4
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * -radius, Math.sin(a) * -radius)
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius)
      ctx.stroke()
    }

    // 楼块
    for (const b of this._blocks) {
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.rot)
      ctx.fillStyle = b.tall > 0.5 ? 'rgba(40,58,84,0.75)' : 'rgba(30,44,64,0.75)'
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = 'rgba(96,150,210,0.35)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      // 楼顶灯
      if (b.tall > 0.75) {
        ctx.fillStyle = 'rgba(255,205,110,0.5)'
        ctx.fillRect(-3, -3, 6, 6)
      }
      ctx.restore()
    }
  }
}

const MAP_THEMES = {
  classroom: CLASSROOM,
  canyon: CANYON,
  starcore: STAR_CORE,
  city: CITY
}

const DEFAULT_MAP_ID = 'classroom'

function getMapTheme(mapId) {
  return MAP_THEMES[mapId] || MAP_THEMES[DEFAULT_MAP_ID]
}

module.exports = {
  MAP_THEMES,
  DEFAULT_MAP_ID,
  getMapTheme
}
