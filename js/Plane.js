// 飞机类 - 对应原项目 PlaneActor
// 简化为2D俯视视角的飞机

const CONSTS = require('./constants')
const { StuntSystem, STUNT_TYPES } = require('./StuntSystem')
const { clamp, normalizeAngle, angleDiff } = require('./utils')

class Plane {
  constructor(options) {
    this.id = options.id || 0
    this.isPlayer = options.isPlayer || false
    this.displayName = options.displayName || 'Plane'
    this.color = options.color || CONSTS.COLORS.PLAYER
    this.accentColor = options.accentColor || CONSTS.COLORS.PLAYER_ACCENT
    
    // 位置和姿态
    this.x = options.x || 0
    this.y = options.y || 0
    this.yaw = options.yaw || 0          // 航向角（弧度）
    this.pitch = 0                         // 俯仰角（仅视觉效果）
    this.roll = 0                          // 滚转角（仅视觉效果）
    
    // 速度
    this.speed = CONSTS.PLANE.CRUISE_SPEED
    this.targetSpeed = CONSTS.PLANE.CRUISE_SPEED
    this.vx = 0
    this.vy = 0
    
    // 状态
    this.isAlive = true
    this.isCrashing = false
    this.invulnTimer = options.invulnTimer || CONSTS.HEALTH.INVULN_ON_SPAWN
    this.health = options.maxHealth || CONSTS.HEALTH.MAX
    this.maxHealth = options.maxHealth || CONSTS.HEALTH.MAX
    this.wind = CONSTS.WIND.MAX
    this.isBoosting = false
    this.isBoostOverheated = false
    this.overheatTimer = 0
    
    // 武器冷却
    this.spitCooldown = 0
    this.missileCooldown = 0
    this.netCooldown = 0
    
    // 弹药
    this.spitAmmo = CONSTS.SPIT.AMMO_START
    this.missileAmmo = options.missileAmmo || 3
    this.netAmmo = options.netAmmo || 2
    
    // AI相关
    this.isAI = options.isAI || false
    
    // 击杀/死亡
    this.kills = 0
    this.deaths = 0
    this.lives = options.lives || 3
    
    // 边界
    this.arenaRadius = CONSTS.ARENA.RADIUS
    
    // 动画参数
    this.wobble = 0

    // 特技系统
    this.stunt = new StuntSystem(this)

    // 道具效果
    this.stealthTimer = 0           // 隐身剩余秒数
    this.isStealthed = false
    this.slingshotArmed = false     // 弹射装填
    this.luckyFoldArmed = false     // 幸运折角
    this.luckyFoldUsed = false
    this.speedBoostMul = 1          // 临时速度倍率
    this.speedBoostTimer = 0
    this.aimJitterTimer = 0
    this.slipTimer = 0
    this.invertTimer = 0

    // 拾取道具弹药
    this.reverseAmmo = 0
    this.miniPlaneAmmo = 0
    this.origamiDartAmmo = 0
    this.soapBubbleAmmo = 0
    this.paperBeeAmmo = 0

    // LAN 相关
    this.lanSeatId = options.lanSeatId || -1
    this.isLocallyDriven = options.isLocallyDriven !== false

    // 体型倍率（Boss）
    this.sizeRadius = options.sizeRadius || 1
  }

  // 获取速度向量
  get velocity() {
    return {
      x: Math.cos(this.yaw) * this.speed,
      y: Math.sin(this.yaw) * this.speed
    }
  }

  // 被命中的视觉标记
  hitFlashTimer = 0

  update(dt, input, game) {
    if (!this.isAlive) return

    // 无敌时间
    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt
    }

    // 过热冷却
    if (this.overheatTimer > 0) {
      this.overheatTimer -= dt
      if (this.overheatTimer <= 0) {
        this.isBoostOverheated = false
      }
    }

    // 受击闪烁
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt
    }

    // 隐身计时
    if (this.stealthTimer > 0) {
      this.stealthTimer -= dt
      this.isStealthed = this.stealthTimer > 0
    } else {
      this.isStealthed = false
    }

    // 临时加速计时
    if (this.speedBoostTimer > 0) {
      this.speedBoostTimer -= dt
      if (this.speedBoostTimer <= 0) {
        this.speedBoostMul = 1
      }
    }

    // AI输入
    let actualInput = input
    if (this.isAI && game) {
      actualInput = game.getAIInput(this, dt)
    }

    // 处理特技请求
    if (actualInput.stuntReqId > 0 && actualInput.stuntType > 0) {
      this.stunt.tryStart(actualInput.stuntType, actualInput.stuntReqId)
    }

    // 特技系统更新（特技激活时接管姿态）
    if (this.stunt.isStunting) {
      this.stunt.update(dt)
    } else {
      // 处理移动输入
      this._handleMovement(actualInput, dt)
    }

    // 更新位置
    this.x += this.vx * dt * 10
    this.y += this.vy * dt * 10

    // 边界限制
    this._clampToArena()

    // 更新武器冷却
    this._updateCooldowns(dt)

    // 风/能量系统（特技时不消费输入加速）
    if (!this.stunt.isStunting) {
      this._updateWind(actualInput, dt)
    }

    // 动画参数
    this.wobble += dt * 8
  }

  _handleMovement(input, dt) {
    // 加速
    const cruiseSpeed = CONSTS.PLANE.CRUISE_SPEED
    const boostSpeed = CONSTS.PLANE.BOOST_SPEED

    if (input.boost && this.wind > 0 && !this.isBoostOverheated) {
      this.targetSpeed = boostSpeed
      this.isBoosting = true
    } else {
      this.targetSpeed = cruiseSpeed
      this.isBoosting = false
    }

    // 速度平滑
    const speedDiff = this.targetSpeed - this.speed
    this.speed += speedDiff * Math.min(1, dt * 3)

    // 航向控制
    const yawInput = input.yaw  // -1 ~ 1
    const yawRate = (this.isAI ? CONSTS.AI.YAW_SPEED : CONSTS.PLANE.YAW_SPEED) * Math.PI / 180
    this.yaw += yawInput * yawRate * dt * (this.speed / cruiseSpeed)

    // 计算速度向量
    this.vx = Math.cos(this.yaw) * this.speed
    this.vy = Math.sin(this.yaw) * this.speed

    // 滚转/俯仰视觉效果
    const rollTarget = -yawInput * CONSTS.PLANE.ROLL_AMOUNT * Math.PI / 180
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 6)
    
    const pitchInput = input.pitch || 0
    const pitchTarget = pitchInput * 0.3
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 4)
  }

  _clampToArena() {
    const dist = Math.sqrt(this.x * this.x + this.y * this.y)
    const maxDist = this.arenaRadius - CONSTS.PLANE.RADIUS

    if (dist > maxDist) {
      const angle = Math.atan2(this.y, this.x)
      this.x = Math.cos(angle) * maxDist
      this.y = Math.sin(angle) * maxDist
    }
  }

  _updateCooldowns(dt) {
    this.spitCooldown = Math.max(0, this.spitCooldown - dt)
    this.missileCooldown = Math.max(0, this.missileCooldown - dt)
    this.netCooldown = Math.max(0, this.netCooldown - dt)
  }

  _updateWind(input, dt) {
    if (input.boost && this.wind > 0 && !this.isBoostOverheated) {
      this.wind -= CONSTS.WIND.DRAIN_PER_SECOND * dt
      if (this.wind <= 0) {
        this.wind = 0
        this.isBoostOverheated = true
        this.overheatTimer = CONSTS.WIND.BOOST_OVERHEAT_SECONDS
      }
    } else {
      this.wind = Math.min(CONSTS.WIND.MAX, this.wind + CONSTS.WIND.REGEN_PER_SECOND * dt)
    }
  }

  canFireSpit() {
    return this.isAlive && this.spitCooldown <= 0 && this.spitAmmo > 0
  }

  canFireMissile() {
    return this.isAlive && this.missileCooldown <= 0 && this.missileAmmo > 0
  }

  canFireNet() {
    return this.isAlive && this.netCooldown <= 0 && this.netAmmo > 0
  }

  fireSpit() {
    if (!this.canFireSpit()) return null
    this.spitCooldown = CONSTS.SPIT.COOLDOWN
    
    return {
      x: this.x + Math.cos(this.yaw) * 20,
      y: this.y + Math.sin(this.yaw) * 20,
      vx: Math.cos(this.yaw) * CONSTS.SPIT.SPEED,
      vy: Math.sin(this.yaw) * CONSTS.SPIT.SPEED,
      owner: this
    }
  }

  fireMissile(target) {
    if (!this.canFireMissile()) return null
    this.missileCooldown = CONSTS.MISSILE.COOLDOWN
    this.missileAmmo--
    
    return {
      x: this.x + Math.cos(this.yaw) * 25,
      y: this.y + Math.sin(this.yaw) * 25,
      vx: Math.cos(this.yaw) * 5,
      vy: Math.sin(this.yaw) * 5,
      yaw: this.yaw,
      target: target,
      owner: this
    }
  }

  fireNet(target) {
    if (!this.canFireNet()) return null
    this.netCooldown = CONSTS.NET.COOLDOWN
    this.netAmmo--
    
    return {
      x: this.x + Math.cos(this.yaw) * 20,
      y: this.y + Math.sin(this.yaw) * 20,
      vx: Math.cos(this.yaw) * CONSTS.NET.SPEED,
      vy: Math.sin(this.yaw) * CONSTS.NET.SPEED,
      target: target,
      owner: this
    }
  }

  takeDamage(amount) {
    if (this.invulnTimer > 0 || !this.isAlive) return false
    
    this.health -= amount
    this.hitFlashTimer = 0.15
    
    if (this.health <= 0) {
      this.health = 0
      this._crash()
      return true
    }
    return false
  }

  _crash() {
    if (!this.isAlive) return
    this.isAlive = false
    this.isCrashing = true
    this.deaths++
    this.stunt.forceEnd()
    this.isStealthed = false
    this.stealthTimer = 0
  }

  respawn(x, y, yaw) {
    this.x = x
    this.y = y
    this.yaw = yaw || Math.random() * Math.PI * 2
    this.health = this.maxHealth
    this.isAlive = true
    this.isCrashing = false
    this.invulnTimer = CONSTS.HEALTH.INVULN_ON_SPAWN
    this.speed = CONSTS.PLANE.CRUISE_SPEED
    this.targetSpeed = CONSTS.PLANE.CRUISE_SPEED
    this.wind = CONSTS.WIND.MAX
    this.spitCooldown = 0
    this.missileCooldown = 0
    this.netCooldown = 0
    this.isBoosting = false
    this.isBoostOverheated = false
  }

  getBounds() {
    return {
      x: this.x - CONSTS.PLANE.RADIUS,
      y: this.y - CONSTS.PLANE.RADIUS,
      radius: CONSTS.PLANE.RADIUS
    }
  }

  // 渲染飞机（2D俯视视角）
  render(ctx, screenX, screenY) {
    if (!this.isAlive && !this.isCrashing) return

    ctx.save()
    ctx.translate(screenX, screenY)
    ctx.rotate(this.yaw + Math.PI / 2)  // 飞机朝上为0度

    // 无敌闪烁
    if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 10) % 2 === 0) {
      ctx.globalAlpha = 0.4
    }

    // 隐身效果
    if (this.isStealthed) {
      ctx.globalAlpha = 0.25
    }

    // 桶滚旋转效果（视觉上滚转）
    if (this.stunt.isBarrelRolling) {
      ctx.rotate(this.stunt.stuntTimer * Math.PI * 2.4)
    }

    // 受击闪烁
    if (this.hitFlashTimer > 0) {
      ctx.fillStyle = '#ff0000'
    } else {
      ctx.fillStyle = this.color
    }

    // 飞机主体
    ctx.beginPath()
    ctx.moveTo(0, -20)           // 机头
    ctx.lineTo(15, 15)           // 右翼尖
    ctx.lineTo(6, 10)            // 右翼根
    ctx.lineTo(0, 18)            // 机尾
    ctx.lineTo(-6, 10)           // 左翼根
    ctx.lineTo(-15, 15)          // 左翼尖
    ctx.closePath()
    ctx.fill()

    // 边框/高亮
    ctx.strokeStyle = this.accentColor
    ctx.lineWidth = 2
    ctx.stroke()

    // 驾驶舱
    ctx.fillStyle = this.isPlayer ? '#87CEEB' : '#FFB6C1'
    ctx.beginPath()
    ctx.ellipse(0, -5, 4, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    // 加速尾迹
    if (this.isBoosting) {
      ctx.fillStyle = 'rgba(255, 165, 0, 0.7)'
      const trailLen = 15 + Math.random() * 10
      ctx.beginPath()
      ctx.moveTo(-5, 15)
      ctx.lineTo(0, 15 + trailLen)
      ctx.lineTo(5, 15)
      ctx.closePath()
      ctx.fill()
    }

    // 机翼下的导弹/网兜挂载
    if (this.missileAmmo > 0) {
      ctx.fillStyle = CONSTS.COLORS.MISSILE
      ctx.fillRect(-12, 5, 3, 8)
      ctx.fillRect(9, 5, 3, 8)
    }
    if (this.netAmmo > 0) {
      ctx.fillStyle = CONSTS.COLORS.NET
      ctx.beginPath()
      ctx.arc(0, 15, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  // 渲染HUD
  renderHUD(ctx, screenX, screenY) {
    // 仅对AI敌机渲染名字和血条
    if (!this.isAI) return

    // 血条背景
    const barWidth = 40
    const barHeight = 5
    const barX = screenX - barWidth / 2
    const barY = screenY - 30

    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barWidth, barHeight)

    // 血条
    const healthPercent = this.health / this.maxHealth
    ctx.fillStyle = healthPercent > 0.5 ? '#2ECC71' : healthPercent > 0.25 ? '#F39C12' : '#E74C3C'
    ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight)

    // 名字
    ctx.fillStyle = '#fff'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(this.displayName, screenX, barY - 3)
  }
}

module.exports = Plane
