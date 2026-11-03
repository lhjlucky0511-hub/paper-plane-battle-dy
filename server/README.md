# 联机服务器部署指南

纸飞机大战抖音小游戏的联机功能需要一个 WebSocket 中转服务器。本文档提供三种部署方案，**从免费到付费**，你可以根据需求选择。

---

## 方案一：本机运行（免费，适合开发调试）

### 适用场景
- 开发调试
- 同一 Wi-Fi 下的朋友聚会

### 步骤

1. 安装 Node.js（如果还没有）：
   ```bash
   # 检查是否已安装
   node -v
   # 如果没有，去 https://nodejs.org 下载安装
   ```

2. 安装依赖并启动：
   ```bash
   cd server
   npm install
   npm start
   ```

3. 查看本机局域网 IP：
   ```bash
   # macOS
   ifconfig | grep "inet " | grep -v 127.0.0.1
   # 或
   ipconfig getifaddr en0
   ```

4. 在抖音开发者工具中：
   - 打开项目 → 右上角"详情" → "本地设置"
   - 勾选 **"不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书"**
   - 在 `js/LanSystem.js` 中把服务器地址改为：`ws://你的局域网IP:8080`

### 注意
- 手机和电脑必须在**同一个 Wi-Fi** 下
- 此方式仅用于开发调试，正式版无法使用

---

## 方案二：Render 免费云部署（推荐，完全免费）

### 适用场景
- 小范围内测
- 不想花钱
- 能接受冷启动延迟（首次连接等 3-5 秒）

### 步骤

1. **准备 GitHub 仓库**（已有）

2. **注册 Render 账号**：
   - 访问 https://render.com
   - 用 GitHub 账号登录（免费，无需信用卡）

3. **创建 Web Service**：
   - 点击 "New" → "Web Service"
   - 连接你的 GitHub 仓库 `paper-plane-battle-dy`
   - 配置：
     - **Name**: `paper-plane-battle-server`（随意）
     - **Root Directory**: `server`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: 选 **Free**

4. **部署**：点击 "Create Web Service"，等待 1-2 分钟

5. **获取服务器地址**：
   - 部署成功后会得到一个地址，如 `https://paper-plane-battle-server.onrender.com`
   - WebSocket 地址就是 `wss://paper-plane-battle-server.onrender.com`

6. **配置抖音小游戏**：
   - 在 `js/LanSystem.js` 中把 `serverUrl` 改为上面的 `wss://...` 地址
   - 去抖音开放平台后台 → 开发 → 开发管理 → 服务器域名
   - 把 `wss://paper-plane-battle-server.onrender.com` 添加到 **socket 合法域名**

### Render 免费额度说明
- 每月 750 免费实例小时（一个 24 小时运行的实例约 720 小时/月，够用）
- 15 分钟无请求会休眠，首次连接需要冷启动 3-5 秒
- 完全免费，不需要信用卡

---

## 方案三：云服务器（正式上线推荐）

### 适用场景
- 正式上线
- 用户量大
- 需要低延迟

### 费用参考
| 服务商 | 配置 | 价格 |
|--------|------|------|
| 阿里云轻量 | 2核2G | ~30元/月 |
| 腾讯云轻量 | 2核2G | ~30元/月 |
| 华为云 | 2核2G | ~30元/月 |

### 步骤

1. 购买云服务器（选择 Ubuntu 系统）

2. 安装 Node.js：
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. 上传代码并启动：
   ```bash
   git clone 你的仓库地址
   cd paper-plane-battle-dy/server
   npm install
   # 用 pm2 保持后台运行
   npm install -g pm2
   pm2 start index.js --name paper-plane-server
   pm2 startup
   pm2 save
   ```

4. **配置 SSL（必须，否则抖音小游戏无法连接）**：
   ```bash
   # 安装 nginx
   sudo apt install nginx -y
   
   # 用 certbot 免费证书
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d 你的域名.com
   ```

5. **配置 nginx 反向代理 WebSocket**：
   ```nginx
   server {
       listen 443 ssl;
       server_name 你的域名.com;
       
       ssl_certificate /etc/letsencrypt/live/你的域名.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/你的域名.com/privkey.pem;
       
       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

6. **开放防火墙端口**：
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   ```

7. 在抖音开放平台后台添加你的域名到 socket 合法域名

---

## 常见问题

### Q: 为什么连接失败？
1. 检查服务器是否在运行：`curl http://你的地址/health` 应返回 `OK`
2. 检查域名白名单是否已配置（抖音开放平台后台）
3. 检查是否用了 `wss://`（生产环境不能用 `ws://`）

### Q: Render 免费版休眠怎么办？
可以用免费的监控服务（如 https://cron-job.org）每隔 10 分钟请求一次 `/health` 接口，保持服务唤醒。

### Q: 最多支持多少人联机？
当前代码限制每个房间最多 4 人。如需更多，修改 `server/index.js` 中的 `maxPlayers`。

### Q: 延迟高不高？
- 本机方案：<10ms
- Render 免费版：50-200ms（取决于地区）
- 国内云服务器：20-50ms
