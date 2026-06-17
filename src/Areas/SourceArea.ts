import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import HarvestArea from "./HarvestArea";

export default class SourceArea extends HarvestArea {
  source: Source;
  linkNextToSource: StructureLink | null;
  linkConstructionSiteNextToSource: ConstructionSite | null;
  linksForDeposits: StructureLink[];

  constructor(source: Source, controller: StructureController) {
    super("SourceArea", source.id, source.pos, controller);
    this.source = source;
    this.linkConstructionSiteNextToSource = GetRoomObjects.getWithinRangeConstructionSite(
      source.pos,
      1,
      STRUCTURE_LINK
    );
    this.linkNextToSource = GetRoomObjects.getWithinRangeLink(source.pos, 2);
    this.linksForDeposits = this.populateLinksForDeposits();
  }

  public handleThisArea() {
    super.handleThisArea();
    this.handleLinks();
  }

  protected handleSetup() {
    super.handleSetup();

    // After controller level 5, we want to build links next to the source
    if (this.controllerLevel >= 5) {
      if (!this.linkNextToSource && !this.linkConstructionSiteNextToSource && this.containerNextToHarvestArea) {
        const positionForLink = Helper.getFreeAdjacentPositions(this.containerNextToHarvestArea.pos, this.room)[0];
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
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToHarvestArea.pos));
        }
      } else {
        // When we are not full or partial full
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
            this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos));
          }
        }
      }
    }
  }

  private handleLinks() {
    if (!this.linkNextToSource || this.linkNextToSource.store.energy !== 800) return;
    for (let i = 0; i < this.linksForDeposits.length; i++) {
      if (this.linksForDeposits[i].store.energy > 300) continue;
      this.linkNextToSource.transferEnergy(this.linksForDeposits[i]);
      break;
    }
  }

  private populateLinksForDeposits(): StructureLink[] {
    const links: StructureLink[] = [];
    const spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    const storage = GetRoomObjects.getRoomStorage(this.room);
    let potentialLink: StructureLink | null;
    if (spawn) {
      potentialLink = GetRoomObjects.getWithinRangeLink(spawn.pos, 4);
      if (potentialLink) {
        links.push(potentialLink);
      }
    }
    if (storage) {
      potentialLink = GetRoomObjects.getWithinRangeLink(storage.pos, 4);
      if (potentialLink) {
        links.push(potentialLink);
      }
    }
    if (this.room.controller) {
      potentialLink = GetRoomObjects.getWithinRangeLink(this.room.controller.pos, 4);
      if (potentialLink) {
        links.push(potentialLink);
      }
    }
    return links;
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
    return new SpawnTask(SpawnType.Harvester, this.source.id, "Harvester", bodyPartConstants, this);
  }

  protected doWeNeedToReplaceWeakCreep(): boolean {
    return super.doWeNeedToReplaceWeakCreep();
  }
}
