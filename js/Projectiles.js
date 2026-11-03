// 子弹类 - 机炮/导弹/网兜的基类
const CONSTS = require('./constants')
const { distance, normalizeAngle, angleDiff } = require('./utils')

// 机炮子弹
class Spit {
  constructor(options) {
    this.x = options.x
    this.y = options.y
    this.vx = options.vx
    this.vy = options.vy
    this.owner = options.owner
    this.life = CONSTS.SPIT.LIFE
    this.radius = CONSTS.SPIT.RADIUS * 3  // 放大到像素
    this.damage = CONSTS.SPIT.DAMAGE
    this.alive = true
  }

  update(dt) {
    if (!this.alive) return

    this.x += this.vx * dt * 10
    this.y += this.vy * dt * 10
    this.life -= dt

    if (this.life <= 0) {
      this.alive = false
    }
  }

  checkCollision(plane) {
    if (!this.alive || !plane.isAlive) return false
    if (plane === this.owner) return false
    if (plane.invulnTimer > 0) return false

    const dist = distance(this.x, this.y, plane.x, plane.y)
    return dist < CONSTS.PLANE.RADIUS + this.radius
  }

  render(ctx, screenX, screenY) {
    if (!this.alive) return

    const tailX = screenX - this.vx * 2
    const tailY = screenY - this.vy * 2

    // 发光效果
    ctx.strokeStyle = CONSTS.COLORS.BULLET
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(screenX, screenY)
    ctx.stroke()

    // 子弹头
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(screenX, screenY, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 追踪导弹
class Missile {
  constructor(options) {
    this.x = options.x
    this.y = options.y
    this.vx = options.vx
    this.vy = options.vy
    this.yaw = options.yaw || Math.atan2(options.vy, options.vx)
    this.target = options.target
    this.owner = options.owner
    this.life = CONSTS.MISSILE.LIFE
    this.alive = true
    this.exploding = false
    this.explosionTimer = 0
    this.explosionMaxTimer = 0.3
    this.damage = CONSTS.MISSILE.DAMAGE
    this.turnRate = CONSTS.MISSILE.TURN_RATE * Math.PI / 180
    this.speed = CONSTS.MISSILE.SPEED
  }

  update(dt, allPlanes) {
    if (!this.alive) return

    if (this.exploding) {
      this.explosionTimer += dt
      if (this.explosionTimer >= this.explosionMaxTimer) {
        this.alive = false
      }
      return
    }

    // 更新目标（支持目标死亡后切换到最近目标）
    if (!this.target || !this.target.isAlive) {
      this.target = this._findNearestTarget(allPlanes)
      if (!this.target) {
        // 无目标时继续直线飞行
      }
    }

    // 追踪目标
    if (this.target && this.target.isAlive) {
      const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x)
      const diff = angleDiff(this.yaw, targetAngle)
      const maxTurn = this.turnRate * dt
      
      if (Math.abs(diff) > maxTurn) {
        this.yaw += Math.sign(diff) * maxTurn
      } else {
        this.yaw = targetAngle
      }
    }

    // 更新速度向量
    this.vx = Math.cos(this.yaw) * this.speed
    this.vy = Math.sin(this.yaw) * this.speed

    // 更新位置
    this.x += this.vx * dt * 10
    this.y += this.vy * dt * 10

    // 检测命中
    if (this.target && this.target.isAlive) {
      const dist = distance(this.x, this.y, this.target.x, this.target.y)
      if (dist < CONSTS.PLANE.RADIUS + 8) {
        this._explode()
        return { hit: this.target }
      }
    }

    // 过期
    this.life -= dt
    if (this.life <= 0) {
      this._explode()
    }

    // 检测与其他飞机的碰撞
    if (allPlanes) {
      for (const plane of allPlanes) {
        if (plane !== this.owner && plane.isAlive && 
            distance(this.x, this.y, plane.x, plane.y) < CONSTS.PLANE.RADIUS + 8) {
          this._explode()
          return { hit: plane }
        }
      }
    }

    return null
  }

  _findNearestTarget(planes) {
    let nearest = null
    let minDist = Infinity

    for (const plane of planes) {
      if (plane === this.owner || !plane.isAlive) continue
      const d = distance(this.x, this.y, plane.x, plane.y)
      if (d < minDist) {
        minDist = d
        nearest = plane
      }
    }

    return nearest
  }

  _explode() {
    if (this.exploding) return
    this.exploding = true
    this.explosionTimer = 0
  }

  getExplosionDamage() {
    if (!this.exploding) return 0
    return this.damage * (1 - this.explosionTimer / this.explosionMaxTimer) * 0.5
  }

  checkExplosionDamage(plane) {
    if (!this.exploding || plane === this.owner) return false
    const dist = distance(this.x, this.y, plane.x, plane.y)
    return dist < CONSTS.MISSILE.EXPLOSION_RADIUS
  }

  render(ctx, screenX, screenY) {
    if (!this.alive) return

    if (this.exploding) {
      // 爆炸效果
      const progress = this.explosionTimer / this.explosionMaxTimer
      const radius = CONSTS.MISSILE.EXPLOSION_RADIUS * progress
      
      ctx.globalAlpha = 1 - progress
      ctx.fillStyle = '#FF6B35'
      ctx.beginPath()
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#FFD700'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.globalAlpha = 1
      return
    }

    ctx.save()
    ctx.translate(screenX, screenY)
    ctx.rotate(this.yaw + Math.PI / 2)

    // 导弹主体
    ctx.fillStyle = CONSTS.COLORS.MISSILE
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.lineTo(4, 6)
    ctx.lineTo(0, 4)
    ctx.lineTo(-4, 6)
    ctx.closePath()
    ctx.fill()

    // 尾焰
    ctx.fillStyle = 'rgba(255, 100, 0, 0.8)'
    const flameLen = 8 + Math.random() * 6
    ctx.beginPath()
    ctx.moveTo(-3, 6)
    ctx.lineTo(0, 6 + flameLen)
    ctx.lineTo(3, 6)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }
}

// 网兜
class Net {
  constructor(options) {
    this.x = options.x
    this.y = options.y
    this.vx = options.vx
    this.vy = options.vy
    this.target = options.target
    this.owner = options.owner
    this.life = CONSTS.NET.LIFE
    this.alive = true
    this.yaw = Math.atan2(options.vy, options.vx)
  }

  update(dt) {
    if (!this.alive) return

    // 追踪目标
    if (this.target && this.target.isAlive) {
      const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x)
      this.yaw = angleDiff(this.yaw, targetAngle) * 0.3 + this.yaw * 0.7
      
      const speed = CONSTS.NET.SPEED
      this.vx = Math.cos(this.yaw) * speed
      this.vy = Math.sin(this.yaw) * speed
    }

    this.x += this.vx * dt * 10
    this.y += this.vy * dt * 10
    this.life -= dt

    if (this.life <= 0) {
      this.alive = false
    }
  }

  checkCollision(plane) {
    if (!this.alive || !plane.isAlive) return false
    if (plane === this.owner) return false

    const dist = distance(this.x, this.y, plane.x, plane.y)
    return dist < CONSTS.PLANE.RADIUS + 12
  }

  render(ctx, screenX, screenY) {
    if (!this.alive) return

    ctx.save()
    ctx.translate(screenX, screenY)
    ctx.rotate(this.yaw + Math.PI / 2)

    // 网兜圆形
    ctx.strokeStyle = CONSTS.COLORS.NET
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 12, 0, Math.PI * 2)
    ctx.stroke()

    // 网格线
    ctx.beginPath()
    for (let i = -10; i <= 10; i += 5) {
      ctx.moveTo(i, -Math.sqrt(Math.max(0, 100 - i * i)))
      ctx.lineTo(i, Math.sqrt(Math.max(0, 100 - i * i)))
    }
    for (let j = -10; j <= 10; j += 5) {
      ctx.moveTo(-Math.sqrt(Math.max(0, 100 - j * j)), j)
      ctx.lineTo(Math.sqrt(Math.max(0, 100 - j * j)), j)
    }
    ctx.stroke()

    ctx.restore()
  }
}

module.exports = { Spit, Missile, Net }
