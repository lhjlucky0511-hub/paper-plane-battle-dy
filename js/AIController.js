// AI 敌人逻辑 - 对应原项目 AiPilot
const CONSTS = require('./constants')
const { distance, angleDiff, angleBetween, normalizeAngle } = require('./utils')

class AIController {
  constructor(plane) {
    this.plane = plane
    this.state = 'patrol'        // patrol, chase, evade
    this.stateTimer = 0
    this.currentTarget = null
    this.evadeAngle = 0
    this.evadeTimer = 0
  }

  getInput(game, dt) {
    const plane = this.plane

    // 寻找最近的存活敌人
    if (!this.currentTarget || !this.currentTarget.isAlive) {
      this.currentTarget = this._findNearestEnemy(game.getAllPlanes())
    }

    // 检测来袭导弹
    const incomingMissile = game.findIncomingMissile(plane)
    if (incomingMissile) {
      this.state = 'evade'
      this.stateTimer = 1.5
      const missileAngle = angleBetween(plane.x, plane.y, incomingMissile.x, incomingMissile.y)
      // 垂直于来袭方向规避
      this.evadeAngle = missileAngle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2)
      this.evadeTimer = 0.8 + Math.random() * 0.5
    }

    // 更新状态计时
    this.stateTimer -= dt
    if (this.stateTimer <= 0 && this.state !== 'chase') {
      this.state = this.currentTarget ? 'chase' : 'patrol'
    }
    if (this.evadeTimer > 0) {
      this.evadeTimer -= dt
      if (this.evadeTimer <= 0) {
        this.state = 'chase'
      }
    }

    // 生成输入
    let yaw = 0
    let pitch = 0
    let boost = false
    let wantFire = false
    let wantMissile = false
    let wantNet = false

    if (this.state === 'evade') {
      // 规避模式
      const diff = angleDiff(plane.yaw, this.evadeAngle)
      yaw = Math.sign(diff) * Math.min(1, Math.abs(diff) * 3)
      boost = true
    } else if (this.state === 'chase' && this.currentTarget) {
      // 追击模式
      const target = this.currentTarget
      const toTarget = angleBetween(plane.x, plane.y, target.x, target.y)
      const distToTarget = distance(plane.x, plane.y, target.x, target.y)
      const diff = angleDiff(plane.yaw, toTarget)

      // 追踪
      yaw = Math.sign(diff) * Math.min(1, Math.abs(diff) * 2)

      // 距离控制 - 太近则减速，太远则加速
      if (distToTarget > 250) {
        boost = true
      } else if (distToTarget < 80) {
        // 急转弯摆脱
        yaw *= 1.2
      }

      // 开火判定
      const inFrontCone = Math.abs(diff) < Math.PI / 4  // 45度内
      const inRange = distToTarget < 400
      
      if (inFrontCone && inRange && plane.spitCooldown <= 0) {
        wantFire = Math.random() < 0.3  // 30%概率开火（模拟反应时间）
      }

      // 导弹判定 - 距离合适且对准
      if (inFrontCone && distToTarget > 150 && distToTarget < 500 && 
          plane.canFireMissile() && Math.random() < 0.01) {
        wantMissile = true
      }

      // 网兜判定 - 近距离时
      if (distToTarget < 100 && plane.canFireNet() && Math.random() < 0.005) {
        wantNet = true
      }

      // 随机状态切换
      if (Math.random() < 0.005) {
        this.state = 'patrol'
        this.stateTimer = 1 + Math.random() * 2
      }
    } else {
      // 巡逻模式 - 缓慢转向找目标
      yaw = Math.sin(this.stateTimer * 0.5) * 0.3
    }

    return {
      yaw: yaw,
      pitch: pitch,
      boost: boost,
      fire: wantFire && plane.canFireSpit(),
      missileFire: wantMissile,
      netDeploy: wantNet
    }
  }

  _findNearestEnemy(planes) {
    let nearest = null
    let minDist = Infinity

    for (const p of planes) {
      if (p === this.plane || !p.isAlive) continue
      const d = distance(this.plane.x, this.plane.y, p.x, p.y)
      if (d < minDist) {
        minDist = d
        nearest = p
      }
    }

    return nearest
  }

  getMissileTarget() {
    return this.currentTarget && this.currentTarget.isAlive ? this.currentTarget : null
  }

  getNetTarget() {
    const target = this.currentTarget
    if (!target || !target.isAlive) return null
    
    const dist = distance(this.plane.x, this.plane.y, target.x, target.y)
    // 网兜只能近距离使用
    return dist < 150 ? target : null
  }
}

module.exports = AIController
