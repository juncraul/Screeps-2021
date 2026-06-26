import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "../../CreepBase";
import SoldierArea, { AttackFlagConfig } from "./SoldierArea";

const ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;
const SOURCE_KEEPER_FLAG_PREFIX = "SourceKeeper";

export interface SourceKeeperFlagConfig extends AttackFlagConfig {
  spawnRoomName: string;
}

export default class SourceKeeperArea extends SoldierArea {
  public flag: SourceKeeperFlagConfig;

  constructor(flag: SourceKeeperFlagConfig) {
    super({
      name: flag.name,
      position: flag.position,
      targetRoom: flag.targetRoom,
      baseRoomName: flag.spawnRoomName,
      primaryColor: COLOR_RED,
      secondaryColor: COLOR_RED,
      squadSize: 2,
      bodySegments: null
    });
    this.memoryType = "SourceKeeperArea";
    this.flag = flag;
    this.creeps = this.getCreepsAssignedToThisArea();
  }

  public static detectAllFlags(): SourceKeeperFlagConfig[] {
    return this.detectFlagsForPrefix(SOURCE_KEEPER_FLAG_PREFIX, SOURCE_KEEPER_FLAG_PREFIX, flag => {
      const parsed = SourceKeeperArea.parseSourceKeeperFlagName(flag.name);
      if (!parsed.spawnRoomName) {
        return null;
      }

      return {
        name: flag.name,
        position: flag.pos,
        targetRoom: flag.pos.roomName,
        spawnRoomName: parsed.spawnRoomName,
        baseRoomName: parsed.spawnRoomName,
        primaryColor: flag.color,
        secondaryColor: flag.secondaryColor,
        squadSize: 2,
        bodySegments: null
      };
    });
  }

  public handleSpawnTasks(room: Room): SpawnTask[] {
    if (this.flag.spawnRoomName !== room.name) {
      return [];
    }

    const dying = this.creeps.filter(creep => creep.ticksToLive && creep.ticksToLive < 150).length;
    const deficit = Math.max(0, this.flag.squadSize - this.creeps.length + dying);
    if (deficit <= 0) {
      return [];
    }

    const spawnTask = this.createCreep();
    return spawnTask ? [spawnTask] : [];
  }

  public handleThisArea(): void {
    const room = Game.rooms[this.flag.targetRoom];
    if (!room || this.creeps.length === 0) {
      return;
    }

    const squadReady = this.isSquadReady();
    const squadHealthy = this.areCreepsHealthy();
    const invader = this.findClosestInvader(this.creeps[0].pos);
    const keeperLair = this.findBestKeeperLair(room, this.creeps[0].pos);

    for (const creep of this.creeps) {
      this.healSelfOrSquadIfNeeded(creep);

      if (!creep.isFree()) {
        continue;
      }

      if (creep.memory.sourceKeeperRecovering && creep.creep.hits >= creep.creep.hitsMax) {
        creep.memory.sourceKeeperRecovering = false;
      }

      if (creep.pos.roomName !== this.flag.targetRoom) {
        creep.addTask(
          new CreepTask(
            Activity.MoveDifferentRoom,
            new RoomPosition(this.flag.position.x, this.flag.position.y, this.flag.targetRoom)
          )
        );
        continue;
      }

      if (
        !squadReady ||
        !squadHealthy ||
        creep.memory.sourceKeeperRecovering ||
        creep.creep.hits < creep.creep.hitsMax
      ) {
        if (creep.creep.hits < creep.creep.hitsMax) {
          creep.memory.sourceKeeperRecovering = true;
        }
        creep.creep.moveTo(this.flag.position, { range: 3 });
        continue;
      }

      if (invader) {
        creep.addTask(new CreepTask(Activity.Attack, invader.pos, null, invader.id));
        continue;
      }

      if (keeperLair) {
        if (creep.pos.getRangeTo(keeperLair.pos) > 1) {
          creep.creep.moveTo(keeperLair.pos, { range: 1 });
        }
        continue;
      }

      creep.creep.moveTo(this.flag.position);
    }
  }

  private healSelfOrSquadIfNeeded(creep: CreepBase): void {
    if (creep.creep.hits >= creep.creep.hitsMax) {
      return;
    }

    const healParts = creep.creep.body.some((part: BodyPartDefinition) => part.type === HEAL && part.hits > 0);
    if (!healParts) {
      return;
    }

    let mostInjuredSquadmate: CreepBase | null = null;
    for (const squadmate of this.creeps) {
      if (squadmate.creep.hits < squadmate.creep.hitsMax) {
        if (!mostInjuredSquadmate || squadmate.creep.hits < mostInjuredSquadmate.creep.hitsMax) {
          mostInjuredSquadmate = squadmate;
        }
      }
    }

    if (mostInjuredSquadmate && mostInjuredSquadmate.creep.hits < mostInjuredSquadmate.creep.hitsMax) {
      creep.creep.heal(mostInjuredSquadmate.creep);
    }
  }

  private isSquadReady(): boolean {
    if (this.creeps.length === 0) {
      return false;
    }

    if (this.creeps.some(creep => creep.pos.roomName !== this.flag.targetRoom)) {
      return false;
    }

    return this.creepsAreGrouped(3);
  }

  private areCreepsHealthy(): boolean {
    if (this.creeps.length === 0) {
      return false;
    }

    if (this.creeps.some(creep => creep.creep.hits < creep.creep.hitsMax)) {
      return false;
    }

    return true;
  }

  private creepsAreGrouped(maxRange: number): boolean {
    for (let i = 0; i < this.creeps.length; i++) {
      for (let j = i + 1; j < this.creeps.length; j++) {
        if (this.creeps[i].pos.getRangeTo(this.creeps[j].pos) > maxRange) {
          return false;
        }
      }
    }

    return true;
  }

  private static parseSourceKeeperFlagName(name: string): { spawnRoomName?: string } {
    const parts = name.split("-");
    const spawnRoomName = parts[1] && ROOM_NAME_PATTERN.test(parts[1]) ? parts[1] : undefined;
    return { spawnRoomName };
  }

  private createCreep(): SpawnTask | null {
    const bodyPartConstants: BodyPartConstant[] = [];
    for (let i = 0; i < 15; i++) bodyPartConstants.push(TOUGH); // 1500 Hits
    for (let i = 0; i < 9; i++) bodyPartConstants.push(MOVE); // plain=4  road=2  swamp=18
    for (let i = 0; i < 15; i++) bodyPartConstants.push(ATTACK); // 450 Attack
    for (let i = 0; i < 2; i++) bodyPartConstants.push(HEAL); // 24 Heal

    return new SpawnTask(CreepType.Melee, this.areaId, bodyPartConstants, this, null, this.flag.spawnRoomName);
  }

  private findClosestInvader(position: RoomPosition): Creep | null {
    return position.findClosestByRange(FIND_HOSTILE_CREEPS, {
      filter: creep =>
        (creep.owner && creep.owner.username === "Invader") || (creep.owner && creep.owner.username === "Source Keeper")
    });
  }

  private findBestKeeperLair(room: Room, position: RoomPosition): StructureKeeperLair | null {
    const lairs = room.find(FIND_HOSTILE_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_KEEPER_LAIR
    }) as StructureKeeperLair[];

    if (lairs.length === 0) {
      return null;
    }

    lairs.sort((a, b) => {
      const aTicks = a.ticksToSpawn ?? Infinity;
      const bTicks = b.ticksToSpawn ?? Infinity;
      if (aTicks !== bTicks) {
        return aTicks - bTicks;
      }
      return position.getRangeTo(a.pos) - position.getRangeTo(b.pos);
    });

    return lairs[0];
  }
}
