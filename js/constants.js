// 游戏常量配置 - 对应原项目 FlightConfig

module.exports = {
  // 飞机基础参数
  PLANE: {
    CRUISE_SPEED: 14,
    BOOST_SPEED: 26,
    YAW_SPEED: 180,       // 度/秒
    PITCH_SPEED: 120,
    ROLL_AMOUNT: 28,
    MIN_HEIGHT: 1.8,
    MAX_HEIGHT: 36,
    RADIUS: 16            // 碰撞半径
  },

  // AI配置
  AI: {
    CRUISE_SPEED: 12,
    BOOST_SPEED: 22,
    YAW_SPEED: 150,
    PITCH_SPEED: 100,
    SPIT_DAMAGE: 14,
    SPIT_COOLDOWN: 0.18,
    SPIT_SPEED: 58,
    SPIT_RADIUS: 0.7,
    MISSILE_SPEED: 10,
    INVULN_ON_SPAWN: 1.6
  },

  // 能量/加速
  WIND: {
    MAX: 100,
    DRAIN_PER_SECOND: 28,
    REGEN_PER_SECOND: 22,
    BOOST_OVERHEAT_SECONDS: 1
  },

  // 生命值
  HEALTH: {
    MAX: 100,
    INVULN_ON_SPAWN: 1.2,
    RESPAWN_DELAY: 0.55,
    CRASH_FALL_DURATION: 1.55
  },

  // 机炮
  SPIT: {
    DAMAGE: 16,
    COOLDOWN: 0.16,
    SPEED: 60,
    LIFE: 1.6,
    RADIUS: 0.52,
    AMMO_START: 999
  },

  // 导弹
  MISSILE: {
    SPEED: 11,
    COOLDOWN: 1.1,
    DAMAGE: 65,
    LIFE: 8,
    TURN_RATE: 180,       // 追踪转向率 度/秒
    EXPLOSION_RADIUS: 40
  },

  // 网兜
  NET: {
    SPEED: 12,
    LIFE: 4,
    COOLDOWN: 2
  },

  // 战斗区域 (2D俯视图用圆形区域)
  ARENA: {
    RADIUS: 400,          // 像素
    BOUNDARY_PUSH: 10     // 边界外推距离
  },

  // 颜色
  COLORS: {
    PLAYER: '#4A90D9',
    PLAYER_ACCENT: '#6AB0F0',
    ENEMY: '#E74C3C',
    ENEMY_ACCENT: '#F5B7B1',
    BULLET: '#FFD700',
    MISSILE: '#FF4500',
    NET: '#9B59B6',
    BACKGROUND: '#1a1a2e',
    ARENA_GRID: '#2a2a4e',
    ARENA_BORDER: '#3a3a6e',
    HEALTH_BAR: '#2ECC71',
    HEALTH_BAR_BG: '#C0392B',
    WIND_BAR: '#3498DB',
    WIND_BAR_BG: '#2C3E50'
  },

  // 游戏模式
  GAME_MODE: {
    PRACTICE: 'practice',
    VERSUS: 'versus',
    BATTLE_ROYALE: 'battle_royale'
  },

  // 默认AI数量
  DEFAULT_AI_COUNT: 3
}
