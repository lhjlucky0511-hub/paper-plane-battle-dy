// 抖音小游戏纸飞机大战 - WebSocket 中转服务器
// 用于局域网/互联网联机对战的消息转发
// 部署方式见 README.md

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// 房间管理
class Room {
  constructor(roomId, hostSocket) {
    this.roomId = roomId;
    this.host = hostSocket;       // 主机 socket
    this.clients = new Map();     // seatId -> socket
    this.maxPlayers = 4;
    this.phase = 'lobby';
    this.createdAt = Date.now();
  }

  addClient(socket) {
    const seatId = this.clients.size + 1;
    this.clients.set(seatId, socket);
    socket.seatId = seatId;
    socket.roomId = this.roomId;
    return seatId;
  }

  removeClient(seatId) {
    this.clients.delete(seatId);
  }

  broadcast(data, excludeSeatId) {
    const msg = JSON.stringify(data);
    for (const [seatId, socket] of this.clients) {
      if (seatId === excludeSeatId) continue;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(msg);
      }
    }
  }

  sendToHost(data) {
    if (this.host && this.host.readyState === WebSocket.OPEN) {
      this.host.send(JSON.stringify(data));
    }
  }

  getPlayerList() {
    const players = [];
    for (const [seatId, socket] of this.clients) {
      players.push({
        seatId,
        nickname: socket.nickname || '玩家',
        isHost: socket === this.host
      });
    }
    return players;
  }
}

// 全局房间管理
const rooms = new Map();  // roomId -> Room

// 生成房间号
function generateRoomId() {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(id));
  return id;
}

// 心跳清理
function cleanupDeadRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    // 房间超过 2 小时且无人，清理
    const hasClients = room.clients.size > 0;
    if (!hasClients && now - room.createdAt > 2 * 60 * 60 * 1000) {
      rooms.delete(roomId);
      console.log(`[清理] 房间 ${roomId} 已过期`);
    }
  }
}
setInterval(cleanupDeadRooms, 60 * 1000);

// 创建 HTTP 服务器（用于 Render/云平台的健康检查）
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Paper Plane Battle WebSocket Server');
});

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

wss.on('connection', (socket) => {
  console.log('[连接] 新客户端连接');

  socket.seatId = -1;
  socket.roomId = null;
  socket.nickname = '玩家';

  socket.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      console.error('[错误] 消息解析失败', e);
      return;
    }

    handleMessage(socket, msg);
  });

  socket.on('close', () => {
    console.log(`[断开] seatId=${socket.seatId} roomId=${socket.roomId}`);
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.removeClient(socket.seatId);
      // 通知其他玩家有人离开
      room.broadcast({
        type: 'player_left',
        data: { seatId: socket.seatId, players: room.getPlayerList() }
      });
      // 如果主机离开，关闭房间
      if (socket === room.host) {
        room.broadcast({ type: 'room_closed', data: {} });
        rooms.delete(socket.roomId);
        console.log(`[关闭] 主机离开，房间 ${socket.roomId} 已关闭`);
      }
    }
  });

  socket.on('error', (err) => {
    console.error('[错误] Socket 错误', err.message);
  });
});

// 处理消息
function handleMessage(socket, msg) {
  const { type, data } = msg;

  switch (type) {
    case 'create_room':
      handleCreateRoom(socket, data);
      break;

    case 'join_room':
      handleJoinRoom(socket, data);
      break;

    case 'player_list':
      handlePlayerListRequest(socket);
      break;

    case 'input':
    case 'snapshot':
    case 'spit_fx':
    case 'missile_fx':
    case 'net_fx':
    case 'player_ready':
    case 'start_game':
    case 'battle_end':
      // 转发消息到房间内其他玩家
      if (socket.roomId && rooms.has(socket.roomId)) {
        const room = rooms.get(socket.roomId);
        room.broadcast({ type, data, from: socket.seatId });
      }
      break;

    case 'ping':
      socket.send(JSON.stringify({ type: 'pong', data: { time: Date.now() } }));
      break;

    default:
      console.log('[未知消息]', type);
  }
}

// 创建房间
function handleCreateRoom(socket, data) {
  const roomId = generateRoomId();
  const room = new Room(roomId, socket);
  rooms.set(roomId, room);

  socket.seatId = 0;
  socket.roomId = roomId;
  socket.nickname = data.nickname || '主机';
  room.clients.set(0, socket);

  console.log(`[创建房间] ${roomId} by ${socket.nickname}`);

  socket.send(JSON.stringify({
    type: 'room_created',
    data: { roomId, seatId: 0, players: room.getPlayerList() }
  }));
}

// 加入房间
function handleJoinRoom(socket, data) {
  const { roomId, nickname } = data;

  if (!rooms.has(roomId)) {
    socket.send(JSON.stringify({
      type: 'error',
      data: { message: '房间不存在' }
    }));
    return;
  }

  const room = rooms.get(roomId);
  if (room.clients.size >= room.maxPlayers) {
    socket.send(JSON.stringify({
      type: 'error',
      data: { message: '房间已满' }
    }));
    return;
  }

  const seatId = room.addClient(socket);
  socket.nickname = nickname || `玩家${seatId}`;

  console.log(`[加入房间] ${roomId} seatId=${seatId} nickname=${socket.nickname}`);

  socket.send(JSON.stringify({
    type: 'room_joined',
    data: { roomId, seatId, players: room.getPlayerList() }
  }));

  // 通知房间内其他玩家
  room.broadcast({
    type: 'player_joined',
    data: { seatId, nickname: socket.nickname, players: room.getPlayerList() }
  }, seatId);
}

// 请求玩家列表
function handlePlayerListRequest(socket) {
  if (socket.roomId && rooms.has(socket.roomId)) {
    const room = rooms.get(socket.roomId);
    socket.send(JSON.stringify({
      type: 'player_list',
      data: { players: room.getPlayerList() }
    }));
  }
}

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`纸飞机大战 WebSocket 服务器已启动`);
  console.log(`端口: ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`========================================\n`);
});
