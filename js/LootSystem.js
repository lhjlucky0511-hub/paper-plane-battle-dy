// 道具系统 - 对应原项目 LootField.cs
// 12种道具：急救包、弹药箱、加速、护盾、隐身、弹射、幸运折角、迷你纸飞机、折纸镖、肥皂泡泡、纸蜜蜂

const CONSTS = require('./constants')
const { randomRange, distance } = require('./utils')

// 道具类型
const LOOT_TYPES = {
  HEAL: 0,          // 急救包：回血35%
  AMMO: 1,          // 弹药箱：随机补导弹/网兜/逆抚
  BOOST: 2,         // 加速：临时速度加成
  SHIELD: 3,        // 护盾：2秒无敌
  STEALTH: 4,       // 隐身：9秒隐身
  SLINGSHOT: 5,     // 弹射：下一次加速时直线冲出+无敌
  LUCKY_FOLD: 6,    // 幸运折角：下一次撞地改为弹开
  MINI_PLANE: 7,    // 迷你纸飞机：自动追踪敌机
  ORIGAMI_DART: 8,  // 折纸镖：高速穿透
  SOAP_BUBBLE: 9,   // 肥皂泡泡：让敌机打滑
  PAPER_BEE: 10,    // 纸蜜蜂：蜂群攻击
  SHIELD_ITEM: 11   // 备用（护盾）
}

// 默认权重：Boost权重0已下架
const DEFAULT_WEIGHTS = [12, 16, 0, 10, 9, 12, 8, 14, 12, 12, 12, 10]

// 道具颜色
const LOOT_COLORS = {
  [LOOT_TYPES.HEAL]: '#E74C3C',
  [LOOT_TYPES.AMMO]: '#FF8C00',
  [LOOT_TYPES.BOOST]: '#5DADE2',
  [LOOT_TYPES.SHIELD]: '#F4D03F',
  [LOOT_TYPES.STEALTH]: '#BB8FCE',
  [LOOT_TYPES.SLINGSHOT]: '#F1948A',
  [LOOT_TYPES.LUCKY_FOLD]: '#FADBD8',
  [LOOT_TYPES.MINI_PLANE]: '#85C1E9',
  [LOOT_TYPES.ORIGAMI_DART]: '#F9E79F',
  [LOOT_TYPES.SOAP_BUBBLE]: '#AED6F1',
  [LOOT_TYPES.PAPER_BEE]: '#F7DC6F',
  [LOOT_TYPES.SHIELD_ITEM]: '#F4D03F'
}

// 道具中文名
const LOOT_NAMES = {
  [LOOT_TYPES.HEAL]: '急救包',
  [LOOT_TYPES.AMMO]: '弹药箱',
  [LOOT_TYPES.BOOST]: '加速',
  [LOOT_TYPES.SHIELD]: '护盾',
  [LOOT_TYPES.STEALTH]: '隐身',
  [LOOT_TYPES.SLINGSHOT]: '弹射',
  [LOOT_TYPES.LUCKY_FOLD]: '幸运折角',
  [LOOT_TYPES.MINI_PLANE]: '迷你纸飞机',
  [LOOT_TYPES.ORIGAMI_DART]: '折纸镖',
  [LOOT_TYPES.SOAP_BUBBLE]: '肥皂泡泡',
  [LOOT_TYPES.PAPER_BEE]: '纸蜜蜂',
  [LOOT_TYPES.SHIELD_ITEM]: '护盾'
}

const STEALTH_PITY = 8  // 保底：连续8次未出隐身则强制隐身

class LootPoint {
  constructor(x, y, type) {
    this.x = x
    this.y = y
    this.type = type
    this.available = true
    this.respawnAt = 0
    this.rotation = 0
    this.bobOffset = Math.random() * Math.PI * 2
  }
}

class LootField {
  constructor(options = {}) {
    this.points = []
    this.respawnSeconds = options.respawnSeconds || 20
    this.pickupRadius = options.pickupRadius || 35
    this.typeWeights = options.typeWeights || [...DEFAULT_WEIGHTS]
    this.typeTotal = this.typeWeights.reduce((a, b) => a + b, 0)
    this.spawnsSinceStealth = 0
    this.built = false
  }

  build(spawns) {
    this.points = []
    for (const pos of spawns) {
      const point = new LootPoint(pos.x, pos.y, this._rollType())
      this.points.push(point)
    }
    this.built = true
  }

  _rollType() {
    // 保底轮转
    const stealthIdx = LOOT_TYPES.STEALTH
    if (this.spawnsSinceStealth >= STEALTH_PITY && this.typeWeights[stealthIdx] > 0) {
      this.spawnsSinceStealth = 0
      return stealthIdx
    }

    // 权重轮盘
    let r = Math.random() * this.typeTotal
    let type = LOOT_TYPES.SHIELD
    for (let i = 0; i < this.typeWeights.length; i++) {
      r -= this.typeWeights[i]
      if (r < 0) {
        type = i
        break
      }
    }

    this.spawnsSinceStealth = type === LOOT_TYPES.STEALTH ? 0 : this.spawnsSinceStealth + 1
    return type
  }

  update(dt, planes, currentTime) {
    if (!this.built) return

    for (const point of this.points) {
      // 自转视觉
      point.rotation += 2 * dt

      // 重生
      if (!point.available && currentTime >= point.respawnAt) {
        point.type = this._rollType()
        point.available = true
      }

      if (!point.available) continue

      // 拾取判定
      for (const plane of planes) {
        if (!plane.isAlive || plane.isCrashing) continue
        if (distance(plane.x, plane.y, point.x, point.y) <= this.pickupRadius) {
          this._applyLoot(plane, point.type)
          point.available = false
          point.respawnAt = currentTime + this.respawnSeconds
          break
        }
      }
    }
  }

  _applyLoot(plane, type) {
    switch (type) {
      case LOOT_TYPES.HEAL:
        plane.health = Math.min(plane.maxHealth, plane.health + plane.maxHealth * 0.35)
        break
      case LOOT_TYPES.AMMO:
        const r = Math.random()
        if (r < 0.4) plane.missileAmmo += 1
        else if (r < 0.7) plane.netAmmo += 1
        else plane.reverseAmmo = (plane.reverseAmmo || 0) + 1
        break
      case LOOT_TYPES.BOOST:
        plane.speedBoostMul = 1.4
        plane.speedBoostTimer = 3
        break
      case LOOT_TYPES.STEALTH:
        plane.stealthTimer = 9
        break
      case LOOT_TYPES.SHIELD:
      case LOOT_TYPES.SHIELD_ITEM:
        plane.invulnTimer = Math.max(plane.invulnTimer, 2)
        break
      case LOOT_TYPES.SLINGSHOT:
        plane.slingshotArmed = true
        break
      case LOOT_TYPES.LUCKY_FOLD:
        plane.luckyFoldArmed = true
        plane.luckyFoldUsed = false
        break
      case LOOT_TYPES.MINI_PLANE:
        plane.miniPlaneAmmo = Math.min(3, (plane.miniPlaneAmmo || 0) + 1)
        break
      case LOOT_TYPES.ORIGAMI_DART:
        plane.origamiDartAmmo = Math.min(3, (plane.origamiDartAmmo || 0) + 1)
        break
      case LOOT_TYPES.SOAP_BUBBLE:
        plane.soapBubbleAmmo = Math.min(3, (plane.soapBubbleAmmo || 0) + 1)
        break
      case LOOT_TYPES.PAPER_BEE:
        plane.paperBeeAmmo = Math.min(3, (plane.paperBeeAmmo || 0) + 1)
        break
    }
  }

  // 获取最近可用道具点位置
  getNearestHint(x, y) {
    if (!this.built) return null
    let best = null
    let bestDist = Infinity
    for (const p of this.points) {
      if (!p.available) continue
      const d = distance(x, y, p.x, p.y)
      if (d < bestDist) {
        bestDist = d
        best = { x: p.x, y: p.y }
      }
    }
    return best
  }

  render(ctx, cameraX, cameraY, viewScale, currentTime) {
    if (!this.built) return

    for (const point of this.points) {
      if (!point.available) continue

      // 世界坐标转屏幕坐标
      const sx = (point.x - cameraX) * viewScale + ctx.canvas.width / 2
      const sy = (point.y - cameraY) * viewScale + ctx.canvas.height / 2
      const bob = Math.sin(currentTime * 2 + point.bobOffset) * 5

      ctx.save()
      ctx.translate(sx, sy + bob)
      ctx.rotate(point.rotation)

      // 发光背景
      const color = LOOT_COLORS[point.type] || '#FFD700'
      ctx.shadowColor = color
      ctx.shadowBlur = 15

      // 道具方块
      ctx.fillStyle = color
      ctx.fillRect(-10, -10, 20, 20)
      ctx.shadowBlur = 0

      // 边框
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(-10, -10, 20, 20)

      // 道具图标（简化）
      ctx.fillStyle = '#fff'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const icon = this._getIcon(point.type)
      ctx.fillText(icon, 0, 0)

      ctx.restore()
    }
  }

  _getIcon(type) {
    const icons = {
      [LOOT_TYPES.HEAL]: '+',
      [LOOT_TYPES.AMMO]: '弹',
      [LOOT_TYPES.BOOST]: '速',
      [LOOT_TYPES.SHIELD]: '盾',
      [LOOT_TYPES.STEALTH]: '隐',
      [LOOT_TYPES.SLINGSHOT]: '弹',
      [LOOT_TYPES.LUCKY_FOLD]: '幸',
      [LOOT_TYPES.MINI_PLANE]: '机',
      [LOOT_TYPES.ORIGAMI_DART]: '镖',
      [LOOT_TYPES.SOAP_BUBBLE]: '泡',
      [LOOT_TYPES.PAPER_BEE]: '蜂'
    }
    return icons[type] || '?'
  }
}

module.exports = {
  LootField,
  LOOT_TYPES,
  LOOT_COLORS,
  LOOT_NAMES,
  DEFAULT_WEIGHTS
}
