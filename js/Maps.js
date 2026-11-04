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

// ============ 第1章：书桌战场（俯视教室：地砖 / 课桌椅 / 吊扇 / 白板）============
const CLASSROOM = {
  id: 'classroom',
  name: '书桌战场',
  bg: '#9aa1a1',
  border: '#7f8b82',
  grid: '#8f9697',
  draw(ctx, radius, elapsed) {
    if (!this._desks) {
      const rnd = makeRandom(20240101)
      // 课桌按两列三排整齐摆放，全部朝向白板方向
      this._desks = []
      const deskCols = [-215, 215]
      const deskRows = [-170, -10, 150]
      for (let r = 0; r < deskRows.length; r++) {
        for (let c = 0; c < deskCols.length; c++) {
          this._desks.push({
            x: deskCols[c],
            y: deskRows[r],
            rot: -0.06,
            w: 128 + rnd() * 34,
            h: 44 + rnd() * 12,
            seed: rnd()
          })
        }
      }
      this._posters = []
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2
        const d = radius * (0.5 + rnd() * 0.38)
        this._posters.push({
          x: Math.cos(a) * d,
          y: Math.sin(a) * d,
          rot: (rnd() - 0.5) * 0.5,
          w: 54 + rnd() * 18,
          h: 66 + rnd() * 22
        })
      }
    }

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
