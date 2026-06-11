import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "../CreepBase";

const SOLDIER_AREA_ID = "SoldierArea-Global";
const SQUAD_SIZE = 5;

enum PrimaryColor {
  RED = COLOR_RED,
  GREEN = COLOR_GREEN,
  BLUE = COLOR_BLUE
}

enum SecondaryColor {
  RED = COLOR_RED,
  GRAY = COLOR_GREY,
  BLUE = COLOR_BLUE,
  YELLOW = COLOR_YELLOW
}

export default class SoldierArea extends BaseArea {
  flagPosition: RoomPosition | null;
  flagTargetRoom: string | null;
  primaryColor: number | null;
  secondaryColor: number | null;

  constructor() {
    super(
      "SoldierArea",
      SOLDIER_AREA_ID,
      new RoomPosition(25, 25, Object.keys(Game.rooms)[0]),
      Game.rooms[Object.keys(Game.rooms)[0]]
    );
    this.flagPosition = null;
    this.flagTargetRoom = null;
    this.primaryColor = null;
    this.secondaryColor = null;
    this.detectFlag();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];

    if (!this.flagTargetRoom) {
      return tasksForThisArea;
    }

    const currentCount = this.creeps.length;
    if (currentCount < SQUAD_SIZE) {
      const task = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }

    return tasksForThisArea;
  }

  public handleThisArea(): void {
    this.detectFlag();

    if (!this.flagTargetRoom) {
      return;
    }

    for (const creep of this.creeps) {
      if (!creep.isFree()) {
        continue;
      }

      if (creep.pos.roomName !== this.flagTargetRoom) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.flagTargetRoom)));
        continue;
      }
      else if (this.flagPosition) {
        creep.addTask(new CreepTask(Activity.Move, this.flagPosition));
      }

      this.assignCombatTask(creep);
    }
  }

  private detectFlag(): void {
    const flags = _.filter(Game.flags, flag => flag.name === "Attack");

    if (flags.length === 0) {
      this.flagPosition = null;
      this.flagTargetRoom = null;
      this.primaryColor = null;
      this.secondaryColor = null;
      return;
    }

    const flag = flags[0];
    this.flagPosition = flag.pos;
    this.flagTargetRoom = flag.pos.roomName;
    this.primaryColor = flag.color;
    this.secondaryColor = flag.secondaryColor;
  }

  private createCreepForThisArea(): SpawnTask | null {
    if (!this.primaryColor) {
      return null;
    }

    let bodyPartConstants: BodyPartConstant[] = [];
    let spawnType: SpawnType;
    let name: string;

    const room = this.room;
    const energyAvailable = room.energyAvailable;
    const energyCapacityAvailable = room.energyCapacityAvailable;

    switch (this.primaryColor) {
      case PrimaryColor.RED:
        spawnType = SpawnType.Melee;
        name = "Melee";
        bodyPartConstants = this.createMeleeBody(energyAvailable, energyCapacityAvailable);
        break;
      case PrimaryColor.GREEN:
        spawnType = SpawnType.Ranged;
        name = "Ranged";
        bodyPartConstants = this.createRangedBody(energyAvailable, energyCapacityAvailable);
        break;
      case PrimaryColor.BLUE:
        spawnType = SpawnType.Melee;
        name = "Melee";
        bodyPartConstants = this.createMeleeBody(energyAvailable, energyCapacityAvailable);
        break;
      default:
        return null;
    }

    return new SpawnTask(spawnType, this.areaId, name, bodyPartConstants, this);
  }

  private createMeleeBody(energyAvailable: number, energyCapacityAvailable: number): BodyPartConstant[] {
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

  private createRangedBody(energyAvailable: number, energyCapacityAvailable: number): BodyPartConstant[] {
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

  private createHealerBody(energyAvailable: number, energyCapacityAvailable: number): BodyPartConstant[] {
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

  private assignCombatTask(creep: CreepBase): void {
    const room = creep.room;

    switch (this.secondaryColor) {
      case SecondaryColor.RED:
        this.attackEverything(creep, room);
        break;
      case SecondaryColor.GRAY:
        this.attackStructures(creep, room);
        break;
      case SecondaryColor.BLUE:
        this.attackCreeps(creep, room);
        break;
      case SecondaryColor.YELLOW:
        this.attackController(creep, room);
        break;
      default:
        this.attackEverything(creep, room);
    }
  }

  private attackEverything(creep: CreepBase, room: Room): void {
    const enemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);

    if (enemyCreeps.length > 0) {
      const target = creep.pos.findClosestByRange(enemyCreeps);
      if (target) {
        if (creep.pos.getRangeTo(target) > 1) {
          creep.addTask(new CreepTask(Activity.Move, target.pos));
        } else {
          creep.addTask(new CreepTask(Activity.Attack, target.pos));
        }
      }
    } else if (enemyStructures.length > 0) {
      const target = creep.pos.findClosestByRange(enemyStructures);
      if (target) {
        if (creep.pos.getRangeTo(target) > 1) {
          creep.addTask(new CreepTask(Activity.Move, target.pos));
        } else {
          creep.addTask(new CreepTask(Activity.Attack, target.pos));
        }
      }
    }
  }

  private attackStructures(creep: CreepBase, room: Room): void {
    const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);

    if (enemyStructures.length > 0) {
      const target = creep.pos.findClosestByRange(enemyStructures);
      if (target) {
        if (creep.pos.getRangeTo(target) > 1) {
          creep.addTask(new CreepTask(Activity.Move, target.pos));
        } else {
          creep.addTask(new CreepTask(Activity.Attack, target.pos));
        }
      }
    }
  }

  private attackCreeps(creep: CreepBase, room: Room): void {
    const enemyCreeps = room.find(FIND_HOSTILE_CREEPS);

    if (enemyCreeps.length > 0) {
      const target = creep.pos.findClosestByRange(enemyCreeps);
      if (target) {
        if (creep.pos.getRangeTo(target) > 1) {
          creep.addTask(new CreepTask(Activity.Move, target.pos));
        } else {
          creep.addTask(new CreepTask(Activity.Attack, target.pos));
        }
      }
    }
  }

  private attackController(creep: CreepBase, room: Room): void {
    if (room.controller) {
      if (creep.pos.getRangeTo(room.controller) > 1) {
        creep.addTask(new CreepTask(Activity.Move, room.controller.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Claim, room.controller.pos));
      }
    }
  }
}
