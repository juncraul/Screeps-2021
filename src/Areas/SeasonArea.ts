import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

const SEASON_AREA_ID = "SeasonArea-Global";

/**
 * A score object that appears randomly in rooms during Season 10. Move a creep onto the same tile to automatically collect it
 * — the score value is credited to the creep's owner and the object disappears.
 *
 * Spawn interval: Every 250 game ticks per room (with 1% chance)
 * Score amount: 500–2500 (common) / 3500–6500 (uncommon) / 8500–11500 (rare)
 * Decay: 100–5000 ticks after spawn
 * Collection: Automatic — move a creep onto the same tile
 */

export default class SeasonArea extends BaseArea {
  scores: Score[];

  constructor() {
    super(
      "SeasonArea",
      SEASON_AREA_ID,
      new RoomPosition(25, 25, Object.keys(Game.rooms)[0]),
      Game.rooms[Object.keys(Game.rooms)[0]]
    );
    this.scores = this.findAllScores();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];

    // One collector per unassigned score.
    const assignedKeys = this.creeps.map(creep => {
      const tp = creep.memory.task?.targetPlace as ICreepTask["targetPlace"] | undefined;
      return tp ? `${String(tp.x)}:${String(tp.y)}:${String(tp.roomName)}` : null;
    });

    for (const score of this.scores) {
      const key = `${score.pos.x}:${score.pos.y}:${score.pos.roomName}`;
      if (!assignedKeys.includes(key)) {
        const task = this.createCreepForThisArea();
        if (task) {
          tasksForThisArea.push(task);
        }
        break; // spawn one per tick maximum
      }
    }

    return tasksForThisArea;
  }

  public handleThisArea(): void {
    for (let i = this.creeps.length - 1; i >= 0; i--) {
      const creep = this.creeps[i];
      if (!creep.isFree()) {
        continue;
      }

      // Find the highest-scoring Score in the same room as the creep.
      const target = this.findBestScoreInRoom(creep.pos.roomName);
      if (!target) {
        continue;
      }

      if (Helper.isSamePosition(creep.pos, target.pos)) {
        // Creep is standing on the score — record collection and mark task done.
        this.recordScoreCollection(target);
        creep.task!.taskDone = true;
      } else {
        creep.addTask(new CreepTask(Activity.Move, target.pos));
      }
    }
  }

  private findAllScores(): Score[] {
    const scores: Score[] = [];
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      try {
        const found = room.find(FIND_SCORES);
        for (const score of found) {
          scores.push(score);
        }
      } catch (_e) {
        // FIND_SCORES not available outside Season — silently skip.
      }
    }
    return scores;
  }

  private findBestScoreInRoom(roomName: string): Score | null {
    const roomScores = this.scores.filter(s => s.pos.roomName === roomName);
    if (roomScores.length === 0) {
      return null;
    }
    return roomScores.reduce((best, s) => (s.score > best.score ? s : best));
  }

  private recordScoreCollection(score: Score): void {
    if (!Memory.scoreHistory) {
      Memory.scoreHistory = [];
    }
    Memory.scoreHistory.push({
      tick: Game.time,
      x: score.pos.x,
      y: score.pos.y,
      roomName: score.pos.roomName
    });
  }

  private createCreepForThisArea(): SpawnTask | null {
    return new SpawnTask(SpawnType.Collector, this.areaId, "Collector", [MOVE], this);
  }
}
