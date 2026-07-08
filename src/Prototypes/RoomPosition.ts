let lastSitePlacedFullTick: number | undefined;

const originalCreateConstructionSite = RoomPosition.prototype.createConstructionSite;

RoomPosition.prototype.createConstructionSite = function (
  this: RoomPosition,
  ...args: Parameters<typeof originalCreateConstructionSite>
): ReturnType<typeof originalCreateConstructionSite> {
  if (lastSitePlacedFullTick === Game.time) {
    return ERR_FULL;
  }

  const result = originalCreateConstructionSite.apply(this, args);

  if (result === ERR_FULL) {
    if (lastSitePlacedFullTick !== Game.time) {
      console.log(
        `RoomPosition.createConstructionSite: ERR_FULL triggered, disabling construction for tick ${Game.time}`
      );
    }
    lastSitePlacedFullTick = Game.time;
  }

  return result;
};
