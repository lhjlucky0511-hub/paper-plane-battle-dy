// 游戏主引擎 - 对应原项目 BattleSession
const CONSTS = require('./constants')
const Plane = require('./Plane')
const AIController = require('./AIController')
const { Spit, Missile, Net } = require('./Projectiles')
const InputManager = require('./InputManager')
const { CampaignManager, OBJECTIVE_TYPE } = require('./CampaignSystem')
const { LootField, LOOT_TYPES, LOOT_COLORS, LOOT_NAMES } = require('./LootSystem')
const { STUNT_TYPES, STUNT_DEFS } = require('./StuntSystem')
const { ParticleSystem, distance, randomRange, normalizeAngle } = require('./utils')
const { getMapTheme, DEFAULT_MAP_ID } = require('./Maps')

// 圆角矩形路径（每次调用前重置路径，避免多按钮路径累积）
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  const rr = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

// 教室地图 3D 透视相机（世界坐标 -> 屏幕坐标）
const CAM3D = {
  HEIGHT: 600,        // 相机离地高度
  DIST: 600,          // 相机位于玩家后方的距离
  TILT: Math.PI / 4,  // 俯视角度
  FOCAL: 360          // 焦距（像素）
}

// 游戏状态
const GAME_STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ENDED: 'ended'
}

class Game {
  constructor(canvas, ctx, inputManager) {
    this.canvas = canvas
    this.ctx = ctx
    this.input = inputManager

    // 状态
    this.state = GAME_STATE.MENU
    this.gameMode = CONSTS.GAME_MODE.PRACTICE
    this.aiCount = CONSTS.DEFAULT_AI_COUNT
    this.mapId = DEFAULT_MAP_ID

    // 飞机列表
    this.player = null
    this.planes = []
    this.aiControllers = []

    // 投射物
    this.spits = []
    this.missiles = []
    this.nets = []

    // 粒子系统
    this.particles = new ParticleSystem()

    // 时间
    this.lastTime = 0
    this.elapsed = 0
    this.gameEndTime = 0

    // 屏幕尺寸
    this.screenWidth = 0
    this.screenHeight = 0
    this.viewScale = 1

    // 相机
    this.cameraX = 0
    this.cameraY = 0

    // 事件回调
    this.onGameEnd = null
    this.onBackToMenu = null

    // UI状态
    this.toasts = []  // 战斗提示

    // 战役系统
    this.campaign = new CampaignManager()
    this.campaignLevel = null
    this.campaignObjective = null

    // 道具系统
    this.lootField = new LootField()

    // 增援
    this.reinforcementsSpawned = false

    // 玩家金币
    this.coins = 0
    this.totalCoins = 0

    // 战斗场地半径
    this.arenaRadius = CONSTS.ARENA.RADIUS

    // 视角缩放（右上角「视角」按钮切换）
    this.zoom = 1

    // 屏幕 HUD 布局（横屏）
    this.hudLayout = null
  }

  init(width, height) {
    this.screenWidth = width
    this.screenHeight = height
    // 横屏：以高度为基准，保证圆形战场纵向填满约 90% 屏幕
    this.viewScale = Math.min(width, height) / 900

    // 设置UI布局
    const layout = this._computeUILayout()
    this.input.init(layout)
    this.hudLayout = layout.hud
  }

  // 横屏布局：左侧摇杆 + 右下圆形按钮簇 + 右上竖排特技列表
  _computeUILayout() {
    const w = this.screenWidth
    const h = this.screenHeight
    const u = h / 393          // 以 852x393 为基准的缩放单位

    // 圆形按钮：rect 即圆的外接矩形（_drawCircleButton 以 w/2 为半径）
    const circle = (cx, cy, r) => ({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, r: Math.round(r) })

    // 风按钮居中且最大；射/网/弹/技四小按钮按逆时针顺序排列（从正上方开始，最后一个导弹在正下方）
    // 四个小按钮等大，外圈轻微压在风上，风主体清晰可见
    const boostR = Math.round(34 * u)   // 风，最大
    const smallR = Math.round(22 * u)   // 射/网/弹/技，统一

    // 风按钮中心到每个小按钮中心的距离（小按钮外圈轻微压在风上，风主体清晰）
    const d = boostR + Math.round(smallR * 0.7)

    // 逆时针从正上方到正下方（左半弧 180°，4 个按钮间距 60°）：
    //   射(正上方, -90°) → 网兜(左上偏上, -150°) → 特技(左下, +150°) → 导弹(正下方, +90°)
    const ANG = {
      FIRE:  -Math.PI / 2,          // 正上方
      NET:   -5 * Math.PI / 6,      // 左上偏上（-150°）
      STUNT:  5 * Math.PI / 6,      // 左下（+150°）
      MISS:   Math.PI / 2           // 正下方
    }
    const dx = (ang) => Math.cos(ang) * d
    const dy = (ang) => Math.sin(ang) * d

    // 边界保护：按整体外包框（仅左半弧）算风的最大可行中心
    const pad = Math.round(14 * u)
    const extentXLeft  = Math.abs(Math.cos(ANG.NET)) * d + smallR   // 左侧最大外扩
    const extentYTop   = Math.abs(Math.sin(ANG.FIRE)) * d + smallR  // 上方最大外扩
    const extentYBottom= Math.abs(Math.sin(ANG.MISS)) * d + smallR  // 下方最大外扩
    const boostCx = Math.min(w - pad - smallR, Math.max(pad + extentXLeft, w - Math.round(110 * u)))
    const boostCy = Math.min(h - pad - extentYBottom, Math.max(pad + extentYTop, h - Math.round(100 * u)))

    // 四个小按钮坐标
    const fireCx  = boostCx + dx(ANG.FIRE),   fireCy  = boostCy + dy(ANG.FIRE)
    const netCx   = boostCx + dx(ANG.NET),    netCy   = boostCy + dy(ANG.NET)
    const misCx   = boostCx + dx(ANG.MISS),   misCy   = boostCy + dy(ANG.MISS)
    const stCx    = boostCx + dx(ANG.STUNT),  stCy    = boostCy + dy(ANG.STUNT)

    // 摇杆（左下角，位于雷达下方）
    const jsSize = Math.round(130 * u)
    const jsCx = Math.round(w * 0.118)
    const jsCy = h - Math.round(74 * u)

    // 右上竖排特技列表：4 行
    const listW = Math.min(132, Math.round(w * 0.16))
    const listH = Math.round(26 * u)
    const listGap = Math.round(7 * u)
    const listX = w - listW - Math.round(8 * u)
    const listY = Math.round(h * 0.11)
    const stuntList = []
    for (let i = 0; i < 4; i++) {
      stuntList.push({
        x: listX,
        y: listY + i * (listH + listGap),
        w: listW,
        h: listH,
        stuntType: i + 1
      })
    }

    return {
      joystick: {
        base: { x: jsCx - jsSize / 2, y: jsCy - jsSize / 2, w: jsSize, h: jsSize }
      },
      boost: circle(boostCx, boostCy, boostR),
      fire:  circle(fireCx,  fireCy,  smallR),
      net:   circle(netCx,   netCy,   smallR),
      missile: circle(misCx, misCy, smallR),
      stunt: circle(stCx,    stCy,    smallR),
      stuntList: stuntList,
      hud: {
        pause: { x: Math.round(14 * u), y: 6, w: Math.round(70 * u), h: Math.round(28 * u) },
        zoom: { x: w - Math.round(84 * u), y: 6, w: Math.round(76 * u), h: Math.round(28 * u) },
        barX: Math.round(96 * u),
        barY: 8,
        barW: Math.round(Math.min(260, w * 0.30)),
        barH: 10,
        panel: { x: Math.round(14 * u), y: 40, w: Math.round(214 * u), h: 68 },
        radar: { x: Math.round(86 * u), y: Math.round(h * 0.42), size: Math.round(90 * u) }
      }
    }
  }

  start(mode, aiCount, mapId) {
    this.gameMode = mode || CONSTS.GAME_MODE.PRACTICE
    this.aiCount = aiCount || CONSTS.DEFAULT_AI_COUNT
    this.mapId = mapId || DEFAULT_MAP_ID
    
    this.state = GAME_STATE.PLAYING
    this.elapsed = 0
    this.reinforcementsSpawned = false
    
    // 清空实体
    this.planes = []
    this.aiControllers = []
    this.spits = []
    this.missiles = []
    this.nets = []
    this.toasts = []
    
    // 初始化道具场
    this._initLootField()
    
    // 创建玩家
    this._spawnPlayer()
    
    // 创建AI
    for (let i = 0; i < this.aiCount; i++) {
      this._spawnAI(i)
    }

    console.log('[game] start ' + this.gameMode + ' ai=' + this.aiCount)
  }

  // 战役模式开始
  startCampaign(levelId) {
    this.campaignLevel = this.campaign.startLevel(levelId)
    if (!this.campaignLevel) return
    
    this.gameMode = 'campaign'
    this.aiCount = 0  // 由关卡配置决定
    // 按章节加载对应地图
    const chapter = this.campaign.getChapter(this.campaignLevel.chapter)
    this.mapId = chapter ? chapter.mapId : DEFAULT_MAP_ID
    this.state = GAME_STATE.PLAYING
    this.elapsed = 0
    this.reinforcementsSpawned = false
    
    this.planes = []
    this.aiControllers = []
    this.spits = []
    this.missiles = []
    this.nets = []
    this.toasts = []
    
    this._initLootField()
    this._spawnPlayer()
    
    // 根据关卡配置生成敌人
    for (let i = 0; i < this.campaignLevel.enemies.length; i++) {
      this._spawnCampaignEnemy(i, this.campaignLevel.enemies[i])
    }
    
    this._addToast(`关卡 ${this.campaignLevel.id}: ${this.campaignLevel.name}`)
    console.log('[campaign] start level=' + this.campaignLevel.id +
                ' enemies=' + this.campaignLevel.enemies.length)
  }

  _initLootField() {
    // 生成道具点位（围绕战场均匀分布）
    const spawns = []
    const count = 8
    const radius = this.arenaRadius * 0.6
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + randomRange(-0.2, 0.2)
      spawns.push({
        x: Math.cos(angle) * radius * randomRange(0.5, 1),
        y: Math.sin(angle) * radius * randomRange(0.5, 1)
      })
    }
    this.lootField.build(spawns)
  }

  _spawnCampaignEnemy(index, spec) {
    const colors = [
      { main: '#E74C3C', accent: '#FFB7B7' },
      { main: '#9B59B6', accent: '#D7BDE2' },
      { main: '#E67E22', accent: '#FAD7A0' }
    ]
    
    const angle = (index / Math.max(1, this.campaignLevel.enemies.length)) * Math.PI * 2
    const dist = randomRange(200, this.arenaRadius - 100)
    const color = colors[index % colors.length]
    
    const baseHealth = 80 * (spec.healthMul || 1)
    const ai = new Plane({
      id: index + 1,
      isPlayer: false,
      isAI: true,
      displayName: spec.name,
      color: color.main,
      accentColor: color.accent,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      yaw: randomRange(0, Math.PI * 2),
      missileAmmo: spec.skillLevel >= 4 ? 2 : 0,
      netAmmo: spec.skillLevel >= 6 ? 1 : 0,
      lives: 0  // 战役模式敌人不重生
    })
    
    ai.maxHealth = baseHealth
    ai.health = baseHealth
    ai.arenaRadius = this.arenaRadius
    ai.attackMul = spec.attackMul || 1
    
    const controller = new AIController(ai)
    controller.skillLevel = spec.skillLevel
    this.aiControllers.push(controller)
    this.planes.push(ai)
  }

  // 生成增援
  spawnReinforcements(specs) {
    this._addToast('敌方增援到达！')
    for (let i = 0; i < specs.length; i++) {
      this._spawnCampaignEnemy(this.aiControllers.length, specs[i])
    }
  }

  _spawnPlayer() {
    const angle = randomRange(0, Math.PI * 2)
    const dist = randomRange(100, 250)
    
    this.player = new Plane({
      id: 0,
      isPlayer: true,
      displayName: 'Player',
      color: CONSTS.COLORS.PLAYER,
      accentColor: CONSTS.COLORS.PLAYER_ACCENT,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      yaw: angle + Math.PI,
      missileAmmo: 3,
      netAmmo: 2,
      lives: 3
    })
    
    this.planes.push(this.player)
  }

  _spawnAI(index) {
    const colors = [
      { main: '#E74C3C', accent: '#FFB7B7' },
      { main: '#9B59B6', accent: '#D7BDE2' },
      { main: '#E67E22', accent: '#FAD7A0' },
      { main: '#1ABC9C', accent: '#A3E4D7' },
      { main: '#F39C12', accent: '#FCF3CF' }
    ]
    
    const angle = (index / Math.max(1, this.aiCount)) * Math.PI * 2 + randomRange(-0.3, 0.3)
    const dist = randomRange(200, CONSTS.ARENA.RADIUS - 100)
    const color = colors[index % colors.length]
    
    const ai = new Plane({
      id: index + 1,
      isPlayer: false,
      isAI: true,
      displayName: `AI-${index + 1}`,
      color: color.main,
      accentColor: color.accent,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      yaw: randomRange(0, Math.PI * 2),
      missileAmmo: Math.random() < 0.5 ? 2 : 0,
      netAmmo: Math.random() < 0.3 ? 1 : 0,
      lives: 1
    })
    
    // AI使用较慢的默认配置
    ai.maxHealth = 80
    ai.health = 80
    ai.arenaRadius = CONSTS.ARENA.RADIUS
    
    const controller = new AIController(ai)
    this.aiControllers.push(controller)
    this.planes.push(ai)
  }

  update(currentTime) {
    if (this.state !== GAME_STATE.PLAYING) return

    const dt = Math.min(0.05, (currentTime - this.lastTime) / 1000 || 0.016)
    this.lastTime = currentTime
    this.elapsed += dt

    // 更新输入采样
    const input = this.input.sample()

    // 更新玩家
    if (this.player && this.player.isAlive) {
      this.player.update(dt, input, this)
      
      // 玩家开火
      if (input.fire && this.player.canFireSpit()) {
        const bullet = this.player.fireSpit()
        if (bullet) this.spits.push(new Spit(bullet))
      }
      
      if (input.missileFire) {
        const target = this._findAIMissileTarget(this.player)
        if (target && this.player.canFireMissile()) {
          const missile = this.player.fireMissile(target)
          if (missile) this.missiles.push(new Missile(missile))
          this._addToast('导弹发射！')
        }
      }
      
      if (input.netDeploy) {
        const target = this._findNetTarget(this.player)
        if (target && this.player.canFireNet()) {
          const net = this.player.fireNet(target)
          if (net) this.nets.push(new Net(net))
          this._addToast('网兜已发射！')
        }
      }
    }

    // 更新AI
    for (const controller of this.aiControllers) {
      const ai = controller.plane
      if (!ai.isAlive) continue
      
      const aiInput = controller.getInput(this, dt)
      ai.update(dt, aiInput, null)
      
      // AI武器发射
      if (aiInput.fire && ai.canFireSpit()) {
        const bullet = ai.fireSpit()
        if (bullet) this.spits.push(new Spit(bullet))
      }
      
      if (aiInput.missileFire) {
        const target = controller.getMissileTarget()
        if (target && ai.canFireMissile()) {
          const missile = ai.fireMissile(target)
          if (missile) this.missiles.push(new Missile(missile))
        }
      }
      
      if (aiInput.netDeploy) {
        const target = controller.getNetTarget()
        if (target && ai.canFireNet()) {
          const net = ai.fireNet(target)
          if (net) this.nets.push(new Net(net))
        }
      }
    }

    // 更新投射物
    this._updateProjectiles(dt)
    
    // 更新粒子
    this.particles.update(dt)
    
    // 更新道具场
    this.lootField.update(dt, this.planes, this.elapsed)
    
    // 战役目标更新
    if (this.gameMode === 'campaign' && this.campaignLevel) {
      const result = this.campaign.tick(dt, this)
      if (result) {
        if (result.completed) {
          this._onCampaignComplete()
        } else if (result.failed) {
          this._onCampaignFail()
        }
      }
    }
    
    // 处理死亡/重生
    this._handleDeathsAndRespawns()
    
    // 更新toasts
    this._updateToasts(dt)
    
    // 检测游戏结束
    this._checkGameEnd()
    
    // 重置一次性按键
    this.input.endFrame()
  }

  _updateProjectiles(dt) {
    // 更新子弹
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const spit = this.spits[i]
      spit.update(dt)
      
      // 碰撞检测
      for (const plane of this.planes) {
        if (spit.checkCollision(plane)) {
          const killed = plane.takeDamage(spit.damage)
          spit.alive = false
          
          if (killed) {
            spit.owner.kills++
            this.particles.emit(plane.x, plane.y, 20, {
              speed: 200, life: 0.5, color: '#E74C3C', size: 3
            })
          } else {
            this.particles.emit(plane.x, plane.y, 5, {
              speed: 100, life: 0.2, color: '#FFD700', size: 2
            })
          }
          break
        }
      }
      
      // 边界/过期
      if (spit.alive) {
        const dist = Math.sqrt(spit.x * spit.x + spit.y * spit.y)
        if (dist > CONSTS.ARENA.RADIUS + 100) spit.alive = false
      }
      
      if (!spit.alive) {
        this.spits.splice(i, 1)
      }
    }

    // 更新导弹
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const missile = this.missiles[i]
      const result = missile.update(dt, this.planes)
      
      // 爆炸伤害检测
      if (missile.exploding) {
        for (const plane of this.planes) {
          if (missile.checkExplosionDamage(plane)) {
            const dmg = missile.getExplosionDamage()
            if (dmg > 0) {
              const killed = plane.takeDamage(dmg)
              if (killed) missile.owner.kills++
            }
          }
        }
      } else if (result && result.hit) {
        const killed = result.hit.takeDamage(missile.damage)
        if (killed) {
          missile.owner.kills++
          this._addToast(`${missile.owner === this.player ? '你' : '敌机'}击毁了 ${result.hit.displayName}！`)
        }
      }
      
      if (!missile.alive) {
        this.particles.emit(missile.x, missile.y, 15, {
          speed: 300, life: 0.6, color: '#FF6B35', size: 3
        })
        this.missiles.splice(i, 1)
      }
    }

    // 更新网兜
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const net = this.nets[i]
      net.update(dt)
      
      for (const plane of this.planes) {
        if (net.checkCollision(plane)) {
          const killed = plane.takeDamage(40)
          net.alive = false
          
          if (killed) {
            net.owner.kills++
            this._addToast(`${net.owner === this.player ? '你' : '敌机'}用网兜网住了 ${plane.displayName}！`)
          }
          break
        }
      }
      
      if (!net.alive) {
        this.nets.splice(i, 1)
      }
    }
  }

  _handleDeathsAndRespawns() {
    // 检查玩家死亡（deathHandled 保证每次坠机只结算一次，避免每帧重复扣命）
    if (this.player && !this.player.isAlive && !this.player.deathHandled) {
      this.player.deathHandled = true
      this.player.lives--
      console.log('[player] down, lives left=' + this.player.lives)
      if (this.player.lives >= 0) {
        // 延迟重生
        setTimeout(() => {
          if (this.state === GAME_STATE.PLAYING) {
            this._respawnPlane(this.player)
          }
        }, CONSTS.HEALTH.RESPAWN_DELAY * 1000)
      }
    }

    // AI死亡后重生
    for (const ai of this.aiControllers) {
      const plane = ai.plane
      if (!plane.isAlive && !plane.deathHandled && plane.lives > 0) {
        plane.deathHandled = true
        plane.lives--
        if (plane.lives >= 0) {
          setTimeout(() => {
            if (this.state === GAME_STATE.PLAYING) {
              this._respawnPlane(plane)
            }
          }, CONSTS.HEALTH.RESPAWN_DELAY * 1000)
        }
      }
    }
  }

  _respawnPlane(plane) {
    const angle = randomRange(0, Math.PI * 2)
    const dist = randomRange(150, 300)
    plane.respawn(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist,
      angle + Math.PI
    )
  }

  _findAIMissileTarget(plane) {
    let best = null
    let bestScore = -Infinity

    for (const target of this.planes) {
      if (target === plane || !target.isAlive) continue

      const dx = target.x - plane.x
      const dy = target.y - plane.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const targetAngle = Math.atan2(dy, dx)
      const angleDiff = Math.abs(normalizeAngle(targetAngle - plane.yaw))

      // 评分：在正前方且距离合适的目标最优
      if (angleDiff < Math.PI / 2 && dist < 500 && dist > 100) {
        const score = 1 / (angleDiff + 0.1) + 100 / dist
        if (score > bestScore) {
          bestScore = score
          best = target
        }
      }
    }

    return best
  }

  _findNetTarget(plane) {
    let best = null
    let minDist = Infinity

    for (const target of this.planes) {
      if (target === plane || !target.isAlive) continue

      const dist = distance(plane.x, plane.y, target.x, target.y)
      if (dist < 150 && dist < minDist) {
        minDist = dist
        best = target
      }
    }

    return best
  }

  findIncomingMissile(plane) {
    for (const missile of this.missiles) {
      if (missile.target === plane && !missile.exploding) {
        return missile
      }
    }
    return null
  }

  getAllPlanes() {
    return this.planes
  }

  getAIInput(plane, dt) {
    const controller = this.aiControllers.find(c => c.plane === plane)
    if (controller) {
      return controller.getInput(this, dt)
    }
    return { yaw: 0, pitch: 0, boost: false, fire: false, missileFire: false, netDeploy: false }
  }

  _addToast(text) {
    this.toasts.push({
      text: text,
      life: 2.5,
      maxLife: 2.5
    })
  }

  _updateToasts(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt
      if (this.toasts[i].life <= 0) {
        this.toasts.splice(i, 1)
      }
    }
  }

  _onCampaignComplete() {
    const level = this.campaign.completeLevel()
    if (level) {
      this.coins += level.rewardCoins
      this.totalCoins += level.rewardCoins
      this.player.missileAmmo = Math.min(5, this.player.missileAmmo + level.rewardMissiles)
      this.player.netAmmo = Math.min(3, this.player.netAmmo + level.rewardNets)
      this._addToast(`关卡完成！获得 ${level.rewardCoins} 金币`)
    }
    this.state = GAME_STATE.ENDED
    this.gameEndTime = this.elapsed
    console.log('[campaign] complete level=' + (level ? level.id : 0))
    if (this.onGameEnd) {
      this.onGameEnd({ ...this._getPlayerStats(), campaignWin: true, levelId: level ? level.id : 0 })
    }
  }

  _onCampaignFail() {
    this._addToast('任务失败！')
    this.state = GAME_STATE.ENDED
    this.gameEndTime = this.elapsed
    console.log('[campaign] fail level=' + (this.campaignLevel ? this.campaignLevel.id : 0))
    if (this.onGameEnd) {
      this.onGameEnd({ ...this._getPlayerStats(), campaignWin: false })
    }
  }

  _checkGameEnd() {
    if (this.gameMode === 'campaign') {
      // 战役模式：达成目标结束，玩家无命时判定失败
      if (this.player && this.player.lives < 0) {
        this._onCampaignFail()
      }
      return
    }

    if (this.gameMode === CONSTS.GAME_MODE.PRACTICE) {
      // 练习模式：玩家无命时结束
      if (this.player && this.player.lives < 0) {
        this.state = GAME_STATE.ENDED
        this._endGame()
      }
    } else if (this.gameMode === CONSTS.GAME_MODE.VERSUS) {
      // 对战模式：玩家或所有AI死亡时结束
      const allAIDead = this.aiControllers.every(c => !c.plane.isAlive || c.plane.lives < 0)
      if ((this.player && this.player.lives < 0) || allAIDead) {
        this.state = GAME_STATE.ENDED
        this._endGame()
      }
    }
  }

  _endGame() {
    this.gameEndTime = this.elapsed
    if (this.onGameEnd) {
      const stats = this._getPlayerStats()
      this.onGameEnd(stats)
    }
  }

  _getPlayerStats() {
    if (!this.player) return { kills: 0, deaths: 0, survived: false }
    
    // 计算击杀AI数
    const aiKills = this.planes.filter(p => p.isAI).reduce((sum, p) => sum + p.deaths, 0)
    
    return {
      kills: this.player.kills,
      deaths: this.player.deaths,
      survived: this.player.lives >= 0,
      aiKills: aiKills,
      time: this.gameEndTime
    }
  }

  render() {
    const ctx = this.ctx
    const w = this.screenWidth
    const h = this.screenHeight

    // 清空
    ctx.fillStyle = CONSTS.COLORS.BACKGROUND
    ctx.fillRect(0, 0, w, h)

    if (this._is3D()) {
      // 教室地图：透视相机 + 3D 场景
      this._render3DScene(ctx, w, h)
    } else {
      // 计算相机（跟随玩家）
      let camX = 0
      let camY = 0
      if (this.player && this.player.isAlive) {
        camX = this.player.x
        camY = this.player.y
      }

      // 相机变换
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(this.viewScale * this.zoom, this.viewScale * this.zoom)
      ctx.translate(-camX, -camY)

      // 渲染战场
      this._renderArena(ctx)

      // 渲染道具场
      this._renderLootField(ctx)

      // 渲染战役能量环
      if (this.gameMode === 'campaign' && this.campaign.objective &&
          this.campaign.objective.rings) {
        this._renderCampaignRings(ctx)
      }

      // 渲染投射物
      for (const spit of this.spits) spit.render(ctx, spit.x, spit.y)
      for (const missile of this.missiles) missile.render(ctx, missile.x, missile.y)
      for (const net of this.nets) net.render(ctx, net.x, net.y)

      // 渲染飞机
      for (const plane of this.planes) {
        if (plane.isAlive || plane.isCrashing) {
          plane.render(ctx, plane.x, plane.y)
          plane.renderHUD(ctx, plane.x, plane.y)
        }
      }

      // 渲染粒子
      this.particles.render(ctx)

      ctx.restore()
    }

    // 渲染HUD（屏幕坐标）
    if (this.state === GAME_STATE.PLAYING) {
      this._renderHUD(ctx)
    }
  }

  // ============ 3D 透视场景（教室地图）============

  _is3D() {
    return typeof getMapTheme(this.mapId).draw3D === 'function'
  }

  _setup3D() {
    const zoomed = this.zoom > 1
    const px = this.player && this.player.isAlive ? this.player.x : 0
    const py = this.player && this.player.isAlive ? this.player.y : 0
    // 放大视角时相机轻微跟随玩家，避免玩家飞出画面
    const follow = zoomed ? 0.5 : 0
    this._cam3d = {
      cx: this.screenWidth / 2,
      cy: this.screenHeight / 2,
      camX: px * follow,
      camY: py * follow,
      height: CAM3D.HEIGHT,
      dist: CAM3D.DIST,
      sin: Math.sin(CAM3D.TILT),
      cos: Math.cos(CAM3D.TILT),
      focal: CAM3D.FOCAL * (zoomed ? 1.45 : 1)
    }
  }

  // 世界坐标 (x, y, z) 投影到屏幕，返回 { x, y, s }（s 为该处缩放）
  _project(x, y, z) {
    const c = this._cam3d
    const dx = x - c.camX
    const dy = y - c.camY + c.dist
    const dz = z - c.height
    const fwd = dy * c.cos - dz * c.sin
    const up = dy * c.sin + dz * c.cos
    const s = c.focal / Math.max(1, fwd)
    return { x: c.cx + dx * s, y: c.cy - up * s, s }
  }

  _render3DScene(ctx, w, h) {
    this._setup3D()
    const theme = getMapTheme(this.mapId)

    theme.draw3D(ctx, {
      project: (x, y, z) => this._project(x, y, z),
      width: w,
      height: h,
      elapsed: this.elapsed
    })

    // 道具
    this._renderLootField(ctx, true)

    // 战役能量环
    if (this.gameMode === 'campaign' && this.campaign.objective &&
        this.campaign.objective.rings) {
      this._renderCampaignRings3D(ctx)
    }

    // 投射物
    for (const spit of this.spits) {
      this._drawProjected(ctx, spit.x, spit.y, 24, c => spit.render(c, 0, 0))
    }
    for (const missile of this.missiles) {
      this._drawProjected(ctx, missile.x, missile.y, 24, c => missile.render(c, 0, 0))
    }
    for (const net of this.nets) {
      this._drawProjected(ctx, net.x, net.y, 24, c => net.render(c, 0, 0))
    }

    // 飞机（地面投影 + 空中 billboard）
    for (const plane of this.planes) {
      if (!plane.isAlive && !plane.isCrashing) continue

      const shadow = this._project(plane.x, plane.y, 0)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)'
      ctx.beginPath()
      ctx.ellipse(shadow.x, shadow.y, 22 * shadow.s, 13 * shadow.s, 0, 0, Math.PI * 2)
      ctx.fill()

      this._drawProjected(ctx, plane.x, plane.y, 46, c => plane.render(c, 0, 0))
      if (plane.isAI) this._renderPlaneTag3D(ctx, plane)
    }

    // 粒子
    this._renderParticles3D(ctx)
  }

  // 把实体按投影位置绘制到屏幕（billboard）
  _drawProjected(ctx, x, y, z, draw) {
    const p = this._project(x, y, z)
    if (p.s < 0.05) return
    if (p.x < -240 || p.x > this.screenWidth + 240 ||
        p.y < -240 || p.y > this.screenHeight + 240) return
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.scale(p.s, p.s)
    draw(ctx)
    ctx.restore()
  }

  _renderPlaneTag3D(ctx, plane) {
    const p = this._project(plane.x, plane.y, 46)
    const bw = 38
    const bh = 5
    const bx = p.x - bw / 2
    const by = p.y - 30
    if (by < 0 || bx < 0 || bx + bw > this.screenWidth) return

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2)
    ctx.fillStyle = '#333'
    ctx.fillRect(bx, by, bw, bh)

    const ratio = Math.max(0, Math.min(1, plane.health / plane.maxHealth))
    ctx.fillStyle = ratio > 0.5 ? '#2ECC71' : ratio > 0.25 ? '#F39C12' : '#E74C3C'
    ctx.fillRect(bx, by, bw * ratio, bh)

    ctx.fillStyle = '#fff'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(plane.displayName, p.x, by - 3)
  }

  _renderParticles3D(ctx) {
    for (const p of this.particles.particles) {
      const q = this._project(p.x, p.y, 30)
      if (q.s < 0.05) continue
      ctx.globalAlpha = p.life / p.maxLife
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(q.x, q.y, Math.max(1, p.size * q.s), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  _renderCampaignRings3D(ctx) {
    const rings = this.campaign.objective.rings
    for (const ring of rings) {
      const outer = []
      const inner = []
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2
        outer.push(this._project(ring.x + Math.cos(a) * ring.radius, ring.y + Math.sin(a) * ring.radius, 0))
        inner.push(this._project(ring.x + Math.cos(a) * ring.radius * 0.6, ring.y + Math.sin(a) * ring.radius * 0.6, 0))
      }

      ctx.beginPath()
      ctx.moveTo(outer[0].x, outer[0].y)
      for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y)
      ctx.closePath()
      ctx.strokeStyle = ring.passed ? '#2ECC71' : '#F1C40F'
      ctx.globalAlpha = ring.passed ? 0.3 : 0.8
      ctx.lineWidth = 3
      ctx.stroke()

      if (!ring.passed) {
        ctx.beginPath()
        ctx.moveTo(inner[0].x, inner[0].y)
        for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y)
        ctx.closePath()
        ctx.fillStyle = 'rgba(241, 196, 15, 0.30)'
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }

  _renderArena(ctx) {
    const radius = CONSTS.ARENA.RADIUS
    const theme = getMapTheme(this.mapId)

    // 战场底色与地图装饰（裁剪在圆形战场内）
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.clip()

    ctx.fillStyle = theme.bg
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2)

    // 网格
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.35
    const gridSize = 100
    for (let x = -radius; x <= radius; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, -radius)
      ctx.lineTo(x, radius)
      ctx.stroke()
    }
    for (let y = -radius; y <= radius; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(-radius, y)
      ctx.lineTo(radius, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 地图主题装饰
    theme.draw(ctx, radius, this.elapsed)

    ctx.restore()

    // 战场边界
    ctx.strokeStyle = theme.border
    ctx.lineWidth = 4
    ctx.setLineDash([20, 10])
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 中心标记
    ctx.strokeStyle = 'rgba(120,120,150,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 30, 0, Math.PI * 2)
    ctx.stroke()
  }

  _renderLootField(ctx, use3D) {
    const field = this.lootField
    if (!field.built) return

    for (const point of field.points) {
      if (!point.available) continue

      const bob = Math.sin(this.elapsed * 2 + point.bobOffset) * 4
      let px = point.x
      let py = point.y + bob
      let ps = 1
      if (use3D) {
        const p = this._project(px, py, 18)
        px = p.x
        py = p.y
        ps = p.s
      }
      ctx.save()
      ctx.translate(px, py)
      ctx.scale(ps, ps)
      ctx.rotate(point.rotation)

      const color = LOOT_COLORS[point.type] || '#FFD700'
      ctx.shadowColor = color
      ctx.shadowBlur = 12

      ctx.fillStyle = color
      ctx.fillRect(-9, -9, 18, 18)
      ctx.shadowBlur = 0

      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(-9, -9, 18, 18)

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(this._lootIcon(point.type), 0, 0)

      ctx.restore()
    }
  }

  _lootIcon(type) {
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

  _renderCampaignRings(ctx) {
    const rings = this.campaign.objective.rings
    for (const ring of rings) {
      if (ring.passed) {
        ctx.strokeStyle = '#2ECC71'
        ctx.globalAlpha = 0.3
      } else {
        ctx.strokeStyle = '#F1C40F'
        ctx.globalAlpha = 0.8
      }
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      // 环中心标记
      if (!ring.passed) {
        ctx.fillStyle = 'rgba(241, 196, 15, 0.3)'
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.radius * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  _renderHUD(ctx) {
    const w = this.screenWidth
    const h = this.screenHeight

    if (!this.player) return

    const player = this.player
    const hud = this.hudLayout

    // 左上：暂停按钮 / 右上：视角按钮
    this._drawChip(ctx, hud.pause, '暂停')
    this._drawChip(ctx, hud.zoom, this.zoom > 1 ? '视角 ×2' : '视角')

    // 顶部双色条：耐久（青）/ 能量（蓝）
    const bx = hud.barX
    const by = hud.barY
    const bw = hud.barW
    const bh = hud.barH

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(bx, by, bw, bh)
    const hpPercent = Math.max(0, Math.min(1, player.health / player.maxHealth))
    ctx.fillStyle = hpPercent > 0.5 ? '#2ECCB0' : hpPercent > 0.25 ? '#F39C12' : '#E74C3C'
    ctx.fillRect(bx, by, bw * hpPercent, bh)

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(bx, by + bh + 4, bw, bh)
    const windPercent = Math.max(0, Math.min(1, player.wind / CONSTS.WIND.MAX))
    ctx.fillStyle = player.isBoostOverheated ? '#E74C3C' : '#4A90D9'
    ctx.fillRect(bx, by + bh + 4, bw * windPercent, bh)

    // 左上信息面板
    const panel = hud.panel
    ctx.fillStyle = 'rgba(18,28,44,0.72)'
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h)

    ctx.fillStyle = '#fff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const tx = panel.x + 8
    const ty = panel.y + 17
    const remain = this.aiControllers.filter(c => c.plane.isAlive || c.plane.lives > 0).length

    ctx.fillText(`命数 ${Math.max(0, player.lives + 1)}   击杀 ${player.kills}`, tx, ty)
    ctx.fillText(`耐久 ${Math.ceil(player.health)}/${Math.round(player.maxHealth)}`, tx, ty + 16)
    ctx.fillText(`对手剩余 ${remain}`, tx, ty + 32)
    const ammoLine = player.missileAmmo > 0 ? `导弹 ×${player.missileAmmo}` : '没有导弹'
    const netLine = player.netAmmo > 0 ? `网兜 ×${player.netAmmo}` : '没有网兜'
    ctx.fillText(`${ammoLine} · ${netLine}`, tx, ty + 48)

    // 战役目标横幅（顶部居中）
    if (this.gameMode === 'campaign' && this.campaignLevel) {
      ctx.fillStyle = '#F1C40F'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`目标: ${this.campaign.getObjectiveText()}   金币 ${this.coins}`, w / 2, 20)
      ctx.textAlign = 'left'
    } else {
      ctx.fillStyle = '#F1C40F'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`金币 ${this.coins}`, w / 2, 20)
      ctx.textAlign = 'left'
    }

    // 左下：雷达
    this._renderRadar(ctx, hud.radar.x, hud.radar.y, hud.radar.size)

    // 武器冷却指示
    this._renderWeaponCooldowns(ctx, w, h)

    // 战斗提示
    this._renderToasts(ctx, w, h)

    // 摇杆 / 按钮 / 特技列表
    this._renderButtons(ctx, w, h)
  }

  // 顶部小按钮（暂停 / 视角）
  _drawChip(ctx, rect, text) {
    ctx.save()
    ctx.fillStyle = 'rgba(30,48,78,0.88)'
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(120,170,230,0.5)'
    ctx.lineWidth = 1
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 6)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2)
    ctx.restore()
  }

  _renderRadar(ctx, cx, cy, size) {
    const radius = (size || 100) / 2
    
    ctx.save()
    ctx.translate(cx, cy)
    
    // 雷达背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = '#4A90D9'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 扫描线
    ctx.strokeStyle = 'rgba(74, 144, 217, 0.5)'
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2)
    ctx.stroke()

    // 玩家在中心
    ctx.fillStyle = CONSTS.COLORS.PLAYER
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fill()
    
    // 玩家朝向
    ctx.strokeStyle = CONSTS.COLORS.PLAYER
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(this.player.yaw) * 15, Math.sin(this.player.yaw) * 15)
    ctx.stroke()

    // 其他飞机
    const radarRange = CONSTS.ARENA.RADIUS
    const scale = radius / radarRange
    
    for (const plane of this.planes) {
      if (plane === this.player || !plane.isAlive) continue
      
      const dx = plane.x - this.player.x
      const dy = plane.y - this.player.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist < radarRange) {
        const rx = dx * scale
        const ry = dy * scale
        
        ctx.fillStyle = plane.isAI ? CONSTS.COLORS.ENEMY : '#FFD700'
        ctx.beginPath()
        ctx.arc(rx, ry, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 导弹
    ctx.fillStyle = CONSTS.COLORS.MISSILE
    for (const missile of this.missiles) {
      if (missile.target === this.player) {
        const dx = missile.x - this.player.x
        const dy = missile.y - this.player.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        if (dist < radarRange) {
          const rx = dx * scale
          const ry = dy * scale
          
          ctx.beginPath()
          ctx.arc(rx, ry, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    ctx.restore()
  }

  _renderWeaponCooldowns(ctx, w, h) {
    const player = this.player
    if (!player) return

    // 机炮冷却（圆形射击按钮上叠一层暗色扇形）
    const fireBtn = this.input.uiLayout.fire
    if (fireBtn && player.spitCooldown > 0) {
      const percent = Math.max(0, Math.min(1, player.spitCooldown / CONSTS.SPIT.COOLDOWN))
      const cx = fireBtn.x + fireBtn.w / 2
      const cy = fireBtn.y + fireBtn.h / 2
      const r = fireBtn.w / 2
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2 * percent)
      ctx.restore()
    }
  }

  _renderToasts(ctx, w, h) {
    ctx.save()
    ctx.textAlign = 'center'
    
    this.toasts.forEach((toast, i) => {
      const alpha = toast.life / toast.maxLife
      ctx.globalAlpha = alpha
      
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 16px sans-serif'
      const y = h / 2 - 100 + i * 30
      
      // 背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      const metrics = ctx.measureText(toast.text)
      ctx.fillRect(w / 2 - metrics.width / 2 - 15, y - 15, metrics.width + 30, 25)
      
      ctx.fillStyle = '#FFD700'
      ctx.fillText(toast.text, w / 2, y)
    })
    
    ctx.restore()
  }

  _renderButtons(ctx, w, h) {
    const layout = this.input.uiLayout
    if (!layout) return
    const player = this.player

    // 先画风按钮（底层），再画四个小按钮（上层，可清晰重叠在风上）
    this._drawCircleButton(ctx, layout.boost, '风', '#2E8B7B', this.input.buttons.boost, null, null)

    // 射（机炮）：小蓝圆
    this._drawCircleButton(ctx, layout.fire, '射', '#3A6FAB', this.input.buttons.fire, null, null)

    // 网兜：绿色小圆（网格图标）+ 数量角标
    const netReady = player.canFireNet()
    this._drawCircleButton(ctx, layout.net, null, netReady ? '#3E8E4A' : '#555', netReady, player.netAmmo, 'grid')

    // 导弹：红色小圆（箭头图标）+ 数量角标
    const missileReady = player.canFireMissile()
    this._drawCircleButton(ctx, layout.missile, null, missileReady ? '#C0392B' : '#555', missileReady, player.missileAmmo, 'arrow')

    // 特技：红色小圆（笔尖图标）+ 冷却角标
    const stuntType = this.input.selectedStunt
    const stuntDef = STUNT_DEFS[stuntType]
    const stuntCd = player.stunt.getStuntCooldown(stuntType)
    const stuntReady = stuntCd <= 0 && player.wind >= stuntDef.cost
    this._drawCircleButton(ctx, layout.stunt, null, stuntReady ? '#C0392B' : '#555', stuntReady,
                           stuntCd > 0 ? Math.ceil(stuntCd) : null, 'pencil')

    // 右上竖排特技列表
    this._renderStuntList(ctx)

    // 左侧摇杆
    this._renderJoystick(ctx)
  }

  // 右上竖排特技列表（点选切换，显示能量消耗）
  _renderStuntList(ctx) {
    const list = this.input.uiLayout.stuntList
    if (!list || !this.player) return
    const player = this.player

    for (const rect of list) {
      const def = STUNT_DEFS[rect.stuntType]
      if (!def) continue
      const selected = this.input.selectedStunt === rect.stuntType
      const cd = player.stunt.getStuntCooldown(rect.stuntType)
      const usable = cd <= 0 && player.wind >= def.cost

      ctx.fillStyle = selected ? 'rgba(46,86,140,0.92)' : 'rgba(24,38,58,0.72)'
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 5)
      ctx.fill()

      ctx.strokeStyle = selected ? '#4A90D9' : 'rgba(120,160,210,0.35)'
      ctx.lineWidth = selected ? 2 : 1
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 5)
      ctx.stroke()

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = usable ? '#fff' : 'rgba(200,200,200,0.55)'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(def.name, rect.x + 7, rect.y + rect.h / 2)

      ctx.textAlign = 'right'
      ctx.fillStyle = cd > 0 ? '#E67E22' : '#7FD4A8'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(cd > 0 ? cd.toFixed(1) + 's' : String(def.cost), rect.x + rect.w - 7, rect.y + rect.h / 2)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }

  // 左侧摇杆（固定基座 + 跟随手指的摇杆头）
  _renderJoystick(ctx) {
    const layout = this.input.uiLayout
    const base = layout && layout.joystick && layout.joystick.base
    if (!base) return

    const cx = base.x + base.w / 2
    const cy = base.y + base.h / 2
    const r = base.w / 2
    const js = this.input.joystick

    ctx.save()
    ctx.fillStyle = 'rgba(18,22,30,0.55)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    const knobX = cx + js.dx * (r * 0.55)
    const knobY = cy + js.dy * (r * 0.55)
    ctx.fillStyle = js.active ? 'rgba(46,204,113,0.9)' : 'rgba(150,160,170,0.85)'
    ctx.beginPath()
    ctx.arc(knobX, knobY, r * 0.34, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('前进方向', cx, base.y - 9)
    ctx.restore()
  }

  _drawCircleButton(ctx, rect, label, color, active, badge, icon) {
    if (!rect) return
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const r = rect.w / 2

    ctx.save()
    ctx.globalAlpha = active ? 0.95 : 0.8
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.35)'
    ctx.lineWidth = active ? 3 : 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    if (icon) {
      this._drawButtonIcon(ctx, icon, cx, cy, r)
    } else {
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(10, Math.round(r * 0.62))}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, cy)
    }

    if (badge !== null && badge !== undefined) {
      const br = Math.max(7, r * 0.42)
      const bx = cx + r * 0.72
      const by = cy + r * 0.72
      ctx.fillStyle = 'rgba(10,14,20,0.85)'
      ctx.beginPath()
      ctx.arc(bx, by, br, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFD700'
      ctx.font = `bold ${Math.max(8, Math.round(br * 0.9))}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(badge), bx, by + 1)
    }
    ctx.restore()
  }

  // 小按钮图标：网格（网兜）/ 双箭头（导弹）/ 笔尖（特技）
  _drawButtonIcon(ctx, type, cx, cy, r) {
    const s = r * 0.5
    ctx.save()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2

    if (type === 'grid') {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(cx + i * s, cy - s)
        ctx.lineTo(cx + i * s, cy + s)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx - s, cy + i * s)
        ctx.lineTo(cx + s, cy + i * s)
        ctx.stroke()
      }
    } else if (type === 'arrow') {
      // 斜向双箭头
      ctx.beginPath()
      ctx.moveTo(cx - s, cy + s)
      ctx.lineTo(cx + s, cy - s)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + s - s * 0.8, cy - s)
      ctx.lineTo(cx + s, cy - s)
      ctx.lineTo(cx + s, cy - s + s * 0.8)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - s + s * 0.8, cy + s)
      ctx.lineTo(cx - s, cy + s)
      ctx.lineTo(cx - s, cy + s - s * 0.8)
      ctx.stroke()
    } else if (type === 'pencil') {
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.7, cy + s * 0.7)
      ctx.lineTo(cx + s, cy - s)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.7, cy + s * 0.7)
      ctx.lineTo(cx - s * 0.1, cy + s * 0.45)
      ctx.lineTo(cx - s * 0.45, cy + s * 0.1)
      ctx.closePath()
      ctx.fillStyle = '#fff'
      ctx.fill()
    }
    ctx.restore()
  }

  // 切换视角缩放
  toggleZoom() {
    this.zoom = this.zoom > 1 ? 1 : 2
  }

  pause() {
    if (this.state === GAME_STATE.PLAYING) {
      this.state = GAME_STATE.PAUSED
    }
  }

  resume() {
    if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING
      this.lastTime = Date.now()
    }
  }

  backToMenu() {
    this.state = GAME_STATE.MENU
    if (this.onBackToMenu) {
      this.onBackToMenu()
    }
  }
}

module.exports = { Game, GAME_STATE }
