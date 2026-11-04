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

// ============ 第1章：书桌战场 ============
const CLASSROOM = {
  id: 'classroom',
  name: '书桌战场',
  bg: '#241c15',
  border: '#7a5a32',
  grid: '#3a2c1c',
  draw(ctx, radius) {
    if (!this._papers) {
      const rnd = makeRandom(20240101)
      this._papers = []
      for (let i = 0; i < 7; i++) {
        const angle = rnd() * Math.PI * 2
        const dist = 90 + rnd() * (radius * 0.75)
        this._papers.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          w: 70 + rnd() * 70,
          h: 50 + rnd() * 40,
          rot: (rnd() - 0.5) * 0.8
        })
      }
    }

    // 木纹横线
    ctx.strokeStyle = '#382a1a'
    ctx.lineWidth = 2
    for (let y = -radius; y <= radius; y += 46) {
      ctx.beginPath()
      ctx.moveTo(-radius, y)
      ctx.lineTo(radius, y + 6)
      ctx.stroke()
    }

    // 纸张/草稿本
    for (const p of this._papers) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = 'rgba(226,214,188,0.10)'
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.strokeStyle = 'rgba(226,214,188,0.18)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const yy = -p.h / 2 + (p.h / 4) * i
        ctx.beginPath()
        ctx.moveTo(-p.w / 2 + 6, yy)
        ctx.lineTo(p.w / 2 - 6, yy)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 铅笔（斜放）
    ctx.strokeStyle = 'rgba(240,200,90,0.35)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-radius * 0.7, radius * 0.55)
    ctx.lineTo(-radius * 0.35, radius * 0.25)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(230,120,90,0.5)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-radius * 0.72, radius * 0.57)
    ctx.lineTo(-radius * 0.68, radius * 0.52)
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
