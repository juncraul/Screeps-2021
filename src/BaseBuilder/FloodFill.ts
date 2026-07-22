const ROOM_DIMENSIONS = 50;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Coord {
  x: number;
  y: number;
}

declare global {
  interface Room {
    floodFill(seeds: Coord[]): CostMatrix;
  }
}

export function findPositionsInsideRect(rect: Rect): Coord[] {
  const positions: Coord[] = [];

  for (let x = rect.x1; x <= rect.x2; x++) {
    for (let y = rect.y1; y <= rect.y2; y++) {
      // Skip positions outside room bounds
      if (x < 0 || x >= ROOM_DIMENSIONS || y < 0 || y >= ROOM_DIMENSIONS) {
        continue;
      }

      positions.push({ x, y });
    }
  }

  return positions;
}

if (typeof Room !== "undefined") {
  Room.prototype.floodFill = function (this: Room, seeds: Coord[]): CostMatrix {
    // Construct cost matrices
    const floodCM = new PathFinder.CostMatrix();
    const terrain = this.getTerrain();
    const visitedCM = new PathFinder.CostMatrix();

    let depth = 0;
    let thisGeneration: Coord[] = seeds;
    let nextGeneration: Coord[] = [];

    // Mark seeds as visited
    for (const pos of seeds) {
      visitedCM.set(pos.x, pos.y, 1);
    }

    while (thisGeneration.length > 0) {
      nextGeneration = [];

      for (const pos of thisGeneration) {
        if (depth !== 0) {
          // Skip walls
          if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
            continue;
          }

          floodCM.set(pos.x, pos.y, depth);

          if (Memory.roomVisuals) {
            this.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {
              fill: `hsl(${200 + depth * 2}, 100%, 60%)`,
              opacity: 0.4
            });
          }
        }

        const rect: Rect = {
          x1: pos.x - 1,
          y1: pos.y - 1,
          x2: pos.x + 1,
          y2: pos.y + 1
        };

        const adjacentPositions = findPositionsInsideRect(rect);

        for (const adjacentPos of adjacentPositions) {
          if (visitedCM.get(adjacentPos.x, adjacentPos.y) === 1) {
            continue;
          }

          visitedCM.set(adjacentPos.x, adjacentPos.y, 1);
          nextGeneration.push(adjacentPos);
        }
      }

      thisGeneration = nextGeneration;
      depth += 1;
    }

    return floodCM;
  };
}

export {};
