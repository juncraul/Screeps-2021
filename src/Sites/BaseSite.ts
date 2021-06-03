import { Helper } from "Helper";
import { CreepBase } from "../CreepBase";

export default class SourceSite {
  memoryType: string;
  siteId: string;

  constructor(memoryType: string, siteId: string) {
    this.memoryType = memoryType;
    this.siteId = siteId;
  }

  getCreepsAssignedToThisSite(): CreepBase[] {
    let creepsNames: string[] = Helper.getCashedMemory(`${this.memoryType}-${this.siteId}`, []);
    let creeps: CreepBase[] = [];
    for (let i: number = creepsNames.length - 1; i >= 0; i--) {
      let creep: Creep | null = Game.creeps[creepsNames[i]];
      if (creep && creep.hits > 0) {
        creeps.push(new CreepBase(creep));
      } else {
        //Clean up any dead creeps.
        creepsNames.splice(i, 1);
      }
    }
    Helper.setCashedMemory(`${this.memoryType}-${this.siteId}`, creepsNames);
    return creeps;
  }
}
