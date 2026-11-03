// 抖音小游戏主入口
const { Game, GAME_STATE } = require('./Game')
const InputManager = require('./InputManager')

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
    } else {
      // 开发调试用
      this.canvas = {
        width: this.screenInfo.width,
        height: this.screenInfo.height
      }
      const MockCanvas = require('./mock/canvas')
      this.ctx = new MockCanvas()
    }
    
    if (!this.ctx && this.canvas.getContext) {
      this.ctx = this.canvas.getContext('2d')
    }
    
    if (!this.ctx) {
      console.error('无法创建 Canvas 上下文')
      return
    }

    // 设置 canvas 尺寸
    if (this.canvas.width !== undefined) {
      this.canvas.width = this.screenInfo.width * this.screenInfo.pixelRatio
      this.canvas.height = this.screenInfo.height * this.screenInfo.pixelRatio
      this.ctx.scale(this.screenInfo.pixelRatio, this.screenInfo.pixelRatio)
    }

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
    const btnH = 60

    // 开始游戏按钮
    const startX = (w - btnW) / 2
    const startY = h * 0.5
    if (this._pointInRect(x, y, startX, startY, btnW, btnH)) {
      this.menuState = 'aiSelect'
      return
    }

    // 帮助按钮
    const helpY = startY + btnH + 20
    if (this._pointInRect(x, y, startX, helpY, btnW, btnH)) {
      this.menuState = 'help'
      return
    }

    // 设置按钮
    const setY = helpY + btnH + 20
    if (this._pointInRect(x, y, startX, setY, btnW, btnH)) {
      this.menuState = 'settings'
      return
    }

    // AI数量选择界面
    if (this.menuState === 'aiSelect') {
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

    // 帮助界面
    if (this.menuState === 'help') {
      // 返回按钮
      const backY = h * 0.8
      if (this._pointInRect(x, y, startX, backY, btnW, btnH)) {
        this.menuState = 'main'
        return
      }
    }

    // 游戏结束界面
    if (this.game.state === GAME_STATE.ENDED) {
      // 再来一局
      const retryY = h * 0.6
      if (this._pointInRect(x, y, startX, retryY, btnW, btnH)) {
        this._startGame(this.game.planes.filter(p => p.isAI).length || 3)
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
      this._drawMenuButton(ctx, w, h, h * 0.5, '开始游戏', '#4A90D9')
      this._drawMenuButton(ctx, w, h, h * 0.5 + 80, '操作说明', '#27AE60')
      this._drawMenuButton(ctx, w, h, h * 0.5 + 160, '设置', '#7F8C8D')
    } else if (this.menuState === 'aiSelect') {
      // AI数量选择
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText('选择AI数量', w / 2, h * 0.35)
      
      this._drawMenuButton(ctx, w, h, h * 0.4, '简单 (1 AI)', '#2ECC71')
      this._drawMenuButton(ctx, w, h, h * 0.4 + 75, '普通 (3 AI)', '#F39C12')
      this._drawMenuButton(ctx, w, h, h * 0.4 + 150, '困难 (5 AI)', '#E74C3C')
      this._drawMenuButton(ctx, w, h, h * 0.4 + 250, '返回', '#7F8C8D')
    } else if (this.menuState === 'help') {
      this._renderHelp(ctx, w, h)
    }
  }

  _drawMenuButton(ctx, w, h, y, text, color) {
    const btnW = 220
    const btnH = 60
    const x = (w - btnW) / 2

    // 按钮背景
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x, y, btnW, btnH, 10)
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
    ctx.beginPath()
    ctx.roundRect(x, y, btnW, btnH, 10)
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

    const won = this.gameResult && this.gameResult.survived && 
                this.game.aiControllers.every(c => !c.plane.isAlive || c.plane.lives < 0)

    ctx.fillStyle = won ? '#2ECC71' : '#E74C3C'
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(won ? '胜利！' : '游戏结束', w / 2, h * 0.25)

    // 战绩
    if (this.gameResult) {
      ctx.fillStyle = '#fff'
      ctx.font = '18px sans-serif'
      const statsY = h * 0.35
      ctx.fillText(`击杀数: ${this.gameResult.kills}`, w / 2, statsY)
      ctx.fillText(`生存时间: ${Math.floor(this.gameResult.time)}秒`, w / 2, statsY + 30)
    }

    // 按钮
    this._drawMenuButton(ctx, w, h, h * 0.6, '再来一局', '#4A90D9')
    this._drawMenuButton(ctx, w, h, h * 0.6 + 80, '返回主菜单', '#7F8C8D')
  }
}

// 启动
const app = new MainApp()
app.init()
