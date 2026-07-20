import { BaseLayout, Coord } from "./BaseLayout";
import {
  layoutBunker,
  layoutFourWays,
  layoutReverseRooftop,
  layoutRooftop,
  layoutSieve,
  layoutUtility,
  layoutFixedExtension
} from "./Layout";
import { Helper } from "./../Helpers/Helper";
import { GetRoomObjects } from "./../Helpers/GetRoomObjects";
import "./DistanceTransform";
import "./FloodFill";

export { BaseBuildPlan, BaseBuildData };

interface BaseBuildPlan {
  flagName: string;
  x: number;
  y: number;
  secondaryColor: ColorConstant;
}

interface BaseBuildData {
  plans: BaseBuildPlan[];
  ramparts: Coord[];
}

// Flags: Primary - Secondary
// Layout construction via the Base flag
// WHITE - WHITE Preview Layout Sieve
// WHITE - GREY  Preview Layout Rooftop
// WHITE - BROWN Preview Layout Reverse/Rooftop
// WHITE - ORANGE Preview Layout FourWays
// WHITE - GREEN Preview Layout Bunker
// WHITE - CYAN  Preview Layout Utility
// WHITE - YELLOW  Preview Layout Fixed Extensions
// GREY  - WHITE Build Layout Sieve
// GREY  - GREY  Build Layout Rooftop
// GREY  - BROWN Build Layout Reverse/Rooftop
// GREY  - ORANGE Build Layout FourWays
// GREY  - GREEN Build Layout Bunker
// GREY  - CYAN  Build Layout Utility
// GREY  - YELLOW  Build Layout Fixed Extensions

// BROWN - WHITE Build Rampart instead of wall

// Base automatically chooses a good anchor using distance transform + flood fill,
// then repositions itself and uses its own colors for preview/build.

export class BaseBuilder {
  private static readonly BASE_BUILD_PLAN_KEY_PREFIX = "Base-Build-Plans-";

  public static storeBuildOptionInMemory(roomName?: string) {
    const rampartFlagsToRemove: string[] = [];

    for (const flagName in Game.flags) {
      const flag = Game.flags[flagName];
      if (roomName && flag.pos.roomName !== roomName) {
        continue;
      }

      switch (flag.color) {
        case COLOR_BROWN:
          switch (flag.secondaryColor) {
            case COLOR_WHITE:
              if (!flag.room) {
                break;
              }

              const roomName = flag.pos.roomName;
              const buildData = this.getBaseBuildData(roomName);
              const constructionRampart = buildData.ramparts;
              if (
                constructionRampart.filter(obj => {
                  return obj.x === flag.pos.x && obj.y === flag.pos.y;
                }).length === 0
              ) {
                constructionRampart.push({ x: flag.pos.x, y: flag.pos.y });
                buildData.ramparts = constructionRampart;
                this.setBaseBuildData(roomName, buildData);
              }

              rampartFlagsToRemove.push(flag.name);

              break;
          }
          break;
      }
    }

    for (const flagName of rampartFlagsToRemove) {
      if (Memory.flags) {
        delete Memory.flags[flagName];
      }

      const flag = Game.flags[flagName];
      if (flag) {
        flag.remove();
      }
    }
  }

  public static automaticFlagPlacement(room: Room) {
    if (!room.controller || room.controller.level < 2) return;
    const buildData = this.getBaseBuildData(room.name);
    if (buildData.plans.length > 0) return; // Don't auto-place if we already have plans
    const spawn = GetRoomObjects.getRoomSpawns(room, true)[0];
    if (!spawn) return; // Don't auto-place if we don't have a spawn yet
    // Place flag
    const flagName = "Base-Autoplaced";
    const flagPos = new RoomPosition(spawn.pos.x, spawn.pos.y - 2, room.name);
    if (!Game.flags[flagName]) {
      spawn.room.createFlag(flagPos, flagName, COLOR_GREY, COLOR_YELLOW);
    }
  }

  public static logicCreateConstructionSites() {
    const autoPlaceFlags = _.filter(Game.flags, flag => {
      return flag.name === "Base" || flag.name.startsWith("Base-");
    });

    BaseBuilder.writeLegend(autoPlaceFlags);

    for (const autoPlaceFlag of autoPlaceFlags) {
      if (!autoPlaceFlag.room) {
        continue;
      }

      const roomName = autoPlaceFlag.pos.roomName;
      const buildData = this.getBaseBuildData(roomName);
      const existingPlan = buildData.plans.find(plan => plan.flagName === autoPlaceFlag.name);
      const selectedSecondaryColor = existingPlan ? existingPlan.secondaryColor : autoPlaceFlag.secondaryColor;

      if (existingPlan && autoPlaceFlag.secondaryColor !== selectedSecondaryColor) {
        autoPlaceFlag.setColor(autoPlaceFlag.color, selectedSecondaryColor);
      }

      const controller = GetRoomObjects.getRoomController(autoPlaceFlag.room);
      const layoutToBeUsed = this.getBaseLayout(selectedSecondaryColor);

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

      let buildPlans = buildData.plans;

      if (autoPlaceFlag.color === COLOR_WHITE) {
        buildPlans = this.removeBuildPlansForFlag(buildPlans, autoPlaceFlag.name);
        buildData.plans = buildPlans;
        this.setBaseBuildData(roomName, buildData);

        const availablePreviewLevels = [8, 7, 6, 5, 4, 3, 2].filter(level => layoutToBeUsed[level] !== undefined);
        if (availablePreviewLevels.length === 0) {
          continue;
        }
        const level = availablePreviewLevels[0];

        this.buildBase(autoPlaceFlag.pos, layoutToBeUsed, level, true);
        this.createContainerRoadConnections(autoPlaceFlag.room, autoPlaceFlag.pos, layoutToBeUsed, level, true);
        this.createWall(Game.rooms[autoPlaceFlag.pos.roomName], true);
      } else if (autoPlaceFlag.color === COLOR_GREY) {
        // Persist minimal plan info and remove flag. Construction will continue from memory.
        buildPlans = this.upsertBuildPlan(buildPlans, {
          flagName: autoPlaceFlag.name,
          x: autoPlaceFlag.pos.x,
          y: autoPlaceFlag.pos.y,
          secondaryColor: selectedSecondaryColor
        });

        this.storeBuildOptionInMemory(roomName);

        const updatedBuildData = this.getBaseBuildData(roomName);
        updatedBuildData.plans = buildPlans;
        this.setBaseBuildData(roomName, updatedBuildData);

        delete Memory.flags[autoPlaceFlag.name];
        autoPlaceFlag.remove();
      }
    }

    const rooms = GetRoomObjects.getAllClaimedRooms();
    rooms.forEach(room => {
      this.executeBuildPlans(room.name, this.getBaseBuildData(room.name).plans);
      this.createExtensionsAroundSources(room);
    });

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

  private static writeLegend(autoPlaceFlags: Flag[]) {
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
  }

  public static getBaseBuildData(roomName: string): BaseBuildData {
    const cachedData = Helper.getCashedMemory(this.getBaseBuildPlanMemoryKey(roomName), {
      plans: [],
      ramparts: []
    });

    if (Array.isArray(cachedData)) {
      return {
        plans: cachedData as BaseBuildPlan[],
        ramparts: []
      };
    }

    return {
      plans: cachedData.plans || [],
      ramparts: cachedData.ramparts || []
    };
  }

  private static setBaseBuildData(roomName: string, buildData: BaseBuildData): void {
    Helper.setCashedMemory(this.getBaseBuildPlanMemoryKey(roomName), buildData);
  }

  private static upsertBuildPlan(buildPlans: BaseBuildPlan[], plan: BaseBuildPlan): BaseBuildPlan[] {
    const filtered = buildPlans.filter(existing => {
      return existing.flagName !== plan.flagName;
    });
    filtered.push(plan);
    return filtered;
  }

  private static removeBuildPlansForFlag(buildPlans: BaseBuildPlan[], flagName: string): BaseBuildPlan[] {
    return buildPlans.filter(plan => plan.flagName !== flagName);
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
        console.log(
          "No layout found for secondary color " + plan.secondaryColor + " and controller level " + controller.level
        );
        continue;
      }

      if (Game.time % 10 === 0 && _.filter(Game.creeps, creep => creep.room === room).length !== 0) {
        const anchor = new RoomPosition(plan.x, plan.y, roomName);

        // Construct only once every 10th tick
        this.buildBase(anchor, layoutToBeUsed, controller.level, false);
        this.createContainerRoadConnections(room, anchor, layoutToBeUsed, controller.level, false);
        if (controller.level >= 3 && Game.time % 1000 === 0) {
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
      case COLOR_YELLOW:
        return layoutFixedExtension;
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
      { text: "CYAN   -> Utility", color: "#00ffff" },
      { text: "YELLOW -> Fixed Extensions", color: "#ffff00" },
      { text: "Rampart: BROWN/WHITE", color: "#d2b48c" }
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
    if (GetRoomObjects.getRoomSpawns(Game.rooms[anchor.roomName], true).length === 0 && !previewInsteadOfBuild) return; // Don't build the other stuff while Spawn is not built yet

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
    if (controllerLevel < 4) return;

    const roadCoordinates = planner.buildings.road.pos;
    if (roadCoordinates.length === 0) {
      return;
    }

    const roadGoals = roadCoordinates
      .map(coord => {
        const x = coord.x - layout.data.anchor.x + anchor.x;
        const y = coord.y - layout.data.anchor.y + anchor.y;
        if (x < 0 || x > 49 || y < 0 || y > 49) return null;
        return { pos: new RoomPosition(x, y, room.name), range: 0 };
      })
      .filter(goal => goal !== null) as { pos: RoomPosition; range: number }[];

    const containerPositions: RoomPosition[] = [];
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
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

      if (roadGoals.length === 0) {
        return;
      }

      const nearestGoal = roadGoals.reduce((best, current) => {
        return pos.getRangeTo(current.pos) < pos.getRangeTo(best.pos) ? current : best;
      }, roadGoals[0]);

      Helper.createRoadBetweenPoints(pos, nearestGoal.pos, previewInsteadOfBuild, {
        goalRange: 0,
        maxOps: 4000,
        maxRooms: 1,
        allowedRoomNames: [room.name]
      });
    });
  }

  private static createWall(room: Room, previewInsteadOfBuild: boolean) {
    for (let i = 0; i < 50; i++) {
      const roomTerrain = Game.map.getRoomTerrain(room.name);
      const buildingType = i % 3 === 0 ? STRUCTURE_RAMPART : STRUCTURE_WALL;
      if (roomTerrain.get(0, i) !== TERRAIN_MASK_WALL && roomTerrain.get(2, i) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, 2, i, buildingType, previewInsteadOfBuild);
        this.createWallEdge(room, 2, i, previewInsteadOfBuild);
      }
      if (roomTerrain.get(49, i) !== TERRAIN_MASK_WALL && roomTerrain.get(47, i) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, 47, i, buildingType, previewInsteadOfBuild);
        this.createWallEdge(room, 47, i, previewInsteadOfBuild);
      }
      if (roomTerrain.get(i, 0) !== TERRAIN_MASK_WALL && roomTerrain.get(i, 2) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, i, 2, buildingType, previewInsteadOfBuild);
        this.createWallEdge(room, i, 2, previewInsteadOfBuild);
      }
      if (roomTerrain.get(i, 49) !== TERRAIN_MASK_WALL && roomTerrain.get(i, 47) !== TERRAIN_MASK_WALL) {
        this.createConstructionSite(room, i, 47, buildingType, previewInsteadOfBuild);
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
    if (roomTerrain.get(x, y) !== TERRAIN_MASK_WALL && !this.isDeadEndWall(room, x, y)) {
      this.createConstructionSite(room, x, y, build, previewInsteadOfBuild);
    }
  }

  private static isDeadEndWall(room: Room, x: number, y: number): boolean {
    if (!room.controller) return false;
    if (x === 48 || x === 1 || y === 48 || y === 1) return false;
    x = x === 47 ? 46 : x;
    x = x === 2 ? 3 : x;
    y = y === 47 ? 46 : y;
    y = y === 2 ? 3 : y;
    const controllerPath = PathFinder.search(
      new RoomPosition(x, y, room.name),
      { pos: room.controller.pos, range: 1 },
      {
        roomCallback: roomName => {
          const room = Game.rooms[roomName];
          if (!room) return false;

          const costs = new PathFinder.CostMatrix();

          // Avoid where we place walls
          for (let i = 2; i <= 47; i++) {
            costs.set(2, i, 255);
            costs.set(47, i, 255);
            costs.set(i, 2, 255);
            costs.set(i, 47, 255);
          }

          return costs;
        }
      }
    );
    // Enable this for debugging dead-end wall placement. It will draw the path to the controller and indicate whether it is reachable or not.
    // room.visual.circle(x, y, { fill: "transparent", radius: 0.4, stroke: "#bfe70b" });
    // for (const path of controllerPath.path) {
    //   room.visual.circle(path.x, path.y, { fill: "transparent", radius: 0.4, stroke: "#ff0000" });
    // }
    // if (controllerPath.incomplete) {
    //   room.visual.text("Dead End Found", room.controller.pos.x, room.controller.pos.y, {
    //     color: "#ff0000",
    //     font: 0.5
    //   });
    // } else {
    //   room.visual.text("Controller can be reached", room.controller.pos.x, room.controller.pos.y, {
    //     color: "#11a11d",
    //     font: 0.5
    //   });
    // }
    return controllerPath.incomplete;
  }

  private static createConstructionSite(
    room: Room,
    x: number,
    y: number,
    type: BuildableStructureConstant,
    previewInsteadOfBuild: boolean
  ) {
    const existingStructure = room.lookForAt(LOOK_STRUCTURES, x, y)[0];
    if (existingStructure) return;
    const existingConstructionSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)[0];
    if (existingConstructionSite) return;
    const constructionRampart = this.getBaseBuildData(room.name).ramparts;
    if (
      constructionRampart.filter(obj => {
        return obj.x === x && obj.y === y;
      }).length !== 0
    ) {
      if (type === STRUCTURE_WALL) {
        type = STRUCTURE_RAMPART;
      }
    }
    if (previewInsteadOfBuild) {
      (room.visual as any).structure(x, y, type);
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
    if (!flag.room) {
      return true;
    }

    const room = flag.room;

    const existingPlan = this.getBaseBuildData(room.name).plans.find(plan => plan.flagName === flag.name);
    if (existingPlan) {
      if (flag.pos.x !== existingPlan.x || flag.pos.y !== existingPlan.y || flag.pos.roomName !== room.name) {
        flag.setPosition(existingPlan.x, existingPlan.y);
      }
      flag.memory.baseBuilder.autoPlaced = true;
      return true;
    }

    if (flag.memory.baseBuilder.autoPlaced) {
      return true;
    }

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

  private static createExtensionsAroundSources(room: Room) {
    if (!room.controller || room.controller.level < 3) return;
    const currentExtensionsUnderConstruction = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_EXTENSION
    });
    if (currentExtensionsUnderConstruction.length > 0) return;
    const sources = room.find(FIND_SOURCES);
    for (const source of sources) {
      const container = GetRoomObjects.getWithinRangeContainer(source.pos, 1);
      if (!container) continue;
      const surroundingPositions = Helper.getWalkableAdjacentPositions(container.pos);
      let roadFromContainerPos = GetRoomObjects.getWithinRangeStructures(container.pos, 1, STRUCTURE_ROAD)[0]?.pos;
      if (!roadFromContainerPos) {
        roadFromContainerPos = GetRoomObjects.getXStepTowardsSpawn(container.pos, 1);
      }
      let linkNextToSourcePos = GetRoomObjects.getWithinRangeLink(source.pos, 2)?.pos;
      if (!linkNextToSourcePos) {
        linkNextToSourcePos = surroundingPositions.filter(
          pos => roadFromContainerPos && !Helper.isSamePosition(pos, roadFromContainerPos)
        )[0];
      }

      for (const pos of surroundingPositions) {
        if (linkNextToSourcePos && pos.isEqualTo(linkNextToSourcePos)) continue;
        if (roadFromContainerPos && pos.isEqualTo(roadFromContainerPos)) continue;
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
        return; // Create just one per tick
      }
    }
  }
}
