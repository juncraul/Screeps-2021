import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "../CreepBase";

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

  // ─── Static tick-guard so flag detection & task-clearing run only once ─────
  private static detectedFlagsTick: number | null = null;
  private static cachedFlags: AttackFlagConfig[] = [];

  constructor(flag: AttackFlagConfig) {
    super("SoldierArea", flag.name, flag.position, Game.rooms[flag.targetRoom]);
    this.flag = flag;
    this.migrateLegacySoldierFlag(flag.name);
  }

  // ─── Static: detect all Attack flags (cached per tick) ───────────────────

  public static detectAllFlags(): AttackFlagConfig[] {
    if (SoldierArea.detectedFlagsTick === Game.time) {
      return SoldierArea.cachedFlags;
    }
    SoldierArea.detectedFlagsTick = Game.time;

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
    SoldierArea.cachedFlags = validFlags;
    return validFlags;
  }

  // ─── Static: draw combined legend for all active flags ───────────────────

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
      const role = SoldierArea.getRoleNameFromColor(flag.primaryColor, 0, flag.squadSize);
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

  // ─── Instance: per-flag spawn tasks ──────────────────────────────────────

  public handleSpawnTasks(): SpawnTask[] {
    const dying = this.creeps.filter(c => c.ticksToLive && c.ticksToLive < 150).length;
    const deficit = Math.max(0, this.flag.squadSize - this.creeps.length + dying);
    const tasks: SpawnTask[] = [];
    if (deficit > 0) {
      const task = this.createCreepForFlag();
      if (task) tasks.push(task);
    }
    return tasks;
  }

  // ─── Instance: per-flag creep handling ───────────────────────────────────

  public handleThisArea(): void {
    this.runHealerSupport();

    const formationMovement = this.shouldUseFormationMovement();
    if (formationMovement) {
      this.tryMoveAsFormation();
    }

    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.pos.roomName !== this.flag.targetRoom) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.flag.targetRoom)));
        continue;
      }

      if (creep.roleName !== "Healer") {
        const combatAssigned = this.assignCombatTask(creep, this.flag.secondaryColor);
        if (!combatAssigned && !formationMovement) {
          creep.addTask(new CreepTask(Activity.Move, this.flag.position));
        }
      }
    }
  }

  // ─── Private static helpers ───────────────────────────────────────────────

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
    const parsedBaseRoom = parts[3];
    const squadSize = /^\d+$/.test(parsedSquad) ? parseInt(parsedSquad, 10) : SQUAD_SIZE;
    const bodySegments = /^\d+$/.test(parsedSegments) ? parseInt(parsedSegments, 10) : null;
    const baseRoomName = parsedBaseRoom && ROOM_NAME_PATTERN.test(parsedBaseRoom) ? parsedBaseRoom : undefined;
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

  private static getRoleNameFromColor(primaryColor: number, existingCountInFlag: number, squadSize: number): string {
    if (primaryColor === PrimaryColor.GREEN) return "Ranged";
    if (primaryColor === PrimaryColor.BLUE) return "Healer";
    if (primaryColor === PrimaryColor.PURPLE) {
      return existingCountInFlag < Math.ceil(squadSize / 2) ? "Melee" : "Ranged";
    }
    return "Melee";
  }

  // ─── Private instance helpers ─────────────────────────────────────────────

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
    const role = SoldierArea.getRoleNameFromColor(this.flag.primaryColor, this.creeps.length, this.flag.squadSize);
    let bodyPartConstants: BodyPartConstant[];
    let spawnType: SpawnType;
    let name: string;

    switch (role) {
      case "Melee":
        spawnType = SpawnType.Melee;
        name = "Melee";
        bodyPartConstants = this.createMeleeBody(this.flag.bodySegments ?? 1);
        break;
      case "Ranged":
        spawnType = SpawnType.Ranged;
        name = "Ranged";
        bodyPartConstants = this.createRangedBody(this.flag.bodySegments ?? 1);
        break;
      case "Healer":
        spawnType = SpawnType.Healer;
        name = "Healer";
        bodyPartConstants = this.createHealerBody(this.flag.bodySegments ?? 1);
        break;
      default:
        return null;
    }

    return new SpawnTask(spawnType, this.areaId, name, bodyPartConstants, this);
  }

  private createMeleeBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(ATTACK, MOVE); // ATTACK-80; MOVE-50 plain=1  road=1  swamp=5
    return body;
  }

  private createRangedBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(RANGED_ATTACK, MOVE, MOVE, MOVE); // RANGED_ATTACK-150; Move x3-150 plain=1  road=1  swamp=2
    return body;
  }

  private createHealerBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(HEAL, MOVE); // HEAL-200; MOVE-50  plain=1  road=1  swamp=5
    return body;
  }

  private runHealerSupport(): void {
    const healers = this.creeps.filter(creep => creep.roleName === "Healer");
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
    if (this.creeps.length <= 1) {
      return false;
    }

    // Formation only when all squad members are in the same room and not already fighting.
    const roomName = this.creeps[0].pos.roomName;
    if (!this.creeps.every(creep => creep.pos.roomName === roomName)) {
      return false;
    }

    return true;
  }

  private tryMoveAsFormation(): boolean {
    const destination =
      this.creeps[0].pos.roomName === this.flag.targetRoom
        ? this.flag.position
        : new RoomPosition(25, 25, this.flag.targetRoom);

    const leader = this.creeps.slice().sort((a, b) => a.pos.getRangeTo(destination) - b.pos.getRangeTo(destination))[0];
    const leaderDirection = leader.pos.getDirectionTo(destination);
    let step = this.getStepOffset(leaderDirection);
    if (!step) {
      // return false;
      step = { dx: 0, dy: 0 }; // If leader is already at destination, just keep current formation.
    }

    // Keep member ordering stable so each creep tends to keep its slot.
    const unassignedCreeps = this.creeps.filter(
      creep => creep.memory.formationOrder === null || creep.memory.formationOrder === undefined
    );
    if (unassignedCreeps.length > 0) {
      const orderedByDistance = this.creeps
        .slice()
        .sort((a, b) => a.pos.getRangeTo(leader.pos) - b.pos.getRangeTo(leader.pos));
      for (let i = 0; i < orderedByDistance.length; i++) {
        orderedByDistance[i].memory.formationOrder = i;
      }
    }

    const ordered = this.creeps.slice().sort((a, b) => (a.memory.formationOrder ?? 0) - (b.memory.formationOrder ?? 0));
    const leaderNext = new RoomPosition(leader.pos.x + step.dx, leader.pos.y + step.dy, leader.pos.roomName);

    // Try square movement first (2x2). We require extra terrain buffer around the square
    // to avoid hugging walls and getting stuck.
    const squareAnchors: RoomPosition[] = [
      new RoomPosition(leaderNext.x, leaderNext.y, leaderNext.roomName),
      new RoomPosition(leaderNext.x - 1, leaderNext.y, leaderNext.roomName),
      new RoomPosition(leaderNext.x, leaderNext.y - 1, leaderNext.roomName),
      new RoomPosition(leaderNext.x - 1, leaderNext.y - 1, leaderNext.roomName)
    ];

    let selectedSquareSlots: RoomPosition[] | null = null;
    for (const anchor of squareAnchors) {
      const candidateSlots = this.getSquareSlots(anchor);
      if (!this.areSquareSlotsWalkableWithBuffer(candidateSlots)) {
        continue;
      }
      selectedSquareSlots = candidateSlots;
      break;
    }

    if (selectedSquareSlots) {
      const slotsForSquad: RoomPosition[] = [];
      for (let i = 0; i < ordered.length; i++) {
        if (i < 4) {
          slotsForSquad.push(selectedSquareSlots[i]);
        } else {
          // Extra members trail behind the square in a line.
          slotsForSquad.push(
            new RoomPosition(
              selectedSquareSlots[0].x - step.dx * (i - 3),
              selectedSquareSlots[0].y - step.dy * (i - 3),
              selectedSquareSlots[0].roomName
            )
          );
        }
      }

      const room = Game.rooms[leaderNext.roomName];
      for (let i = 0; i < ordered.length; i++) {
        ordered[i].creep.move(leaderDirection);
        room.visual.text(`${i}`, slotsForSquad[i].x, slotsForSquad[i].y, {
          align: "center",
          opacity: 0.8,
          font: 0.5,
          color: "#00ff88",
          backgroundColor: "#000000"
        });
      }
      return true;
    }

    // If we are in a narrow path, break formation into a line and continue moving.
    const lineSlots = this.getLineSlots(leaderNext, ordered.length, step);
    const room = Game.rooms[leaderNext.roomName];
    for (let i = 0; i < ordered.length; i++) {
      ordered[i].creep.move(leaderDirection);
      room.visual.text(`${i}`, lineSlots[i].x, lineSlots[i].y, {
        align: "center",
        opacity: 0.8,
        font: 0.5,
        color: "#ffcc00",
        backgroundColor: "#000000"
      });
    }

    return true;
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

  private areSquareSlotsWalkableWithBuffer(slots: RoomPosition[]): boolean {
    if (slots.length !== 4) {
      return false;
    }

    const room = Game.rooms[slots[0].roomName];
    if (!room) return false;

    const squadNames = new Set(this.creeps.map(creep => creep.name));

    // First: all four square slots must be walkable.
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

    // Extra terrain layer: the 1-tile ring around the square must not contain walls.
    const minX = Math.min(...slots.map(slot => slot.x));
    const maxX = Math.max(...slots.map(slot => slot.x));
    const minY = Math.min(...slots.map(slot => slot.y));
    const maxY = Math.max(...slots.map(slot => slot.y));

    for (let x = minX - 1; x <= maxX + 1; x++) {
      for (let y = minY - 1; y <= maxY + 1; y++) {
        if (x < 1 || x > 48 || y < 1 || y > 48) {
          return false;
        }
        const terrain = room.getTerrain().get(x, y);
        if (terrain === TERRAIN_MASK_WALL) {
          return false;
        }
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
