// 游戏主引擎 - 对应原项目 BattleSession
const CONSTS = require('./constants')
const Plane = require('./Plane')
const AIController = require('./AIController')
const { Spit, Missile, Net } = require('./Projectiles')
const InputManager = require('./InputManager')
const { ParticleSystem, distance, randomRange } = require('./utils')

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
  }

  init(width, height) {
    this.screenWidth = width
    this.screenHeight = height
    this.viewScale = Math.min(width, height) / 900

    // 设置UI布局
    const layout = this._computeUILayout()
    this.input.init(layout)
  }

  _computeUILayout() {
    const w = this.screenWidth
    const h = this.screenHeight
    const buttonSize = 70

    return {
      joystick: {
        base: { x: 30, y: h - 130, w: 120, h: 120 }
      },
      boost: {
        x: w - buttonSize - 30,
        y: h - buttonSize - 30,
        w: buttonSize,
        h: buttonSize
      },
      fire: {
        x: w - buttonSize * 2 - 40,
        y: h - buttonSize * 2 - 40,
        w: buttonSize,
        h: buttonSize
      },
      missile: {
        x: w - buttonSize - 30,
        y: h - buttonSize * 3 - 50,
        w: buttonSize,
        h: buttonSize
      },
      net: {
        x: w - buttonSize * 2 - 40,
        y: h - buttonSize * 3 - 50,
        w: buttonSize,
        h: buttonSize
      }
    }
  }

  start(mode, aiCount) {
    this.gameMode = mode || CONSTS.GAME_MODE.PRACTICE
    this.aiCount = aiCount || CONSTS.DEFAULT_AI_COUNT
    
    this.state = GAME_STATE.PLAYING
    this.elapsed = 0
    
    // 清空实体
    this.planes = []
    this.aiControllers = []
    this.spits = []
    this.missiles = []
    this.nets = []
    this.toasts = []
    
    // 创建玩家
    this._spawnPlayer()
    
    // 创建AI
    for (let i = 0; i < this.aiCount; i++) {
      this._spawnAI(i)
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
    // 检查玩家死亡
    if (this.player && !this.player.isAlive && this.player.lives >= 0) {
      this.player.lives--
      if (this.player.lives >= 0) {
        // 延迟重生
        setTimeout(() => {
          if (this.state === GAME_STATE.PLAYING) {
            this._respawnPlane(this.player)
          }
        }, CONSTS.HEALTH.RESPAWN_DELAY * 1000)
      } else {
        this.player.lives = -1
      }
    }

    // AI死亡后重生
    for (const ai of this.aiControllers) {
      const plane = ai.plane
      if (!plane.isAlive && plane.lives > 0) {
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

  _checkGameEnd() {
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
    ctx.scale(this.viewScale, this.viewScale)
    ctx.translate(-camX, -camY)

    // 渲染战场
    this._renderArena(ctx)

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

    // 渲染HUD（屏幕坐标）
    if (this.state === GAME_STATE.PLAYING) {
      this._renderHUD(ctx)
    }
  }

  _renderArena(ctx) {
    const radius = CONSTS.ARENA.RADIUS

    // 战场边界
    ctx.strokeStyle = CONSTS.COLORS.ARENA_BORDER
    ctx.lineWidth = 4
    ctx.setLineDash([20, 10])
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 网格
    ctx.strokeStyle = CONSTS.COLORS.ARENA_GRID
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.3
    
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

    // 中心标记
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 30, 0, Math.PI * 2)
    ctx.stroke()
  }

  _renderHUD(ctx) {
    const w = this.screenWidth
    const h = this.screenHeight

    if (!this.player) return

    // 左上：血条和能量条
    const barX = 20
    const barY = 20
    const barW = 200
    const barH = 15

    // 血条背景
    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barW, barH)
    // 血条
    const hpPercent = this.player.health / this.player.maxHealth
    ctx.fillStyle = hpPercent > 0.5 ? '#2ECC71' : hpPercent > 0.25 ? '#F39C12' : '#E74C3C'
    ctx.fillRect(barX, barY, barW * hpPercent, barH)
    // 血条文字
    ctx.fillStyle = '#fff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`HP: ${Math.ceil(this.player.health)}`, barX + 5, barY + 12)

    // 能量条
    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY + 22, barW, barH)
    ctx.fillStyle = this.player.isBoostOverheated ? '#E74C3C' : CONSTS.COLORS.WIND_BAR
    ctx.fillRect(barX, barY + 22, barW * (this.player.wind / CONSTS.WIND.MAX), barH)
    ctx.fillStyle = '#fff'
    ctx.fillText(`能量: ${Math.ceil(this.player.wind)}`, barX + 5, barY + 34)

    // 生命数
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(`生命: ${Math.max(0, this.player.lives + 1)}`, barX, barY + 60)

    // 击杀数
    ctx.fillText(`击杀: ${this.player.kills}`, barX, barY + 80)

    // 右上：雷达
    this._renderRadar(ctx, w - 120, 60)

    // 右下：弹药
    const ammoX = w - 120
    const ammoY = h - 140
    
    ctx.fillStyle = '#fff'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'left'
    
    // 导弹
    ctx.fillStyle = CONSTS.COLORS.MISSILE
    ctx.fillRect(ammoX, ammoY, 15, 15)
    ctx.fillStyle = '#fff'
    ctx.fillText(`导弹 ${this.player.missileAmmo}`, ammoX + 20, ammoY + 12)
    
    // 网兜
    ctx.fillStyle = CONSTS.COLORS.NET
    ctx.beginPath()
    ctx.arc(ammoX + 7, ammoY + 30, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(`网兜 ${this.player.netAmmo}`, ammoX + 20, ammoY + 34)

    // 武器冷却指示
    this._renderWeaponCooldowns(ctx, w, h)

    // 战斗提示
    this._renderToasts(ctx, w, h)

    // 按钮
    this._renderButtons(ctx, w, h)
  }

  _renderRadar(ctx, cx, cy) {
    const size = 100
    const radius = size / 2
    
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

    // 机炮冷却（射击按钮位置）
    const fireBtn = this.input.uiLayout.fire
    if (fireBtn) {
      const cooldownPercent = 1 - player.spitCooldown / CONSTS.SPIT.COOLDOWN
      if (player.spitCooldown > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(fireBtn.x, fireBtn.y, fireBtn.w, fireBtn.h * (1 - cooldownPercent))
      }
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

    // 机炮按钮
    this._drawButton(ctx, layout.fire, '射击', '#E74C3C', this.input.buttons.fire)
    
    // 导弹按钮
    const missileReady = this.player.canFireMissile()
    this._drawButton(ctx, layout.missile, '导弹', missileReady ? CONSTS.COLORS.MISSILE : '#555', missileReady)
    
    // 网兜按钮
    const netReady = this.player.canFireNet()
    this._drawButton(ctx, layout.net, '网兜', netReady ? CONSTS.COLORS.NET : '#555', netReady)
    
    // 加速按钮
    this._drawButton(ctx, layout.boost, '加速', '#F39C12', this.input.buttons.boost)
  }

  _drawButton(ctx, rect, label, color, active) {
    ctx.save()
    
    // 背景
    ctx.globalAlpha = active ? 0.9 : 0.7
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = active ? '#fff' : '#888'
    ctx.lineWidth = active ? 3 : 2
    ctx.stroke()
    
    // 标签
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2)
    
    ctx.restore()
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
