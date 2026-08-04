import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";
import { AttackFlagConfig } from "../SoldierArea";
import { setSoldierNavigationStyle } from "../SoldierAreaMemory";

export default class LineNaviagation {
  public static tryMoveAsFormation(creeps: CreepBase[], destination: RoomPosition, flag: AttackFlagConfig): boolean {
    if (creeps.length < 4) {
      return false;
    }

    const line = creeps.slice(0, 4);
    if (!this.creepsAreInRangeOfEachOther(line, 6)) {
      return false;
    }

    const leader = line[0];

    const search = Helper.simplePathFinderWithObstacles(leader.pos, destination);
    if (search.path.length === 0) {
      setSoldierNavigationStyle(flag.name, undefined);
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
      let lastPos = path[path.length - 1];
      path.pop();
      if (lastPos.x === 1) path.push(new RoomPosition(0, lastPos.y, lastPos.roomName));
      if (lastPos.x === 48) path.push(new RoomPosition(49, lastPos.y, lastPos.roomName));
      if (lastPos.y === 1) path.push(new RoomPosition(lastPos.x, 0, lastPos.roomName));
      if (lastPos.y === 48) path.push(new RoomPosition(lastPos.x, 49, lastPos.roomName));

      lastPos = path[path.length - 1];
      if (Game.map.getRoomTerrain(lastPos.roomName).get(lastPos.x, lastPos.y) === TERRAIN_MASK_WALL) {
        path.pop(); // remove it as it is a wall.
      }
    }

    for (let i = 0; i < path.length; i++) {
      const pos = path[i];
      const room = Game.rooms[pos.roomName];
      if (!room) continue;
      room.visual.circle(pos.x, pos.y, { fill: "transparent", radius: 0.5, stroke: "#ff0000" });
      room.visual.text(i.toString(), pos.x, pos.y, { color: "#ff0000", font: 0.5 });
    }

    // Check if creeps have fatique
    if (creeps.some(creep => creep.creep.fatigue > 0)) {
      return true;
    }

    for (const creep of line) {
      creep.creep.moveByPath(path);
    }

    return true;
  }

  // private static creepsAreInRangeOfEachOther(creeps: CreepBase[], range: number): boolean {
  //   for (let i = 0; i < creeps.length; i++) {
  //     for (let j = i + 1; j < creeps.length; j++) {
  //       if (creeps[i].pos.roomName !== creeps[j].pos.roomName) {
  //         return false;
  //       }
  //       if (creeps[i].pos.getRangeTo(creeps[j].pos) > range) {
  //         return false;
  //       }
  //     }
  //   }
  //   return true;
  // }

  private static creepsAreInRangeOfEachOther(creeps: CreepBase[], range: number): boolean {
    const positions = creeps.map(c => this.getWorldPosition(c.pos));

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (Math.max(Math.abs(positions[i].x - positions[j].x), Math.abs(positions[i].y - positions[j].y)) > range) {
          return false;
        }
      }
    }

    return true;
  }

  private static getWorldPosition(pos: RoomPosition) {
    const match = /^([WE])(\d+)([NS])(\d+)$/.exec(pos.roomName)!;

    let rx = Number(match[2]);
    let ry = Number(match[4]);

    if (match[1] === "W") rx = -rx - 1;
    if (match[3] === "N") ry = -ry - 1;

    return {
      x: rx * 50 + pos.x,
      y: ry * 50 + pos.y
    };
  }
}
