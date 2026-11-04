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

// 画一个空间四边形：a/b/c/d 为 [x, y, z]
function fillQuad3D(ctx, project, a, b, c, d, fill, stroke, lw) {
  const pts = [
    project(a[0], a[1], a[2]),
    project(b[0], b[1], b[2]),
    project(c[0], c[1], c[2]),
    project(d[0], d[1], d[2])
  ]
  tracePoly(ctx, pts)
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

// 立体盒子（课桌 / 椅子 / 讲台）
function drawBox3D(ctx, project, cx, cy, w, h, z0, z1, topColor, frontColor, sideColor) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  fillQuad3D(ctx, project, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], sideColor)
  fillQuad3D(ctx, project, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], sideColor)
  fillQuad3D(ctx, project, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], frontColor)
  fillQuad3D(ctx, project, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], topColor)
}

// 地面投影阴影
function drawShadow3D(ctx, project, cx, cy, w, h, offset, alpha) {
  const y0 = cy - h / 2 + offset
  const y1 = cy + h / 2 + offset
  const pts = [
    project(cx - w / 2, y0, 0),
    project(cx + w / 2, y0, 0),
    project(cx + w / 2, y1, 0),
    project(cx - w / 2, y1, 0)
  ]
  tracePoly(ctx, pts)
  ctx.fillStyle = 'rgba(24, 14, 6, ' + alpha + ')'
  ctx.fill()
}

// 水平圆（地面圆 / 桶盖）
function drawCircle3D(ctx, project, cx, cy, radius, z, fill, stroke, lw) {
  const pts = []
  const segments = 32
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(project(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z))
  }
  tracePoly(ctx, pts)
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

  // ============ 3D 教室（透视：地板 / 四面墙 / 白板 / 课桌椅 / 垃圾桶）============
  draw3D(ctx, scene) {
    this._init()
    const project = scene.project
    const W = scene.width
    const H = scene.height

    const HALF_X = 1000   // 房间左右半宽
    const FAR = 470       // 远墙
    const NEAR = -470     // 近端（相机身后）
    const WALL_H = 250    // 墙高

    // ---------- 天花板背景 ----------
    const bgg = ctx.createLinearGradient(0, 0, 0, H * 0.6)
    bgg.addColorStop(0, '#141719')
    bgg.addColorStop(1, '#2f373a')
    ctx.fillStyle = bgg
    ctx.fillRect(0, 0, W, H)

    // ---------- 地板 ----------
    const floorPts = [
      project(-HALF_X, NEAR, 0),
      project(HALF_X, NEAR, 0),
      project(HALF_X, FAR, 0),
      project(-HALF_X, FAR, 0)
    ]
    const floorGrad = ctx.createLinearGradient(0, H, 0, floorPts[2].y)
    floorGrad.addColorStop(0, '#b28c62')
    floorGrad.addColorStop(0.55, '#987650')
    floorGrad.addColorStop(1, '#6b5337')

    ctx.save()
    tracePoly(ctx, floorPts)
    ctx.fillStyle = floorGrad
    ctx.fill()
    ctx.clip()

    // 木地板长条（沿纵深方向的板缝）
    for (let x = -HALF_X, i = 0; x < HALF_X; x += 110, i++) {
      const x2 = Math.min(HALF_X, x + 110)
      if (i % 2 === 0) {
        fillQuad3D(ctx, project,
          [x, NEAR, 0], [x2, NEAR, 0], [x2, FAR, 0], [x, FAR, 0],
          'rgba(255, 238, 210, 0.06)')
      }
      const a = project(x, NEAR, 0)
      const b = project(x, FAR, 0)
      ctx.strokeStyle = 'rgba(64, 43, 26, 0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // 横向板缝
    for (let y = NEAR; y <= FAR; y += 176) {
      const a = project(-HALF_X, y, 0)
      const b = project(HALF_X, y, 0)
      ctx.strokeStyle = 'rgba(64, 43, 26, 0.32)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // 战场边界（画在地板上的圆形界线）
    const ringPts = []
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      ringPts.push(project(Math.cos(a) * 400, Math.sin(a) * 400, 0))
    }
    tracePoly(ctx, ringPts)
    ctx.strokeStyle = 'rgba(250, 246, 232, 0.55)'
    ctx.lineWidth = 3
    ctx.stroke()

    // 中央标记
    drawCircle3D(ctx, project, 0, 0, 30, 0, null, 'rgba(255, 255, 255, 0.35)', 2)

    ctx.restore()

    // ---------- 墙面 ----------
    fillQuad3D(ctx, project,
      [-HALF_X, NEAR, 0], [-HALF_X, FAR, 0], [-HALF_X, FAR, WALL_H], [-HALF_X, NEAR, WALL_H],
      '#6d7b76')
    fillQuad3D(ctx, project,
      [HALF_X, NEAR, 0], [HALF_X, FAR, 0], [HALF_X, FAR, WALL_H], [HALF_X, NEAR, WALL_H],
      '#65736e')
    fillQuad3D(ctx, project,
      [-HALF_X, FAR, 0], [HALF_X, FAR, 0], [HALF_X, FAR, WALL_H], [-HALF_X, FAR, WALL_H],
      '#77867f')

    // 踢脚线
    fillQuad3D(ctx, project,
      [-HALF_X, FAR, 0], [HALF_X, FAR, 0], [HALF_X, FAR, 16], [-HALF_X, FAR, 16],
      '#4f5c56')
    fillQuad3D(ctx, project,
      [-HALF_X, NEAR, 0], [-HALF_X, FAR, 0], [-HALF_X, FAR, 16], [-HALF_X, NEAR, 16],
      '#525f59')
    fillQuad3D(ctx, project,
      [HALF_X, NEAR, 0], [HALF_X, FAR, 0], [HALF_X, FAR, 16], [HALF_X, NEAR, 16],
      '#525f59')

    // 白板（远墙）
    fillQuad3D(ctx, project,
      [-300, FAR, 108], [300, FAR, 108], [300, FAR, 232], [-300, FAR, 232],
      '#e9efe9', '#3b6e91', 5)
    ctx.strokeStyle = 'rgba(90, 120, 110, 0.35)'
    ctx.lineWidth = 2
    for (let i = 0; i < 5; i++) {
      const z = 128 + i * 20
      const a = project(-260, FAR, z)
      const b = project(250 - (i % 2) * 90, FAR, z)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // 侧墙上的纸张 / 海报
    const wallPosters = [
      { side: -1, y: 120, h: 140, z: 110, w: 112 },
      { side: -1, y: 320, h: 104, z: 124, w: 88 },
      { side: 1, y: 260, h: 120, z: 116, w: 100 }
    ]
    for (const p of wallPosters) {
      const x = p.side * HALF_X
      const halfH = p.h / 2
      fillQuad3D(ctx, project,
        [x, p.y - halfH, p.z], [x, p.y + halfH, p.z],
        [x, p.y + halfH, p.z + p.w], [x, p.y - halfH, p.z + p.w],
        'rgba(238, 241, 233, 0.95)', 'rgba(70, 120, 150, 0.7)', 2)
      ctx.strokeStyle = 'rgba(110, 120, 120, 0.3)'
      ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const z = p.z + 20 + i * 24
        const a = project(x, p.y - halfH + 12, z)
        const b = project(x, p.y + halfH - 12, z)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }

    // ---------- 家具（远处先画） ----------
    const items = []
    for (const d of this._desks) {
      items.push({ kind: 'desk', x: d.x, y: d.y, w: d.w, h: d.h })
    }
    items.push({ kind: 'teacher', x: 0, y: 345, w: 330, h: 104 })
    items.push({ kind: 'bin', x: -430, y: 300, w: 58, h: 58 })
    items.sort((a, b) => b.y - a.y)

    for (const it of items) {
      if (it.kind === 'desk') {
        const chairY = it.y - it.h / 2 - 28

        drawShadow3D(ctx, project, it.x, it.y, it.w + 22, it.h + 22, 12, 0.26)
        drawBox3D(ctx, project, it.x, it.y, it.w, it.h, 0, 30, '#c9a477', '#2c6347', '#245038')

        // 桌面木纹
        ctx.strokeStyle = 'rgba(120, 88, 52, 0.35)'
        ctx.lineWidth = 1
        for (let i = 1; i < 4; i++) {
          const yy = it.y - it.h / 2 + (it.h / 4) * i
          const a = project(it.x - it.w / 2 + 10, yy, 30)
          const b = project(it.x + it.w / 2 - 10, yy, 30)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }

        // 椅子
        drawShadow3D(ctx, project, it.x, chairY, 54, 48, 10, 0.22)
        drawBox3D(ctx, project, it.x, chairY, 48, 42, 0, 18, '#438f60', '#2b6444', '#23503a')
        // 椅背（靠相机一侧，背对学生）
        fillQuad3D(ctx, project,
          [it.x - 24, chairY - 21, 18], [it.x + 24, chairY - 21, 18],
          [it.x + 24, chairY - 21, 56], [it.x - 24, chairY - 21, 56],
          '#2f7a4f', 'rgba(0, 0, 0, 0.2)', 1)

      } else if (it.kind === 'teacher') {
        drawShadow3D(ctx, project, it.x, it.y, it.w + 26, it.h + 26, 14, 0.28)
        drawBox3D(ctx, project, it.x, it.y, it.w, it.h, 0, 46, '#b58d63', '#345c46', '#2a4a39')

      } else if (it.kind === 'bin') {
        drawShadow3D(ctx, project, it.x, it.y, it.w + 10, it.h + 10, 8, 0.22)
        // 桶身
        fillQuad3D(ctx, project,
          [it.x - it.w / 2, it.y - it.h / 2, 0], [it.x + it.w / 2, it.y - it.h / 2, 0],
          [it.x + it.w / 2, it.y - it.h / 2, 78], [it.x - it.w / 2, it.y - it.h / 2, 78],
          '#8b928f')
        fillQuad3D(ctx, project,
          [it.x + it.w / 2, it.y - it.h / 2, 0], [it.x + it.w / 2, it.y + it.h / 2, 0],
          [it.x + it.w / 2, it.y + it.h / 2, 78], [it.x + it.w / 2, it.y - it.h / 2, 78],
          '#737a77')
        // 桶口
        drawCircle3D(ctx, project, it.x, it.y, it.w / 2, 78, '#a0a7a3', 'rgba(45, 50, 47, 0.6)', 2)
        drawCircle3D(ctx, project, it.x, it.y, it.w / 2 - 8, 78, null, 'rgba(40, 45, 42, 0.5)', 2)
      }
    }

    // 掉在地上的铅笔
    const pa = project(-165, -140, 1)
    const pb = project(-85, -80, 1)
    ctx.strokeStyle = 'rgba(232, 196, 86, 0.85)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(214, 120, 90, 0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pa.x + (pb.x - pa.x) * 0.16, pa.y + (pb.y - pa.y) * 0.16)
    ctx.stroke()
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
