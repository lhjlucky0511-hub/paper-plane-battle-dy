// 抖音小游戏主入口 - 纸飞机大战
const { Game, GAME_STATE } = require('./Game')
const InputManager = require('./InputManager')

// 兼容版 roundRect 实现
function roundRect(ctx, x, y, w, h, r) {
  // 抖音引擎的 ctx.roundRect 不会重置路径，必须手动 beginPath，
  // 否则多个按钮会累积到同一路径，后一次 fill() 会覆盖前面所有按钮
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  r = Math.min(r, w / 2, h / 2)
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
    this._lastMenuTouchTime = 0

    // 加载页面状态
    this._loading = false
    this._loadingStart = 0
    this._loadingDuration = 1800   // 启动页总时长（毫秒）
    this._loadingT = 0            // 当前进度 0~1
    this._paperPlanePhase = 0     // 纸飞机动画相位
  }

  init() {
    // 抖音小游戏获取 canvas
    // 优先使用 game.js 顶部创建的全局上屏画布（必须是第一个 tt.createCanvas() 调用）
    if (typeof tt !== 'undefined') {
      if (globalThis.__rawCanvas && globalThis.__rawCtx) {
        this.canvas = globalThis.__rawCanvas
        this.ctx = globalThis.__rawCtx
      } else {
        // 兜底（可能是离屏画布）
        this.canvas = tt.createCanvas()
        this.ctx = this.canvas.getContext('2d')
      }
    } else {
      this.canvas = null
      this.ctx = null
    }
    
    if (!this.ctx) {
      console.error('无法创建 Canvas 上下文')
      return
    }

    console.log('[init] canvas:', this.screenInfo.width, 'x', this.screenInfo.height,
                'pixelRatio:', this.screenInfo.pixelRatio)

    // 启动：先显示 LOADING 页面，再初始化 Game 并进入主循环
    this._loading = true
    this._loadingStart = Date.now()
    this._lastTime = this._loadingStart
    this._loadingLoop()
  }

  _loadingLoop() {
    try {
      const now = Date.now()
      const dt = now - this._lastTime
      this._lastTime = now
      this._paperPlanePhase += dt / 1000

      // 每帧渲染加载页
      this._renderLoading(this.ctx, this.screenInfo.width, this.screenInfo.height)

      // 进度到 100% 后执行初始化
      if (now - this._loadingStart >= this._loadingDuration) {
        this._loading = false
        this._finishInit()
        return
      }

      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => this._loadingLoop())
      } else {
        setTimeout(() => this._loadingLoop(), 16)
      }
    } catch (e) {
      console.error('[LOADING ERROR]', e.message)
      this._loading = false
      this._finishInit()
    }
  }

  _finishInit() {
    try {
      this.input = new InputManager()
      this.game = new Game(this.canvas, this.ctx, this.input)
      this.game.init(this.screenInfo.width, this.screenInfo.height)

      this.game.onGameEnd = (stats) => this._onGameEnd(stats)
      this.game.onBackToMenu = () => this.menuState = 'main'

      this._setupMenuInput()

      // 开始主循环
      this._lastTime = Date.now()
      this._loop()
    } catch(e) {
      console.error('[init] FAILED:', e.message)
      try {
        this.ctx.fillStyle = '#FF0000'
        this.ctx.fillRect(0, 0, this.screenInfo.width, this.screenInfo.height)
        this.ctx.fillStyle = '#FFFFFF'
        this.ctx.font = '14px sans-serif'
        this.ctx.fillText('ERROR: ' + e.message, 20, 50)
      } catch(e2) {}
    }
  }

  _setupMenuInput() {
    // 使用抖音小游戏触摸事件
    if (typeof tt !== 'undefined') {
      tt.onTouchStart((e) => {
        // 防止同一次点击被重复派发，导致一次触摸连续穿过两层菜单
        const now = Date.now()
        if (now - (this._lastMenuTouchTime || 0) < 250) return
        this._lastMenuTouchTime = now

        const touch = e.changedTouches[0]
        const x = touch.clientX
        const y = touch.clientY

        if (this.game.state === GAME_STATE.PLAYING) {
          const hud = this.game.hudLayout
          // 左上暂停按钮
          if (hud && this._pointInRect(x, y, hud.pause.x, hud.pause.y, hud.pause.w, hud.pause.h)) {
            this.game.pause()
            return
          }
          // 右上视角按钮
          if (hud && this._pointInRect(x, y, hud.zoom.x, hud.zoom.y, hud.zoom.w, hud.zoom.h)) {
            this.game.toggleZoom()
          }
          return
        }

        if (this.game.state === GAME_STATE.MENU ||
            this.game.state === GAME_STATE.ENDED ||
            this.game.state === GAME_STATE.PAUSED) {
          this._handleMenuTouch(x, y)
        }
      })
    }
  }

  // 横屏菜单布局：渲染与命中检测共用同一份矩形
  _menuLayout() {
    const w = this.screenInfo.width
    const h = this.screenInfo.height
    const L = {}

    // 横排按钮
    const row = (count, bw, bh, gap, y) => {
      const total = count * bw + (count - 1) * gap
      const x0 = (w - total) / 2
      const arr = []
      for (let i = 0; i < count; i++) {
        arr.push({ x: x0 + i * (bw + gap), y: y, w: bw, h: bh })
      }
      return arr
    }

    // 网格按钮
    const grid = (count, cols, bw, bh, gapX, gapY, y) => {
      const total = cols * bw + (cols - 1) * gapX
      const x0 = (w - total) / 2
      const arr = []
      for (let i = 0; i < count; i++) {
        arr.push({
          x: x0 + (i % cols) * (bw + gapX),
          y: y + Math.floor(i / cols) * (bh + gapY),
          w: bw,
          h: bh
        })
      }
      return arr
    }

    if (this.game.state === GAME_STATE.ENDED) {
      const p = row(2, 176, 54, 24, h * 0.62)
      L.retry = p[0]
      L.back = p[1]
      return L
    }

    if (this.game.state === GAME_STATE.PAUSED) {
      const p = row(2, 176, 54, 24, h * 0.56)
      L.resume = p[0]
      L.back = p[1]
      return L
    }

    if (this.menuState === 'main') {
      // 标题放到屏幕正中，按钮放在标题下方
      L.main = grid(4, 2, Math.min(220, w * 0.26), Math.min(56, h * 0.15), 22, 16, h * 0.62)
    } else if (this.menuState === 'aiSelect') {
      L.ai = row(3, Math.min(180, w * 0.21), 52, 16, h * 0.46)
      L.back = row(1, 150, 42, 0, h - 64)[0]
    } else if (this.menuState === 'campaignChapter') {
      L.chapters = grid(4, 2, Math.min(210, w * 0.25), 52, 20, 14, h * 0.32)
      L.back = row(1, 150, 42, 0, h - 64)[0]
    } else if (this.menuState === 'campaignLevel') {
      const size = Math.min(56, h * 0.15)
      L.levels = row(7, size, size, 12, h * 0.44)
      L.back = row(1, 150, 42, 0, h - 64)[0]
    } else if (this.menuState === 'lanMenu') {
      L.lan = row(3, Math.min(170, w * 0.2), 52, 20, h * 0.5)
    } else {
      // lanCreate / lanJoin / help 只有返回按钮
      L.back = row(1, 150, 42, 0, h - 64)[0]
    }

    return L
  }

  _handleMenuTouch(x, y) {
    const L = this._menuLayout()
    const hit = (r) => r && this._pointInRect(x, y, r.x, r.y, r.w, r.h)

    // 结算界面
    if (this.game.state === GAME_STATE.ENDED) {
      if (hit(L.retry)) {
        if (this.game.gameMode === 'campaign' && this.game.campaignLevel) {
          this._startCampaign(this.game.campaignLevel.id)
        } else {
          this._startGame(this.game.planes.filter(p => p.isAI).length || 3)
        }
        return
      }
      if (hit(L.back)) {
        this.menuState = 'main'
        this.game.backToMenu()
      }
      return
    }

    // 暂停界面
    if (this.game.state === GAME_STATE.PAUSED) {
      if (hit(L.resume)) {
        this.game.resume()
        return
      }
      if (hit(L.back)) {
        this.menuState = 'main'
        this.game.backToMenu()
      }
      return
    }

    if (this.game.state !== GAME_STATE.MENU) return

    if (this.menuState === 'main') {
      if (hit(L.main[0])) { this.menuState = 'aiSelect'; return }
      if (hit(L.main[1])) { this.menuState = 'campaignChapter'; return }
      if (hit(L.main[2])) { this.menuState = 'lanMenu'; return }
      if (hit(L.main[3])) { this.menuState = 'help'; return }
      return
    }

    if (this.menuState === 'aiSelect') {
      if (hit(L.ai[0])) { this._startGame(1); return }
      if (hit(L.ai[1])) { this._startGame(3); return }
      if (hit(L.ai[2])) { this._startGame(5); return }
      if (hit(L.back)) this.menuState = 'main'
      return
    }

    if (this.menuState === 'campaignChapter') {
      for (let i = 0; i < 4; i++) {
        if (hit(L.chapters[i])) {
          this.selectedChapter = i + 1
          this.menuState = 'campaignLevel'
          return
        }
      }
      if (hit(L.back)) this.menuState = 'main'
      return
    }

    if (this.menuState === 'campaignLevel') {
      const levels = this.game.campaign.getLevelsOfChapter(this.selectedChapter)
      for (let i = 0; i < levels.length && i < L.levels.length; i++) {
        if (hit(L.levels[i])) {
          const level = levels[i]
          if (this.game.campaign.unlockedLevels.includes(level.id)) {
            this._startCampaign(level.id)
          }
          return
        }
      }
      if (hit(L.back)) this.menuState = 'campaignChapter'
      return
    }

    if (this.menuState === 'lanMenu') {
      if (hit(L.lan[0])) { this.menuState = 'lanCreate'; return }
      if (hit(L.lan[1])) { this.menuState = 'lanJoin'; return }
      if (hit(L.lan[2])) { this.menuState = 'main'; return }
      return
    }

    if (this.menuState === 'lanCreate' || this.menuState === 'lanJoin') {
      if (hit(L.back)) this.menuState = 'lanMenu'
      return
    }

    if (this.menuState === 'help') {
      if (hit(L.back)) this.menuState = 'main'
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
    try {
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
    } catch(e) {
      console.error('[LOOP ERROR]', e.message, e.stack)
      // 出错后尝试继续循环，避免卡死
      setTimeout(() => this._loop(), 100)
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

  // ========== 启动加载页 ==========
  _renderLoading(ctx, w, h) {
    const t = Math.min(1, (Date.now() - this._loadingStart) / this._loadingDuration)
    const cx = w / 2
    const cy = h / 2
    const ph = this._paperPlanePhase

    // 背景：深蓝夜空渐变
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
    bg.addColorStop(0, '#2a3f5f')
    bg.addColorStop(0.6, '#1a2538')
    bg.addColorStop(1, '#0d1320')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // 星点（固定种子，轻微闪烁）
    ctx.save()
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 137) % w)
      const sy = ((i * 241) % h)
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(ph * 1.3 + i * 0.4))
      ctx.fillStyle = `rgba(255,255,255,${twinkle * 0.55})`
      ctx.beginPath()
      ctx.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // 标题（渐入，从 y-20 滑到目标 y）
    const titleY = cy - 50
    const fadeIn = Math.min(1, t * 2.5)
    ctx.save()
    ctx.globalAlpha = fadeIn
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.round(h * 0.09)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('纸飞机大战', cx, titleY)

    ctx.fillStyle = '#9ab'
    ctx.font = `${Math.round(h * 0.032)}px sans-serif`
    ctx.fillText('Paper Plane Battle', cx, titleY + h * 0.045)
    ctx.restore()

    // 动画纸飞机（在标题下方画 S 形轨迹）
    const planeY = cy + 30
    const amp = Math.min(w, h) * 0.18
    const trajX = cx + Math.sin(ph * 1.5) * amp
    const trajY = planeY + Math.cos(ph * 2.1) * h * 0.05
    const planeAng = Math.atan2(Math.cos(ph * 2.1) * h * 0.05 * (-2.1),
                                 Math.cos(ph * 1.5) * amp * 1.5)
    this._drawPaperPlane(ctx, trajX, trajY, planeAng, Math.min(w, h) * 0.08)

    // 进度条
    const barW = Math.min(w * 0.5, 260)
    const barH = Math.max(4, h * 0.015)
    const barX = cx - barW / 2
    const barY = cy + h * 0.14
    const filled = barW * t

    // 外框
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, barH + 4)
    ctx.fill()

    // 底层
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    roundRect(ctx, barX, barY, barW, barH, barH / 2)
    ctx.fill()

    // 填充（带一点亮色）
    const progGrad = ctx.createLinearGradient(barX, barY, barX + filled, barY)
    progGrad.addColorStop(0, '#4A90D9')
    progGrad.addColorStop(1, '#6BC0F5')
    ctx.fillStyle = progGrad
    roundRect(ctx, barX, barY, filled, barH, barH / 2)
    ctx.fill()

    // 进度百分比
    ctx.fillStyle = '#cdd'
    ctx.font = `${Math.round(h * 0.028)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${Math.round(t * 100)}%`, cx, barY + barH + 6)
    ctx.restore()
  }

  // 画一个简单的纸飞机图标（面向右侧，ang 为弧度）
  _drawPaperPlane(ctx, cx, cy, ang, size) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(ang)
    ctx.strokeStyle = '#e8eef5'
    ctx.fillStyle = 'rgba(232,238,245,0.85)'
    ctx.lineWidth = 1.5

    // 上半三角（机身）
    ctx.beginPath()
    ctx.moveTo(size, 0)
    ctx.lineTo(-size * 0.55, -size * 0.6)
    ctx.lineTo(-size * 0.2, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // 下半三角（上折痕）
    ctx.beginPath()
    ctx.moveTo(size, 0)
    ctx.lineTo(-size * 0.55, size * 0.6)
    ctx.lineTo(-size * 0.2, 0)
    ctx.closePath()
    ctx.fillStyle = 'rgba(200,210,225,0.8)'
    ctx.fill()
    ctx.stroke()

    // 中心线（折痕）
    ctx.strokeStyle = 'rgba(120,140,160,0.5)'
    ctx.beginPath()
    ctx.moveTo(size, 0)
    ctx.lineTo(-size * 0.2, 0)
    ctx.stroke()
    ctx.restore()
  }

  _renderMenu(ctx, w, h) {
    const L = this._menuLayout()

    if (this.menuState === 'main') {
      // 标题整体（主标题+副标题）垂直居中于屏幕正中
      ctx.save()
      const bigFont = Math.round(h * 0.08)
      const subFont = Math.round(h * 0.032)
      const gap = Math.round(h * 0.025)                              // 主副标题间距
      const totalH = bigFont + gap + subFont
      const baseY = h * 0.5 - totalH / 2 + bigFont                   // 主标题 baseline（middle）
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${bigFont}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('纸飞机大战', w / 2, baseY)
      ctx.fillStyle = '#8a8a9a'
      ctx.font = `${subFont}px sans-serif`
      ctx.fillText('Paper Plane Battle', w / 2, baseY + gap + subFont / 2)
      ctx.restore()

      const labels = ['对战模式', '战役模式', '联机模式', '操作说明']
      const colors = ['#4A90D9', '#E74C3C', '#9B59B6', '#27AE60']
      for (let i = 0; i < 4; i++) {
        this._drawRectButton(ctx, L.main[i], labels[i], colors[i])
      }
    } else if (this.menuState === 'aiSelect') {
      this._drawPageTitle(ctx, w, '选择AI数量', '', h * 0.24)
      this._drawRectButton(ctx, L.ai[0], '简单 (1 AI)', '#2ECC71')
      this._drawRectButton(ctx, L.ai[1], '普通 (3 AI)', '#F39C12')
      this._drawRectButton(ctx, L.ai[2], '困难 (5 AI)', '#E74C3C')
      this._drawRectButton(ctx, L.back, '返回', '#7F8C8D')
    } else if (this.menuState === 'campaignChapter') {
      this._renderCampaignChapters(ctx, w, h, L)
    } else if (this.menuState === 'campaignLevel') {
      this._renderCampaignLevels(ctx, w, h, L)
    } else if (this.menuState === 'lanMenu') {
      this._renderLanMenu(ctx, w, h, L)
    } else if (this.menuState === 'lanCreate' || this.menuState === 'lanJoin') {
      this._renderLanInfo(ctx, w, h, L)
    } else if (this.menuState === 'help') {
      this._renderHelp(ctx, w, h, L)
    }
  }

  // 页面标题（横屏时整体上移）
  _drawPageTitle(ctx, w, title, subtitle, y) {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(title, w / 2, y)
    if (subtitle) {
      ctx.fillStyle = '#8a8a9a'
      ctx.font = '13px sans-serif'
      ctx.fillText(subtitle, w / 2, y + 20)
    }
  }

  _drawRectButton(ctx, rect, text, color, fontSize) {
    if (!rect) return
    ctx.fillStyle = color
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10)
    ctx.fill()

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10)
    ctx.stroke()

    ctx.fillStyle = '#fff'
    ctx.font = `bold ${fontSize || 19}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2)
    ctx.textBaseline = 'alphabetic'
  }

  _renderCampaignChapters(ctx, w, h, L) {
    this._drawPageTitle(ctx, w, '选择地图', '', h * 0.14)

    const chapters = [
      { name: '书桌战场', desc: '7关' },
      { name: '遗迹迷途', desc: '7关' },
      { name: '星核决战', desc: '5关' },
      { name: '都市峡谷', desc: '7关' }
    ]
    const colors = ['#4A90D9', '#E74C3C', '#9B59B6', '#F39C12']

    for (let i = 0; i < chapters.length; i++) {
      this._drawRectButton(ctx, L.chapters[i],
        `${chapters[i].name} [${chapters[i].desc}]`, colors[i], 15)
    }
    this._drawRectButton(ctx, L.back, '返回', '#7F8C8D', 16)
  }

  _renderCampaignLevels(ctx, w, h, L) {
    const chapter = this.game.campaign.getChapter(this.selectedChapter)
    this._drawPageTitle(ctx, w, chapter ? chapter.name : '关卡选择', '', h * 0.15)

    const levels = this.game.campaign.getLevelsOfChapter(this.selectedChapter)

    for (let i = 0; i < levels.length && i < L.levels.length; i++) {
      const r = L.levels[i]
      const level = levels[i]
      const unlocked = this.game.campaign.unlockedLevels.includes(level.id)
      const completed = this.game.campaign.completedLevels.includes(level.id)

      ctx.fillStyle = !unlocked ? '#444' : completed ? '#2ECC71' : level.isBoss ? '#E74C3C' : '#4A90D9'
      ctx.globalAlpha = unlocked ? 1 : 0.5
      roundRect(ctx, r.x, r.y, r.w, r.h, 8)
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      if (unlocked) {
        ctx.font = 'bold 22px sans-serif'
        ctx.fillText(level.id, r.x + r.w / 2, r.y + r.h / 2 + 7)
      } else {
        ctx.font = '17px sans-serif'
        ctx.fillText('🔒', r.x + r.w / 2, r.y + r.h / 2 + 6)
      }

      if (level.isBoss) {
        ctx.fillStyle = '#FFD700'
        ctx.font = '8px sans-serif'
        ctx.fillText('BOSS', r.x + r.w / 2, r.y + 12)
      }
      if (completed) {
        ctx.fillStyle = '#fff'
        ctx.font = '9px sans-serif'
        ctx.fillText('✓', r.x + r.w - 10, r.y + 13)
      }
    }

    this._drawRectButton(ctx, L.back, '返回', '#7F8C8D', 16)
  }

  _renderLanMenu(ctx, w, h, L) {
    this._drawPageTitle(ctx, w, '联机模式', '基于 WebSocket 的实时对战', h * 0.26)
    this._drawRectButton(ctx, L.lan[0], '创建房间', '#4A90D9')
    this._drawRectButton(ctx, L.lan[1], '加入房间', '#27AE60')
    this._drawRectButton(ctx, L.lan[2], '返回', '#7F8C8D')
  }

  _renderLanInfo(ctx, w, h, L) {
    this._drawPageTitle(ctx, w, this.menuState === 'lanCreate' ? '创建房间' : '加入房间', '', h * 0.22)

    ctx.fillStyle = '#aaa'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('需要配置 WebSocket 中转服务器', w / 2, h * 0.4)
    ctx.fillText('服务器地址请在 LanSystem.js 中配置', w / 2, h * 0.5)

    ctx.fillStyle = '#888'
    ctx.font = '12px sans-serif'
    ctx.fillText('请确保主机和客户端在同一局域网', w / 2, h * 0.64)
    ctx.fillText('或通过公网 WebSocket 服务器连接', w / 2, h * 0.74)

    this._drawRectButton(ctx, L.back, '返回', '#7F8C8D', 16)
  }

  _renderHelp(ctx, w, h, L) {
    this._drawPageTitle(ctx, w, '操作说明', '', h * 0.15)

    const columns = [
      [
        '【移动】',
        '左侧摇杆控制飞机方向',
        '',
        '【武器】',
        '射：机炮，弹药无限',
        '弹：追踪导弹，数量有限',
        '网：近距离网住敌人',
        '风：消耗能量加速飞行'
      ],
      [
        '【特技】',
        '右上列表点选，消耗能量',
        '',
        '【战术】',
        '导弹需要正前方锁定目标',
        '注意避开敌方导弹',
        '',
        '【提示】',
        '左上「暂停」可随时退出'
      ]
    ]

    ctx.fillStyle = '#ccc'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    columns.forEach((lines, col) => {
      const x = col === 0 ? 24 : w / 2 + 24
      lines.forEach((line, i) => {
        ctx.fillText(line, x, h * 0.3 + i * 18)
      })
    })

    this._drawRectButton(ctx, L.back, '返回', '#7F8C8D', 16)
  }

  _renderPauseOverlay(ctx, w, h) {
    const L = this._menuLayout()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('游戏暂停', w / 2, h * 0.34)

    this._drawRectButton(ctx, L.resume, '继续游戏', '#27AE60')
    this._drawRectButton(ctx, L.back, '返回主菜单', '#E74C3C')
  }

  _renderGameOver(ctx, w, h) {
    const L = this._menuLayout()

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
    ctx.font = 'bold 32px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(title, w / 2, h * 0.2)

    // 战绩
    if (this.gameResult) {
      ctx.fillStyle = '#fff'
      ctx.font = '17px sans-serif'
      const statsY = h * 0.36
      ctx.fillText(`击杀数: ${this.gameResult.kills}`, w / 2, statsY)
      ctx.fillText(`生存时间: ${Math.floor(this.gameResult.time)}秒`, w / 2, statsY + 28)

      if (won && this.game.gameMode === 'campaign' && this.game.campaignLevel) {
        ctx.fillStyle = '#F1C40F'
        ctx.fillText(`获得 ${this.game.campaignLevel.rewardCoins} 金币`, w / 2, statsY + 54)
      }
    }

    this._drawRectButton(ctx, L.retry, '再来一局', '#4A90D9')
    this._drawRectButton(ctx, L.back, '返回主菜单', '#7F8C8D')
  }
}

// 启动
const app = new MainApp()
// 暴露给调试/自动化使用的只读探针
globalThis.__app = app
app.init()
