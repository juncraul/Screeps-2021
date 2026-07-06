import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import HarvestArea from "./HarvestArea";
import BaseRoomStats from "./BaseRoomStats";

export default class SourceArea extends HarvestArea {
  source: Source;
  controller: StructureController;
  linkNextToSource: StructureLink | null;
  linkConstructionSiteNextToSource: ConstructionSite | null;
  linkForStorage: StructureLink | null;

  constructor(source: Source, controller: StructureController) {
    super("SourceArea", source.id, source.pos, controller);
    this.source = source;
    this.controller = controller;
    this.linkConstructionSiteNextToSource = GetRoomObjects.getWithinRangeConstructionSite(
      source.pos,
      1,
      STRUCTURE_LINK
    );
    this.linkNextToSource = GetRoomObjects.getWithinRangeLink(source.pos, 2);
    this.linkForStorage = this.populateLinkStorage();
  }

  public handleThisArea() {
    super.handleThisArea();
    this.handleLinks();
  }

  protected handleSetup() {
    super.handleSetup();

    if (this.controllerLevel < 5) {
      return;
    }

    const sourcesInRoom = this.room.find(FIND_SOURCES);
    const linksNextToSourcesInRoom = sourcesInRoom
      .map(source => GetRoomObjects.getWithinRangeLink(source.pos, 2))
      .filter(link => link !== null) as StructureLink[];

    const linksConstructionSitesNextToSource = GetRoomObjects.getWithinRangeConstructionSites(
      this.source.pos,
      2,
      STRUCTURE_LINK
    );

    if (!this.linkNextToSource && !this.linkConstructionSiteNextToSource && this.containerNextToHarvestArea) {
      const canCreateLink =
        this.controllerLevel >= 7 || // At level 7 we can create another link at the second source, the link for level 6 is for the controller.
        (this.controllerLevel <= 6 && // At level 5/6 we create only one link at the source and one at the base.
          linksNextToSourcesInRoom.length + linksConstructionSitesNextToSource.length < 1 &&
          this.isFurthestSourceInRoom());

      if (canCreateLink) {
        const positionForLink = Helper.getFreeAdjacentPositions(this.containerNextToHarvestArea.pos)[0];
        if (positionForLink) {
          this.room.createConstructionSite(positionForLink, STRUCTURE_LINK);
        } else {
          console.log("SourceArea: No position for link next to source");
        }
      }
    }
  }

  protected handleCreeps() {
    for (let i = 0; i < this.creeps.length; i++) {
      if (!this.creeps[i].isFree()) continue;

      if (this.creeps[i].isFull()) {
        if (this.containerConstructionSiteNextToHarvestArea) {
          this.creeps[i].addTask(
            new CreepTask(Activity.Construct, this.containerConstructionSiteNextToHarvestArea.pos)
          );
        }
        if (this.containerNextToHarvestArea) {
          if (this.containerNextToHarvestArea.store.getFreeCapacity() > 0) {
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToHarvestArea.pos));
          } else {
            this.creeps[i].addTask(new CreepTask(Activity.Drop, this.containerNextToHarvestArea.pos));
          }
        }
      } else {
        if (this.containerConstructionSiteNextToHarvestArea) {
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos));
        } else if (this.linkNextToSource && this.containerNextToHarvestArea) {
          if (!Helper.isSamePosition(this.containerNextToHarvestArea.pos, this.creeps[i].pos)) {
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToHarvestArea.pos));
          } else {
            this.creeps[i].addTask(
              new CreepTask(Activity.HarvestAndDeposit, this.source.pos, this.linkNextToSource.pos)
            );
          }
        } else if (this.containerNextToHarvestArea) {
          if (!Helper.isSamePosition(this.containerNextToHarvestArea.pos, this.creeps[i].pos)) {
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToHarvestArea.pos));
          } else {
            this.creeps[i].addTask(new CreepTask(Activity.HarvestAndDeposit, this.source.pos));
          }
        }
      }
    }
  }

  private handleLinks() {
    if (!this.linkNextToSource || this.linkNextToSource.store.energy !== 800) return;

    const linkForController = GetRoomObjects.getWithinRangeLink(this.controller.pos, 2);
    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (
      linkForController &&
      linkForController.store.energy <= 100 &&
      ((storage && storage.store.energy > 30000) || !storage)
    ) {
      const energyBefore = this.linkNextToSource.store.getUsedCapacity(RESOURCE_ENERGY);
      const result = this.linkNextToSource.transferEnergy(linkForController);
      if (result === OK) {
        const spentEnergy = Math.max(0, energyBefore - this.linkNextToSource.store.getUsedCapacity(RESOURCE_ENERGY));
        BaseRoomStats.addSpent(this.room.name, spentEnergy, "linkTransfer:controllerLink");
      }
      return;
    }

    if (this.linkForStorage && this.linkForStorage.store.energy <= 100) {
      const energyBefore = this.linkNextToSource.store.getUsedCapacity(RESOURCE_ENERGY);
      const result = this.linkNextToSource.transferEnergy(this.linkForStorage);
      if (result === OK) {
        const spentEnergy = Math.max(0, energyBefore - this.linkNextToSource.store.getUsedCapacity(RESOURCE_ENERGY));
        BaseRoomStats.addSpent(this.room.name, spentEnergy, "linkTransfer:storageLink");
      }
      return;
    }
  }

  private isFurthestSourceInRoom(): boolean {
    const sources = this.room.find(FIND_SOURCES);
    if (sources.length === 0) {
      return false;
    }

    const spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    const thisSourceDistance = this.source.pos.getRangeTo(spawn.pos);
    let furthestDistance = -1;
    let furthestSourceId = "";

    for (const source of sources) {
      const distance = source.pos.getRangeTo(spawn.pos);
      if (distance > furthestDistance || (distance === furthestDistance && source.id < furthestSourceId)) {
        furthestDistance = distance;
        furthestSourceId = source.id;
      }
    }

    return thisSourceDistance === furthestDistance && this.source.id === furthestSourceId;
  }

  private populateLinkStorage(): StructureLink | null {
    const spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    const storage = GetRoomObjects.getRoomStorage(this.room);
    let potentialLink: StructureLink | null;
    if (spawn) {
      potentialLink = GetRoomObjects.getWithinRangeLink(spawn.pos, 4);
      if (potentialLink) {
        return potentialLink;
      }
    }
    if (storage) {
      potentialLink = GetRoomObjects.getWithinRangeLink(storage.pos, 4);
      if (potentialLink) {
        return potentialLink;
      }
    }
    if (this.room.controller) {
      potentialLink = GetRoomObjects.getWithinRangeLink(this.room.controller.pos, 4);
      if (potentialLink) {
        return potentialLink;
      }
    }
    return null;
  }

  protected createCreepForThisArea(): SpawnTask | null {
    let bodyPartConstants: BodyPartConstant[] = [];
    const buildCheapestCreep = this.creeps.length === 0 || !this.hasCarryCreepsInRoom(); // We might get in a deadend where resources will never be more available.
    if (this.linkNextToSource) {
      if (buildCheapestCreep && this.room.energyAvailable < 700) {
        bodyPartConstants = [WORK, MOVE, CARRY];
      } else {
        // 5 X Work; 3 X Move; 1 X Carry. 700 Ene. Walk time empty/full: plain=2/2 road=1/1 swamp=9/10
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY];
      }
    } else if (this.containerNextToHarvestArea) {
      let segments = Math.floor(this.room.energyCapacityAvailable / 150); // Work-100; Move-50
      segments = buildCheapestCreep ? Math.floor(this.room.energyAvailable / 150) : segments;
      if (segments < 2) {
        console.log("SourceArea, containerNextToSource: Something wrong with room capacity");
      } else if (segments === 2) {
        // 300 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE];
      } else if (segments === 3) {
        // 450 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE];
      } else if (segments === 4) {
        // 600 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE];
      } else if (segments >= 5) {
        // 800 energy - This is the ideal creep with 10 energy collected per tick, enough for source refresh.
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE];
      }
      if (GetRoomObjects.getWithinRangeExtensions(this.containerNextToHarvestArea.pos, 1).length > 0) {
        bodyPartConstants.push(CARRY); // If we have extensions next to the container, we can add a carry part to the creep to help with energy transfer.
      }
    } else {
      let segments = Math.floor(this.room.energyCapacityAvailable / 200); // Work-100; Move-50; Carry-50
      segments = buildCheapestCreep ? Math.floor(this.room.energyAvailable / 200) : segments;
      if (segments === 1) {
        // 200 energy
        bodyPartConstants = [WORK, MOVE, CARRY];
      } else if (segments === 2) {
        // 400 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE, CARRY, CARRY];
      } else if (segments === 3) {
        // 600 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY];
      } else if (segments >= 4) {
        // 800 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY];
      }
    }
    return new SpawnTask(CreepType.Harvester, this.source.id, bodyPartConstants, this);
  }

  protected doWeNeedToReplaceWeakCreep(): boolean {
    return super.doWeNeedToReplaceWeakCreep();
  }
}
