import { GetRoomObjects } from "Helpers/GetRoomObjects";
import type RemoteArea from "./RemoteArea";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";

export function handleMineralCarrier(area: RemoteArea, creep: CreepBase): void {
  if (!creep.isFree()) return;
  const mineralType = area.mineralType;
  if (!mineralType) return;

  if (creep.pos.roomName === area.baseRoom.name) {
    if (creep.store.getUsedCapacity() === 0) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.roomName)));
    } else {
      const storage = GetRoomObjects.getRoomStorage(area.baseRoom);
      if (storage && storage.store.getFreeCapacity() > 0) {
        creep.addTask(new CreepTask(Activity.DepositMineral, storage.pos, null, mineralType));
      }
    }
  } else if (creep.pos.roomName === area.roomName) {
    if (creep.store.getUsedCapacity() > 0) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.baseRoom.name)));
    } else if (area.mineralContainer) {
      const available = area.mineralContainer.store.getUsedCapacity(mineralType) ?? 0;
      if (available > 0) {
        creep.addTask(new CreepTask(Activity.CollectMineral, area.mineralContainer.pos, null, mineralType));
      }
    }
  } else {
    creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.roomName)));
  }
}

export function createMineralCarrier(area: RemoteArea): SpawnTask {
  const segments = Math.min(12, Math.floor(area.baseRoom.energyCapacityAvailable / 100));
  const bodyPartConstants: BodyPartConstant[] = [];
  for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
  for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);
  return new SpawnTask(CreepType.MineralCarrier, area.areaId, bodyPartConstants, area, "MinCarrier-" + area.roomName);
}
