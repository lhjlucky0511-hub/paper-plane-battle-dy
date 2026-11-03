// 特技系统 - 对应原项目 StuntType.cs / StuntDefs.cs
// 4种特技：英麦曼回转、三连桶滚、眼镜蛇急停、剪刀甩尾

const CONSTS = require('./constants')

// 特技类型
const STUNT_TYPES = {
  NONE: 0,
  IMMELMANN: 1,    // 英麦曼回转：垂直爬升半筋斗+顶点半滚，180°掉头
  BARREL_ROLL: 2,  // 三连桶滚：绕机身纵轴滚三周，强制导弹脱锁
  COBRA: 3,        // 眼镜蛇急停：猛抬机头至近垂直、速度骤降
  SCISSORS: 4      // 剪刀甩尾：左右急转交替，持续破坏追尾瞄准
}

// 特技参数表（完全确定性，无随机）
const STUNT_DEFS = {
  [STUNT_TYPES.IMMELMANN]: {
    name: '英麦曼',
    duration: 1.8,
    cost: 40,
    cooldown: 8,
    hitRadiusScale: 0.85,
    description: '180°掉头绕后，进攻型特技'
  },
  [STUNT_TYPES.BARREL_ROLL]: {
    name: '三连桶滚',
    duration: 2.5,
    cost: 25,
    cooldown: 5,
    hitRadiusScale: 0.5,
    description: '强制导弹脱锁，中弹判定圈缩小50%'
  },
  [STUNT_TYPES.COBRA]: {
    name: '眼镜蛇',
    duration: 1.5,
    cost: 45,
    cooldown: 10,
    hitRadiusScale: 0.85,
    description: '速度骤降，让追尾敌机冲过头'
  },
  [STUNT_TYPES.SCISSORS]: {
    name: '剪刀甩尾',
    duration: 1.8,
    cost: 30,
    cooldown: 7,
    hitRadiusScale: 0.7,
    description: '持续破坏追尾瞄准，中弹圈缩小30%'
  }
}

const STUNT_STIFF_SECONDS = 0.4  // 特技后僵直前摇

class StuntSystem {
  constructor(plane) {
    this.plane = plane
    this.activeStunt = STUNT_TYPES.NONE
    this.stuntTimer = 0
    this.stuntProgress = 0
    this.stuntYaw0 = 0
    this.stuntPitch0 = 0
    this.speed0 = 0
    this.stuntCdRemain = [0, 0, 0, 0, 0]  // 索引对应 STUNT_TYPES
    this.lastStuntReqId = 0
  }

  get isStunting() {
    return this.activeStunt !== STUNT_TYPES.NONE
  }

  get currentStunt() {
    return this.activeStunt
  }

  // 特技进行中的命中圈倍率
  get hitRadiusScale() {
    if (this.activeStunt === STUNT_TYPES.NONE) return 1
    return STUNT_DEFS[this.activeStunt].hitRadiusScale
  }

  // 是否在桶滚中（导弹强制脱锁）
  get isBarrelRolling() {
    return this.activeStunt === STUNT_TYPES.BARREL_ROLL
  }

  getStuntCooldown(type) {
    const idx = type
    return idx >= 0 && idx < this.stuntCdRemain.length ? this.stuntCdRemain[idx] : 0
  }

  // 尝试触发特技
  tryStart(type, reqId) {
    if (type === STUNT_TYPES.NONE) return false
    if (this.activeStunt !== STUNT_TYPES.NONE) return false
    if (this.stuntCdRemain[type] > 0) return false

    const def = STUNT_DEFS[type]
    if (this.plane.wind < def.cost) return false

    // 消耗能量
    this.plane.wind -= def.cost

    // 开始特技
    this.activeStunt = type
    this.stuntTimer = 0
    this.stuntYaw0 = this.plane.yaw
    this.stuntPitch0 = this.plane.pitch
    this.speed0 = this.plane.speed
    this.lastStuntReqId = reqId

    return true
  }

  // 每帧更新
  update(dt) {
    // 更新冷却
    for (let i = 0; i < this.stuntCdRemain.length; i++) {
      if (this.stuntCdRemain[i] > 0) {
        this.stuntCdRemain[i] = Math.max(0, this.stuntCdRemain[i] - dt)
      }
    }

    if (this.activeStunt === STUNT_TYPES.NONE) return

    const def = STUNT_DEFS[this.activeStunt]
    this.stuntTimer += dt
    this.stuntProgress = Math.min(1, this.stuntTimer / def.duration)

    // 执行特技脚本
    this._executeStunt(dt)

    if (this.stuntTimer >= def.duration) {
      this._endStunt()
    }
  }

  _executeStunt(dt) {
    const plane = this.plane
    const t = this.stuntProgress
    const def = STUNT_DEFS[this.activeStunt]

    switch (this.activeStunt) {
      case STUNT_TYPES.IMMELMANN:
        // 英麦曼：先爬升（yaw不变，速度下降），到顶点180°掉头
        if (t < 0.5) {
          // 爬升阶段
          plane.pitch = lerp(0, Math.PI * 0.7, t / 0.5)
          plane.speed = lerp(this.speed0, this.speed0 * 0.5, t / 0.5)
        } else {
          // 掉头阶段
          plane.pitch = lerp(Math.PI * 0.7, 0, (t - 0.5) / 0.5)
          plane.yaw = this.stuntYaw0 + Math.PI
          plane.speed = lerp(this.speed0 * 0.5, this.speed0, (t - 0.5) / 0.5)
        }
        break

      case STUNT_TYPES.BARREL_ROLL:
        // 三连桶滚：绕纵轴滚3*360°，yaw微调整，速度略降
        plane.roll = t * Math.PI * 6  // 3圈
        // 速度小幅下降
        plane.speed = this.speed0 * (0.7 + 0.3 * (1 - Math.abs(t - 0.5) * 2))
        // 航向基本保持
        break

      case STUNT_TYPES.COBRA:
        // 眼镜蛇：机头猛抬至近垂直，速度骤降，然后恢复
        if (t < 0.3) {
          plane.pitch = lerp(0, Math.PI * 0.85, t / 0.3)
          plane.speed = lerp(this.speed0, this.speed0 * 0.3, t / 0.3)
        } else if (t < 0.7) {
          // 保持高迎角
          plane.pitch = Math.PI * 0.85 * Math.sin((t - 0.3) / 0.4 * Math.PI)
          plane.speed = this.speed0 * (0.3 + 0.2 * Math.sin((t - 0.3) / 0.4 * Math.PI))
        } else {
          // 恢复
          plane.pitch = lerp(0, 0, (t - 0.7) / 0.3)
          plane.speed = lerp(this.speed0 * 0.3, this.speed0, (t - 0.7) / 0.3)
        }
        break

      case STUNT_TYPES.SCISSORS:
        // 剪刀甩尾：左右急转交替
        const phase = Math.floor(t * 4)  // 每0.25s切换一次
        const dir = phase % 2 === 0 ? 1 : -1
        const localT = (t * 4) % 1
        plane.yaw = this.stuntYaw0 + dir * Math.sin(localT * Math.PI) * 0.8
        plane.speed = this.speed0 * (0.6 + 0.4 * Math.abs(Math.sin(localT * Math.PI)))
        plane.roll = dir * 0.4 * Math.sin(localT * Math.PI)
        break
    }
  }

  _endStunt() {
    const def = STUNT_DEFS[this.activeStunt]
    this.stuntCdRemain[this.activeStunt] = def.cooldown
    this.activeStunt = STUNT_TYPES.NONE
    this.stuntTimer = 0
    this.stuntProgress = 0
    this.plane.pitch = 0
    this.plane.roll = 0
  }

  // 强制结束（死亡时调用）
  forceEnd() {
    this.activeStunt = STUNT_TYPES.NONE
    this.stuntTimer = 0
    this.stuntProgress = 0
  }
}

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t))
}

module.exports = {
  StuntSystem,
  STUNT_TYPES,
  STUNT_DEFS,
  STUNT_STIFF_SECONDS
}
