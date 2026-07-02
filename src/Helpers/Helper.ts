export class Helper {
  public static getUserName(): string {
    // TODO: Make this not hard coded
    return "Raul";
    // return _.find(Game.structures)!.owner.username
  }

  public static isSamePosition(roomPosition1: RoomPosition, roomPosition2: RoomPosition) {
    return (
      roomPosition1.x === roomPosition2.x &&
      roomPosition1.y === roomPosition2.y &&
      roomPosition1.roomName === roomPosition2.roomName
    );
  }

  public static getCashedMemory(key: string, defaultValue: any): any {
    if (!Memory.Keys || typeof Memory.Keys !== "object") {
      Memory.Keys = {};
    }
    let obj = Memory.Keys[key];
    if (obj === undefined) {
      obj = defaultValue;
    }
    return obj;
  }

  public static setCashedMemory(key: string, value: any) {
    if (!Memory.Keys || typeof Memory.Keys !== "object") {
      Memory.Keys = {};
    }
    Memory.Keys[key] = value;
  }

  public static getFreeAdjacentPositions(pos: RoomPosition, minRange = 1, maxRange = 1): RoomPosition[] {
    const adjacentPositions: RoomPosition[] = [];
    for (let x = -maxRange; x <= maxRange; x++) {
      for (let y = -maxRange; y <= maxRange; y++) {
        const range = Math.max(Math.abs(x), Math.abs(y));
        if (range < minRange || range > maxRange) continue;
        const adjacentPos = new RoomPosition(pos.x + x, pos.y + y, pos.roomName);
        if (adjacentPos.x < 0 || adjacentPos.x > 49 || adjacentPos.y < 0 || adjacentPos.y > 49) continue;
        if (adjacentPos.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
        if (adjacentPos.lookFor(LOOK_STRUCTURES).length > 0) continue;
        adjacentPositions.push(adjacentPos);
      }
    }
    return adjacentPositions;
  }

  public static getCreepNamesFromArea(areaType: string, roomName: string): string[] {
    const creeps: string[] = Helper.getCashedMemory(`${areaType}-${roomName}`, []);
    return creeps;
  }

  public static createRoadBetweenPoints(
    start: RoomPosition,
    end: RoomPosition,
    previewInsteadOfBuild = false,
    options: {
      goalRange?: number;
      maxOps?: number;
      maxRooms?: number;
      allowedRoomNames?: string[];
      avoidParallelRoads?: boolean;
    } = {}
  ): { searchPath: RoomPosition[]; incomplete: boolean; remainingRoadsToBuild: number } {
    const goalRange = options.goalRange ?? 0;
    const maxOps = options.maxOps ?? 4000;
    const maxRooms = options.maxRooms ?? 1;
    const allowedRoomNames = options.allowedRoomNames;
    const avoidParallelRoads = options.avoidParallelRoads ?? true;

    const search = PathFinder.search(
      start,
      { pos: end, range: goalRange },
      {
        maxOps,
        maxRooms,
        plainCost: 2,
        swampCost: 10,
        roomCallback: roomName => {
          if (allowedRoomNames && allowedRoomNames.indexOf(roomName) === -1) {
            return false;
          }

          const costs = new PathFinder.CostMatrix();
          const terrain = Game.map.getRoomTerrain(roomName);
          const roadTiles: RoomPosition[] = [];

          for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
              if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costs.set(x, y, 255);
              }
              if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                // Treat swamp just a bit worse than plain for road building purposes
                costs.set(x, y, 3);
              }
            }
          }

          const room = Game.rooms[roomName];
          if (room) {
            room.find(FIND_STRUCTURES).forEach(structure => {
              if (structure.structureType === STRUCTURE_ROAD) {
                costs.set(structure.pos.x, structure.pos.y, 1);
                roadTiles.push(structure.pos);
              } else if (
                structure.structureType !== STRUCTURE_CONTAINER &&
                structure.structureType !== STRUCTURE_RAMPART
              ) {
                costs.set(structure.pos.x, structure.pos.y, 255);
              }
            });

            room.find(FIND_CONSTRUCTION_SITES).forEach(site => {
              if (site.structureType === STRUCTURE_ROAD) {
                costs.set(site.pos.x, site.pos.y, 1);
                roadTiles.push(site.pos);
              } else if (site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_RAMPART) {
                costs.set(site.pos.x, site.pos.y, 255);
              }
            });

            if (avoidParallelRoads) {
              roadTiles.forEach(roadPos => {
                const adjacent: [number, number][] = [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1]
                ];
                adjacent.forEach(([dx, dy]) => {
                  const x = roadPos.x + dx;
                  const y = roadPos.y + dy;
                  if (x < 0 || x > 49 || y < 0 || y > 49) return;
                  const current = costs.get(x, y);
                  if (current === 0) {
                    // Discourage building right next to existing roads when another route can merge onto the road.
                    costs.set(x, y, 4);
                  }
                });
              });
            }
          }

          return costs;
        }
      }
    );

    if (search.incomplete) {
      return { searchPath: [], incomplete: true, remainingRoadsToBuild: 0 };
    }

    let remainingRoadsToBuild = 0;

    search.path.forEach(step => {
      const room = Game.rooms[step.roomName];
      if (!room) {
        return;
      }

      if (step.x === 0 || step.x === 49 || step.y === 0 || step.y === 49) {
        return;
      }

      if (previewInsteadOfBuild) {
        room.visual.structure(step.x, step.y, STRUCTURE_ROAD);
        return;
      }

      const terrain = room.lookForAt(LOOK_TERRAIN, step.x, step.y)[0];
      if (terrain === "wall") {
        return;
      }

      const hasBlockingStructure = room
        .lookForAt(LOOK_STRUCTURES, step.x, step.y)
        .some(structure => structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_RAMPART);
      if (hasBlockingStructure) {
        return;
      }

      const roadSiteExists = room
        .lookForAt(LOOK_CONSTRUCTION_SITES, step.x, step.y)
        .some(site => site.structureType === STRUCTURE_ROAD);
      const roadExists = room
        .lookForAt(LOOK_STRUCTURES, step.x, step.y)
        .some(structure => structure.structureType === STRUCTURE_ROAD);

      if (!roadExists && !roadSiteExists) {
        room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
        remainingRoadsToBuild++;
      }
    });

    return { searchPath: search.path, incomplete: false, remainingRoadsToBuild };
  }
}
