import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";
import SoldierArea, { AttackFlagConfig } from "./SoldierArea";

const LOOTER_FLAG_PREFIX = "Looter";
const ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;

export interface LooterFlagConfig extends AttackFlagConfig {
  spawnRoomName: string;
}

type LootTask =
  | { activity: Activity.Pickup; pos: RoomPosition }
  | { activity: Activity.Collect; pos: RoomPosition }
  | { activity: Activity.CollectMineral; pos: RoomPosition; resourceType: ResourceConstant };

export default class LooterArea extends SoldierArea {
  public flag: LooterFlagConfig;

  constructor(flag: LooterFlagConfig) {
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
    this.flag = flag;
    this.creeps = this.getCreepsAssignedToThisArea();
  }

  public static detectAllFlags(): LooterFlagConfig[] {
    return this.detectFlagsForPrefix(LOOTER_FLAG_PREFIX, LOOTER_FLAG_PREFIX, flag => {
      const parsed = LooterArea.parseLooterFlagName(flag.name);
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
    if (this.flag.baseRoomName && this.flag.baseRoomName !== room.name) {
      return [];
    }

    const dying = this.creeps.filter(creep => creep.ticksToLive && creep.ticksToLive < 150).length;
    const deficit = Math.max(0, 1 - this.creeps.length + dying);
    if (deficit <= 0) {
      return [];
    }

    const spawnTask = this.createCreep(room.name);
    return spawnTask ? [spawnTask] : [];
  }

  public handleThisArea(): void {
    const targetRoom = Game.rooms[this.flag.targetRoom] ?? null;
    for (const creep of this.creeps) {
      const homeRoomName = this.getHomeRoomName(creep);
      if (!creep.isFree() || !homeRoomName || !targetRoom) {
        continue;
      }

      if (creep.pos.roomName === homeRoomName) {
        if (!creep.isEmpty()) {
          this.returnToBaseAndDeposit(creep, homeRoomName);
        } else {
          this.goToTargetRoom(creep, targetRoom);
        }
      } else if (creep.pos.roomName === targetRoom.name) {
        const roomHasLoot = targetRoom ? this.hasLootRemaining(targetRoom) : true;
        if (creep.isFull() || !roomHasLoot) {
          console.log(`LooterArea: ${creep.name} is full or no loot remaining, returning to base ${homeRoomName}`);
          this.returnToBaseAndDeposit(creep, homeRoomName);
        } else {
          this.lootTheRoom(creep);
        }
      } else {
        // We are enroute
      }
    }
  }

  private goToTargetRoom(creep: CreepBase, targetRoom: Room) {
    // TODO: decide exactly how many ticks should be allowed.
    if (creep.ticksToLive && creep.ticksToLive < 600) {
      console.log(`LooterArea: ${creep.name} has low TTL, suiciding`);
      creep.suicide();
    }
    creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, targetRoom.name)));
  }

  private lootTheRoom(creep: CreepBase) {
    const nonEnergyLoot = this.findLootTask(creep, false);
    if (nonEnergyLoot) {
      console.log(`LooterArea: ${creep.name} found non-energy loot, collecting it`);
      this.addLootTask(creep, nonEnergyLoot);
    }

    const energyLoot = this.findLootTask(creep, true);
    if (energyLoot) {
      console.log(`LooterArea: ${creep.name} found energy loot, collecting it`);
      this.addLootTask(creep, energyLoot);
    }
  }

  private createCreep(homeRoomName: string): SpawnTask {
    const bodyPartConstants: BodyPartConstant[] = [];
    for (let i = 0; i < 4; i++) bodyPartConstants.push(CARRY);
    for (let i = 0; i < 4; i++) bodyPartConstants.push(MOVE);
    return new SpawnTask(CreepType.Looter, this.areaId, bodyPartConstants, this, null, homeRoomName);
  }

  private getHomeRoomName(creep: CreepBase): string | null {
    return creep.memory.seasonSpawnRoom ?? this.flag.baseRoomName ?? null;
  }

  private returnToBaseAndDeposit(creep: CreepBase, homeRoomName: string): void {
    if (creep.pos.roomName !== homeRoomName) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, homeRoomName)));
      return;
    }

    const homeRoom = Game.rooms[homeRoomName];
    if (!homeRoom) {
      return;
    }

    const storage = GetRoomObjects.getRoomStorage(homeRoom);
    if (storage && storage.store.getFreeCapacity() > 0) {
      if (creep.store[RESOURCE_ENERGY] > 0) {
        creep.addTask(new CreepTask(Activity.Deposit, storage.pos));
      } else {
        creep.addTask(new CreepTask(Activity.DepositMineral, storage.pos));
      }
      return;
    }

    const terminal = GetRoomObjects.getRoomTerminal(homeRoom);
    if (terminal && terminal.store.getFreeCapacity() > 0) {
      if (creep.store[RESOURCE_ENERGY] > 0) {
        creep.addTask(new CreepTask(Activity.Deposit, terminal.pos));
      } else {
        creep.addTask(new CreepTask(Activity.DepositMineral, terminal.pos));
      }
      return;
    }
  }

  private hasLootRemaining(room: Room): boolean {
    return (
      this.findLootTask(new CreepBase(Game.creeps[Object.keys(Game.creeps)[0]]), false) !== null ||
      this.findLootTask(new CreepBase(Game.creeps[Object.keys(Game.creeps)[0]]), true) !== null
    );
  }

  private findLootTask(creep: CreepBase, includeEnergy: boolean): LootTask | null {
    const room: Room = creep.room;
    const droppedResources = room
      .find(FIND_DROPPED_RESOURCES)
      .filter(resource =>
        includeEnergy ? resource.amount > 0 : resource.resourceType !== RESOURCE_ENERGY && resource.amount > 0
      );
    const closestDropped = this.findClosestByRange(creep, droppedResources);
    if (closestDropped) {
      return includeEnergy && closestDropped.resourceType === RESOURCE_ENERGY
        ? { activity: Activity.Pickup, pos: closestDropped.pos }
        : includeEnergy === false || closestDropped.resourceType !== RESOURCE_ENERGY
        ? {
            activity:
              includeEnergy && closestDropped.resourceType !== RESOURCE_ENERGY
                ? Activity.CollectMineral
                : Activity.Pickup,
            pos: closestDropped.pos,
            resourceType: closestDropped.resourceType
          }
        : { activity: Activity.Pickup, pos: closestDropped.pos };
    }

    const tombstones = room
      .find(FIND_TOMBSTONES)
      .filter(target => this.getAvailableResources(target.store, includeEnergy).length > 0);
    const ruins = room
      .find(FIND_RUINS)
      .filter(target => this.getAvailableResources(target.store, includeEnergy).length > 0);
    const structureContainer = room
      .find(FIND_STRUCTURES)
      .filter(
        (s): s is StructureContainer =>
          s.structureType === STRUCTURE_CONTAINER && this.getAvailableResources(s.store, includeEnergy).length > 0
      );
    const structureStorage = room
      .find(FIND_STRUCTURES)
      .filter(
        (s): s is StructureStorage =>
          s.structureType === STRUCTURE_STORAGE && this.getAvailableResources(s.store, includeEnergy).length > 0
      );
    const structureTerminal = room
      .find(FIND_STRUCTURES)
      .filter(
        (s): s is StructureTerminal =>
          s.structureType === STRUCTURE_TERMINAL && this.getAvailableResources(s.store, includeEnergy).length > 0
      );

    const candidates = [...tombstones, ...ruins, ...structureContainer, ...structureStorage, ...structureTerminal];
    const closestTarget = this.findClosestByRange(creep, candidates);
    if (!closestTarget) {
      return null;
    }

    const resourceType = this.getAvailableResources(closestTarget.store, includeEnergy)[0];
    if (!resourceType) {
      return null;
    }

    if (resourceType === RESOURCE_ENERGY && includeEnergy) {
      return { activity: Activity.Collect, pos: closestTarget.pos };
    }

    return { activity: Activity.CollectMineral, pos: closestTarget.pos, resourceType };
  }

  private addLootTask(creep: CreepBase, lootTask: LootTask): void {
    if (lootTask.activity === Activity.Pickup) {
      creep.addTask(new CreepTask(Activity.Pickup, lootTask.pos));
      return;
    }

    if (lootTask.activity === Activity.Collect) {
      creep.addTask(new CreepTask(Activity.Collect, lootTask.pos));
      return;
    }

    creep.addTask(new CreepTask(Activity.CollectMineral, lootTask.pos, null, lootTask.resourceType));
  }

  private findClosestByRange<T extends { pos: RoomPosition }>(creep: CreepBase, targets: T[]): T | null {
    let bestTarget: T | null = null;
    let bestRange = Infinity;
    for (const target of targets) {
      const range = creep.pos.getRangeTo(target.pos);
      if (range < bestRange) {
        bestRange = range;
        bestTarget = target;
      }
    }
    return bestTarget;
  }

  private getAvailableResources(store: Store<ResourceConstant, boolean>, includeEnergy: boolean): ResourceConstant[] {
    return Object.keys(store).filter(
      resource => store[resource as ResourceConstant] > 0 && (includeEnergy || resource !== RESOURCE_ENERGY)
    ) as ResourceConstant[];
  }

  private static parseLooterFlagName(name: string): { spawnRoomName?: string } {
    const parts = name.split("-");
    const spawnRoomName = parts[1] && ROOM_NAME_PATTERN.test(parts[1]) ? parts[1] : undefined;
    return { spawnRoomName };
  }
}
