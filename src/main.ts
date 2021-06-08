import { ErrorMapper } from "utils/ErrorMapper";
import Overseer from "Overseer";
import { CreepBase } from "CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import './Prototypes/RoomVisual'; // Prototypes used in Visualizer class

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  let overseer: Overseer = new Overseer;
  overseer.refresh();

  GetRoomObjects.getAllMyCreeps().forEach(creep => {
    let creepBase: CreepBase = new CreepBase(creep);
    creepBase.workTheTask();
  });

});
