// 战役模式系统 - 对应原项目 CampaignCatalog.cs / CampaignObjective
// 4个章节，共26关，3种目标类型（击落全部/存活/穿环），Boss+增援机制

const CONSTS = require('./constants')

// 目标类型
const OBJECTIVE_TYPE = {
  KILL_ALL: 0,    // 击落全部敌机
  SURVIVE: 1,     // 存活指定秒数
  FLY_RING: 2     // 穿过指定数量能量环
}

// 敌人规格
class EnemySpec {
  constructor(options = {}) {
    this.name = options.name || '敌机'
    this.skillLevel = options.skillLevel || 1
    this.healthMul = options.healthMul || 1
    this.scaleMul = options.scaleMul || 1
    this.attackMul = options.attackMul || 1
  }
}

// 关卡定义
class LevelDef {
  constructor(options = {}) {
    this.id = options.id || 0
    this.chapter = options.chapter || 1
    this.name = options.name || '关卡'
    this.briefing = options.briefing || ''
    this.objective = options.objective || OBJECTIVE_TYPE.KILL_ALL
    this.surviveSeconds = options.surviveSeconds || 0
    this.ringCount = options.ringCount || 0
    this.enemies = options.enemies || []
    this.rewardCoins = options.rewardCoins || 0
    this.rewardMissiles = options.rewardMissiles || 0
    this.rewardNets = options.rewardNets || 0
    this.isBoss = options.isBoss || false
    this.reinforceAtSeconds = options.reinforceAtSeconds || 0
    this.reinforcements = options.reinforcements || []
  }
}

// 战役配置表
const CAMPAIGN_CHAPTERS = [
  { id: 1, name: '第1章·书桌战场', mapId: 'classroom' },
  { id: 2, name: '第2章·遗迹迷途', mapId: 'canyon' },
  { id: 3, name: '第3章·星核决战', mapId: 'starcore' },
  { id: 4, name: '第4章·都市峡谷', mapId: 'city' }
]

// 26关关卡数据
const CAMPAIGN_LEVELS = [
  // ========== 第1章 ==========
  new LevelDef({
    id: 1, chapter: 1, name: '同桌的丑飞机', briefing: '击败这架碍眼的飞机！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [new EnemySpec({ name: '同桌的丑飞机', skillLevel: 1 })],
    rewardCoins: 70, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 2, chapter: 1, name: '双机夹击', briefing: '两架敌机一起上了！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '纸敌甲', skillLevel: 1 }),
      new EnemySpec({ name: '纸敌乙', skillLevel: 1 })
    ],
    rewardCoins: 110, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 3, chapter: 1, name: '小组长', briefing: '小组长带着僚机来了！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '小组长', skillLevel: 3, healthMul: 2.2, scaleMul: 1.7, attackMul: 1.25 }),
      new EnemySpec({ name: '小组长僚机', skillLevel: 2 })
    ],
    rewardCoins: 180, rewardMissiles: 1, rewardNets: 1, isBoss: true
  }),
  new LevelDef({
    id: 4, chapter: 1, name: '三机围杀', briefing: '小心被包围！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '纸敌甲', skillLevel: 2 }),
      new EnemySpec({ name: '纸敌乙', skillLevel: 2 }),
      new EnemySpec({ name: '纸敌丙', skillLevel: 2 })
    ],
    rewardCoins: 200, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 5, chapter: 1, name: '纸敌小队', briefing: '三人组的围攻！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '纸敌甲', skillLevel: 3 }),
      new EnemySpec({ name: '纸敌乙', skillLevel: 3 }),
      new EnemySpec({ name: '纸敌丙', skillLevel: 3 })
    ],
    rewardCoins: 250, rewardMissiles: 0, rewardNets: 1
  }),
  new LevelDef({
    id: 6, chapter: 1, name: '学习委员', briefing: '学霸来了，带两架护航机！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '学习委员', skillLevel: 5, healthMul: 3, scaleMul: 2, attackMul: 1.35 }),
      new EnemySpec({ name: '护航机甲', skillLevel: 4 }),
      new EnemySpec({ name: '护航机乙', skillLevel: 4 })
    ],
    rewardCoins: 330, rewardMissiles: 2, rewardNets: 1, isBoss: true
  }),
  new LevelDef({
    id: 7, chapter: 1, name: '班长', briefing: '最终BOSS！班长亲自出马！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '班长', skillLevel: 6, healthMul: 3.5, scaleMul: 2.3, attackMul: 1.5 }),
      new EnemySpec({ name: '班长僚机甲', skillLevel: 5 }),
      new EnemySpec({ name: '班长僚机乙', skillLevel: 5 })
    ],
    rewardCoins: 450, rewardMissiles: 2, rewardNets: 2, isBoss: true
  }),

  // ========== 第2章·遗迹迷途 ==========
  new LevelDef({
    id: 8, chapter: 2, name: '穿环训练', briefing: '穿过4个能量环，小心敌机骚扰！',
    objective: OBJECTIVE_TYPE.FLY_RING, ringCount: 4,
    enemies: [
      new EnemySpec({ name: '异星机甲', skillLevel: 6 }),
      new EnemySpec({ name: '异星机乙', skillLevel: 6 }),
      new EnemySpec({ name: '异星机丙', skillLevel: 7 })
    ],
    rewardCoins: 70, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 9, chapter: 2, name: '巡逻机甲', briefing: '遗迹的巡逻队！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '巡逻机甲', skillLevel: 6, healthMul: 1.35, attackMul: 1.1 }),
      new EnemySpec({ name: '巡逻机乙', skillLevel: 6 }),
      new EnemySpec({ name: '巡逻机丙', skillLevel: 7 })
    ],
    rewardCoins: 110, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 10, chapter: 2, name: '守卫战', briefing: '存活70秒！注意增援！',
    objective: OBJECTIVE_TYPE.SURVIVE, surviveSeconds: 70,
    enemies: [
      new EnemySpec({ name: '守卫机甲', skillLevel: 7 }),
      new EnemySpec({ name: '守卫机乙', skillLevel: 7 })
    ],
    reinforcements: [
      new EnemySpec({ name: '守卫机丙', skillLevel: 8 }),
      new EnemySpec({ name: '守卫机丁', skillLevel: 8 })
    ],
    reinforceAtSeconds: 32,
    rewardCoins: 180, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 11, chapter: 2, name: '回廊穿环', briefing: '穿过5个能量环！',
    objective: OBJECTIVE_TYPE.FLY_RING, ringCount: 5,
    enemies: [
      new EnemySpec({ name: '回廊机甲', skillLevel: 7 }),
      new EnemySpec({ name: '回廊机乙', skillLevel: 7 }),
      new EnemySpec({ name: '回廊机丙', skillLevel: 8 })
    ],
    rewardCoins: 200, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 12, chapter: 2, name: '精英小队', briefing: '精英敌人来袭！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '精英机甲', skillLevel: 8, healthMul: 1.4, attackMul: 1.15 }),
      new EnemySpec({ name: '精英机乙', skillLevel: 8 }),
      new EnemySpec({ name: '精英机丙', skillLevel: 8 })
    ],
    rewardCoins: 250, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 13, chapter: 2, name: '遗迹守卫', briefing: 'BOSS！遗迹的守护者！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '遗迹守卫', skillLevel: 9, healthMul: 3.1, scaleMul: 1.8, attackMul: 1.55 }),
      new EnemySpec({ name: '守卫僚机甲', skillLevel: 8 }),
      new EnemySpec({ name: '守卫僚机乙', skillLevel: 8 })
    ],
    rewardCoins: 330, rewardMissiles: 2, rewardNets: 1, isBoss: true
  }),
  new LevelDef({
    id: 14, chapter: 2, name: '归途守门人', briefing: '最终BOSS！守门人登场！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '归途守门人', skillLevel: 10, healthMul: 3.7, scaleMul: 2.1, attackMul: 1.65 }),
      new EnemySpec({ name: '守门僚机甲', skillLevel: 9 }),
      new EnemySpec({ name: '守门僚机乙', skillLevel: 9 })
    ],
    rewardCoins: 450, rewardMissiles: 2, rewardNets: 2, isBoss: true
  }),

  // ========== 第3章·星核决战 ==========
  new LevelDef({
    id: 15, chapter: 3, name: '核心突围', briefing: '存活75秒，注意增援！',
    objective: OBJECTIVE_TYPE.SURVIVE, surviveSeconds: 75,
    enemies: [
      new EnemySpec({ name: '核心机甲', skillLevel: 9 }),
      new EnemySpec({ name: '核心机乙', skillLevel: 9 })
    ],
    reinforcements: [
      new EnemySpec({ name: '核心机丙', skillLevel: 9 }),
      new EnemySpec({ name: '核心机丁', skillLevel: 10 })
    ],
    reinforceAtSeconds: 35,
    rewardCoins: 130, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 16, chapter: 3, name: '光道穿环', briefing: '穿过6个能量环！',
    objective: OBJECTIVE_TYPE.FLY_RING, ringCount: 6,
    enemies: [
      new EnemySpec({ name: '光道机甲', skillLevel: 9 }),
      new EnemySpec({ name: '光道机乙', skillLevel: 9 }),
      new EnemySpec({ name: '光道机丙', skillLevel: 10 })
    ],
    rewardCoins: 200, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 17, chapter: 3, name: '量子围杀', briefing: '四机围攻！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '量子机甲', skillLevel: 10, healthMul: 1.35, attackMul: 1.15 }),
      new EnemySpec({ name: '量子机乙', skillLevel: 10 }),
      new EnemySpec({ name: '量子机丙', skillLevel: 10 }),
      new EnemySpec({ name: '量子机丁', skillLevel: 10 })
    ],
    rewardCoins: 270, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 18, chapter: 3, name: '星核执政官', briefing: 'BOSS！执政官来了！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '星核执政官', skillLevel: 10, healthMul: 3.6, scaleMul: 2, attackMul: 1.65 }),
      new EnemySpec({ name: '执政僚机甲', skillLevel: 10 }),
      new EnemySpec({ name: '执政僚机乙', skillLevel: 10 })
    ],
    rewardCoins: 400, rewardMissiles: 2, rewardNets: 1, isBoss: true
  }),
  new LevelDef({
    id: 19, chapter: 3, name: '星核之心', briefing: '最终BOSS！星核之心！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '星核之心', skillLevel: 10, healthMul: 4.4, scaleMul: 2.4, attackMul: 1.8 }),
      new EnemySpec({ name: '心核僚机甲', skillLevel: 10 }),
      new EnemySpec({ name: '心核僚机乙', skillLevel: 10 })
    ],
    rewardCoins: 600, rewardMissiles: 2, rewardNets: 2, isBoss: true
  }),

  // ========== 第4章·都市峡谷 ==========
  new LevelDef({
    id: 20, chapter: 4, name: '楼顶哨战', briefing: '穿过6个能量环！',
    objective: OBJECTIVE_TYPE.FLY_RING, ringCount: 6,
    enemies: [
      new EnemySpec({ name: '楼顶哨机甲', skillLevel: 8 }),
      new EnemySpec({ name: '楼顶哨机乙', skillLevel: 8 }),
      new EnemySpec({ name: '楼顶哨机丙', skillLevel: 9 })
    ],
    rewardCoins: 170, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 21, chapter: 4, name: '窗间猎手', briefing: '都市中的猎手！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '窗间猎手甲', skillLevel: 9, healthMul: 1.35, attackMul: 1.15 }),
      new EnemySpec({ name: '窗间猎手乙', skillLevel: 9 }),
      new EnemySpec({ name: '窗间猎手丙', skillLevel: 9 })
    ],
    rewardCoins: 230, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 22, chapter: 4, name: '风道截击', briefing: '存活70秒！',
    objective: OBJECTIVE_TYPE.SURVIVE, surviveSeconds: 70,
    enemies: [
      new EnemySpec({ name: '风道截击甲', skillLevel: 9 }),
      new EnemySpec({ name: '风道截击乙', skillLevel: 9 })
    ],
    reinforcements: [
      new EnemySpec({ name: '风道截击丙', skillLevel: 10 }),
      new EnemySpec({ name: '风道截击丁', skillLevel: 10 })
    ],
    reinforceAtSeconds: 30,
    rewardCoins: 200, rewardMissiles: 1, rewardNets: 0
  }),
  new LevelDef({
    id: 23, chapter: 4, name: '天台巡逻', briefing: '穿过7个能量环！',
    objective: OBJECTIVE_TYPE.FLY_RING, ringCount: 7,
    enemies: [
      new EnemySpec({ name: '天台巡逻甲', skillLevel: 10 }),
      new EnemySpec({ name: '天台巡逻乙', skillLevel: 10 }),
      new EnemySpec({ name: '天台巡逻丙', skillLevel: 10 })
    ],
    rewardCoins: 270, rewardMissiles: 1, rewardNets: 1
  }),
  new LevelDef({
    id: 24, chapter: 4, name: '天台守卫', briefing: '四人围攻！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '天台守卫甲', skillLevel: 10, healthMul: 1.4, attackMul: 1.2 }),
      new EnemySpec({ name: '天台守卫乙', skillLevel: 10 }),
      new EnemySpec({ name: '天台守卫丙', skillLevel: 10 }),
      new EnemySpec({ name: '天台守卫丁', skillLevel: 10 })
    ],
    rewardCoins: 330, rewardMissiles: 2, rewardNets: 1
  }),
  new LevelDef({
    id: 25, chapter: 4, name: '都市之眼', briefing: 'BOSS！都市之眼！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '都市之眼', skillLevel: 10, healthMul: 3.9, scaleMul: 2.2, attackMul: 1.7 }),
      new EnemySpec({ name: '都市僚机甲', skillLevel: 10 }),
      new EnemySpec({ name: '都市僚机乙', skillLevel: 10 })
    ],
    rewardCoins: 470, rewardMissiles: 2, rewardNets: 1, isBoss: true
  }),
  new LevelDef({
    id: 26, chapter: 4, name: '城市之心', briefing: '最终BOSS！城市之心！',
    objective: OBJECTIVE_TYPE.KILL_ALL,
    enemies: [
      new EnemySpec({ name: '城市之心', skillLevel: 10, healthMul: 4.9, scaleMul: 2.6, attackMul: 1.85 }),
      new EnemySpec({ name: '心核哨机甲', skillLevel: 10 }),
      new EnemySpec({ name: '心核哨机乙', skillLevel: 10 })
    ],
    rewardCoins: 670, rewardMissiles: 2, rewardNets: 2, isBoss: true
  })
]

// 战役目标基类
class CampaignObjective {
  constructor() {
    this.completed = false
    this.failed = false
  }
  tick(dt, game) {}
}

// 击落全部目标
class KillAllObjective extends CampaignObjective {
  constructor(totalEnemies) {
    super()
    this.totalEnemies = totalEnemies
  }
  tick(dt, game) {
    const aliveEnemies = game.planes.filter(p => p.isAI && p.isAlive).length
    if (aliveEnemies === 0 && game.elapsed > 1) {
      this.completed = true
    }
  }
}

// 存活目标
class SurviveObjective extends CampaignObjective {
  constructor(seconds) {
    super()
    this.surviveSeconds = seconds
    this.elapsed = 0
  }
  tick(dt, game) {
    this.elapsed += dt
    if (game.player && !game.player.isAlive && game.player.lives < 0) {
      this.failed = true
      return
    }
    if (this.elapsed >= this.surviveSeconds) {
      this.completed = true
    }
  }
}

// 穿环目标
class FlyRingObjective extends CampaignObjective {
  constructor(ringCount) {
    super()
    this.ringCount = ringCount
    this.ringsPassed = 0
    this.rings = []  // 能量环位置数组
  }
  initRings(arenaRadius) {
    // 生成能量环
    for (let i = 0; i < this.ringCount; i++) {
      const angle = (i / this.ringCount) * Math.PI * 2
      const dist = arenaRadius * 0.5
      this.rings.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        passed: false,
        radius: 30
      })
    }
  }
  tick(dt, game) {
    if (!game.player || !game.player.isAlive) return
    if (this.rings.length === 0) {
      this.initRings(game.arenaRadius || CONSTS.ARENA.RADIUS)
    }

    for (const ring of this.rings) {
      if (ring.passed) continue
      const dx = game.player.x - ring.x
      const dy = game.player.y - ring.y
      if (Math.sqrt(dx * dx + dy * dy) < ring.radius) {
        ring.passed = true
        this.ringsPassed++
      }
    }

    if (this.ringsPassed >= this.ringCount) {
      this.completed = true
    }
  }
}

// 战役管理器
class CampaignManager {
  constructor() {
    this.currentLevel = null
    this.objective = null
    this.reinforceSpawned = false
    this.unlockedLevels = [1]  // 已解锁关卡
    this.completedLevels = []
  }

  getChapter(chapterId) {
    return CAMPAIGN_CHAPTERS.find(c => c.id === chapterId)
  }

  getLevel(levelId) {
    return CAMPAIGN_LEVELS.find(l => l.id === levelId)
  }

  getLevelsOfChapter(chapterId) {
    return CAMPAIGN_LEVELS.filter(l => l.chapter === chapterId)
  }

  startLevel(levelId) {
    this.currentLevel = this.getLevel(levelId)
    if (!this.currentLevel) return null

    this.reinforceSpawned = false

    // 创建目标
    switch (this.currentLevel.objective) {
      case OBJECTIVE_TYPE.KILL_ALL:
        this.objective = new KillAllObjective(this.currentLevel.enemies.length)
        break
      case OBJECTIVE_TYPE.SURVIVE:
        this.objective = new SurviveObjective(this.currentLevel.surviveSeconds)
        break
      case OBJECTIVE_TYPE.FLY_RING:
        this.objective = new FlyRingObjective(this.currentLevel.ringCount)
        break
    }

    return this.currentLevel
  }

  tick(dt, game) {
    if (!this.objective || !this.currentLevel) return

    // 增援
    if (!this.reinforceSpawned && this.currentLevel.reinforcements.length > 0 &&
        game.elapsed >= this.currentLevel.reinforceAtSeconds) {
      this.reinforceSpawned = true
      game.spawnReinforcements(this.currentLevel.reinforcements)
    }

    this.objective.tick(dt, game)

    return {
      completed: this.objective.completed,
      failed: this.objective.failed
    }
  }

  completeLevel() {
    if (!this.currentLevel) return null
    const levelId = this.currentLevel.id
    if (!this.completedLevels.includes(levelId)) {
      this.completedLevels.push(levelId)
    }
    // 解锁下一关
    const nextId = levelId + 1
    if (this.getLevel(nextId) && !this.unlockedLevels.includes(nextId)) {
      this.unlockedLevels.push(nextId)
    }
    return this.currentLevel
  }

  getObjectiveText() {
    if (!this.currentLevel || !this.objective) return ''
    switch (this.currentLevel.objective) {
      case OBJECTIVE_TYPE.KILL_ALL:
        return `击落全部敌机`
      case OBJECTIVE_TYPE.SURVIVE:
        const remaining = Math.max(0, Math.ceil(this.currentLevel.surviveSeconds - this.objective.elapsed))
        return `存活 ${remaining} 秒`
      case OBJECTIVE_TYPE.FLY_RING:
        return `穿环 ${this.objective.ringsPassed}/${this.currentLevel.ringCount}`
    }
    return ''
  }
}

module.exports = {
  CampaignManager,
  OBJECTIVE_TYPE,
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_LEVELS,
  KillAllObjective,
  SurviveObjective,
  FlyRingObjective,
  EnemySpec,
  LevelDef
}
