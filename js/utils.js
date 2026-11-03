// 工具函数

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

function angleBetween(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1)
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function lerp(start, end, t) {
  return start + (end - start) * t
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function randomRange(min, max) {
  return min + Math.random() * (max - min)
}

function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1))
}

// 角度插值（最短路径）
function lerpAngle(start, end, t) {
  let diff = normalizeAngle(end - start)
  return start + diff * t
}

// 角度差（最短路径，-PI ~ PI）
function angleDiff(a, b) {
  return normalizeAngle(b - a)
}

// 将角度限制在 [-PI/2, PI/2]（辅助瞄准）
function aimAssist(currentYaw, targetAngle, maxError = 0.3) {
  const diff = angleDiff(currentYaw, targetAngle)
  if (Math.abs(diff) < maxError) {
    return targetAngle
  }
  return currentYaw + Math.sign(diff) * maxError
}

// 预测拦截点（导弹/网兜用）
function predictIntercept(shooterX, shooterY, targetX, targetY, targetVX, targetVY, projectileSpeed) {
  const dx = targetX - shooterX
  const dy = targetY - shooterY
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  if (distance < 1) {
    return { x: targetX, y: targetY }
  }
  
  const timeToTarget = distance / projectileSpeed
  
  return {
    x: targetX + targetVX * timeToTarget,
    y: targetY + targetVY * timeToTarget
  }
}

// 简单粒子
class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x
    this.y = y
    this.vx = vx
    this.vy = vy
    this.life = life
    this.maxLife = life
    this.color = color
    this.size = size || 2
  }

  update(dt) {
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.vx *= 0.98
    this.vy *= 0.98
    this.life -= dt
  }

  render(ctx) {
    const alpha = this.life / this.maxLife
    ctx.globalAlpha = alpha
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  get alive() {
    return this.life > 0
  }
}

// 粒子系统
class ParticleSystem {
  constructor() {
    this.particles = []
  }

  emit(x, y, count, options = {}) {
    const {
      speed = 100,
      life = 0.5,
      color = '#FFD700',
      size = 2,
      spread = Math.PI * 2
    } = options

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * spread - spread / 2 - Math.PI / 2
      const spd = speed * (0.5 + Math.random() * 0.5)
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        life * (0.5 + Math.random() * 0.5),
        color,
        size
      ))
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt)
      if (!this.particles[i].alive) {
        this.particles.splice(i, 1)
      }
    }
  }

  render(ctx) {
    for (const p of this.particles) {
      p.render(ctx)
    }
  }

  clear() {
    this.particles = []
  }
}

module.exports = {
  distance,
  angleBetween,
  normalizeAngle,
  lerp,
  clamp,
  randomRange,
  randomInt,
  lerpAngle,
  angleDiff,
  aimAssist,
  predictIntercept,
  ParticleSystem,
  Particle
}
