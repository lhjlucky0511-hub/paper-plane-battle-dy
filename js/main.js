// 抖音小游戏主入口 - 纸飞机大战
const { Game, GAME_STATE } = require('./Game')
const InputManager = require('./InputManager')

// 兼容版 roundRect 实现
function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// 获取屏幕尺寸
function getScreenInfo() {
  if (typeof tt !== 'undefined') {
    const info = tt.getSystemInfoSync()
    return {
      width: info.windowWidth,
      height: info.windowHeight,
      pixelRatio: info.pixelRatio || 1
    }
  }
  return { width: 375, height: 667, pixelRatio: 2 }
}

// 主程序
class MainApp {
  constructor() {
    this.canvas = null
    this.ctx = null
    this.game = null
    this.input = null
    this.screenInfo = getScreenInfo()
    
    this.menuState = 'main'  // main, modeSelect, aiSelect, help
    this.gameResult = null
  }

  init() {
    // 抖音小游戏获取 canvas
    if (typeof tt !== 'undefined') {
      this.canvas = tt.createCanvas()
      this.ctx = this.canvas.getContext('2d')
      // 抖音小游戏 canvas 自动适配屏幕，不需要手动 scale
      // 但需要确保像素比正确
      if (this.canvas.width && this.screenInfo.pixelRatio > 1) {
        this.ctx.scale(this.screenInfo.pixelRatio, this.screenInfo.pixelRatio)
      }
    } else {
      // 开发调试用（mock 环境）
      this.canvas = null
      this.ctx = null
    }
    
    if (!this.ctx) {
      console.error('无法创建 Canvas 上下文')
      return
    }

    console.log('[init] canvas:', this.screenInfo.width, 'x', this.screenInfo.height,
                'pixelRatio:', this.screenInfo.pixelRatio)

    // 初始化输入管理器
    this.input = new InputManager()

    // 初始化游戏
    this.game = new Game(this.canvas, this.ctx, this.input)
    this.game.init(this.screenInfo.width, this.screenInfo.height)
    
    this.game.onGameEnd = (stats) => this._onGameEnd(stats)
    this.game.onBackToMenu = () => this.menuState = 'main'

    // 设置屏幕点击事件（用于UI）
    this._setupMenuInput()

    // 开始主循环
    this._lastTime = Date.now()
    this._loop()
  }

  _setupMenuInput() {
    // 使用抖音小游戏触摸事件
    if (typeof tt !== 'undefined') {
      tt.onTouchStart((e) => {
        if (this.game.state === GAME_STATE.MENU || this.game.state === GAME_STATE.ENDED) {
          const touch = e.changedTouches[0]
          this._handleMenuTouch(touch.clientX, touch.clientY)
        }
      })
    }
  }

  _handleMenuTouch(x, y) {
    const w = this.screenInfo.width
    const h = this.screenInfo.height
    const btnW = 220
    const btnH = 55

    // 主菜单按钮
    if (this.menuState === 'main') {
      const startX = (w - btnW) / 2
      const baseY = h * 0.45
      const gap = btnH + 15

      // 对战模式
      if (this._pointInRect(x, y, startX, baseY, btnW, btnH)) {
        this.menuState = 'aiSelect'
        return
      }
      // 战役模式
      if (this._pointInRect(x, y, startX, baseY + gap, btnW, btnH)) {
        this.menuState = 'campaignChapter'
        return
      }
      // 联机模式
      if (this._pointInRect(x, y, startX, baseY + gap * 2, btnW, btnH)) {
        this.menuState = 'lanMenu'
        return
      }
      // 操作说明
      if (this._pointInRect(x, y, startX, baseY + gap * 3, btnW, btnH)) {
        this.menuState = 'help'
        return
      }
    }

    // AI数量选择界面
    if (this.menuState === 'aiSelect') {
      const startX = (w - btnW) / 2
      // 选择1个AI
      const ai1Y = h * 0.4
      if (this._pointInRect(x, y, startX, ai1Y, btnW, btnH)) {
        this._startGame(1)
        return
      }
      // 选择3个AI
      const ai3Y = ai1Y + btnH + 15
      if (this._pointInRect(x, y, startX, ai3Y, btnW, btnH)) {
        this._startGame(3)
        return
      }
      // 选择5个AI
      const ai5Y = ai3Y + btnH + 15
      if (this._pointInRect(x, y, startX, ai5Y, btnW, btnH)) {
        this._startGame(5)
        return
      }
      // 返回
      const backY = ai5Y + btnH + 30
      if (this._pointInRect(x, y, startX, backY, btnW, btnH)) {
        this.menuState = 'main'
        return
      }
    }

    // 战役章节选择
    if (this.menuState === 'campaignChapter') {
      const startX = (w - btnW) / 2
      const chapters = this.game.campaign
      for (let i = 0; i < 4; i++) {
        const btnY = h * 0.3 + i * (btnH + 10)
        if (this._pointInRect(x, y, startX, btnY, btnW, btnH)) {
          this.selectedChapter = i + 1
          this.menuState = 'campaignLevel'
          return
        }
      }
      // 返回
      const backY = h * 0.85
      if (this._pointInRect(x, y, startX, backY, btnW, btnH)) {
        this.menuState = 'main'
        return
      }
    }

    // 战役关卡选择
    if (this.menuState === 'campaignLevel') {
      const startX = (w - btnW) / 2
      const levels = this.game.campaign.getLevelsOfChapter(this.selectedChapter)
      const cols = 3
      const btnW2 = 70
      const btnH2 = 70
      const startX2 = (w - cols * (btnW2 + 10)) / 2
      const startY = h * 0.25

      for (let i = 0; i < levels.length; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const bx = startX2 + col * (btnW2 + 10)
        const by = startY + row * (btnH2 + 10)
        if (this._pointInRect(x, y, bx, by, btnW2, btnH2)) {
          const level = levels[i]
          if (this.game.campaign.unlockedLevels.includes(level.id)) {
            this._startCampaign(level.id)
          }
          return
        }
      }
      // 返回
      const backY = h * 0.9
      if (this._pointInRect(x, y, startX, backY, btnW, btnH)) {
        this.menuState = 'campaignChapter'
        return
      }
    }

    // 联机菜单
    if (this.menuState === 'lanMenu') {
      const startX = (w - btnW) / 2
      const baseY = h * 0.4
      // 创建房间
      if (this._pointInRect(x, y, startX, baseY, btnW, btnH)) {
        this.menuState = 'lanCreate'
        return
      }
      // 加入房间
      if (this._pointInRect(x, y, startX, baseY + btnH + 15, btnW, btnH)) {
        this.menuState = 'lanJoin'
        return
      }
      // 返回
      if (this._pointInRect(x, y, startX, baseY + (btnH + 15) * 2, btnW, btnH)) {
        this.menuState = 'main'
        return
      }
    }

    // 帮助界面
    if (this.menuState === 'help') {
      const startX = (w - btnW) / 2
      const backY = h * 0.85
      if (this._pointInRect(x, y, startX, backY, btnW, btnH)) {
        this.menuState = 'main'
        return
      }
    }

    // 游戏结束界面
    if (this.game.state === GAME_STATE.ENDED) {
      const startX = (w - btnW) / 2
      // 再来一局
      const retryY = h * 0.6
      if (this._pointInRect(x, y, startX, retryY, btnW, btnH)) {
        if (this.game.gameMode === 'campaign') {
          this._startCampaign(this.game.campaignLevel.id)
        } else {
          this._startGame(this.game.planes.filter(p => p.isAI).length || 3)
        }
        return
      }
      // 返回主菜单
      const menuY = retryY + btnH + 20
      if (this._pointInRect(x, y, startX, menuY, btnW, btnH)) {
        this.game.backToMenu()
        return
      }
    }

    // 暂停界面
    if (this.game.state === GAME_STATE.PAUSED) {
      // 继续游戏
      const resumeY = h * 0.5
      if (this._pointInRect(x, y, startX, resumeY, btnW, btnH)) {
        this.game.resume()
        return
      }
      // 返回主菜单
      const quitY = resumeY + btnH + 20
      if (this._pointInRect(x, y, startX, quitY, btnW, btnH)) {
        this.game.backToMenu()
        return
      }
    }
  }

  _pointInRect(x, y, rx, ry, rw, rh) {
    return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh
  }

  _startGame(aiCount) {
    this.menuState = 'main'
    this.gameResult = null
    this.game.start('versus', aiCount)
    this._lastTime = Date.now()
  }

  _startCampaign(levelId) {
    this.menuState = 'main'
    this.gameResult = null
    this.game.startCampaign(levelId)
    this._lastTime = Date.now()
  }

  _onGameEnd(stats) {
    this.gameResult = stats
  }

  _loop() {
    const now = Date.now()
    const dt = now - this._lastTime
    this._lastTime = now

    if (this.game.state === GAME_STATE.PLAYING) {
      this.game.update(now)
    }

    this._render()

    // 继续循环
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this._loop())
    } else {
      // 抖音小游戏用 setTimeout
      setTimeout(() => this._loop(), 16)
    }
  }

  _render() {
    const ctx = this.ctx
    const w = this.screenInfo.width
    const h = this.screenInfo.height

    // 清空屏幕
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, w, h)

    if (this.game.state === GAME_STATE.MENU) {
      this._renderMenu(ctx, w, h)
    } else if (this.game.state === GAME_STATE.PLAYING || 
               this.game.state === GAME_STATE.PAUSED) {
      this.game.render()
      
      if (this.game.state === GAME_STATE.PAUSED) {
        this._renderPauseOverlay(ctx, w, h)
      }
    } else if (this.game.state === GAME_STATE.ENDED) {
      this._renderGameOver(ctx, w, h)
    }
  }

  _renderMenu(ctx, w, h) {
    // 标题
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('纸飞机大战', w / 2, h * 0.2)
    
    ctx.fillStyle = '#888'
    ctx.font = '16px sans-serif'
    ctx.fillText('Paper Plane Battle', w / 2, h * 0.2 + 30)

    if (this.menuState === 'main') {
      const baseY = h * 0.45
      this._drawMenuButton(ctx, w, h, baseY, '对战模式', '#4A90D9')
      this._drawMenuButton(ctx, w, h, baseY + 70, '战役模式', '#E74C3C')
      this._drawMenuButton(ctx, w, h, baseY + 140, '联机模式', '#9B59B6')
      this._drawMenuButton(ctx, w, h, baseY + 210, '操作说明', '#27AE60')
    } else if (this.menuState === 'aiSelect') {
      // AI数量选择
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText('选择AI数量', w / 2, h * 0.35)
      
      this._drawMenuButton(ctx, w, h, h * 0.4, '简单 (1 AI)', '#2ECC71')
      this._drawMenuButton(ctx, w, h, h * 0.4 + 70, '普通 (3 AI)', '#F39C12')
      this._drawMenuButton(ctx, w, h, h * 0.4 + 140, '困难 (5 AI)', '#E74C3C')
      this._drawMenuButton(ctx, w, h, h * 0.4 + 240, '返回', '#7F8C8D')
    } else if (this.menuState === 'campaignChapter') {
      this._renderCampaignChapters(ctx, w, h)
    } else if (this.menuState === 'campaignLevel') {
      this._renderCampaignLevels(ctx, w, h)
    } else if (this.menuState === 'lanMenu') {
      this._renderLanMenu(ctx, w, h)
    } else if (this.menuState === 'lanCreate' || this.menuState === 'lanJoin') {
      this._renderLanInfo(ctx, w, h)
    } else if (this.menuState === 'help') {
      this._renderHelp(ctx, w, h)
    }
  }

  _renderCampaignChapters(ctx, w, h) {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('选择章节', w / 2, h * 0.2)

    const chapters = [
      { name: '第1章·书桌战场', desc: '7关' },
      { name: '第2章·遗迹迷途', desc: '7关' },
      { name: '第3章·星核决战', desc: '5关' },
      { name: '第4章·都市峡谷', desc: '7关' }
    ]

    for (let i = 0; i < chapters.length; i++) {
      const y = h * 0.3 + i * 65
      this._drawMenuButton(ctx, w, h, y, `${chapters[i].name} [${chapters[i].desc}]`, i === 0 ? '#4A90D9' : i === 1 ? '#E74C3C' : i === 2 ? '#9B59B6' : '#F39C12')
    }
    this._drawMenuButton(ctx, w, h, h * 0.85, '返回', '#7F8C8D')
  }

  _renderCampaignLevels(ctx, w, h) {
    const chapter = this.game.campaign.getChapter(this.selectedChapter)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(chapter ? chapter.name : '关卡选择', w / 2, h * 0.15)

    const levels = this.game.campaign.getLevelsOfChapter(this.selectedChapter)
    const cols = 3
    const btnW = 70
    const btnH = 70
    const startX = (w - cols * (btnW + 10)) / 2
    const startY = h * 0.25

    for (let i = 0; i < levels.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const bx = startX + col * (btnW + 10)
      const by = startY + row * (btnH + 10)
      const level = levels[i]
      const unlocked = this.game.campaign.unlockedLevels.includes(level.id)
      const completed = this.game.campaign.completedLevels.includes(level.id)

      // 按钮背景
      ctx.fillStyle = !unlocked ? '#444' : completed ? '#2ECC71' : level.isBoss ? '#E74C3C' : '#4A90D9'
      ctx.globalAlpha = unlocked ? 1 : 0.5
      roundRect(ctx, bx, by, btnW, btnH, 8)
      ctx.fill()
      ctx.globalAlpha = 1

      // 关卡编号
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(level.id, bx + btnW / 2, by + btnH / 2 + 5)

      // Boss标记
      if (level.isBoss) {
        ctx.fillStyle = '#FFD700'
        ctx.font = '10px sans-serif'
        ctx.fillText('BOSS', bx + btnW / 2, by + 12)
      }

      // 已完成标记
      if (completed) {
        ctx.fillStyle = '#fff'
        ctx.font = '10px sans-serif'
        ctx.fillText('✓', bx + btnW - 12, by + 15)
      }

      // 锁定标记
      if (!unlocked) {
        ctx.fillStyle = '#fff'
        ctx.font = '16px sans-serif'
        ctx.fillText('🔒', bx + btnW / 2, by + btnH / 2 + 5)
      }
    }

    this._drawMenuButton(ctx, w, h, h * 0.9, '返回', '#7F8C8D')
  }

  _renderLanMenu(ctx, w, h) {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('联机模式', w / 2, h * 0.3)

    ctx.fillStyle = '#888'
    ctx.font = '14px sans-serif'
    ctx.fillText('基于 WebSocket 的实时对战', w / 2, h * 0.35)

    const baseY = h * 0.4
    this._drawMenuButton(ctx, w, h, baseY, '创建房间', '#4A90D9')
    this._drawMenuButton(ctx, w, h, baseY + 70, '加入房间', '#27AE60')
    this._drawMenuButton(ctx, w, h, baseY + 140, '返回', '#7F8C8D')
  }

  _renderLanInfo(ctx, w, h) {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(this.menuState === 'lanCreate' ? '创建房间' : '加入房间', w / 2, h * 0.3)

    ctx.fillStyle = '#aaa'
    ctx.font = '14px sans-serif'
    ctx.fillText('需要配置 WebSocket 中转服务器', w / 2, h * 0.4)
    ctx.fillText('服务器地址请在 LanSystem.js 中配置', w / 2, h * 0.45)

    ctx.fillStyle = '#888'
    ctx.font = '12px sans-serif'
    ctx.fillText('请确保主机和客户端在同一局域网', w / 2, h * 0.55)
    ctx.fillText('或通过公网 WebSocket 服务器连接', w / 2, h * 0.6)

    this._drawMenuButton(ctx, w, h, h * 0.8, '返回', '#7F8C8D')
  }

  _drawMenuButton(ctx, w, h, y, text, color) {
    const btnW = 220
    const btnH = 60
    const x = (w - btnW) / 2

    // 按钮背景
    ctx.fillStyle = color
    roundRect(ctx, x, y, btnW, btnH, 10)
    ctx.fill()

    // 按钮文字
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, y + btnH / 2)
    ctx.textBaseline = 'alphabetic'
  }

  _renderHelp(ctx, w, h) {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('操作说明', w / 2, h * 0.3)

    ctx.font = '14px sans-serif'
    ctx.textAlign = 'left'
    
    const lines = [
      '【移动】',
      '屏幕左下摇杆控制飞机方向',
      '',
      '【武器】',
      '右侧按钮：射击 / 导弹 / 网兜 / 加速',
      '射击：机炮，弹药无限',
      '导弹：追踪目标，数量有限',
      '网兜：近距离网住敌人，造成高伤害',
      '加速：消耗能量快速飞行',
      '',
      '【战术】',
      '导弹需要锁定目标（在正前方）',
      '网兜用于近距离缠斗',
      '注意避开敌方导弹（有警告）',
      ''
    ]

    ctx.fillStyle = '#ccc'
    lines.forEach((line, i) => {
      ctx.fillText(line, 40, h * 0.38 + i * 22)
    })

    // 返回按钮
    const btnW = 220
    const btnH = 60
    const x = (w - btnW) / 2
    const y = h * 0.8
    ctx.fillStyle = '#7F8C8D'
    roundRect(ctx, x, y, btnW, btnH, 10)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('返回', w / 2, y + btnH / 2 + 6)
  }

  _renderPauseOverlay(ctx, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('游戏暂停', w / 2, h * 0.35)

    this._drawMenuButton(ctx, w, h, h * 0.5, '继续游戏', '#27AE60')
    this._drawMenuButton(ctx, w, h, h * 0.5 + 80, '返回主菜单', '#E74C3C')
  }

  _renderGameOver(ctx, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(0, 0, w, h)

    let won = false
    let title = '游戏结束'
    
    if (this.game.gameMode === 'campaign') {
      won = this.gameResult && this.gameResult.campaignWin
      title = won ? '任务完成！' : '任务失败'
    } else {
      won = this.gameResult && this.gameResult.survived && 
            this.game.aiControllers.every(c => !c.plane.isAlive || c.plane.lives < 0)
      title = won ? '胜利！' : '游戏结束'
    }

    ctx.fillStyle = won ? '#2ECC71' : '#E74C3C'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, w / 2, h * 0.25)

    // 战绩
    if (this.gameResult) {
      ctx.fillStyle = '#fff'
      ctx.font = '18px sans-serif'
      const statsY = h * 0.35
      ctx.fillText(`击杀数: ${this.gameResult.kills}`, w / 2, statsY)
      ctx.fillText(`生存时间: ${Math.floor(this.gameResult.time)}秒`, w / 2, statsY + 30)
      
      if (won && this.game.gameMode === 'campaign') {
        const level = this.game.campaignLevel
        ctx.fillStyle = '#F1C40F'
        ctx.fillText(`获得 ${level.rewardCoins} 金币`, w / 2, statsY + 60)
      }
    }

    // 按钮
    this._drawMenuButton(ctx, w, h, h * 0.6, '再来一局', '#4A90D9')
    this._drawMenuButton(ctx, w, h, h * 0.6 + 80, '返回主菜单', '#7F8C8D')
  }
}

// 启动
const app = new MainApp()
app.init()
