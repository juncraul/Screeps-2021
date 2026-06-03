const ROOM_DIMENSIONS = 50;

declare global {
  interface Room {
    distanceTransform(
      initialCM: CostMatrix,
      enableVisuals: boolean,
      x1?: number,
      y1?: number,
      x2?: number,
      y2?: number
    ): CostMatrix;

    diagonalDistanceTransform(
      initialCM: CostMatrix,
      enableVisuals: boolean,
      x1?: number,
      y1?: number,
      x2?: number,
      y2?: number
    ): CostMatrix;
  }
}

/**
 * Good for anything that isn't a diagonal, as it searches all adjacent tiles when finding distance.
 */
Room.prototype.distanceTransform = function (
  this: Room,
  initialCM: CostMatrix,
  enableVisuals: boolean,
  x1 = 0,
  y1 = 0,
  x2 = ROOM_DIMENSIONS - 1,
  y2 = ROOM_DIMENSIONS - 1
): CostMatrix {
  const distanceCM = new PathFinder.CostMatrix();

  let x: number;
  let y: number;

  for (x = Math.max(x1 - 1, 0); x < Math.min(x2 + 1, ROOM_DIMENSIONS - 1); x += 1) {
    for (y = Math.max(y1 - 1, 0); y < Math.min(y2 + 1, ROOM_DIMENSIONS - 1); y += 1) {
      distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
    }
  }

  let top: number;
  let left: number;
  let topLeft: number;
  let topRight: number;
  let bottomLeft: number;

  for (x = x1; x <= x2; x += 1) {
    for (y = y1; y <= y2; y += 1) {
      top = distanceCM.get(x, y - 1);
      left = distanceCM.get(x - 1, y);
      topLeft = distanceCM.get(x - 1, y - 1);
      topRight = distanceCM.get(x + 1, y - 1);
      bottomLeft = distanceCM.get(x - 1, y + 1);

      distanceCM.set(x, y, Math.min(Math.min(top, left, topLeft, topRight, bottomLeft) + 1, distanceCM.get(x, y)));
    }
  }

  let bottom: number;
  let right: number;
  let bottomRight: number;

  for (x = x2; x >= x1; x -= 1) {
    for (y = y2; y >= y1; y -= 1) {
      bottom = distanceCM.get(x, y + 1);
      right = distanceCM.get(x + 1, y);
      bottomRight = distanceCM.get(x + 1, y + 1);
      topRight = distanceCM.get(x + 1, y - 1);
      bottomLeft = distanceCM.get(x - 1, y + 1);

      distanceCM.set(
        x,
        y,
        Math.min(Math.min(bottom, right, bottomRight, topRight, bottomLeft) + 1, distanceCM.get(x, y))
      );
    }
  }

  if (enableVisuals) {
    for (x = x1; x <= x2; x += 1) {
      for (y = y1; y <= y2; y += 1) {
        this.visual.rect(x - 0.5, y - 0.5, 1, 1, {
          fill: `hsl(${200 + distanceCM.get(x, y) * 10}, 100%, 60%)`,
          opacity: 0.4
        });
      }
    }
  }

  return distanceCM;
};

/**
 * Good for finding open diamond-shaped areas, as it ignores adjacent diagonal tiles when finding distance.
 */
Room.prototype.diagonalDistanceTransform = function (
  this: Room,
  initialCM: CostMatrix,
  enableVisuals: boolean,
  x1 = 0,
  y1 = 0,
  x2 = ROOM_DIMENSIONS - 1,
  y2 = ROOM_DIMENSIONS - 1
): CostMatrix {
  const distanceCM = new PathFinder.CostMatrix();

  let x: number;
  let y: number;

  for (x = x1; x <= x2; x += 1) {
    for (y = y1; y <= y2; y += 1) {
      distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
    }
  }

  let top: number;
  let left: number;

  for (x = x1; x <= x2; x += 1) {
    for (y = y1; y <= y2; y += 1) {
      top = distanceCM.get(x, y - 1);
      left = distanceCM.get(x - 1, y);

      distanceCM.set(x, y, Math.min(Math.min(top, left) + 1, distanceCM.get(x, y)));
    }
  }

  let bottom: number;
  let right: number;

  for (x = x2; x >= x1; x -= 1) {
    for (y = y2; y >= y1; y -= 1) {
      bottom = distanceCM.get(x, y + 1);
      right = distanceCM.get(x + 1, y);

      distanceCM.set(x, y, Math.min(Math.min(bottom, right) + 1, distanceCM.get(x, y)));
    }
  }

  if (enableVisuals) {
    for (x = x1; x <= x2; x += 1) {
      for (y = y1; y <= y2; y += 1) {
        const distance = distanceCM.get(x, y);

        // Ignore walls and obstacles.
        if (distance !== 0) {
          this.visual.rect(x - 0.5, y - 0.5, 1, 1, {
            fill: `hsl(${200 + distance * 10}, 100%, 60%)`,
            opacity: 0.4
          });

          this.visual.text(distance.toString(), x, y);
        }
      }
    }
  }

  return distanceCM;
};

export {};
