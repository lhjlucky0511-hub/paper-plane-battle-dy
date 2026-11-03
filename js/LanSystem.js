// 局域网联机系统 - 基于 WebSocket 的主机-客户端架构
// 抖音小游戏不支持直接 TCP/UDP 广播，使用 WebSocket 中转服务器
// 对应原项目 LanNetworkHub.cs / LanModels.cs
//
// 服务器地址配置：
//   - 本机调试: 'ws://192.168.x.x:8080'（需在开发者工具勾选"不校验合法域名"）
//   - Render 免费云: 'wss://你的服务名.onrender.com'
//   - 自建服务器: 'wss://你的域名.com'
const SERVER_URL = 'wss://你的服务器地址.onrender.com';  // ← 在这里修改服务器地址

const CONSTS = require('./constants')

// 网络消息类型
const MSG_TYPE = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  ROOM_LIST: 'room_list',
  PLAYER_LIST: 'player_list',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  BATTLE_END: 'battle_end',
  SPIT_FX: 'spit_fx',
  MISSILE_FX: 'missile_fx',
  NET_FX: 'net_fx',
  PLAYER_READY: 'player_ready',
  START_GAME: 'start_game',
  LEAVE_ROOM: 'leave_room',
  PING: 'ping'
}

// 座位状态
class LanSeat {
  constructor(seatId, nickname, planeId = 'dart') {
    this.seatId = seatId
    this.nickname = nickname
    this.planeId = planeId
    this.ready = false
    this.eliminated = false
  }
}

// 房间
class LanRoom {
  constructor(roomId, hostSeat, hostNickname) {
    this.roomId = roomId
    this.hostSeatId = hostSeat
    this.seats = [new LanSeat(hostSeat, hostNickname)]
    this.maxPlayers = 4
    this.mapId = 'classroom'
    this.phase = 'lobby'  // lobby, battle, ended
  }

  addSeat(nickname) {
    if (this.seats.length >= this.maxPlayers) return null
    const seatId = this.seats.length
    const seat = new LanSeat(seatId, nickname)
    this.seats.push(seat)
    return seat
  }

  removeSeat(seatId) {
    this.seats = this.seats.filter(s => s.seatId !== seatId)
  }
}

// 飞机网络状态
class PlaneNetState {
  constructor(plane) {
    this.seatId = plane.lanSeatId
    this.x = plane.x
    this.y = plane.y
    this.yaw = plane.yaw
    this.health = plane.health
    this.lives = plane.lives
    this.alive = plane.isAlive
    this.wind = plane.wind
    this.speed = plane.speed
    this.missiles = plane.missileAmmo
    this.nets = plane.netAmmo
  }
}

// 战斗快照
class BattleSnapshot {
  constructor(time, planes) {
    this.time = time
    this.planes = planes
  }
}

// LAN 网络管理器
class LanNetwork {
  constructor() {
    this.isHost = false
    this.socket = null
    this.room = null
    this.localSeatId = -1
    this.localNickname = '玩家'
    this.connected = false
    this.rooms = []  // 发现的房间列表

    // 事件回调
    this.onRoomCreated = null
    this.onRoomJoined = null
    this.onRoomListUpdate = null
    this.onPlayerListUpdate = null
    this.onSnapshotReceived = null
    this.onInputReceived = null
    this.onBattleStart = null
    this.onBattleEnd = null
    this.onSpitFx = null
    this.onMissileFx = null
    this.onNetFx = null
    this.onDisconnect = null
  }

  // 连接到 WebSocket 服务器
  connect(callback, serverUrl) {
    const url = serverUrl || SERVER_URL
    if (typeof tt === 'undefined') {
      callback && callback(new Error('抖音环境不可用'))
      return
    }

    this.socket = tt.connectSocket({
      url: url,
      success: () => {
        console.log('[LAN] 连接中...')
      },
      fail: (err) => {
        console.error('[LAN] 连接失败', err)
        callback && callback(err)
      }
    })

    tt.onSocketOpen(() => {
      this.connected = true
      console.log('[LAN] 已连接到服务器')
      callback && callback(null)
    })

    tt.onSocketMessage((res) => {
      try {
        const msg = JSON.parse(res.data)
        this._handleMessage(msg)
      } catch (e) {
        console.error('[LAN] 消息解析失败', e)
      }
    })

    tt.onSocketClose(() => {
      this.connected = false
      console.log('[LAN] 连接断开')
      this.onDisconnect && this.onDisconnect()
    })

    tt.onSocketError((err) => {
      console.error('[LAN] Socket错误', err)
    })
  }

  disconnect() {
    if (this.socket) {
      tt.closeSocket({})
      this.socket = null
    }
    this.connected = false
    this.room = null
  }

  _send(type, data) {
    if (!this.connected) {
      console.warn('[LAN] 未连接，无法发送消息')
      return
    }
    tt.sendSocketMessage({
      data: JSON.stringify({ type, data, from: this.localSeatId }),
      fail: (err) => console.error('[LAN] 发送失败', err)
    })
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case MSG_TYPE.ROOM_LIST:
        this.rooms = msg.data.rooms || []
        this.onRoomListUpdate && this.onRoomListUpdate(this.rooms)
        break

      case MSG_TYPE.PLAYER_LIST:
        if (this.room) {
          this.room.seats = msg.data.seats || []
        }
        this.onPlayerListUpdate && this.onPlayerListUpdate(this.room)
        break

      case MSG_TYPE.START_GAME:
        this.onBattleStart && this.onBattleStart(msg.data)
        break

      case MSG_TYPE.INPUT:
        this.onInputReceived && this.onInputReceived(msg.data)
        break

      case MSG_TYPE.SNAPSHOT:
        this.onSnapshotReceived && this.onSnapshotReceived(msg.data)
        break

      case MSG_TYPE.BATTLE_END:
        this.onBattleEnd && this.onBattleEnd(msg.data)
        break

      case MSG_TYPE.SPIT_FX:
        this.onSpitFx && this.onSpitFx(msg.data)
        break

      case MSG_TYPE.MISSILE_FX:
        this.onMissileFx && this.onMissileFx(msg.data)
        break

      case MSG_TYPE.NET_FX:
        this.onNetFx && this.onNetFx(msg.data)
        break

      case MSG_TYPE.PING:
        // 心跳响应
        break

      default:
        // 自定义消息处理
        if (this.onCustomMessage) {
          this.onCustomMessage(msg)
        }
    }
  }

  // ========== 主机操作 ==========

  createRoom(nickname, callback) {
    this.localNickname = nickname
    this.isHost = true
    this.localSeatId = 0
    this._send(MSG_TYPE.CREATE_ROOM, { nickname })

    // 等待服务器响应
    this._onCreateRoomCallback = callback
  }

  // 主机广播快照
  broadcastSnapshot(snapshot) {
    if (!this.isHost) return
    this._send(MSG_TYPE.SNAPSHOT, snapshot)
  }

  // 主机广播战斗开始
  broadcastBattleStart(options) {
    if (!this.isHost) return
    this.room.phase = 'battle'
    this._send(MSG_TYPE.START_GAME, options)
  }

  // 主机广播战斗结束
  broadcastBattleEnd(ranks) {
    if (!this.isHost) return
    this._send(MSG_TYPE.BATTLE_END, { ranks })
  }

  // 主机广播武器特效
  broadcastSpitFx(seatId, x, y, vx, vy) {
    if (!this.isHost) return
    this._send(MSG_TYPE.SPIT_FX, { seatId, x, y, vx, vy })
  }

  broadcastMissileFx(attackerSeatId, targetSeatId, x, y) {
    if (!this.isHost) return
    this._send(MSG_TYPE.MISSILE_FX, { attackerSeatId, targetSeatId, x, y })
  }

  broadcastNetFx(attackerSeatId, targetSeatId, x, y) {
    if (!this.isHost) return
    this._send(MSG_TYPE.NET_FX, { attackerSeatId, targetSeatId, x, y })
  }

  // ========== 客户端操作 ==========

  joinRoom(roomId, nickname, callback) {
    this.localNickname = nickname
    this.isHost = false
    this._send(MSG_TYPE.JOIN_ROOM, { roomId, nickname })
    this._onJoinRoomCallback = callback
  }

  // 客户端发送输入
  sendInput(input) {
    this._send(MSG_TYPE.INPUT, input)
  }

  // 请求房间列表
  requestRoomList() {
    this._send(MSG_TYPE.ROOM_LIST, {})
  }

  // 设置就绪
  setReady(ready) {
    this._send(MSG_TYPE.PLAYER_READY, { seatId: this.localSeatId, ready })
  }

  // 离开房间
  leaveRoom() {
    this._send(MSG_TYPE.LEAVE_ROOM, { seatId: this.localSeatId })
    this.room = null
  }

  // 心跳
  sendPing() {
    this._send(MSG_TYPE.PING, { time: Date.now() })
  }
}

// ========== 输入快照（用于网络传输）==========
function serializeInput(input, time) {
  return {
    time,
    yaw: input.yaw,
    pitch: input.pitch,
    boost: input.boost,
    fire: input.fire,
    missileFire: input.missileFire,
    netDeploy: input.netDeploy,
    stuntType: input.stuntType || 0,
    stuntReqId: input.stuntReqId || 0
  }
}

function deserializeInput(data) {
  return {
    yaw: data.yaw || 0,
    pitch: data.pitch || 0,
    boost: data.boost || false,
    fire: data.fire || false,
    missileFire: data.missileFire || false,
    netDeploy: data.netDeploy || false,
    stuntType: data.stuntType || 0,
    stuntReqId: data.stuntReqId || 0
  }
}

// ========== 快照序列化 ==========
function serializeSnapshot(game, time) {
  const planes = []
  for (const plane of game.planes) {
    if (plane.lanSeatId >= 0) {
      planes.push(new PlaneNetState(plane))
    }
  }
  return new BattleSnapshot(time, planes)
}

function applySnapshotToPlane(plane, state) {
  plane.x = state.x
  plane.y = state.y
  plane.yaw = state.yaw
  plane.health = state.health
  plane.lives = state.lives
  plane.isAlive = state.alive
  plane.wind = state.wind
  plane.speed = state.speed
  plane.missileAmmo = state.missiles
  plane.netAmmo = state.nets
}

module.exports = {
  LanNetwork,
  LanRoom,
  LanSeat,
  PlaneNetState,
  BattleSnapshot,
  MSG_TYPE,
  serializeInput,
  deserializeInput,
  serializeSnapshot,
  applySnapshotToPlane
}
