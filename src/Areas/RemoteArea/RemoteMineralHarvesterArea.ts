import type RemoteArea from "./RemoteArea";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";

export function handleMineralHarvester(area: RemoteArea, creep: CreepBase): void {
  if (!creep.isFree()) return;
  if (creep.pos.roomName !== area.roomName) {
    creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.roomName)));
    return;
  }
  if (!area.mineral || !area.mineralContainer) return;
  if (area.mineralContainer.store.getFreeCapacity() < 20) return;
  creep.addTask(new CreepTask(Activity.HarvestMineral, area.mineral.pos, area.mineralContainer.pos));
}

export function createMineralHarvester(area: RemoteArea): SpawnTask | null {
  if (area.room) {
    if (!area.mineral) return null;
    const extractor = area.mineral.pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTRACTOR);
    if (!extractor) return null;
  }
  const bodyPartConstants: BodyPartConstant[] = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE];
  return new SpawnTask(
    CreepType.MineralHarvester,
    area.areaId,
    bodyPartConstants,
    area,
    "MinHarvester-" + area.roomName
  );
}
