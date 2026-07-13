import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./../BaseArea";
import { CreepBase } from "../../CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import QuadNavigation from "./Navigation/QuadNavigation";

const SQUAD_SIZE = 5;
const ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;
const EXCEPTION_PLAYER_NAMES = ["nekey975"];

enum PrimaryColor {
  RED = COLOR_RED, // Melee
  GREEN = COLOR_GREEN, // Ranged
  BLUE = COLOR_BLUE, // Healer
  PURPLE = COLOR_PURPLE, // Split (half Melee, half Ranged)
  YELLOW = COLOR_YELLOW // Dismantle (1 Dismantler, rest Healers)
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
    visual.text("  YELLOW -> Dismantle squad (1 Dismantler, rest Healers)", x, y, plain);
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
    this.runHealerPassiveEffect();
    this.runDismantlerPassiveEffect();

    const formationMovementApplied = QuadNavigation.tryMoveAsFormation(this.creeps, this.flag.position);

    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.pos.roomName !== this.flag.targetRoom) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.flag.targetRoom)));
        continue;
      }

      if (creep.creepType === CreepType.Healer) {
        if (!formationMovementApplied) {
          creep.addTask(new CreepTask(Activity.Move, this.flag.position));
        }
      } else {
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
    if (primaryColor === PrimaryColor.YELLOW) {
      return existingCountInFlag === 0 ? CreepType.Dismantler : CreepType.Healer;
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
      case CreepType.Dismantler:
        bodyPartConstants = this.createDismantlerBody(this.flag.bodySegments ?? 1);
        break;
      default:
        return null;
    }

    return new SpawnTask(creepType, this.areaId, bodyPartConstants, this, null, this.flag.baseRoomName);
  }

  private createMeleeBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(ATTACK); // ATTACK-80; MOVE-50 plain=1  road=1  swamp=5
    for (let i = 0; i < segments; i++) body.push(MOVE); // ATTACK-80; MOVE-50 plain=1  road=1  swamp=5
    return body;
  }

  private createRangedBody(segments: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(RANGED_ATTACK); // RANGED_ATTACK-150; Move-50 plain=1  road=1  swamp=5
    for (let i = 0; i < segments; i++) body.push(MOVE); // RANGED_ATTACK-150; Move-50 plain=1  road=1  swamp=5
    return body;
  }

  private createHealerBody(segments: number): BodyPartConstant[] {
    if (segments === 0) segments = 6; // 0 is used for maximum segments.
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(MOVE); // HEAL-200; MOVE-50  plain=1  road=1  swamp=5
    for (let i = 0; i < segments; i++) body.push(HEAL); // HEAL-200; MOVE-50  plain=1  road=1  swamp=5
    return body;
  }

  private createDismantlerBody(segments: number): BodyPartConstant[] {
    if (segments === 0) segments = 6; // 0 is used for maximum segments.
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(TOUGH); // TOUGH-10; WORK-100; MOVE-50  plain=1  road=1  swamp=5
    for (let i = 0; i < segments; i++) body.push(WORK); // TOUGH-10; WORK-100; MOVE-50  plain=1  road=1  swamp=5
    for (let i = 0; i < segments * 2; i++) body.push(MOVE); // TOUGH-10; WORK-100; MOVE-50  plain=1  road=1  swamp=5
    return body;
  }

  private runHealerPassiveEffect(): void {
    const healers = this.creeps.filter(creep => creep.creepType === CreepType.Healer);
    for (const healer of healers) {
      this.healMostDamagedTarget(healer);
    }
  }

  private runDismantlerPassiveEffect(): void {
    // TODO: It does not work properly, it should distroy all the roads in the path without affecting move.
    if (this.flag.secondaryColor === SecondaryColor.WHITE) return;
    const dismantlers = this.creeps.filter(
      creep => creep.creepType === CreepType.Dismantler && creep.pos.roomName === this.flag.targetRoom
    );
    for (const dismantler of dismantlers) {
      // Find strcture to dismantle at range 1
      const target = GetRoomObjects.getWithinRangeStructures(dismantler.pos, 1, STRUCTURE_ROAD);
      if (target.length > 0) {
        dismantler.dismantle(target[0]);
      }
    }
  }

  private healMostDamagedTarget(healer: CreepBase): void {
    const candidates = this.getHealerTargets();
    if (candidates.length === 0) candidates.push(healer.creep); // Do self-heal

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
    // We need to filter players we don't want to attack, like our allies or exceptions.
    const enemyCreeps = room
      .find(FIND_HOSTILE_CREEPS)
      .filter(creep => !EXCEPTION_PLAYER_NAMES.includes(creep.owner.username));
    const enemyStructures = room
      .find(FIND_HOSTILE_STRUCTURES)
      .filter(structure => structure.owner && !EXCEPTION_PLAYER_NAMES.includes(structure.owner.username));
    if (enemyCreeps.length > 0) {
      const target = creep.pos.findClosestByPath(enemyCreeps);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    } else if (enemyStructures.length > 0) {
      const target = this.flag.position.findClosestByPath(enemyStructures);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    }
    return false;
  }

  private attackStructures(creep: CreepBase, room: Room): boolean {
    const enemyStructures = room
      .find(FIND_HOSTILE_STRUCTURES)
      .filter(structure => structure.owner && !EXCEPTION_PLAYER_NAMES.includes(structure.owner.username));
    if (enemyStructures.length > 0) {
      const target = this.flag.position.findClosestByPath(enemyStructures);
      if (target) {
        const creepHasWork = creep.creep.body.some(part => part.type === WORK);
        if (creepHasWork) {
          creep.addTask(new CreepTask(Activity.Dismantle, target.pos, null, target.id));
        } else {
          creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        }
        return true;
      }
    }
    return false;
  }

  private attackCreeps(creep: CreepBase, room: Room): boolean {
    const enemyCreeps = room
      .find(FIND_HOSTILE_CREEPS)
      .filter(creep => !EXCEPTION_PLAYER_NAMES.includes(creep.owner.username));
    if (enemyCreeps.length > 0) {
      const target = creep.pos.findClosestByPath(enemyCreeps);
      if (target) {
        creep.addTask(new CreepTask(Activity.Attack, target.pos, null, target.id));
        return true;
      }
    }
    return false;
  }
}
