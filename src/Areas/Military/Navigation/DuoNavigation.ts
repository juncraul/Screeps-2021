import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";
import QuadNavigation from "./QuadNavigation";

export default class DuoNavigation {
  public static tryToKiteTheEnemyAsFormation(
    duo: CreepBase[],
    destination: RoomPosition,
    memoryName: string,
    flagColor: ColorConstant
  ): boolean {
    if (duo.length !== 2) return false;
    const movement = QuadNavigation.getCombatMovement(duo, destination, memoryName, flagColor, "duo");
    if (duo.some(creep => creep.creep.fatigue > 0)) return true;
    if (this.getRange(duo[0].pos, duo[1].pos) !== 1) {
      return this.tryMoveAsFormation(duo, destination);
    }
    return movement ? this.tryMoveAsFormation(duo, movement.destination) : true;
  }

  public static tryMoveAsFormation(duo: CreepBase[], destination: RoomPosition): boolean {
    if (duo.length !== 2) return false;

    const [head, tail] = duo;
    if (duo.some(creep => creep.creep.fatigue > 0)) return true;

    if (this.getRange(head.pos, tail.pos) !== 1) {
      tail.creep.moveTo(head.pos, { range: 1, reusePath: 0 });
      return true;
    }

    const crossingRoom = head.pos.roomName !== tail.pos.roomName;
    if (!crossingRoom && head.pos.roomName === destination.roomName && head.pos.inRangeTo(destination, 1)) return true;

    const headOnExit = head.pos.x === 0 || head.pos.x === 49 || head.pos.y === 0 || head.pos.y === 49;
    const next =
      crossingRoom && headOnExit
        ? new RoomPosition(
            Math.max(1, Math.min(48, head.pos.x)),
            Math.max(1, Math.min(48, head.pos.y)),
            head.pos.roomName
          )
        : Helper.simplePathFinderWithObstacles(head.pos, destination, {
            range: 1,
            ignoreCreeps: duo.map(creep => creep.name),
            allowUnseenRooms: true
          }).path[0];
    if (!next || this.getRange(head.pos, next) !== 1) return true;

    const direction = this.getDirection(head.pos, next);
    if (head.creep.move(direction) === OK) {
      tail.creep.move(this.getDirection(tail.pos, head.pos));
    }
    return true;
  }

  private static getWorldPosition(pos: RoomPosition): { x: number; y: number } {
    const match = /^([WE])(\d+)([NS])(\d+)$/.exec(pos.roomName);
    if (!match) return { x: pos.x, y: pos.y };
    const roomX = match[1] === "W" ? -Number(match[2]) - 1 : Number(match[2]);
    const roomY = match[3] === "N" ? -Number(match[4]) - 1 : Number(match[4]);
    return { x: roomX * 50 + pos.x, y: roomY * 50 + pos.y };
  }

  private static getRange(from: RoomPosition, to: RoomPosition): number {
    const start = this.getWorldPosition(from);
    const end = this.getWorldPosition(to);
    const deltaX = Math.abs(start.x - end.x);
    const deltaY = Math.abs(start.y - end.y);
    const crossesX = Math.abs(Math.floor(start.x / 50) - Math.floor(end.x / 50)) === 1;
    const crossesY = Math.abs(Math.floor(start.y / 50) - Math.floor(end.y / 50)) === 1;
    return Math.max(crossesX ? Math.max(1, deltaX - 1) : deltaX, crossesY ? Math.max(1, deltaY - 1) : deltaY);
  }

  private static getDirection(from: RoomPosition, to: RoomPosition): DirectionConstant {
    const start = this.getWorldPosition(from);
    const end = this.getWorldPosition(to);
    const deltaX = Math.sign(end.x - start.x);
    const deltaY = Math.sign(end.y - start.y);
    const directions = [
      [8, 1, 2],
      [7, 0, 3],
      [6, 5, 4]
    ];
    return directions[deltaY + 1][deltaX + 1] as DirectionConstant;
  }
}
