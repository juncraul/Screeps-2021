import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "../CreepBase";

const SOLDIER_AREA_ID = "SoldierArea-Global";
const SQUAD_SIZE = 5;

enum PrimaryColor {
  RED = COLOR_RED,
  GREEN = COLOR_GREEN,
  BLUE = COLOR_BLUE,
  PURPLE = COLOR_PURPLE
}

enum SecondaryColor {
  RED = COLOR_RED,
  GRAY = COLOR_GREY,
  BLUE = COLOR_BLUE
}

interface AttackFlagConfig {
  name: string;
  position: RoomPosition;
  targetRoom: string;
  primaryColor: number;
  secondaryColor: number;
  squadSize: number;
  bodySegments: number | null;
}

export default class SoldierArea extends BaseArea {
  attackFlags: AttackFlagConfig[];

  constructor() {
    super(
      "SoldierArea",
      SOLDIER_AREA_ID,
      new RoomPosition(25, 25, Object.keys(Game.rooms)[0]),
      Game.rooms[Object.keys(Game.rooms)[0]]
    );
    this.attackFlags = this.detectFlags();
  }

  public handleSpawnTasks(): SpawnTask[] {
    this.attackFlags = this.detectFlags();

    const tasksForThisArea: SpawnTask[] = [];
    if (this.attackFlags.length === 0) {
      return tasksForThisArea;
    }

    this.ensureSquadAssignments(this.attackFlags);

    const deficits = this.attackFlags
      .map(flag => ({
        flag,
        deficit: Math.max(0, flag.squadSize - this.getCreepsForFlag(flag.name).length)
      }))
      .filter(item => item.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);

    for (const item of deficits) {
      const task = this.createCreepForFlag(item.flag);
      if (task) {
        tasksForThisArea.push(task);
      }
    }

    return tasksForThisArea;
  }

  public handleThisArea(): void {
    this.attackFlags = this.detectFlags();

    if (this.attackFlags.length === 0) {
      return;
    }

    this.drawLegend();

    this.ensureSquadAssignments(this.attackFlags);

    for (const flag of this.attackFlags) {
      const squadCreeps = this.getCreepsForFlag(flag.name);
      for (const creep of squadCreeps) {
        if (!creep.isFree()) {
          continue;
        }

        if (creep.pos.roomName !== flag.targetRoom) {
          creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, flag.targetRoom)));
          continue;
        }

        const combatAssigned = this.assignCombatTask(creep, flag.secondaryColor);
        if (!combatAssigned) {
          creep.addTask(new CreepTask(Activity.Move, flag.position));
        }
      }
    }
  }

  private detectFlags(): AttackFlagConfig[] {
    const flags = _.filter(Game.flags, flag => flag.name === "Attack" || flag.name.startsWith("Attack-"));

    const currentStates: Record<string, SoldierFlagState> = {};
    const configs: AttackFlagConfig[] = [];

    for (const flag of flags) {
      const parsed = this.parseAttackFlagName(flag.name);
      const config: AttackFlagConfig = {
        name: flag.name,
        position: flag.pos,
        targetRoom: flag.pos.roomName,
        primaryColor: flag.color,
        secondaryColor: flag.secondaryColor,
        squadSize: parsed.squadSize,
        bodySegments: parsed.bodySegments
      };
      configs.push(config);
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
      if (!prev) {
        continue;
      }

      const changed =
        prev.color !== curr.color ||
        prev.secondaryColor !== curr.secondaryColor ||
        prev.x !== curr.x ||
        prev.y !== curr.y ||
        prev.roomName !== curr.roomName;

      if (changed) {
        this.clearTasksForFlag(flagName);
      }
    }

    for (const flagName of Object.keys(previousStates)) {
      if (!currentStates[flagName]) {
        this.clearTasksForFlag(flagName);
      }
    }

    Memory.soldierFlagStates = currentStates;

    const validFlags = configs.filter(flag => flag.squadSize > 0);
    validFlags.sort((a, b) => a.name.localeCompare(b.name));
    return validFlags;
  }

  private parseAttackFlagName(name: string): { squadSize: number; bodySegments: number | null } {
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

  private clearTasksForFlag(flagName: string): void {
    for (const creep of this.creeps) {
      if (creep.memory.soldierFlag === flagName) {
        creep.memory.task = null;
        creep.task = undefined;
      }
    }
  }

  private ensureSquadAssignments(flags: AttackFlagConfig[]): void {
    const activeNames = new Set(flags.map(flag => flag.name));

    for (const creep of this.creeps) {
      if (creep.memory.soldierFlag && !activeNames.has(creep.memory.soldierFlag)) {
        creep.memory.soldierFlag = null;
      }
    }

    const unassigned = this.creeps.filter(creep => !creep.memory.soldierFlag);
    if (unassigned.length === 0) {
      return;
    }

    for (const flag of flags) {
      let missing = flag.squadSize - this.getCreepsForFlag(flag.name).length;
      if (missing <= 0) {
        continue;
      }

      for (let i = 0; i < unassigned.length && missing > 0; i++) {
        if (unassigned[i].memory.soldierFlag) {
          continue;
        }
        unassigned[i].memory.soldierFlag = flag.name;
        missing--;
      }
    }
  }

  private getCreepsForFlag(flagName: string): CreepBase[] {
    return this.creeps.filter(creep => creep.memory.soldierFlag === flagName);
  }

  private getRoleNameFromColor(primaryColor: number, existingCountInFlag: number, squadSize: number): string {
    if (primaryColor === PrimaryColor.GREEN) {
      return "Ranged";
    }
    if (primaryColor === PrimaryColor.BLUE) {
      return "Healer";
    }
    if (primaryColor === PrimaryColor.PURPLE) {
      return existingCountInFlag < Math.ceil(squadSize / 2) ? "Melee" : "Ranged";
    }
    return "Melee";
  }

  private drawLegend(): void {
    const visual = this.room.visual;
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

    visual.text(`Active flags: ${this.attackFlags.length}`, x, y, header);
    y += 0.7;
    for (const flag of this.attackFlags) {
      const role = this.getRoleNameFromColor(flag.primaryColor, 0, flag.squadSize);
      let targetType = "Everything";
      if (flag.secondaryColor === SecondaryColor.GRAY) {
        targetType = "Structures";
      } else if (flag.secondaryColor === SecondaryColor.BLUE) {
        targetType = "Creeps";
      }
      const assigned = this.getCreepsForFlag(flag.name).length;
      const segmentText = flag.bodySegments === null ? "default" : `${flag.bodySegments}`;
      visual.text(
        `${flag.name}: squad ${assigned}/${flag.squadSize}, segments ${segmentText}, role ${role}, target ${targetType}, room ${flag.targetRoom}`,
        x,
        y,
        active
      );
      y += 0.62;
    }
  }
  private createCreepForFlag(flag: AttackFlagConfig): SpawnTask | null {
    let bodyPartConstants: BodyPartConstant[] = [];
    let spawnType: SpawnType;
    let name: string;

    const room = this.room;
    const energyAvailable = room.energyAvailable;
    const energyCapacityAvailable = room.energyCapacityAvailable;

    const creepsForFlag = this.getCreepsForFlag(flag.name).length;
    const role = this.getRoleNameFromColor(flag.primaryColor, creepsForFlag, flag.squadSize);

    switch (role) {
      case "Melee":
        spawnType = SpawnType.Melee;
        name = "Melee";
        bodyPartConstants = this.createMeleeBody(energyAvailable, energyCapacityAvailable, flag.bodySegments);
        break;
      case "Ranged":
        spawnType = SpawnType.Ranged;
        name = "Ranged";
        bodyPartConstants = this.createRangedBody(energyAvailable, energyCapacityAvailable, flag.bodySegments);
        break;
      case "Healer":
        spawnType = SpawnType.Healer;
        name = "Healer";
        bodyPartConstants = this.createHealerBody(energyAvailable, energyCapacityAvailable, flag.bodySegments);
        break;
      default:
        return null;
    }

    return new SpawnTask(spawnType, this.areaId, name, bodyPartConstants, this);
  }

  private createMeleeBody(
    energyAvailable: number,
    energyCapacityAvailable: number,
    forcedSegments: number | null
  ): BodyPartConstant[] {
    if (forcedSegments !== null) {
      const body: BodyPartConstant[] = [];
      for (let i = 0; i < forcedSegments; i++) {
        body.push(ATTACK, MOVE);
      }
      return body;
    }

    const segments = Math.floor(energyCapacityAvailable / 130); // ATTACK-80; MOVE-50
    const actualSegments = this.creeps.length === 0 ? Math.floor(energyAvailable / 130) : segments;

    if (actualSegments < 1) {
      return [ATTACK, MOVE];
    } else if (actualSegments === 1) {
      return [ATTACK, MOVE];
    } else if (actualSegments === 2) {
      return [ATTACK, ATTACK, MOVE, MOVE];
    } else if (actualSegments === 3) {
      return [ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE];
    } else if (actualSegments >= 4) {
      return [ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE];
    }

    return [ATTACK, MOVE];
  }

  private createRangedBody(
    energyAvailable: number,
    energyCapacityAvailable: number,
    forcedSegments: number | null
  ): BodyPartConstant[] {
    if (forcedSegments !== null) {
      const body: BodyPartConstant[] = [];
      for (let i = 0; i < forcedSegments; i++) {
        body.push(RANGED_ATTACK, MOVE);
      }
      return body;
    }

    const segments = Math.floor(energyCapacityAvailable / 200); // RANGED_ATTACK-150; MOVE-50
    const actualSegments = this.creeps.length === 0 ? Math.floor(energyAvailable / 200) : segments;

    if (actualSegments < 1) {
      return [RANGED_ATTACK, MOVE];
    } else if (actualSegments === 1) {
      return [RANGED_ATTACK, MOVE];
    } else if (actualSegments === 2) {
      return [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE];
    } else if (actualSegments === 3) {
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE];
    } else if (actualSegments >= 4) {
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, MOVE];
    }

    return [RANGED_ATTACK, MOVE];
  }

  private createHealerBody(
    energyAvailable: number,
    energyCapacityAvailable: number,
    forcedSegments: number | null
  ): BodyPartConstant[] {
    if (forcedSegments !== null) {
      const body: BodyPartConstant[] = [];
      for (let i = 0; i < forcedSegments; i++) {
        body.push(HEAL, MOVE);
      }
      return body;
    }

    const segments = Math.floor(energyCapacityAvailable / 250); // HEAL-200; MOVE-50
    const actualSegments = this.creeps.length === 0 ? Math.floor(energyAvailable / 250) : segments;

    if (actualSegments < 1) {
      return [HEAL, MOVE];
    } else if (actualSegments === 1) {
      return [HEAL, MOVE];
    } else if (actualSegments === 2) {
      return [HEAL, HEAL, MOVE, MOVE];
    } else if (actualSegments === 3) {
      return [HEAL, HEAL, HEAL, MOVE, MOVE, MOVE];
    } else if (actualSegments >= 4) {
      return [HEAL, HEAL, HEAL, HEAL, MOVE, MOVE, MOVE, MOVE];
    }

    return [HEAL, MOVE];
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
