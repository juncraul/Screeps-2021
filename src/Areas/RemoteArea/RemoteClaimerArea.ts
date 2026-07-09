import type RemoteArea from "./RemoteArea";
import { Helper } from "Helpers/Helper";
import { RemoteRoomMode } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";

export function handleClaimer(area: RemoteArea, creep: CreepBase): void {
  if (creep.pos.roomName !== area.roomName) {
    creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.roomName)));
  } else if (area.controller) {
    if (area.remoteMode === RemoteRoomMode.Claim) {
      creep.addTask(new CreepTask(Activity.Claim, area.controller.pos));
    } else if (area.remoteMode === RemoteRoomMode.ReserveAttack) {
      if (area.controller.owner && area.controller.owner.username !== Helper.getUserName()) {
        creep.addTask(new CreepTask(Activity.AttackController, area.controller.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Claim, area.controller.pos));
      }
    } else {
      creep.addTask(new CreepTask(Activity.Reserve, area.controller.pos));
    }
  }
}

export function shouldSpawnClaimer(area: RemoteArea): boolean {
  if (!area.controller) {
    return true;
  }

  if (area.remoteMode === RemoteRoomMode.Claim) {
    return !area.controller.my;
  }

  if (area.remoteMode === RemoteRoomMode.ReserveAttack) {
    return Boolean(
      (area.controller.owner && area.controller.owner.username !== Helper.getUserName()) ||
        (area.controller.reservation && area.controller.reservation.username !== Helper.getUserName())
    );
  }

  return (
    !area.controller.reservation ||
    area.controller.reservation.username !== Helper.getUserName() ||
    area.controller.reservation.ticksToEnd < 1000
  );
}

export function createClaimer(area: RemoteArea): SpawnTask {
  const bodyPartConstants: BodyPartConstant[] = [];
  const segments =
    area.remoteMode === RemoteRoomMode.Claim ? 1 : Math.min(3, Math.floor(area.baseRoom.energyCapacityAvailable / 650));
  for (let i = 0; i < segments; i++) bodyPartConstants.push(CLAIM);
  for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);

  return new SpawnTask(CreepType.Claimer, area.areaId, bodyPartConstants, area, "RemoteClaimer-" + area.roomName);
}
