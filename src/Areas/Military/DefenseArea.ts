import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";
import { CreepBase } from "CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";

export const DEFENSE_FLAG_PREFIX = "Defense";
export const DEFENSE_TEST_FLAG_PREFIX = "Defense-Test";

export interface DefenseFlagConfig {
  name: string;
  roomName: string;
}

export default class DefenseArea extends BaseArea {
  public flag: DefenseFlagConfig;

  constructor(flag: DefenseFlagConfig) {
    const room = Game.rooms[flag.roomName];
    const spawns: StructureSpawn[] = room ? room.find(FIND_MY_SPAWNS) : [];
    const pos = spawns.length > 0 ? spawns[0].pos : new RoomPosition(25, 25, flag.roomName);
    super("DefenseArea", flag.name, pos, room);
    this.flag = flag;
    this.creeps = this.getCreepsAssignedToThisArea();
  }

  /** Detects all Defense-* flags in visible rooms. */
  public static detectAllFlags(): DefenseFlagConfig[] {
    return _.filter(
      Game.flags,
      flag =>
        flag.name === DEFENSE_FLAG_PREFIX ||
        flag.name.startsWith(`${DEFENSE_FLAG_PREFIX}`) ||
        DefenseArea.isTestFlagName(flag.name)
    ).map(flag => ({
      name: flag.name,
      roomName: flag.pos.roomName
    }));
  }

  public handleSpawnTasks(room: Room): SpawnTask[] {
    if (room.name !== this.flag.roomName) {
      return [];
    }

    const tasks: SpawnTask[] = [];

    const defenders = this.creeps.filter(c => c.creepType === CreepType.Defender);
    const rangers = this.creeps.filter(c => c.creepType === CreepType.DefenseRanger);
    const healers = this.creeps.filter(c => c.creepType === CreepType.DefenseHealer);

    const defenderAlive = defenders.filter(c => !(c.ticksToLive !== undefined && c.ticksToLive < 150)).length;
    const rangerAlive = rangers.filter(c => !(c.ticksToLive !== undefined && c.ticksToLive < 150)).length;
    const healerAlive = healers.filter(c => !(c.ticksToLive !== undefined && c.ticksToLive < 150)).length;

    if (defenderAlive < 1) {
      tasks.push(this.createDefenderCreep());
    }
    if (rangerAlive < 1) {
      tasks.push(this.createRangerCreep());
    }
    if (healerAlive < 1) {
      tasks.push(this.createHealerCreep());
    }

    return tasks;
  }

  public handleThisArea(): void {
    const room = Game.rooms[this.flag.roomName];
    if (!room) return;

    const hostiles = room
      .find(FIND_HOSTILE_CREEPS, {
        filter: creep => creep.owner !== null
      })
      .map(h => h.pos);

    const testFlag = this.getTestFlag(room);
    if (testFlag) hostiles.push(testFlag.pos);

    if (hostiles.length === 0) {
      return;
    }

    // Healers act every tick regardless of task state (mirrors SoldierArea healer pattern).
    for (const creep of this.creeps) {
      if (creep.creepType === CreepType.DefenseHealer) {
        this.runHealerActions(creep);
      }
    }

    // Positioning and combat.
    for (const creep of this.creeps) {
      if (creep.creepType === CreepType.Defender) {
        this.handleFighter(creep, hostiles, room, false);
      } else if (creep.creepType === CreepType.DefenseRanger) {
        this.handleFighter(creep, hostiles, room, true);
      } else if (creep.creepType === CreepType.DefenseHealer) {
        this.handleHealerMovement(creep, room);
      }
    }

    if (this.isTestMode()) {
      this.handleTestDefense(room);
    }
  }

  // ─── Healer ──────────────────────────────────────────────────────────────

  /** Heal the most injured DefenseArea creep each tick, preferring close-range heal. */
  private runHealerActions(healer: CreepBase): void {
    let mostDamaged: CreepBase | null = null;
    let highestDamageRatio = -1;

    for (const candidate of this.creeps) {
      const ratio = 1 - candidate.hits / candidate.hitsMax;
      if (ratio > highestDamageRatio) {
        highestDamageRatio = ratio;
        mostDamaged = candidate;
      }
    }

    if (!mostDamaged) return;

    const range = healer.pos.getRangeTo(mostDamaged.pos);
    if (range <= 1) {
      healer.creep.heal(mostDamaged.creep);
    } else if (range <= 3) {
      healer.creep.rangedHeal(mostDamaged.creep);
    }
  }

  /** Move healer to a rampart within ranged-heal distance (≤3) of the defender. */
  private handleHealerMovement(healer: CreepBase, room: Room): void {
    const fighter =
      this.creeps.find(c => c.creepType === CreepType.Defender) ??
      this.creeps.find(c => c.creepType === CreepType.DefenseRanger);
    if (!fighter) return;

    const target = this.findBestHealerRampart(fighter.pos, healer, room);
    if (target && !this.isPosEqual(healer.pos, target.pos)) {
      this.moveThroughDefensiveRoute(healer.creep, target.pos, room);
    }
  }

  // ─── Fighters (Melee + Ranger) ──────────────────────────────────────────

  /** Move fighter to a rampart near the closest enemy; attack while holding rampart. */
  private handleFighter(creep: CreepBase, hostilePositions: RoomPosition[], room: Room, ranged: boolean): void {
    // Pick the closest hostile as the primary target.
    const target = hostilePositions.reduce<RoomPosition | null>((best, h) => {
      if (!best) return h;
      return creep.pos.getRangeTo(h) < creep.pos.getRangeTo(best) ? h : best;
    }, null);

    if (!target) return;

    const creeps = target.lookFor(LOOK_CREEPS);
    const creepTarget = creeps.length > 0 ? creeps[0] : null;
    const isSimulatedTarget = target.lookFor(LOOK_FLAGS).some(f => DefenseArea.isTestFlagName(f.name));

    if (!isSimulatedTarget && !creepTarget) return;

    if (ranged) {
      const inRangeAttack = creep.pos.getRangeTo(target) <= 3;
      if (inRangeAttack) {
        if (isSimulatedTarget) {
          creep.creep.say("⚔️");
        } else if (creepTarget) {
          creep.creep.rangedAttack(creepTarget);
        }
      }
    } else {
      const adjacent = hostilePositions.find(h => creep.pos.getRangeTo(h) <= 1);
      if (adjacent) {
        if (isSimulatedTarget) {
          creep.creep.say("⚔️");
        } else if (creepTarget) {
          creep.creep.attack(creepTarget);
        }
      }
    }

    // Re-evaluate every tick: enemy can reposition, so we may need a different rampart.
    const targetRampart = this.findBestDefenderRampart(target, creep, room);
    if (targetRampart && !this.isPosEqual(creep.pos, targetRampart.pos)) {
      this.moveThroughDefensiveRoute(creep.creep, targetRampart.pos, room);
    } else {
      if (creepTarget) {
        creep.addTask(
          new CreepTask(ranged ? Activity.RangedAttack : Activity.Attack, creepTarget.pos, null, creepTarget.id)
        );
      }
    }
  }

  /** Test mode: treat Defense-Test like a hostile target without spending attack energy. */
  private handleTestDefense(room: Room): void {
    const targetPos = this.flagPos;
    const towers = GetRoomObjects.getRoomTowers(room);

    let totalAttack = 0;

    for (const creep of this.creeps) {
      if (creep.creepType === CreepType.Defender) {
        totalAttack += this.getMeleeAttackPower(creep, targetPos);
        room.visual.line(creep.pos, targetPos, { color: "red", opacity: 0.8, width: 0.15 });
      } else if (creep.creepType === CreepType.DefenseRanger) {
        totalAttack += this.getRangedAttackPower(creep, targetPos);
        room.visual.line(creep.pos, targetPos, { color: "red", opacity: 0.8, width: 0.15 });
      }
    }

    for (const tower of towers) {
      totalAttack += this.getTowerAttackPower(tower, targetPos);
      room.visual.line(tower.pos, targetPos, { color: "red", opacity: 0.8, width: 0.15 });
    }

    room.visual.text(`${totalAttack}`, targetPos.x + 1, targetPos.y - 1, {
      align: "left",
      color: "#ff3333",
      font: 0.7,
      opacity: 1
    });
  }

  // ─── Rampart helpers ─────────────────────────────────────────────────────

  private findBestDefenderRampart(enemyPos: RoomPosition, creep: CreepBase, room: Room): StructureRampart | null {
    const ramparts = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_RAMPART
    }) as StructureRampart[];

    if (ramparts.length === 0) return null;

    const interior = ramparts.filter(r => this.isInteriorPos(r.pos));
    const rampartPool = interior.length > 0 ? interior : ramparts;

    const free = rampartPool.filter(r => !this.otherCreepOnPos(r.pos, creep.name));
    const pool = free.length > 0 ? free : rampartPool;

    const scored = pool.map(rampart => ({
      rampart,
      path: this.getDefensivePathInfo(creep.creep, rampart.pos, room)
    }));

    const insideReachable = scored.filter(s => !s.path.outside && !s.path.incomplete);
    const candidates = insideReachable.length > 0 ? insideReachable : scored;

    // Prefer ramparts close enough to pressure enemy while still pathing from inside.
    // Ranking: enemy range first (closer is better), then travel distance from current position.
    candidates.sort((a, b) => {
      const diff = a.rampart.pos.getRangeTo(enemyPos) - b.rampart.pos.getRangeTo(enemyPos);
      if (diff !== 0) return diff;
      const pathDiff = a.path.length - b.path.length;
      if (pathDiff !== 0) return pathDiff;
      return a.rampart.pos.getRangeTo(creep.pos) - b.rampart.pos.getRangeTo(creep.pos);
    });

    return candidates[0].rampart;
  }

  private findBestHealerRampart(defenderPos: RoomPosition, healer: CreepBase, room: Room): StructureRampart | null {
    const ramparts = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_RAMPART
    }) as StructureRampart[];

    if (ramparts.length === 0) return null;

    const interior = ramparts.filter(r => this.isInteriorPos(r.pos));
    const rampartPool = interior.length > 0 ? interior : ramparts;

    const free = rampartPool.filter(r => !this.otherCreepOnPos(r.pos, healer.name));
    const pool = free.length > 0 ? free : rampartPool;

    // Prefer ramparts reachable by ranged-heal (≤1 tile from defender).
    const inHealRange = pool.filter(r => r.pos.getRangeTo(defenderPos) <= 1);
    const candidates = inHealRange.length > 0 ? inHealRange : pool;

    const scored = candidates.map(rampart => ({
      rampart,
      path: this.getDefensivePathInfo(healer.creep, rampart.pos, room)
    }));

    const insideReachable = scored.filter(s => !s.path.outside && !s.path.incomplete);
    const ranked = insideReachable.length > 0 ? insideReachable : scored;

    // Sort: closest to healer, tiebroken by proximity to defender.
    ranked.sort((a, b) => {
      const diff = a.rampart.pos.getRangeTo(healer.pos) - b.rampart.pos.getRangeTo(healer.pos);
      if (diff !== 0) return diff;
      const pathDiff = a.path.length - b.path.length;
      if (pathDiff !== 0) return pathDiff;
      return a.rampart.pos.getRangeTo(defenderPos) - b.rampart.pos.getRangeTo(defenderPos);
    });

    return ranked[0].rampart;
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  /**
   * Constrains defensive movement to interior routes and strongly prefers friendly
   * ramparts when pathing. This avoids routing around the outside wall ring.
   */
  private moveThroughDefensiveRoute(creep: Creep, target: RoomPosition, room: Room): void {
    const defenseMatrix = this.buildDefenseCostMatrix(room);
    creep.moveTo(target, {
      range: 0,
      reusePath: 0,
      visualizePathStyle: { stroke: "#ff3333", opacity: 0.5, lineStyle: "dashed" },
      costCallback: (roomName: string, matrix: CostMatrix) => {
        if (roomName !== room.name) {
          return matrix;
        }
        return defenseMatrix.clone();
      }
    });
  }

  private buildDefenseCostMatrix(room: Room, visualizeMatrix = false): CostMatrix {
    const matrix = new PathFinder.CostMatrix();
    const terrain = room.getTerrain();
    const friendlyRamparts = new Set<string>();

    const structures = room.find(FIND_STRUCTURES);
    for (const structure of structures) {
      if (structure.structureType === STRUCTURE_RAMPART && structure.my) {
        friendlyRamparts.add(`${structure.pos.x}:${structure.pos.y}`);
      }
    }

    // Strongly prefer friendly ramparts and block walls/hostile ramparts.
    for (const structure of structures) {
      if (structure.structureType === STRUCTURE_RAMPART) {
        matrix.set(structure.pos.x, structure.pos.y, structure.my ? 1 : 255);
      } else if (structure.structureType === STRUCTURE_WALL) {
        matrix.set(structure.pos.x, structure.pos.y, 255);
      }
    }

    // Penalize border-near tiles and tiles that sit outside the friendly rampart ring.
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
          matrix.set(x, y, 255);
          continue;
        }

        if (x <= 2 || x >= 47 || y <= 2 || y >= 47) {
          matrix.set(x, y, 50);
          continue;
        }

        const key = `${x}:${y}`;
        if (friendlyRamparts.has(key)) {
          matrix.set(x, y, 1);
        }

        // We need to set 255 for where unwalkable structure and other creeps are.
        if (
          room
            .lookForAt(LOOK_STRUCTURES, x, y)
            .some(s => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD) ||
          room.lookForAt(LOOK_CREEPS, x, y).length > 0
        ) {
          matrix.set(x, y, 255);
        }
      }
    }

    // Toggle this if you want to visualize the cost matrix for debugging.
    if (visualizeMatrix) {
      for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
          room.visual.text(matrix.get(x, y).toString(), x, y, { font: 0.5, color: "orange" });
        }
      }
    }

    return matrix;
  }

  private getTestFlag(room: Room): Flag | null {
    const flag = Game.flags[this.flag.name];
    return flag && flag.pos.roomName === room.name && DefenseArea.isTestFlagName(flag.name) ? flag : null;
  }

  private get flagPos(): RoomPosition {
    return this.flag.name in Game.flags ? Game.flags[this.flag.name].pos : new RoomPosition(25, 25, this.flag.roomName);
  }

  private getMeleeAttackPower(creep: CreepBase, targetPos: RoomPosition): number {
    const range = creep.pos.getRangeTo(targetPos);
    if (range > 1) return 0;
    return creep.creep.getActiveBodyparts(ATTACK) * ATTACK_POWER;
  }

  private getRangedAttackPower(creep: CreepBase, targetPos: RoomPosition): number {
    const range = creep.pos.getRangeTo(targetPos);
    if (range > 3) return 0;
    const activeParts = creep.creep.getActiveBodyparts(RANGED_ATTACK);
    return activeParts * RANGED_ATTACK_POWER;
  }

  private getTowerAttackPower(tower: StructureTower, targetPos: RoomPosition): number {
    const range = tower.pos.getRangeTo(targetPos);
    if (range <= TOWER_OPTIMAL_RANGE) {
      return TOWER_POWER_ATTACK;
    }

    const minDamage = Math.floor(TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF));
    if (range >= TOWER_FALLOFF_RANGE) {
      return minDamage;
    }

    const falloffPct = (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
    return Math.floor(TOWER_POWER_ATTACK - (TOWER_POWER_ATTACK - minDamage) * falloffPct);
  }

  private getDefensivePathInfo(
    creep: Creep,
    target: RoomPosition,
    room: Room
  ): { length: number; outside: boolean; incomplete: boolean } {
    const matrix = this.buildDefenseCostMatrix(room);
    const result = PathFinder.search(
      creep.pos,
      { pos: target, range: 0 },
      {
        maxRooms: 1,
        plainCost: 5,
        swampCost: 20,
        roomCallback: roomName => (roomName === room.name ? matrix.clone() : false)
      }
    );

    const outside = result.path.some(p => p.x <= 2 || p.x >= 47 || p.y <= 2 || p.y >= 47);
    return {
      length: result.path.length,
      outside,
      incomplete: result.incomplete
    };
  }

  /** Interior tiles exclude near-edge positions where outside-wall pathing happens. */
  private isInteriorPos(pos: RoomPosition): boolean {
    return pos.x >= 3 && pos.x <= 46 && pos.y >= 3 && pos.y <= 46;
  }

  private otherCreepOnPos(pos: RoomPosition, excludeName: string): boolean {
    return this.creeps.some(c => c.name !== excludeName && this.isPosEqual(c.pos, pos));
  }

  private isPosEqual(a: RoomPosition, b: RoomPosition): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
  }

  // ─── Spawn helpers ────────────────────────────────────────────────────────

  /** TOUGH + ATTACK + MOVE — one segment = 140 energy, capped at 16 segments. */
  private createDefenderCreep(): SpawnTask {
    if (this.isTestMode()) {
      return new SpawnTask(CreepType.Defender, this.areaId, [ATTACK, MOVE], this);
    }
    const room = Game.rooms[this.flag.roomName];
    const energy = room?.energyCapacityAvailable ?? 550;
    const segments = Math.max(1, Math.min(16, Math.floor(energy / 140)));
    const body: BodyPartConstant[] = [];
    // segments = 1;
    for (let i = 0; i < segments; i++) body.push(ATTACK);
    for (let i = 0; i < segments / 2; i++) body.push(MOVE);
    return new SpawnTask(CreepType.Defender, this.areaId, body, this);
  }

  /** HEAL + MOVE — one segment = 300 energy, capped at 10 segments. */
  private createHealerCreep(): SpawnTask {
    if (this.isTestMode()) {
      return new SpawnTask(CreepType.DefenseHealer, this.areaId, [HEAL, MOVE], this);
    }
    const room = Game.rooms[this.flag.roomName];
    const energy = room?.energyCapacityAvailable ?? 300;
    const segments = Math.max(1, Math.min(10, Math.floor(energy / 300)));
    const body: BodyPartConstant[] = [];
    // segments = 1;
    for (let i = 0; i < segments; i++) body.push(HEAL);
    for (let i = 0; i < segments / 2; i++) body.push(MOVE);
    return new SpawnTask(CreepType.DefenseHealer, this.areaId, body, this);
  }

  /** TOUGH + RANGED_ATTACK + MOVE — one segment = 210 energy, capped at 5 segments. */
  private createRangerCreep(): SpawnTask {
    if (this.isTestMode()) {
      return new SpawnTask(CreepType.DefenseRanger, this.areaId, [RANGED_ATTACK, MOVE], this);
    }
    const room = Game.rooms[this.flag.roomName];
    const energy = room?.energyCapacityAvailable ?? 550;
    const segments = Math.max(1, Math.min(6, Math.floor(energy / 210)));
    const body: BodyPartConstant[] = [];
    // segments = 1;
    for (let i = 0; i < segments; i++) body.push(RANGED_ATTACK);
    for (let i = 0; i < segments / 2; i++) body.push(MOVE);
    return new SpawnTask(CreepType.DefenseRanger, this.areaId, body, this);
  }

  private isTestMode(): boolean {
    return DefenseArea.isTestFlagName(this.flag.name);
  }

  private static isTestFlagName(name: string): boolean {
    return name === DEFENSE_TEST_FLAG_PREFIX || name.startsWith(`${DEFENSE_TEST_FLAG_PREFIX}-`);
  }
}
