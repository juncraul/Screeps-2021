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

  public static isInRange(roomPosition1: RoomPosition, roomPosition2: RoomPosition, range: number) {
    return roomPosition1.inRangeTo(roomPosition2, range);
  }

  public static getCashedMemory<T>(key: string, defaultValue: T): T {
    if (!Memory.Keys || typeof Memory.Keys !== "object") {
      Memory.Keys = {};
    }
    let obj = Memory.Keys[key];
    if (obj === undefined) {
      obj = defaultValue;
    }
    return obj;
  }

  public static setCashedMemory<T>(key: string, value: T) {
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

  public static getWalkableAdjacentPositions(pos: RoomPosition, minRange = 1, maxRange = 1): RoomPosition[] {
    const adjacentPositions: RoomPosition[] = [];
    for (let x = -maxRange; x <= maxRange; x++) {
      for (let y = -maxRange; y <= maxRange; y++) {
        const range = Math.max(Math.abs(x), Math.abs(y));
        if (range < minRange || range > maxRange) continue;
        const adjacentPos = new RoomPosition(pos.x + x, pos.y + y, pos.roomName);
        if (adjacentPos.x < 0 || adjacentPos.x > 49 || adjacentPos.y < 0 || adjacentPos.y > 49) continue;
        if (adjacentPos.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
        if (
          adjacentPos
            .lookFor(LOOK_STRUCTURES)
            .filter(
              s =>
                s.structureType !== STRUCTURE_ROAD &&
                s.structureType !== STRUCTURE_RAMPART &&
                s.structureType !== STRUCTURE_CONTAINER
            ).length > 0
        )
          continue;
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

  public static findClosestMatching(
    startPos: RoomPosition,
    maxRange: number | null,
    avoidEdges: boolean,
    callback: (pos: RoomPosition) => boolean
  ): RoomPosition | null {
    if (maxRange === null) {
      maxRange = 50;
    }
    for (let range = 1; range <= maxRange; range++) {
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          // Only positions on the edge of the square
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== range) continue;

          const x = startPos.x + dx;
          const y = startPos.y + dy;

          if (x < 0 || x > 49 || y < 0 || y > 49) continue;

          if (
            avoidEdges &&
            (x === 0 ||
              x === 1 ||
              x === 47 ||
              x === 48 ||
              x === 49 ||
              y === 0 ||
              y === 1 ||
              y === 47 ||
              y === 48 ||
              y === 49)
          )
            continue;

          const pos = new RoomPosition(x, y, startPos.roomName);

          if (callback(pos)) {
            return pos;
          }
        }
      }
    }
    return null;
  }

  public static positionIsWalkable(pos: RoomPosition): boolean {
    const room = Game.rooms[pos.roomName];
    if (!room) {
      return false;
    }
    const terrain = room.getTerrain().get(pos.x, pos.y);
    if (terrain === TERRAIN_MASK_WALL) {
      return false;
    }
    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (
      structures.some(
        structure =>
          structure.structureType !== STRUCTURE_ROAD &&
          structure.structureType !== STRUCTURE_CONTAINER &&
          structure.structureType !== STRUCTURE_RAMPART
      )
    ) {
      return false;
    }
    const constructionSites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    if (
      constructionSites.some(
        site =>
          site.structureType !== STRUCTURE_ROAD &&
          site.structureType !== STRUCTURE_CONTAINER &&
          site.structureType !== STRUCTURE_RAMPART
      )
    ) {
      return false;
    }
    const creeps = pos.lookFor(LOOK_CREEPS);
    if (creeps.length > 0) {
      return false;
    }
    return true;
  }

  public static simplePathFinderWithObstacles(start: RoomPosition, end: RoomPosition): PathFinderPath {
    const result = PathFinder.search(
      start,
      { pos: end, range: 0 },
      {
        plainCost: 2,
        swampCost: 10,
        maxOps: 5000,
        roomCallback: roomName => {
          const room = Game.rooms[roomName];
          if (!room) {
            return false;
          }

          const costs = new PathFinder.CostMatrix();
          const terrain = room.getTerrain();
          const blocked = new Set<string>();

          const structures = room.find(FIND_STRUCTURES);
          for (const structure of structures) {
            if (
              structure.structureType === STRUCTURE_ROAD ||
              structure.structureType === STRUCTURE_CONTAINER ||
              structure.structureType === STRUCTURE_RAMPART
            ) {
              continue;
            }
            blocked.add(`${structure.pos.x}:${structure.pos.y}`);
          }

          const creeps = room.find(FIND_CREEPS);
          for (const creep of creeps) {
            blocked.add(`${creep.pos.x}:${creep.pos.y}`);
          }

          for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
              if (x < 1 || x > 48 || y < 1 || y > 48) {
                costs.set(x, y, 255);
                continue;
              }

              const positionBlocked = terrain.get(x, y) === TERRAIN_MASK_WALL || blocked.has(`${x}:${y}`);

              if (positionBlocked) {
                costs.set(x, y, 255);
              }
            }
          }

          return costs;
        }
      }
    );
    return result;
  }
}
