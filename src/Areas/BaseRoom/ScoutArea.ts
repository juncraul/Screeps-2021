import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { Helper } from "Helpers/Helper";

interface ScoutSourceIntel {
  id: string;
  x: number;
  y: number;
}

interface ScoutMineralIntel {
  id: string;
  x: number;
  y: number;
  mineralType: ResourceConstant;
  amount: number;
}

interface ScoutControllerIntel {
  x: number;
  y: number;
  roomName: string;
  level: number | null;
  owner: string | null;
  reservation: string | null;
}

interface ScoutRoomIntel {
  roomName: string;
  lastSeen: number;
  controller: ScoutControllerIntel | null;
  sources: ScoutSourceIntel[];
  minerals: ScoutMineralIntel[];
  hostileCount: number;
  claimable: boolean;
}

type ScoutIntelMemory = Record<string, ScoutRoomIntel>;

export default class ScoutArea extends BaseArea {
  private static readonly MANAGED_FLAG_PREFIX = "Reserve";

  baseRoom: Room;
  roomIntel: ScoutIntelMemory;

  constructor(baseRoom: Room) {
    super("ScoutArea", baseRoom.name, new RoomPosition(25, 25, baseRoom.name), baseRoom);
    this.baseRoom = baseRoom;
    this.roomIntel = this.loadIntelFromMemory();
  }

  public handleThisArea(): void {
    this.refreshIntelForVisibleRooms();
    this.handleCreeps();
    this.saveIntelToMemory();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const baseController = this.baseRoom.controller;
    if (!baseController || baseController.level >= 3) {
      return [];
    }
    const activeScouts = this.creeps.filter(creep => !(creep.ticksToLive !== undefined && creep.ticksToLive < 100));
    if (activeScouts.length >= 1) {
      return [];
    }

    return [this.createScout()];
  }

  public handleCreeps(): void {
    for (const creep of this.creeps) {
      if (!creep.isFree()) {
        continue;
      }

      const currentRoom = Game.rooms[creep.pos.roomName];
      if (currentRoom && this.hasHostiles(currentRoom)) {
        if (creep.pos.roomName !== this.baseRoom.name) {
          creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.baseRoom.name)));
        }
        continue;
      }

      const nextRoomName = this.pickNextRoomToScout(creep.pos.roomName);
      if (!nextRoomName || nextRoomName === creep.pos.roomName) {
        continue;
      }

      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, nextRoomName)));
    }
  }

  private refreshIntelForVisibleRooms(): void {
    for (const roomName of this.getScoutRoomNames()) {
      const room = Game.rooms[roomName];
      if (!room) {
        continue;
      }

      const intel = this.collectRoomIntel(room);
      if (intel) {
        this.roomIntel[roomName] = intel;
        this.syncManagedFlag(room, intel);
      }
    }
  }

  private collectRoomIntel(room: Room): ScoutRoomIntel | null {
    const controller = room.controller
      ? {
          x: room.controller.pos.x,
          y: room.controller.pos.y,
          roomName: room.controller.pos.roomName,
          level: room.controller.level ?? null,
          owner: room.controller.owner?.username ?? null,
          reservation: room.controller.reservation?.username ?? null
        }
      : null;

    if (!controller) return null;

    const sources = GetRoomObjects.getRoomSources(room).map(source => ({
      id: source.id,
      x: source.pos.x,
      y: source.pos.y
    }));

    const minerals = room.find(FIND_MINERALS).map(mineral => ({
      id: mineral.id,
      x: mineral.pos.x,
      y: mineral.pos.y,
      mineralType: mineral.mineralType,
      amount: mineral.mineralAmount
    }));

    const hostileCount = room.find(FIND_HOSTILE_CREEPS).length;
    const hasController = !!controller;
    const controllerNeutru = !controller.owner && !controller.reservation;
    const controllerReservedByUs = controller.reservation === Helper.getUserName();
    const controllerReservedByInvader = controller.reservation === "Invader";
    const controllerFree = hasController && (controllerNeutru || controllerReservedByUs || controllerReservedByInvader);
    const claimable = hostileCount === 0 && hasController && controllerFree && sources.length > 0;

    return {
      roomName: room.name,
      lastSeen: Game.time,
      controller,
      sources,
      minerals,
      hostileCount,
      claimable
    };
  }

  private syncManagedFlag(room: Room, intel: ScoutRoomIntel): void {
    const flagName = this.getManagedFlagName(room.name);
    const existingFlags = this.getAllRemoteFlags(room.name);

    if (existingFlags.length > 0 || !intel.controller || intel.hostileCount > 0 || !intel.claimable) {
      return;
    }

    const flagPos = new RoomPosition(intel.controller.x, intel.controller.y, intel.roomName);
    flagPos.createFlag(flagName, COLOR_PURPLE, COLOR_PURPLE);
  }

  private hasHostiles(room: Room): boolean {
    return (
      room
        .find(FIND_HOSTILE_CREEPS)
        .filter(creep => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0).length > 0
    );
  }

  private getScoutRoomNames(): string[] {
    const exits = Game.map.describeExits(this.baseRoom.name);
    if (!exits) {
      return [];
    }

    return Array.from(
      new Set(
        Object.values(exits).filter(
          (roomName): roomName is string => !!roomName && GetRoomObjects.ROOM_NAME_PATTERN.test(roomName)
        )
      )
    );
  }

  private pickNextRoomToScout(currentRoomName: string): string | null {
    const roomNames = this.getScoutRoomNames();
    if (roomNames.length === 0) {
      return null;
    }

    const currentTick = Game.time;
    let bestRoomName: string | null = null;
    let bestScore = -1;

    for (const roomName of roomNames) {
      if (roomName === currentRoomName) {
        continue;
      }

      const intel = this.roomIntel[roomName];
      const age = intel ? Math.max(1, currentTick - intel.lastSeen) : 5000;
      const hostilePenalty = intel && intel.hostileCount > 0 ? 0.25 : 1;
      const score = age * hostilePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestRoomName = roomName;
      }
    }

    return bestRoomName;
  }

  private loadIntelFromMemory(): ScoutIntelMemory {
    const storedIntel = Memory.scoutIntel ?? {};
    Memory.scoutIntel = storedIntel;
    return storedIntel;
  }

  private saveIntelToMemory(): void {
    Memory.scoutIntel = this.roomIntel;
  }

  private getManagedFlagName(roomName: string): string {
    return `${ScoutArea.MANAGED_FLAG_PREFIX}-${this.baseRoom.name}-Scout-${roomName}`;
  }

  private getAllRemoteFlags(roomName: string): Flag[] {
    return Object.values(Game.flags).filter(
      flag => flag.room?.name === roomName && flag.name.startsWith(`${ScoutArea.MANAGED_FLAG_PREFIX}`)
    );
  }

  private createScout(): SpawnTask {
    return new SpawnTask(CreepType.Scout, this.areaId, [MOVE], this, `Scout-${this.baseRoom.name}`);
  }
}
