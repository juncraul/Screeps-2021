import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";
import { CreepType } from "../../../CreepType";

export default class LineNaviagation {
  public static tryMoveAsFormation(creeps: CreepBase[], destination: RoomPosition): boolean {
    if (creeps.length < 4) {
      return false;
    }

    const ordered = this.getOrderedFormationCreeps(creeps);
    const line = ordered.slice(0, 4);
    if (!this.creepsAreInRangeOfEachOther(line, 6)) {
      return false;
    }

    const leader = line[0];

    const search = Helper.simplePathFinderWithObstacles(leader.pos, destination);
    if (search.path.length === 0) {
      return false;
    }

    const path: RoomPosition[] = [];
    for (const creep of line
      .sort((a, b) => a.pos.getRangeTo(search.path[0]) - b.pos.getRangeTo(search.path[0]))
      .reverse()) {
      path.push(creep.pos);
    }

    path.push(...search.path);

    if (search.incomplete) {
      const lastPos = path[path.length - 1];
      path.pop();
      if (lastPos.x === 1) path.push(new RoomPosition(0, lastPos.y, lastPos.roomName));
      if (lastPos.x === 48) path.push(new RoomPosition(49, lastPos.y, lastPos.roomName));
      if (lastPos.y === 1) path.push(new RoomPosition(lastPos.x, 0, lastPos.roomName));
      if (lastPos.y === 48) path.push(new RoomPosition(lastPos.x, 49, lastPos.roomName));

      if (Game.map.getRoomTerrain(lastPos.roomName).get(lastPos.x, lastPos.y) !== TERRAIN_MASK_WALL) {
        path.pop(); // remove it as it is a wall.
      }
    }

    for (let i = 0; i < path.length; i++) {
      const pos = path[i];
      leader.room.visual.circle(pos.x, pos.y, { fill: "transparent", radius: 0.5, stroke: "#ff0000" });
      leader.room.visual.text(i.toString(), pos.x, pos.y, { color: "#ff0000", font: 0.5 });
    }

    for (const creep of line) {
      creep.creep.moveByPath(path);
    }

    return true;
  }

  private static getOrderedFormationCreeps(creeps: CreepBase[]): CreepBase[] {
    const designatedLeader =
      creeps.find(creep => creep.creepType === CreepType.Melee) ??
      creeps.find(creep => creep.creepType === CreepType.Dismantler) ??
      creeps.slice().sort((a, b) => a.ticksToLive! - b.ticksToLive!)[0];

    const followers = creeps
      .filter(creep => creep.name !== designatedLeader.name)
      .sort((a, b) => a.ticksToLive! - b.ticksToLive!);

    const ordered = [designatedLeader, ...followers];
    for (let i = 0; i < ordered.length; i++) {
      ordered[i].memory.formationOrder = i;
    }

    return ordered;
  }

  private static creepsAreInRangeOfEachOther(creeps: CreepBase[], range: number): boolean {
    for (let i = 0; i < creeps.length; i++) {
      for (let j = i + 1; j < creeps.length; j++) {
        if (creeps[i].pos.roomName !== creeps[j].pos.roomName) {
          return false;
        }
        if (creeps[i].pos.getRangeTo(creeps[j].pos) > range) {
          return false;
        }
      }
    }
    return true;
  }
}
