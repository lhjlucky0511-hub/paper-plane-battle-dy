// 输入管理器 - 处理触屏/键盘输入
// 对应原项目 InputService

class InputManager {
  constructor() {
    // 摇杆状态
    this.joystick = {
      active: false,
      baseX: 0,
      baseY: 0,
      dx: 0,
      dy: 0,
      knobX: 0,
      knobY: 0
    }

    // 按钮状态
    this.buttons = {
      fire: false,
      missile: false,
      net: false,
      boost: false,
      stunt: false
    }

    // 按钮是否被首次按下（用于触发一次性动作）
    this.buttonPressed = {
      fire: false,
      missile: false,
      net: false,
      stunt: false
    }

    // 当前选中的特技类型
    this.selectedStunt = 1  // 默认英麦曼
    this.stuntReqId = 0

    // 触摸点追踪
    this.touches = {}
    this.joystickTouchId = null
    this.fireTouchId = null
    this.missileTouchId = null
    this.netTouchId = null
    this.boostTouchId = null
    this.stuntTouchId = null

    // 虚拟按钮位置（需要在 init 时根据屏幕尺寸设置）
    this.uiLayout = null

    // 触摸事件去重
    this._lastStartTouch = null

    this._setupListeners()
  }

  init(layout) {
    this.uiLayout = layout
  }

  _setupListeners() {
    // 抖音小游戏使用 tt.onTouchStart/onTouchMove/onTouchEnd
    if (typeof tt !== 'undefined') {
      tt.onTouchStart((e) => this._onTouchStart(e))
      tt.onTouchMove((e) => this._onTouchMove(e))
      tt.onTouchEnd((e) => this._onTouchEnd(e))
      tt.onTouchCancel((e) => this._onTouchEnd(e))
    }

    // 键盘支持（开发调试用）
    // 抖音小游戏里 window 存在但 window.addEventListener 不是函数！必须双重检查
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => this._onKeyDown(e))
      window.addEventListener('keyup', (e) => this._onKeyUp(e))
    }
  }

  _onTouchStart(e) {
    const touches = e.changedTouches
    const now = Date.now()
    for (const touch of touches) {
      // 抖音模拟器可能把同一次点击派发两次，这里按坐标+时间窗口去重
      const cx = Math.round(touch.clientX)
      const cy = Math.round(touch.clientY)
      const last = this._lastStartTouch
      if (last && last.cx === cx && last.cy === cy && now - last.t < 120) {
        continue
      }
      this._lastStartTouch = { cx, cy, t: now }
      this._handleTouchStart(touch)
    }
  }

  _onTouchMove(e) {
    const touches = e.changedTouches
    for (const touch of touches) {
      this._handleTouchMove(touch)
    }
  }

  _onTouchEnd(e) {
    const touches = e.changedTouches
    for (const touch of touches) {
      this._handleTouchEnd(touch)
    }
  }

  _handleTouchStart(touch) {
    const { clientX, clientY, identifier } = touch
    const layout = this.uiLayout

    if (!layout) {
      // 如果没有设置布局，默认左下为摇杆
      if (clientX < this._screenWidth() * 0.4) {
        this._startJoystick(clientX, clientY, identifier)
      }
      return
    }

    // 判断点击的是哪个控件
    if (this._pointInRect(clientX, clientY, layout.joystick.base)) {
      this._startJoystick(clientX, clientY, identifier)
    } else if (this._pointInRect(clientX, clientY, layout.boost)) {
      this.buttons.boost = true
      this.boostTouchId = identifier
    } else if (this._pointInRect(clientX, clientY, layout.net)) {
      this.buttonPressed.net = true
      this.netTouchId = identifier
    } else if (this._pointInRect(clientX, clientY, layout.missile)) {
      this.buttonPressed.missile = true
      this.missileTouchId = identifier
    } else if (this._pointInRect(clientX, clientY, layout.fire)) {
      this.buttons.fire = true
      this.fireTouchId = identifier
    } else if (layout.stunt && this._pointInRect(clientX, clientY, layout.stunt)) {
      // 特技按钮：每次按下触发当前选中的特技
      this.stuntReqId++
      this.buttonPressed.stunt = true
      this.stuntTouchId = identifier
    } else if (layout.stuntSelect && this._pointInRect(clientX, clientY, layout.stuntSelect)) {
      // 特技选择按钮：切换特技类型
      this.selectedStunt = (this.selectedStunt % 4) + 1
    } else {
      // 默认左下为摇杆
      if (clientX < this._screenWidth() * 0.4 && !this.joystick.active) {
        this._startJoystick(clientX, clientY, identifier)
      }
    }
  }

  _handleTouchMove(touch) {
    const { clientX, clientY, identifier } = touch

    if (identifier === this.joystickTouchId) {
      this._moveJoystick(clientX, clientY)
    }
  }

  _handleTouchEnd(touch) {
    const { identifier } = touch

    if (identifier === this.joystickTouchId) {
      this._endJoystick()
    }
    if (identifier === this.fireTouchId) {
      this.buttons.fire = false
      this.fireTouchId = null
    }
    if (identifier === this.missileTouchId) {
      this.missileTouchId = null
    }
    if (identifier === this.netTouchId) {
      this.netTouchId = null
    }
    if (identifier === this.boostTouchId) {
      this.buttons.boost = false
      this.boostTouchId = null
    }
    if (identifier === this.stuntTouchId) {
      this.stuntTouchId = null
    }
  }

  _startJoystick(x, y, touchId) {
    this.joystick.active = true
    this.joystick.baseX = x
    this.joystick.baseY = y
    this.joystick.knobX = x
    this.joystick.knobY = y
    this.joystick.dx = 0
    this.joystick.dy = 0
    this.joystickTouchId = touchId
  }

  _moveJoystick(x, y) {
    const maxDist = 50
    let dx = x - this.joystick.baseX
    let dy = y - this.joystick.baseY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > maxDist) {
      dx = (dx / dist) * maxDist
      dy = (dy / dist) * maxDist
    }

    this.joystick.knobX = this.joystick.baseX + dx
    this.joystick.knobY = this.joystick.baseY + dy
    this.joystick.dx = dx / maxDist
    this.joystick.dy = dy / maxDist
  }

  _endJoystick() {
    this.joystick.active = false
    this.joystick.dx = 0
    this.joystick.dy = 0
    this.joystickTouchId = null
  }

  _pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w &&
           y >= rect.y && y <= rect.y + rect.h
  }

  _screenWidth() {
    if (typeof tt !== 'undefined') {
      return tt.getSystemInfoSync().windowWidth
    }
    return 375
  }

  // 键盘调试支持
  _onKeyDown(e) {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.joystick.dx = -1; break
      case 'ArrowRight': case 'KeyD': this.joystick.dx = 1; break
      case 'ArrowUp': case 'KeyW': this.joystick.dy = -1; break
      case 'ArrowDown': case 'KeyS': this.joystick.dy = 1; break
      case 'Space': this.buttons.fire = true; break
      case 'KeyQ': this.buttonPressed.missile = true; break
      case 'KeyE': this.buttonPressed.net = true; break
      case 'ShiftLeft': case 'ShiftRight': this.buttons.boost = true; break
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': if (this.joystick.dx < 0) this.joystick.dx = 0; break
      case 'ArrowRight': case 'KeyD': if (this.joystick.dx > 0) this.joystick.dx = 0; break
      case 'ArrowUp': case 'KeyW': if (this.joystick.dy < 0) this.joystick.dy = 0; break
      case 'ArrowDown': case 'KeyS': if (this.joystick.dy > 0) this.joystick.dy = 0; break
      case 'Space': this.buttons.fire = false; break
      case 'ShiftLeft': case 'ShiftRight': this.buttons.boost = false; break
    }
  }

  // 每帧结束时重置一次性按键
  endFrame() {
    this.buttonPressed.fire = false
    this.buttonPressed.missile = false
    this.buttonPressed.net = false
  }

  // 采样输入状态（返回与 FlightInputState 对应的数据）
  sample() {
    return {
      yaw: this.joystick.dx,           // 左右摇杆输入
      pitch: -this.joystick.dy,        // 上下摇杆输入（Y轴反转）
      boost: this.buttons.boost,
      fire: this.buttons.fire,
      missileFire: this.buttonPressed.missile,
      netDeploy: this.buttonPressed.net,
      stuntType: this.buttonPressed.stunt ? this.selectedStunt : 0,
      stuntReqId: this.buttonPressed.stunt ? this.stuntReqId : 0
    }
  }

  // 渲染虚拟摇杆和按钮
  renderControls(ctx) {
    const layout = this.uiLayout
    if (!layout) return

    // 渲染摇杆基座
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(this.joystick.baseX, this.joystick.baseY, 50, 0, Math.PI * 2)
    ctx.fill()

    // 渲染摇杆球
    ctx.fillStyle = '#cccccc'
    ctx.beginPath()
    ctx.arc(this.joystick.knobX || this.joystick.baseX, 
            this.joystick.knobY || this.joystick.baseY, 25, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

module.exports = InputManager
