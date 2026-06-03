import { BaseLayout, Coord } from "./BaseLayout";
import {
  layoutBunker,
  layoutFourWays,
  layoutReverseRooftop,
  layoutRooftop,
  layoutSieve,
  layoutUtility
} from "./Layout";
import { Helper } from "./../Helpers/Helper";
import { GetRoomObjects } from "./../Helpers/GetRoomObjects";
import "./DistanceTransform";
import "./FloodFill";

// Flags: Primary - Secondary
// Layout construction via the AutoPlaceBase flag
// WHITE - WHITE Preview Layout Sieve
// WHITE - GREY  Preview Layout Rooftop
// WHITE - BROWN Preview Layout Reverse/Rooftop
// WHITE - ORANGE Preview Layout FourWays
// WHITE - GREEN Preview Layout Bunker
// GREY  - WHITE Build Layout Sieve
// GREY  - GREY  Build Layout Rooftop
// GREY  - BROWN Build Layout Reverse/Rooftop
// GREY  - ORANGE Build Layout FourWays
// GREY  - GREEN Build Layout Bunker

// BROWN - WHITE Build Rampart instead of wall

// AutoPlaceBase automatically chooses a good anchor using distance transform + flood fill,
// then repositions itself and uses its own colors for preview/build.

export class BaseBuilder {
  public static storeBuildOptionInMemory() {
    for (const flagName in Game.flags) {
      const flag = Game.flags[flagName];
      switch (flag.color) {
        case COLOR_BROWN:
          switch (flag.secondaryColor) {
            case COLOR_WHITE:
              const constructionRampart: RoomPosition[] = Helper.getCashedMemory("Construction-Rampart", []);
              if (
                constructionRampart.filter(obj => {
                  return obj.roomName === flag.pos.roomName && obj.x === flag.pos.x && obj.y === flag.pos.y;
                }).length === 0
              ) {
                constructionRampart.push(flag.pos);
                Helper.setCashedMemory("Construction-Rampart", constructionRampart);
              }

              break;
          }
          break;
      }
    }
  }

  public static logicCreateConstructionSites() {
    const autoPlaceFlag = Game.flags.AutoPlaceBase;
    if (autoPlaceFlag && autoPlaceFlag.room) {
      const controller = GetRoomObjects.getRoomController(autoPlaceFlag.room);
      const layoutToBeUsed = this.getBaseLayout(autoPlaceFlag.secondaryColor);

      if (!controller) {
        console.log("BaseBuilder: No controller found in the room of the AutoPlaceBase flag.");
        return;
      }
      if (!layoutToBeUsed || !layoutToBeUsed[controller.level]) {
        return;
      }

      this.autoPlaceConstructionFlag(autoPlaceFlag, layoutToBeUsed, controller.level);

      if (_.filter(Game.creeps, creep => creep.room === autoPlaceFlag.room).length !== 0) {
        if (autoPlaceFlag.color === COLOR_WHITE) {
          this.buildBase(autoPlaceFlag.pos, layoutToBeUsed, controller.level, true);
          this.createWall(Game.rooms[autoPlaceFlag.pos.roomName], true);
        } else if (autoPlaceFlag.color === COLOR_GREY && Game.time % 10 === 0) {
          // Construct only once every 10th tick
          this.buildBase(autoPlaceFlag.pos, layoutToBeUsed, controller.level, false);
          if (controller.level >= 3) {
            // Build walls only if the controller is at least level 3 because that's when we can build Cannons.
            this.createWall(Game.rooms[autoPlaceFlag.pos.roomName], false);
          }
        }
      }
    }

    for (let i = 10; i < 20; i++) {
      const flag = Game.flags["ConstructionSite-" + i];
      if (!flag) continue;
      if (_.filter(Game.creeps, creep => creep.room === flag.room).length === 0) continue;

      let layoutToBeUsed: BaseLayout;
      switch (flag.secondaryColor) {
        case COLOR_WHITE:
          layoutToBeUsed = layoutUtility;
          break;
        default:
          continue;
      }
      if (flag.color === COLOR_WHITE) {
        this.buildBase(flag.pos, layoutToBeUsed, 4, true);
      } else if (flag.color === COLOR_GREY && Game.time % 10 === 0) {
        // Construct only once every 10th tick
        this.buildBase(flag.pos, layoutToBeUsed, 4, false);
      }
    }

    const deleteStructuresFlag = Game.flags.DeleteStructures;
    if (deleteStructuresFlag) {
      const structures = deleteStructuresFlag.room!.find(FIND_STRUCTURES);
      for (const i in structures) {
        structures[i].destroy();
      }
    }

    const deleteConstructionSitesFlag = Game.flags.DeleteConstructionSites;
    if (deleteConstructionSitesFlag) {
      const constructionSites = deleteConstructionSitesFlag.room!.find(FIND_CONSTRUCTION_SITES);
      for (const i in constructionSites) {
        constructionSites[i].remove();
      }
    }

    const createSpawnFlag = Game.flags.CreateSpawn;
    if (createSpawnFlag && createSpawnFlag.room) {
      createSpawnFlag.room.createConstructionSite(
        createSpawnFlag.pos.x,
        createSpawnFlag.pos.y,
        STRUCTURE_SPAWN,
        "Raul-" + createSpawnFlag.room.name + "-X"
      );
    }
  }

  private static getBaseLayout(secondaryColor: ColorConstant): BaseLayout | null {
    switch (secondaryColor) {
      case COLOR_WHITE:
        return layoutSieve;
      case COLOR_GREY:
        return layoutRooftop;
      case COLOR_BROWN:
        return layoutReverseRooftop;
      case COLOR_ORANGE:
        return layoutFourWays;
      case COLOR_GREEN:
        return layoutBunker;
      default:
        return null;
    }
  }

  private static buildBase(
    anchor: RoomPosition,
    layout: BaseLayout,
    controllerLevel: number,
    previewInsteadOfBuild: boolean
  ) {
    const spawnCoordinates = layout[controllerLevel]!.buildings.spawn.pos;
    const roadCoordinates = layout[controllerLevel]!.buildings.road.pos;
    const extensionCoordinates = layout[controllerLevel]!.buildings.extension.pos;
    const wallCoordinates = layout[controllerLevel]!.buildings.wall.pos;
    const rampartCoordinates = layout[controllerLevel]!.buildings.rampart.pos;
    const containerCoordinates = layout[controllerLevel]!.buildings.container.pos;
    const observerCoordinates = layout[controllerLevel]!.buildings.observer.pos;
    const powerSpawnCoordinates = layout[controllerLevel]!.buildings.powerSpawn.pos;
    const linkCoordinates = layout[controllerLevel]!.buildings.link.pos;
    const terminalCoordinates = layout[controllerLevel]!.buildings.terminal.pos;
    const towerCoordinates = layout[controllerLevel]!.buildings.tower.pos;
    const nukerCoordinates = layout[controllerLevel]!.buildings.nuker.pos;
    const storageCoordinates = layout[controllerLevel]!.buildings.storage.pos;
    const labCoordinates = layout[controllerLevel]!.buildings.lab.pos;

    this.buildBuildingType(anchor, spawnCoordinates, STRUCTURE_SPAWN, previewInsteadOfBuild, layout);
    if (GetRoomObjects.getRoomSpawns(Game.rooms[anchor.roomName], true).length === 0)
      // Don't build the other stuff while Spawn is not built yet
      return;
    this.buildBuildingType(anchor, roadCoordinates, STRUCTURE_ROAD, previewInsteadOfBuild, layout);
    Game.rooms[anchor.roomName].visual.connectRoads();
    this.buildBuildingType(anchor, extensionCoordinates, STRUCTURE_EXTENSION, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, wallCoordinates, STRUCTURE_WALL, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, rampartCoordinates, STRUCTURE_RAMPART, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, containerCoordinates, STRUCTURE_CONTAINER, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, observerCoordinates, STRUCTURE_OBSERVER, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, powerSpawnCoordinates, STRUCTURE_POWER_SPAWN, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, linkCoordinates, STRUCTURE_LINK, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, terminalCoordinates, STRUCTURE_TERMINAL, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, towerCoordinates, STRUCTURE_TOWER, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, nukerCoordinates, STRUCTURE_NUKER, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, storageCoordinates, STRUCTURE_STORAGE, previewInsteadOfBuild, layout);
    this.buildBuildingType(anchor, labCoordinates, STRUCTURE_LAB, previewInsteadOfBuild, layout);
  }

  private static buildBuildingType(
    anchor: RoomPosition,
    buildingsCoordinates: Coord[],
    constructionType: BuildableStructureConstant,
    previewInsteadOfBuild: boolean,
    layout: BaseLayout
  ) {
    buildingsCoordinates.forEach(function (coord) {
      const x = coord.x - layout.data.anchor.x + anchor.x;
      const y = coord.y - layout.data.anchor.y + anchor.y;
      if (previewInsteadOfBuild) {
        Game.rooms[anchor.roomName].visual.structure(x, y, constructionType);
      } else {
        if (Game.rooms[anchor.roomName].lookForAt(LOOK_TERRAIN, x, y)[0] !== "wall") {
          Game.rooms[anchor.roomName].createConstructionSite(x, y, constructionType);
        }
      }
    });
  }

  private static createWall(room: Room, previewInsteadOfBuild: boolean) {
    for (let i = 0; i < 50; i++) {
      const roomTerrain = Game.map.getRoomTerrain(room.name);
      if (roomTerrain.get(0, i) !== TERRAIN_MASK_WALL && roomTerrain.get(2, i) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, 2, i, STRUCTURE_WALL, previewInsteadOfBuild);
        this.createWallEdge(room, 2, i, previewInsteadOfBuild);
      }
      if (roomTerrain.get(49, i) !== TERRAIN_MASK_WALL && roomTerrain.get(47, i) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, 47, i, STRUCTURE_WALL, previewInsteadOfBuild);
        this.createWallEdge(room, 47, i, previewInsteadOfBuild);
      }
      if (roomTerrain.get(i, 0) !== TERRAIN_MASK_WALL && roomTerrain.get(i, 2) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, i, 2, STRUCTURE_WALL, previewInsteadOfBuild);
        this.createWallEdge(room, i, 2, previewInsteadOfBuild);
      }
      if (roomTerrain.get(i, 49) !== TERRAIN_MASK_WALL && roomTerrain.get(i, 47) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, i, 47, STRUCTURE_WALL, previewInsteadOfBuild);
        this.createWallEdge(room, i, 47, previewInsteadOfBuild);
      }
    }
  }

  private static createWallEdge(room: Room, x: number, y: number, previewInsteadOfBuild: boolean) {
    const terrainXToCheck = x !== 2 && x !== 47 ? x : x < 25 ? 0 : 49;
    const terrainYToCheck = y !== 2 && y !== 47 ? y : y < 25 ? 0 : 49;
    const xDirection = x === 2 ? 1 : x === 47 ? -1 : 0;
    const yDirection = y === 2 ? 1 : y === 47 ? -1 : 0;
    let xOffset = x === 2 || x === 47 ? 0 : -1;
    let yOffset = y === 2 || y === 47 ? 0 : -1;
    if (x === 47 && y === 47) {
      this.checkForStructureAndBuild(room, 48, 47, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 47, 48, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 48, 48, STRUCTURE_WALL, previewInsteadOfBuild);
    } else if (x === 2 && y === 2) {
      this.checkForStructureAndBuild(room, 2, 1, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 1, 2, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 1, 1, STRUCTURE_WALL, previewInsteadOfBuild);
    } else if (x === 47 && y === 2) {
      this.checkForStructureAndBuild(room, 47, 1, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 46, 2, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 47, 1, STRUCTURE_WALL, previewInsteadOfBuild);
    } else if (x === 2 && y === 47) {
      this.checkForStructureAndBuild(room, 2, 46, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 1, 47, STRUCTURE_WALL, previewInsteadOfBuild);
      this.checkForStructureAndBuild(room, 1, 46, STRUCTURE_WALL, previewInsteadOfBuild);
    } else {
      const roomTerrain = Game.map.getRoomTerrain(room.name);
      if (roomTerrain.get(terrainXToCheck + xOffset, terrainYToCheck + yOffset) === TERRAIN_MASK_WALL) {
        this.checkForStructureAndBuild(
          room,
          terrainXToCheck + 1 * xDirection + 2 * xOffset,
          terrainYToCheck + 1 * yDirection + 2 * yOffset,
          STRUCTURE_WALL,
          previewInsteadOfBuild
        );
        this.checkForStructureAndBuild(
          room,
          terrainXToCheck + 2 * xDirection + 2 * xOffset,
          terrainYToCheck + 2 * yDirection + 2 * yOffset,
          STRUCTURE_WALL,
          previewInsteadOfBuild
        );
        this.checkForStructureAndBuild(
          room,
          terrainXToCheck + 2 * xDirection + 1 * xOffset,
          terrainYToCheck + 2 * yDirection + 1 * yOffset,
          STRUCTURE_WALL,
          previewInsteadOfBuild
        );
      }
      xOffset = x === 2 || x === 47 ? 0 : 1;
      yOffset = y === 2 || y === 47 ? 0 : 1;
      if (roomTerrain.get(terrainXToCheck + xOffset, terrainYToCheck + yOffset) === TERRAIN_MASK_WALL) {
        this.checkForStructureAndBuild(
          room,
          terrainXToCheck + 1 * xDirection + 2 * xOffset,
          terrainYToCheck + 1 * yDirection + 2 * yOffset,
          STRUCTURE_WALL,
          previewInsteadOfBuild
        );
        this.checkForStructureAndBuild(
          room,
          terrainXToCheck + 2 * xDirection + 2 * xOffset,
          terrainYToCheck + 2 * yDirection + 2 * yOffset,
          STRUCTURE_WALL,
          previewInsteadOfBuild
        );
        this.checkForStructureAndBuild(
          room,
          terrainXToCheck + 2 * xDirection + 1 * xOffset,
          terrainYToCheck + 2 * yDirection + 1 * yOffset,
          STRUCTURE_WALL,
          previewInsteadOfBuild
        );
      }
    }
  }

  private static checkForStructureAndBuild(
    room: Room,
    x: number,
    y: number,
    build: BuildableStructureConstant,
    previewInsteadOfBuild: boolean
  ) {
    const roomTerrain = Game.map.getRoomTerrain(room.name);
    if (roomTerrain.get(x, y) !== TERRAIN_MASK_WALL)
      this.createConstructionSite(room, x, y, build, previewInsteadOfBuild);
  }

  private static createConstructionSite(
    room: Room,
    x: number,
    y: number,
    type: BuildableStructureConstant,
    previewInsteadOfBuild: boolean
  ) {
    const constructionRampart: RoomPosition[] = Helper.getCashedMemory("Construction-Rampart", []);
    if (
      constructionRampart.filter(obj => {
        return obj.roomName === room.name && obj.x === x && obj.y === y;
      }).length !== 0
    ) {
      if (type === STRUCTURE_WALL) {
        type = STRUCTURE_RAMPART;
      }
    }
    if (previewInsteadOfBuild) {
      room.visual.structure(x, y, type);
    } else {
      switch (type) {
        case STRUCTURE_WALL:
          room.createConstructionSite(x, y, STRUCTURE_WALL);
          break;
        case STRUCTURE_RAMPART:
          room.createConstructionSite(x, y, STRUCTURE_RAMPART);
          break;
      }
    }
  }

  /**
   * Uses DistanceTransform to score tiles by openness (distance from walls) and FloodFill from
   * the room's spawns to confirm reachability, then moves the AutoPlaceBase flag to the
   * highest-scored position. The flag is only auto-positioned once; remove and place it again
   * if you want to recompute the anchor.
   */
  public static autoPlaceConstructionFlag(flag: Flag, layout: BaseLayout, controllerLevel: number): void {
    if (flag.memory.autoPlaced || !flag.room) {
      return;
    }

    const room = flag.room;

    // Mark walls in the initial cost matrix (255 = obstacle)
    const initialCM = new PathFinder.CostMatrix();
    const terrain = room.getTerrain();
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
          initialCM.set(x, y, 255);
        }
      }
    }

    // Distance transform: high value = far from walls = open area
    const distanceCM = room.distanceTransform(initialCM, false);

    // Flood fill from spawns to determine reachability
    const spawns = GetRoomObjects.getRoomSpawns(room, true);
    const seeds: Coord[] = spawns.length > 0 ? spawns.map(s => ({ x: s.pos.x, y: s.pos.y })) : [{ x: 25, y: 25 }];
    const floodCM = room.floodFill(seeds);

    // Score each tile: maximise openness, penalise distance from spawn
    // Constrain candidate anchors so the full base footprint fits in the room.
    let bestScore = -1;
    let bestPos: Coord = seeds[0];
    const layoutSize = layout.data.size;
    const halfWidth = layoutSize ? Math.floor(layoutSize.x / 2) : 2;
    const halfHeight = layoutSize ? Math.floor(layoutSize.y / 2) : 2;
    const minX = Math.max(2, halfWidth);
    const maxX = Math.min(47, 49 - halfWidth);
    const minY = Math.max(2, halfHeight);
    const maxY = Math.min(47, 49 - halfHeight);

    const planner = layout[controllerLevel];
    if (!planner) {
      return;
    }

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const floodDepth = floodCM.get(x, y);
        if (floodDepth === 0) continue; // wall, seed tile, or unreachable

        const distScore = distanceCM.get(x, y);
        if (distScore === 0) continue; // immediately adjacent to a wall

        // Weight openness heavily; slightly prefer tiles closer to spawn
        const score = distScore * 100 - floodDepth;
        if (score > bestScore) {
          bestScore = score;
          bestPos = { x, y };
        }
      }
    }

    if (flag.pos.x !== bestPos.x || flag.pos.y !== bestPos.y || flag.pos.roomName !== room.name) {
      flag.setPosition(bestPos.x, bestPos.y);
    }

    flag.memory.autoPlaced = true;
  }
}
