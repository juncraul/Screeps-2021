import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./../BaseArea";
import { CreepBase } from "../../CreepBase";

const SQUAD_SIZE = 5;
const ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;

enum PrimaryColor {
  RED = COLOR_RED, // Melee
  GREEN = COLOR_GREEN, // Ranged
  BLUE = COLOR_BLUE, // Healer
  PURPLE = COLOR_PURPLE // Split (half Melee, half Ranged)
}

enum SecondaryColor {
  RED = COLOR_RED, // Attack everything
  GRAY = COLOR_GREY, // Attack structures only
  BLUE = COLOR_BLUE, // Attack creeps only
  WHITE = COLOR_WHITE // No attack (just move to flag)
}

export interface AttackFlagConfig {
  name: string;
  position: RoomPosition;
  targetRoom: string;
  baseRoomName?: string;
  primaryColor: number;
  secondaryColor: number;
  squadSize: number;
  bodySegments: number | null;
}

/**
 * One SoldierArea instance per Attack flag.
 * areaId = flag.name, so BaseArea memory tracks this flag's creeps independently.
 * Overseer calls SoldierArea.detectAllFlags() once, then creates one instance per flag.
 */
export default class SoldierArea extends BaseArea {
  flag: AttackFlagConfig;

  // Shared tick cache for military flag detection helpers.
  protected static cachedFlagLists: Record<string, { tick: number; flags: unknown[] }> = {};

  constructor(flag: AttackFlagConfig) {
    super("SoldierArea", flag.name, flag.position, Game.rooms[flag.targetRoom]);
    this.flag = flag;
    this.migrateLegacySoldierFlag(flag.name);
  }

  // Static: detect all Attack flags (cached per tick)

  public static detectAllFlags(): AttackFlagConfig[] {
    const flags = _.filter(Game.flags, flag => flag.name === "Attack" || flag.name.startsWith("Attack-"));
    const currentStates: Record<string, SoldierFlagState> = {};
    const configs: AttackFlagConfig[] = [];

    for (const flag of flags) {
      const parsed = SoldierArea.parseAttackFlagName(flag.name);
      configs.push({
        name: flag.name,
        position: flag.pos,
        targetRoom: flag.pos.roomName,
        baseRoomName: parsed.baseRoomName,
        primaryColor: flag.color,
        secondaryColor: flag.secondaryColor,
        squadSize: parsed.squadSize,
        bodySegments: parsed.bodySegments
      });
      currentStates[flag.name] = {
        x: flag.pos.x,
        y: flag.pos.y,
        roomName: flag.pos.roomName,
        color: flag.color,
        secondaryColor: flag.secondaryColor
      };
    }

    const previousStates = Memory.soldierFlagStates ?? {};

    for (const flagName of Object.keys(currentStates)) {
      const prev = previousStates[flagName];
      const curr = currentStates[flagName];
      if (!prev) continue;
      const changed =
        prev.color !== curr.color ||
        prev.secondaryColor !== curr.secondaryColor ||
        prev.x !== curr.x ||
        prev.y !== curr.y ||
        prev.roomName !== curr.roomName;
      if (changed) {
        SoldierArea.clearTasksForFlag(flagName);
      }
    }

    for (const flagName of Object.keys(previousStates)) {
      if (!currentStates[flagName]) {
        SoldierArea.clearTasksForFlag(flagName);
      }
    }

    Memory.soldierFlagStates = currentStates;

    const validFlags = configs.filter(c => c.squadSize > 0);
    validFlags.sort((a, b) => a.name.localeCompare(b.name));
    SoldierArea.cachedFlagLists.Attack = { tick: Game.time, flags: validFlags as unknown[] };
    return validFlags;
  }

  // Static: draw combined legend for all active flags

  public static drawLegend(soldierAreas: SoldierArea[], room: Room): void {
    if (!room) return;

    const visual = room.visual;
    const x = 1;
    let y = 3;
    const plain: TextStyle = { align: "left", opacity: 0.85, font: 0.5 };
    const header: TextStyle = { align: "left", opacity: 0.9, font: 0.52, color: "#ffff00" };
    const title: TextStyle = { align: "left", opacity: 1, font: 0.6, color: "#ffffff" };
    const active: TextStyle = { align: "left", opacity: 1, font: 0.52, color: "#00ff88" };

    visual.text("=== Attack Flags ===", x, y, title);
    y += 0.9;
    visual.text("Name format: Attack-squadSize-bodySegments-baseRoom-anyText", x, y, header);
    y += 0.7;
    visual.text("Example: Attack-4-2-E29S25-Healers => squad 4, 2 segments, base E29S25", x, y, plain);
    y += 0.7;
    visual.text("Attack-4-2-Healers keeps default: spawn from any base", x, y, plain);
    y += 0.9;

    visual.text("Primary color (flag body):", x, y, header);
    y += 0.7;
    visual.text("  RED -> Melee squad", x, y, plain);
    y += 0.6;
    visual.text("  GREEN -> Ranged squad", x, y, plain);
    y += 0.6;
    visual.text("  BLUE -> Healer squad", x, y, plain);
    y += 0.6;
    visual.text("  PURPLE -> Split squad (half Melee, half Ranged)", x, y, plain);
    y += 0.8;

    visual.text("Secondary color (flag dot):", x, y, header);
    y += 0.7;
    visual.text("  RED -> Attack everything", x, y, plain);
    y += 0.6;
    visual.text("  GRAY -> Attack structures only", x, y, plain);
    y += 0.6;
    visual.text("  BLUE -> Attack creeps only", x, y, plain);
    y += 0.9;

    visual.text(`Active flags: ${soldierAreas.length}`, x, y, header);
    y += 0.7;
    for (const area of soldierAreas) {
      const flag = area.flag;
      const role = CreepType[SoldierArea.getCreepTypeFromColor(flag.primaryColor, 0, flag.squadSize)];
      let targetType = "Everything";
      if (flag.secondaryColor === SecondaryColor.GRAY) targetType = "Structures";
      else if (flag.secondaryColor === SecondaryColor.BLUE) targetType = "Creeps";
      else if (flag.secondaryColor === SecondaryColor.WHITE) targetType = "None";
      const segmentText = flag.bodySegments === null ? "default" : `${flag.bodySegments}`;
      const spawnBaseText = flag.baseRoomName ? flag.baseRoomName : "any";
      visual.text(
        `${flag.name}: squad ${area.creeps.length}/${flag.squadSize}, segments ${segmentText}, base ${spawnBaseText}, role ${role}, target ${targetType}, room ${flag.targetRoom}`,
        x,
        y,
        active
      );
      y += 0.62;
    }
  }

  // Instance: per-flag spawn tasks

  public handleSpawnTasks(room: Room): SpawnTask[] {
    if (this.flag.baseRoomName && this.flag.baseRoomName !== room.name) return [];
    const dying = this.creeps.filter(c => c.ticksToLive && c.ticksToLive < 150).length;
    const deficit = Math.max(0, this.flag.squadSize - this.creeps.length + dying);
    const tasks: SpawnTask[] = [];
    if (deficit > 0) {
      const task = this.createCreepForFlag();
      if (task) tasks.push(task);
    }
    return tasks;
  }

  // Instance: per-flag creep handling

  public handleThisArea(): void {
    this.runHealerSupport();

    const formationMovementApplied = this.shouldUseFormationMovement() && this.tryMoveAsFormation();

    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.pos.roomName !== this.flag.targetRoom) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.flag.targetRoom)));
        continue;
      }

      if (creep.creepType !== CreepType.Healer) {
        const combatAssigned = this.assignCombatTask(creep, this.flag.secondaryColor);
        if (!combatAssigned && !formationMovementApplied) {
          creep.addTask(new CreepTask(Activity.Move, this.flag.position));
        }
      }
    }
  }

  // Private static helpers

  private static parseAttackFlagName(
    name: string
  ): {
    squadSize: number;
    bodySegments: number | null;
    baseRoomName?: string;
  } {
    if (name === "Attack") {
      return { squadSize: SQUAD_SIZE, bodySegments: null };
    }
    const parts = name.split("-");
    const parsedSquad = parts[1];
    const parsedSegments = parts[2];
    const squadSize = /^\d+$/.test(parsedSquad) ? parseInt(parsedSquad, 10) : SQUAD_SIZE;
    const bodySegments = /^\d+$/.test(parsedSegments) ? parseInt(parsedSegments, 10) : null;
    const baseRoomName = parts.slice(3).find(part => ROOM_NAME_PATTERN.test(part));
    return { squadSize, bodySegments, baseRoomName };
  }

  private static clearTasksForFlag(flagName: string): void {
    const key = `SoldierArea-${flagName}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    for (const name of creepNames) {
      const creep = Game.creeps[name];
      if (creep) {
        creep.memory.task = null;
      }
    }
  }

  protected static detectFlagsForPrefix<T extends { name: string }>(
    cacheKey: string,
    prefix: string,
    parseFlag: (flag: Flag) => T | null
  ): T[] {
    const cached = this.cachedFlagLists[cacheKey];
    if (cached && cached.tick === Game.time) {
      return cached.flags as T[];
    }

    const flags = _.filter(Game.flags, flag => flag.name === prefix || flag.name.startsWith(`${prefix}-`));
    const configs: T[] = [];

    for (const flag of flags) {
      const parsed = parseFlag(flag);
      if (parsed) {
        configs.push(parsed);
      }
    }

    configs.sort((a, b) => a.name.localeCompare(b.name));
    this.cachedFlagLists[cacheKey] = { tick: Game.time, flags: configs as unknown[] };
    return configs;
  }

  private static getCreepTypeFromColor(
    primaryColor: number,
    existingCountInFlag: number,
    squadSize: number
  ): CreepType {
    if (primaryColor === PrimaryColor.GREEN) return CreepType.Ranged;
    if (primaryColor === PrimaryColor.BLUE) return CreepType.Healer;
    if (primaryColor === PrimaryColor.PURPLE) {
      return existingCountInFlag < Math.ceil(squadSize / 2) ? CreepType.Melee : CreepType.Ranged;
    }
    return CreepType.Melee;
  }

  // Private instance helpers

  /**
   * Migrate existing creeps that carry memory.soldierFlag from the old global
   * SoldierArea into this flag's BaseArea memory list. Safe to call every tick;
   * the check is idempotent.
   */
  private migrateLegacySoldierFlag(flagName: string): void {
    const key = `SoldierArea-${flagName}`;
    const registeredNames: string[] = Helper.getCashedMemory(key, []);
    let changed = false;
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      if (creep.memory.soldierFlag === flagName && !registeredNames.includes(name)) {
        registeredNames.push(name);
        changed = true;
      }
    }
    if (changed) {
      Helper.setCashedMemory(key, registeredNames);
      this.creeps = this.getCreepsAssignedToThisArea();
    }
  }

  private createCreepForFlag(): SpawnTask | null {
    const creepType = SoldierArea.getCreepTypeFromColor(
      this.flag.primaryColor,
      this.creeps.length,
      this.flag.squadSize
    );
    let bodyPartConstants: BodyPartConstant[];

    switch (creepType) {
      case CreepType.Melee:
        bodyPartConstants = this.createMeleeBody(this.flag.bodySegments ?? 1);
        break;
      case CreepType.Ranged:
        bodyPartConstants = this.createRangedBody(this.flag.bodySegments ?? 1);
        break;
      case CreepType.Healer:
        bodyPartConstants = this.createHealerBody(this.flag.bodySegments ?? 1);
        break;
      default:
        return null;
    }

    return new SpawnTask(creepType, this.areaId, bodyPartConstants, this, null, this.flag.baseRoomName);
  }

  private createMeleeBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(ATTACK, MOVE); // ATTACK-80; MOVE-50 plain=1  road=1  swamp=5
    return body;
  }

  private createRangedBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(RANGED_ATTACK, MOVE); // RANGED_ATTACK-150; Move-50 plain=1  road=1  swamp=5
    return body;
  }

  private createHealerBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(HEAL, MOVE); // HEAL-200; MOVE-50  plain=1  road=1  swamp=5
    return body;
  }

  private runHealerSupport(): void {
    const healers = this.creeps.filter(creep => creep.creepType === CreepType.Healer);
    for (const healer of healers) {
      this.healMostDamagedTarget(healer);
    }
  }

  private healMostDamagedTarget(healer: CreepBase): void {
    const candidates = this.getHealerTargets();
    if (candidates.length === 0) return;

    const target = candidates.sort((a, b) => {
      const missingA = a.hitsMax - a.hits;
      const missingB = b.hitsMax - b.hits;
      if (missingA !== missingB) {
        return missingB - missingA;
      }
      return healer.pos.getRangeTo(a.pos) - healer.pos.getRangeTo(b.pos);
    })[0];

    const range = healer.pos.getRangeTo(target.pos);
    if (range <= 1) {
      healer.creep.heal(target);
    } else if (range <= 3) {
      healer.creep.rangedHeal(target);
    }
  }

  private getHealerTargets(): Creep[] {
    if (this.flag.secondaryColor === SecondaryColor.BLUE) {
      return this.creeps.map(creep => creep.creep).filter(creep => creep.hits < creep.hitsMax);
    }

    // RED (and any non-BLUE) healer mode: heal any own damaged creep in visible rooms.
    return _.filter(Game.creeps, creep => creep.my && creep.hits < creep.hitsMax);
  }

  private shouldUseFormationMovement(): boolean {
    const freeCreeps = this.creeps.filter(creep => creep.isFree());
    if (freeCreeps.length < 4) {
      return false;
    }

    const ordered = this.getOrderedFormationCreeps(freeCreeps);
    const quad = ordered.slice(0, 4);
    const roomName = quad[0].pos.roomName;
    if (!quad.every(creep => creep.pos.roomName === roomName)) {
      return false;
    }

    return true;
  }

  private tryMoveAsFormation(): boolean {
    const freeCreeps = this.creeps.filter(creep => creep.isFree());
    if (freeCreeps.length < 4) {
      return false;
    }

    const ordered = this.getOrderedFormationCreeps(freeCreeps);
    const quad = ordered.slice(0, 4);
    const leader = quad[0];

    const destination =
      leader.pos.roomName === this.flag.targetRoom
        ? this.flag.position
        : new RoomPosition(25, 25, this.flag.targetRoom);

    if (!this.isQuadAssembled(quad)) {
      this.regroupQuad(quad, leader.pos);
      return true;
    }

    const direction = this.getLeaderDirectionForQuadPath(leader, destination, quad);
    if (!direction) {
      return false;
    }

    const step = this.getStepOffset(direction);
    if (!step) {
      return false;
    }

    const nextLeader = new RoomPosition(leader.pos.x + step.dx, leader.pos.y + step.dy, leader.pos.roomName);
    const nextSquare = this.getSquareSlots(nextLeader);
    const room = Game.rooms[nextLeader.roomName];
    if (!room) {
      return false;
    }

    if (this.isSquareValid(nextSquare, new Set(quad.map(creep => creep.name)))) {
      for (const creep of quad) {
        creep.creep.move(direction);
      }
      for (let i = 0; i < quad.length; i++) {
        room.visual.text(`${i}`, nextSquare[i].x, nextSquare[i].y, {
          align: "center",
          opacity: 0.8,
          font: 0.5,
          color: "#00ff88",
          backgroundColor: "#000000"
        });
      }
    } else {
      // Narrow path fallback: still use one shared directional move so creeps do not scatter.
      const lineSlots = this.getLineSlots(nextLeader, quad.length, step);
      for (const creep of quad) {
        creep.creep.move(direction);
      }
      for (let i = 0; i < quad.length; i++) {
        room.visual.text(`${i}`, lineSlots[i].x, lineSlots[i].y, {
          align: "center",
          opacity: 0.8,
          font: 0.5,
          color: "#ffcc00",
          backgroundColor: "#000000"
        });
      }
    }

    // Non-quad members trail behind the leader with normal moveTo.
    for (const trailing of ordered.slice(4)) {
      trailing.creep.moveTo(leader.pos, { reusePath: 0, range: 1 });
    }

    return true;
  }

  private getOrderedFormationCreeps(creeps: CreepBase[]): CreepBase[] {
    const unassigned = creeps.filter(
      creep => creep.memory.formationOrder === null || creep.memory.formationOrder === undefined
    );
    if (unassigned.length > 0) {
      const orderedByDistance = creeps
        .slice()
        .sort((a, b) => a.pos.getRangeTo(this.flag.position) - b.pos.getRangeTo(this.flag.position));
      for (let i = 0; i < orderedByDistance.length; i++) {
        orderedByDistance[i].memory.formationOrder = i;
      }
    }

    return creeps.slice().sort((a, b) => (a.memory.formationOrder ?? 0) - (b.memory.formationOrder ?? 0));
  }

  private isQuadAssembled(quad: CreepBase[]): boolean {
    const leader = quad[0];
    const expectedSlots = this.getSquareSlots(leader.pos);
    const occupied = new Set(quad.map(creep => `${creep.pos.x}:${creep.pos.y}:${creep.pos.roomName}`));
    return expectedSlots.every(slot => occupied.has(`${slot.x}:${slot.y}:${slot.roomName}`));
  }

  private regroupQuad(quad: CreepBase[], leaderPos: RoomPosition): void {
    const room = Game.rooms[leaderPos.roomName];
    if (!room) {
      return;
    }

    const slots = this.findBestRegroupSlots(quad, leaderPos);
    if (!slots) {
      return;
    }

    for (let i = 0; i < quad.length; i++) {
      quad[i].creep.moveTo(slots[i], { reusePath: 0, range: 0 });
      room.visual.text(`${i}`, slots[i].x, slots[i].y, {
        align: "center",
        opacity: 0.8,
        font: 0.5,
        color: "#66ccff",
        backgroundColor: "#000000"
      });
    }
  }

  private findBestRegroupSlots(quad: CreepBase[], leaderPos: RoomPosition): RoomPosition[] | null {
    const room = Game.rooms[leaderPos.roomName];
    if (!room) {
      return null;
    }

    const squadNames = new Set(quad.map(creep => creep.name));
    const searchRadius = 3;
    const minX = Math.max(1, leaderPos.x - searchRadius);
    const maxX = Math.min(48, leaderPos.x + searchRadius);
    const minY = Math.max(1, leaderPos.y - searchRadius);
    const maxY = Math.min(48, leaderPos.y + searchRadius);

    let bestSlots: RoomPosition[] | null = null;
    let bestScore = Infinity;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const anchor = new RoomPosition(x, y, leaderPos.roomName);
        const slots = this.getSquareSlots(anchor);
        if (!this.isSquareValid(slots, squadNames)) {
          continue;
        }

        const score = this.getQuadRegroupScore(quad, slots, leaderPos);
        if (score < bestScore) {
          bestScore = score;
          bestSlots = slots;
        }
      }
    }

    return bestSlots;
  }

  private getQuadRegroupScore(quad: CreepBase[], slots: RoomPosition[], leaderPos: RoomPosition): number {
    const followerIndexes = [1, 2, 3];
    const followerSlotPermutations: number[][] = [
      [1, 2, 3],
      [1, 3, 2],
      [2, 1, 3],
      [2, 3, 1],
      [3, 1, 2],
      [3, 2, 1]
    ];

    // Keep the first creep as leader at slot[0], then choose the cheapest assignment for followers.
    const leaderTravel = quad[0].pos.getRangeTo(slots[0]);
    let bestFollowerTravel = Infinity;

    for (const permutation of followerSlotPermutations) {
      let travel = 0;
      for (let i = 0; i < followerIndexes.length; i++) {
        const creepIndex = followerIndexes[i];
        const slotIndex = permutation[i];
        travel += quad[creepIndex].pos.getRangeTo(slots[slotIndex]);
      }
      if (travel < bestFollowerTravel) {
        bestFollowerTravel = travel;
      }
    }

    // Prefer anchors near the current leader position when costs tie.
    const leaderAnchorOffset = leaderPos.getRangeTo(slots[0]);
    return leaderTravel + bestFollowerTravel + leaderAnchorOffset * 0.1;
  }

  private getLeaderDirectionForQuadPath(
    leader: CreepBase,
    destination: RoomPosition,
    quad: CreepBase[]
  ): DirectionConstant | null {
    const squadNames = new Set(quad.map(creep => creep.name));
    const result = PathFinder.search(
      leader.pos,
      { pos: destination, range: 0 },
      {
        plainCost: 2,
        swampCost: 10,
        maxOps: 5000,
        roomCallback: roomName => {
          const room = Game.rooms[roomName];
          if (!room) {
            return false;
          }

          const costs = new PathFinder.CostMatrix();
          const terrain = room.getTerrain();
          const blocked = new Set<string>();

          const structures = room.find(FIND_STRUCTURES);
          for (const structure of structures) {
            if (
              structure.structureType === STRUCTURE_ROAD ||
              structure.structureType === STRUCTURE_CONTAINER ||
              structure.structureType === STRUCTURE_RAMPART
            ) {
              continue;
            }
            blocked.add(`${structure.pos.x}:${structure.pos.y}`);
          }

          const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
          for (const hostile of hostileCreeps) {
            blocked.add(`${hostile.pos.x}:${hostile.pos.y}`);
          }

          const creeps = room.find(FIND_CREEPS);
          for (const creep of creeps) {
            if (squadNames.has(creep.name)) {
              continue;
            }
            blocked.add(`${creep.pos.x}:${creep.pos.y}`);
          }

          for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
              // Keep anchor away from edges so 2x2 always remains inside room.
              if (x < 1 || x > 48 || y < 1 || y > 48) {
                costs.set(x, y, 255);
                continue;
              }

              const squareBlocked =
                terrain.get(x, y) === TERRAIN_MASK_WALL ||
                terrain.get(x + 1, y) === TERRAIN_MASK_WALL ||
                terrain.get(x, y + 1) === TERRAIN_MASK_WALL ||
                terrain.get(x + 1, y + 1) === TERRAIN_MASK_WALL ||
                blocked.has(`${x}:${y}`) ||
                blocked.has(`${x + 1}:${y}`) ||
                blocked.has(`${x}:${y + 1}`) ||
                blocked.has(`${x + 1}:${y + 1}`);

              if (squareBlocked) {
                costs.set(x, y, 255);
              }
            }
          }

          return costs;
        }
      }
    );

    if (result.incomplete || result.path.length === 0) {
      return null;
    }

    return leader.pos.getDirectionTo(result.path[0]);
  }

  private getStepOffset(direction: DirectionConstant): { dx: number; dy: number } | null {
    switch (direction) {
      case TOP:
        return { dx: 0, dy: -1 };
      case TOP_RIGHT:
        return { dx: 1, dy: -1 };
      case RIGHT:
        return { dx: 1, dy: 0 };
      case BOTTOM_RIGHT:
        return { dx: 1, dy: 1 };
      case BOTTOM:
        return { dx: 0, dy: 1 };
      case BOTTOM_LEFT:
        return { dx: -1, dy: 1 };
      case LEFT:
        return { dx: -1, dy: 0 };
      case TOP_LEFT:
        return { dx: -1, dy: -1 };
      default:
        return null;
    }
  }

  private getSquareSlots(anchor: RoomPosition): RoomPosition[] {
    return [
      new RoomPosition(anchor.x, anchor.y, anchor.roomName),
      new RoomPosition(anchor.x + 1, anchor.y, anchor.roomName),
      new RoomPosition(anchor.x, anchor.y + 1, anchor.roomName),
      new RoomPosition(anchor.x + 1, anchor.y + 1, anchor.roomName)
    ];
  }

  private getLineSlots(head: RoomPosition, count: number, step: { dx: number; dy: number }): RoomPosition[] {
    const slots: RoomPosition[] = [];
    for (let i = 0; i < count; i++) {
      const x = head.x - step.dx * i;
      const y = head.y - step.dy * i;
      const boundedX = Math.max(1, Math.min(48, x));
      const boundedY = Math.max(1, Math.min(48, y));
      slots.push(new RoomPosition(boundedX, boundedY, head.roomName));
    }
    return slots;
  }

  private isSquareValid(slots: RoomPosition[], squadNames: Set<string>): boolean {
    if (slots.length !== 4) {
      return false;
    }

    const room = Game.rooms[slots[0].roomName];
    if (!room) return false;

    for (const slot of slots) {
      if (slot.x < 1 || slot.x > 48 || slot.y < 1 || slot.y > 48) {
        return false;
      }

      const terrain = room.getTerrain().get(slot.x, slot.y);
      if (terrain === TERRAIN_MASK_WALL) {
        return false;
      }

      const structures = slot.lookFor(LOOK_STRUCTURES);
      const blockedByStructure = structures.some(
        structure =>
          structure.structureType !== STRUCTURE_ROAD &&
          structure.structureType !== STRUCTURE_CONTAINER &&
          structure.structureType !== STRUCTURE_RAMPART
      );
      if (blockedByStructure) {
        return false;
      }

      const otherCreeps = slot.lookFor(LOOK_CREEPS);
      if (otherCreeps.some(creep => !squadNames.has(creep.name))) {
        return false;
      }
    }

    return true;
  }

  private assignCombatTask(creep: CreepBase, secondaryColor: number): boolean {
    const room = creep.room;
    switch (secondaryColor) {
      case SecondaryColor.RED:
        return this.attackEverything(creep, room);
      case SecondaryColor.GRAY:
        return this.attackStructures(creep, room);
      case SecondaryColor.BLUE:
        return this.attackCreeps(creep, room);
      case SecondaryColor.WHITE:
        return false; // No attack, just move to flag
      default:
        return this.attackEverything(creep, room);
    }
  }

  private attackEverything(creep: CreepBase, room: Room): boolean {
    const enemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);
    if (enemyCreeps.length > 0) {
      const target = creep.pos.findClosestByRange(enemyCreeps);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    } else if (enemyStructures.length > 0) {
      const target = creep.pos.findClosestByRange(enemyStructures);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    }
    return false;
  }

  private attackStructures(creep: CreepBase, room: Room): boolean {
    const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);
    if (enemyStructures.length > 0) {
      const target = creep.pos.findClosestByRange(enemyStructures);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    }
    return false;
  }

  private attackCreeps(creep: CreepBase, room: Room): boolean {
    const enemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    if (enemyCreeps.length > 0) {
      const target = creep.pos.findClosestByRange(enemyCreeps);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    }
    return false;
  }
}
