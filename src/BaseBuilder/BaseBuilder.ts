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

interface BaseBuildPlan {
  x: number;
  y: number;
  secondaryColor: ColorConstant;
}

// Flags: Primary - Secondary
// Layout construction via the Base flag
// WHITE - WHITE Preview Layout Sieve
// WHITE - GREY  Preview Layout Rooftop
// WHITE - BROWN Preview Layout Reverse/Rooftop
// WHITE - ORANGE Preview Layout FourWays
// WHITE - GREEN Preview Layout Bunker
// WHITE - CYAN  Preview Layout Utility
// GREY  - WHITE Build Layout Sieve
// GREY  - GREY  Build Layout Rooftop
// GREY  - BROWN Build Layout Reverse/Rooftop
// GREY  - ORANGE Build Layout FourWays
// GREY  - GREEN Build Layout Bunker
// GREY  - CYAN  Build Layout Utility

// BROWN - WHITE Build Rampart instead of wall

// Base automatically chooses a good anchor using distance transform + flood fill,
// then repositions itself and uses its own colors for preview/build.

export class BaseBuilder {
  private static readonly BASE_BUILD_PLAN_KEY_PREFIX = "Base-Build-Plans-";

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
    const autoPlaceFlags = _.filter(Game.flags, flag => {
      return flag.name === "Base" || flag.name.startsWith("Base-");
    });

    const infoRooms = new Set<string>();
    autoPlaceFlags.forEach(flag => {
      if (flag.room) {
        infoRooms.add(flag.room.name);
      }
    });
    infoRooms.forEach(roomName => {
      const room = Game.rooms[roomName];
      if (room) {
        this.drawBaseFlagInfo(room);
      }
    });

    for (const autoPlaceFlag of autoPlaceFlags) {
      if (!autoPlaceFlag.room) {
        continue;
      }

      const controller = GetRoomObjects.getRoomController(autoPlaceFlag.room);
      const layoutToBeUsed = this.getBaseLayout(autoPlaceFlag.secondaryColor);

      if (!controller) {
        console.log("BaseBuilder: No controller found in the room of the Base flag.");
        continue;
      }
      if (!layoutToBeUsed) {
        continue;
      }

      let autoPlaceLevel = controller.level;
      if (!layoutToBeUsed[autoPlaceLevel]) {
        const fallbackLevel = [8, 7, 6, 5, 4, 3, 2].find(level => layoutToBeUsed[level]);
        if (!fallbackLevel) {
          continue;
        }
        autoPlaceLevel = fallbackLevel;
      }

      const canPlaceThisLayout = this.autoPlaceConstructionFlag(autoPlaceFlag, layoutToBeUsed, autoPlaceLevel);
      if (!canPlaceThisLayout) {
        continue;
      }

      const roomName = autoPlaceFlag.pos.roomName;
      let buildPlans = this.getBaseBuildPlans(roomName);

      if (autoPlaceFlag.color === COLOR_WHITE) {
        buildPlans = this.removeBuildPlansForLayout(buildPlans, autoPlaceFlag.secondaryColor);
        this.setBaseBuildPlans(roomName, buildPlans);

        const availablePreviewLevels = [2, 3, 4, 5, 6, 7].filter(level => layoutToBeUsed[level] !== undefined);
        if (availablePreviewLevels.length === 0) {
          continue;
        }
        const level = availablePreviewLevels[Game.time % availablePreviewLevels.length];

        this.buildBase(autoPlaceFlag.pos, layoutToBeUsed, level, true);
        this.createContainerRoadConnections(autoPlaceFlag.room, autoPlaceFlag.pos, layoutToBeUsed, level, true);
        this.createWall(Game.rooms[autoPlaceFlag.pos.roomName], true);
      } else if (autoPlaceFlag.color === COLOR_GREY) {
        // Persist minimal plan info and remove flag. Construction will continue from memory.
        buildPlans = this.upsertBuildPlan(buildPlans, {
          x: autoPlaceFlag.pos.x,
          y: autoPlaceFlag.pos.y,
          secondaryColor: autoPlaceFlag.secondaryColor
        });
        this.setBaseBuildPlans(roomName, buildPlans);

        delete Memory.flags[autoPlaceFlag.name];
        autoPlaceFlag.remove();
      }
    }

    for (const roomName in Game.rooms) {
      this.executeBuildPlans(roomName, this.getBaseBuildPlans(roomName));
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

  private static getBaseBuildPlans(roomName: string): BaseBuildPlan[] {
    return Helper.getCashedMemory(this.getBaseBuildPlanMemoryKey(roomName), []);
  }

  private static setBaseBuildPlans(roomName: string, buildPlans: BaseBuildPlan[]): void {
    Helper.setCashedMemory(this.getBaseBuildPlanMemoryKey(roomName), buildPlans);
  }

  private static upsertBuildPlan(buildPlans: BaseBuildPlan[], plan: BaseBuildPlan): BaseBuildPlan[] {
    const filtered = buildPlans.filter(existing => {
      return existing.secondaryColor !== plan.secondaryColor;
    });
    filtered.push(plan);
    return filtered;
  }

  private static removeBuildPlansForLayout(
    buildPlans: BaseBuildPlan[],
    secondaryColor: ColorConstant
  ): BaseBuildPlan[] {
    return buildPlans.filter(plan => plan.secondaryColor !== secondaryColor);
  }

  private static executeBuildPlans(roomName: string, buildPlans: BaseBuildPlan[]): void {
    if (buildPlans.length === 0) {
      return;
    }

    const room = Game.rooms[roomName];
    if (!room) {
      return;
    }

    const controller = GetRoomObjects.getRoomController(room);
    if (!controller) {
      return;
    }

    for (const plan of buildPlans) {
      const layoutToBeUsed = this.getBaseLayout(plan.secondaryColor);
      if (!layoutToBeUsed || !layoutToBeUsed[controller.level]) {
        continue;
      }

      if (Game.time % 10 === 0 && _.filter(Game.creeps, creep => creep.room === room).length !== 0) {
        const anchor = new RoomPosition(plan.x, plan.y, roomName);

        // Construct only once every 10th tick
        this.buildBase(anchor, layoutToBeUsed, controller.level, false);
        this.createContainerRoadConnections(room, anchor, layoutToBeUsed, controller.level, false);
        if (controller.level >= 3) {
          // Build walls only if the controller is at least level 3 because that's when we can build Cannons.
          this.createWall(room, false);
        }
      }
    }
  }

  private static getBaseBuildPlanMemoryKey(roomName: string): string {
    return this.BASE_BUILD_PLAN_KEY_PREFIX + roomName;
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
      case COLOR_CYAN:
        return layoutUtility;
      default:
        return null;
    }
  }

  private static drawBaseFlagInfo(room: Room): void {
    const lines: { text: string; color: string }[] = [
      { text: "Base Layouts", color: "#ffffff" },
      { text: "Primary: WHITE=Preview", color: "#ffffff" },
      { text: "Primary: GREY=Build", color: "#ffffff" },
      { text: "WHITE  -> Sieve", color: "#ffffff" },
      { text: "GREY   -> Rooftop", color: "#a0a0a0" },
      { text: "BROWN  -> Reverse Rooftop", color: "#8b4513" },
      { text: "ORANGE -> FourWays", color: "#ffa500" },
      { text: "GREEN  -> Bunker", color: "#00ff00" },
      { text: "CYAN   -> Utility", color: "#00ffff" }
    ];

    const startX = 1;
    const startY = 1;
    for (let i = 0; i < lines.length; i++) {
      room.visual.text(lines[i].text, startX, startY + i, {
        align: "left",
        color: lines[i].color,
        backgroundColor: "#000000",
        opacity: 0.7,
        font: 0.7
      });
    }
  }

  private static buildBase(
    anchor: RoomPosition,
    layout: BaseLayout,
    controllerLevel: number,
    previewInsteadOfBuild: boolean
  ) {
    if (previewInsteadOfBuild) {
      Game.rooms[anchor.roomName].visual.text(`RCL ${controllerLevel}`, anchor.x + 2, anchor.y, {
        color: "#ffffff",
        font: 0.5
      });
    }

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

  /**
   * Connect all room containers to the nearest tile of the base road network using shortest paths.
   */
  private static createContainerRoadConnections(
    room: Room,
    anchor: RoomPosition,
    layout: BaseLayout,
    controllerLevel: number,
    previewInsteadOfBuild: boolean
  ): void {
    const planner = layout[controllerLevel];
    if (!planner) {
      return;
    }

    const roadCoordinates = planner.buildings.road.pos;
    if (roadCoordinates.length === 0) {
      return;
    }

    const roadGoals = roadCoordinates.map(coord => {
      const x = coord.x - layout.data.anchor.x + anchor.x;
      const y = coord.y - layout.data.anchor.y + anchor.y;
      return { pos: new RoomPosition(x, y, room.name), range: 0 };
    });

    const containerPositions: RoomPosition[] = [];
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    }) as StructureContainer[];
    containers.forEach(container => containerPositions.push(container.pos));

    const containerSites = room.find(FIND_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER
    });
    containerSites.forEach(site => containerPositions.push(site.pos));

    const seen = new Set<string>();
    containerPositions.forEach(pos => {
      const posKey = `${pos.x}:${pos.y}`;
      if (seen.has(posKey)) {
        return;
      }
      seen.add(posKey);

      const search = PathFinder.search(pos, roadGoals, {
        maxOps: 4000,
        roomCallback: roomName => {
          if (roomName !== room.name) {
            return false;
          }

          const costs = new PathFinder.CostMatrix();
          const terrain = Game.map.getRoomTerrain(roomName);

          for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
              if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costs.set(x, y, 255);
              }
            }
          }

          room.find(FIND_STRUCTURES).forEach(structure => {
            if (structure.structureType === STRUCTURE_ROAD) {
              costs.set(structure.pos.x, structure.pos.y, 1);
            } else if (
              structure.structureType !== STRUCTURE_CONTAINER &&
              (structure.structureType !== STRUCTURE_RAMPART || !structure.my)
            ) {
              costs.set(structure.pos.x, structure.pos.y, 255);
            }
          });

          room.find(FIND_CONSTRUCTION_SITES).forEach(site => {
            if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER) {
              costs.set(site.pos.x, site.pos.y, 255);
            }
          });

          roadGoals.forEach(goal => costs.set(goal.pos.x, goal.pos.y, 1));

          return costs;
        }
      });

      if (search.incomplete) {
        return;
      }

      search.path.forEach((step, index) => {
        if (index === 0) {
          return;
        }

        if (previewInsteadOfBuild) {
          room.visual.structure(step.x, step.y, STRUCTURE_ROAD);
          return;
        }

        const existingRoad = step
          .lookFor(LOOK_STRUCTURES)
          .some(structure => structure.structureType === STRUCTURE_ROAD);
        const roadSite = step.lookFor(LOOK_CONSTRUCTION_SITES).some(site => site.structureType === STRUCTURE_ROAD);

        if (!existingRoad && !roadSite) {
          room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
        }
      });
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
   * the room's spawns to confirm reachability, then moves the Base flag to the
   * highest-scored position. The flag is only auto-positioned once; remove and place it again
   * if you want to recompute the anchor.
   */
  public static autoPlaceConstructionFlag(flag: Flag, layout: BaseLayout, controllerLevel: number): boolean {
    flag.memory.baseBuilder = flag.memory.baseBuilder || {};
    if (flag.memory.baseBuilder.autoPlaced || !flag.room) {
      return true;
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
    const maxFootprint = layoutSize ? Math.max(layoutSize.x, layoutSize.y) : 5;
    const requiredDistance = Math.ceil(maxFootprint / 2);
    const minX = Math.max(2, halfWidth);
    const maxX = Math.min(47, 49 - halfWidth);
    const minY = Math.max(2, halfHeight);
    const maxY = Math.min(47, 49 - halfHeight);

    if (minX > maxX || minY > maxY) {
      return false;
    }

    const planner = layout[controllerLevel];
    if (!planner) {
      return false;
    }

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const floodDepth = floodCM.get(x, y);
        if (floodDepth === 0) continue; // wall, seed tile, or unreachable

        const distScore = distanceCM.get(x, y);
        if (distScore < requiredDistance) continue; // footprint would overlap nearby terrain walls

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

    flag.memory.baseBuilder.autoPlaced = true;
    return true;
  }
}
