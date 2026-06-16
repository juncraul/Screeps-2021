import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "../CreepBase";

const SQUAD_SIZE = 5;

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
    visual.text("Name format: Attack-squadSize-bodySegments-anyText", x, y, header);
    y += 0.7;
    visual.text("Example: Attack-4-2-First => squad 4, 2 segments per creep", x, y, plain);
    y += 0.7;
    visual.text("Attack (without suffix) keeps default squad/body behavior", x, y, plain);
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
      visual.text(
        `${flag.name}: squad ${area.creeps.length}/${flag.squadSize}, segments ${segmentText}, role ${role}, target ${targetType}, room ${flag.targetRoom}`,
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
    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.pos.roomName !== this.flag.targetRoom) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.flag.targetRoom)));
        continue;
      }

      const combatAssigned = this.assignCombatTask(creep, this.flag.secondaryColor);
      if (!combatAssigned) {
        creep.addTask(new CreepTask(Activity.Move, this.flag.position));
      }
    }
  }

  // ─── Private static helpers ───────────────────────────────────────────────

  private static parseAttackFlagName(name: string): { squadSize: number; bodySegments: number | null } {
    if (name === "Attack") {
      return { squadSize: SQUAD_SIZE, bodySegments: null };
    }
    const parts = name.split("-");
    const parsedSquad = parts[1];
    const parsedSegments = parts[2];
    const squadSize = /^\d+$/.test(parsedSquad) ? parseInt(parsedSquad, 10) : SQUAD_SIZE;
    const bodySegments = /^\d+$/.test(parsedSegments) ? parseInt(parsedSegments, 10) : null;
    return { squadSize, bodySegments };
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
