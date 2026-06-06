import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "../CreepBase";

const SEASON_AREA_ID = "SeasonArea-Global";
const EXPLORATION_EXPIRATION_TICKS = 2500;

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
  exploredRooms: Map<string, number>; // roomName -> timestamp
  enemyRooms: Set<string>;
  flagTargetRoom: string | null;

  constructor() {
    super(
      "SeasonArea",
      SEASON_AREA_ID,
      new RoomPosition(25, 25, Object.keys(Game.rooms)[0]),
      Game.rooms[Object.keys(Game.rooms)[0]]
    );
    this.scores = this.findAllScores();
    this.exploredRooms = this.getExploredRoomsFromMemory();
    this.enemyRooms = new Set(this.getEnemyRoomsFromMemory());
    this.flagTargetRoom = this.detectFlag();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    
    // Always maintain at least one scout collector for exploration
    if (this.creeps.length === 0 || (Game.time % 100 === 0 && this.creeps.length < 10)) {
      const task = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
      return tasksForThisArea;
    }

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
    this.scores = this.findAllScores(); // Refresh scores each tick
    this.flagTargetRoom = this.detectFlag(); // Check for flags each tick
    this.expireOldExplorations(); // Expire old explorations

    // Check for flag priority first
    if (this.flagTargetRoom) {
      const targetPos = new RoomPosition(25, 25, this.flagTargetRoom);

      const closestCreep = this.creeps.reduce<CreepBase | null>((closest, creep) => {
        if (!closest) return creep;

        const creepDistance = Game.map.getRoomLinearDistance(
          creep.room.name,
          this.flagTargetRoom!
        );

        const closestDistance = Game.map.getRoomLinearDistance(
          closest.room.name,
          this.flagTargetRoom!
        );

        return creepDistance < closestDistance ? creep : closest;
      }, null);

      if (closestCreep && closestCreep.pos.roomName !== this.flagTargetRoom) {
        closestCreep.addTask(
          new CreepTask(Activity.MoveDifferentRoom, targetPos)
        );
      }
    }

    
    for (let i = this.creeps.length - 1; i >= 0; i--) {
      const creep = this.creeps[i];
      if (!creep.isFree()) {
        continue;
      }

      // Find the highest-scoring Score in the same room as the creep.
      const target = this.findBestScoreInRoom(creep.pos.roomName);
      if (target) {
        if (Helper.isSamePosition(creep.pos, target.pos)) {
          // Creep is standing on the score — record collection and mark task done.
          this.recordScoreCollection(target);
          creep.task!.taskDone = true;
        } else {
          creep.addTask(new CreepTask(Activity.Move, target.pos));
        }
        continue;
      }

      // If no scores in current room, explore intelligently
      this.exploreRoom(creep);
    }
    
    // Save exploration state to memory
    this.saveExploredRoomsToMemory();
    this.saveEnemyRoomsToMemory();
  }

  private expireOldExplorations(): void {
    const currentTime = Game.time;
    const expiredRooms: string[] = [];
    
    for (const [roomName, exploredAt] of this.exploredRooms.entries()) {
      if (currentTime - exploredAt > EXPLORATION_EXPIRATION_TICKS) {
        expiredRooms.push(roomName);
      }
    }
    
    for (const roomName of expiredRooms) {
      this.exploredRooms.delete(roomName);
    }
  }

  private exploreRoom(creep: CreepBase): void {
    const currentRoom = creep.pos.roomName;
    
    // Check if current room has enemies and mark it
    if (this.isEnemyRoom(currentRoom)) {
      this.enemyRooms.add(currentRoom);
    }
    
    // Mark current room as explored with current timestamp
    this.exploredRooms.set(currentRoom, Game.time);
    
    // Find next room to explore
    const nextRoom = this.findNextRoomToExplore(currentRoom);
    if (nextRoom) {
      const targetPos = new RoomPosition(25, 25, nextRoom);
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, targetPos));
    }
  }

  private findNextRoomToExplore(currentRoom: string): string | null {
    const adjacentRooms = Game.map.describeExits(currentRoom);
    if (!adjacentRooms) return null;
    
    const roomNames = Object.values(adjacentRooms).filter(room => room !== undefined) as string[];
    
    // Prioritize unexplored rooms that aren't enemy rooms
    const unexploredSafeRooms = roomNames.filter(room => 
      !this.exploredRooms.has(room) && !this.enemyRooms.has(room)
    );
    
    if (unexploredSafeRooms.length > 0) {
      // Return a random unexplored safe room
      return unexploredSafeRooms[Math.floor(Math.random() * unexploredSafeRooms.length)];
    }
    
    // If all adjacent rooms are explored, try to find a path to unexplored rooms
    for (const room of roomNames) {
      if (!this.enemyRooms.has(room)) {
        const pathToUnexplored = this.findPathToUnexplored(room);
        if (pathToUnexplored) {
          return pathToUnexplored;
        }
      }
    }
    
    // Fallback to any safe adjacent room
    const safeAdjacentRooms = roomNames.filter(room => !this.enemyRooms.has(room));
    if (safeAdjacentRooms.length > 0) {
      return safeAdjacentRooms[Math.floor(Math.random() * safeAdjacentRooms.length)];
    }
    
    return null;
  }

  private findPathToUnexplored(startRoom: string): string | null {
    const visited = new Set<string>();
    const queue: string[] = [startRoom];
    visited.add(startRoom);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const exits = Game.map.describeExits(current);
      
      if (exits) {
        for (const direction of Object.values(exits)) {
          if (!direction) continue;
          
          if (!this.exploredRooms.has(direction) && !this.enemyRooms.has(direction)) {
            return direction;
          }
          
          if (!visited.has(direction) && !this.enemyRooms.has(direction)) {
            visited.add(direction);
            queue.push(direction);
          }
        }
      }
    }
    
    return null;
  }

  private isEnemyRoom(roomName: string): boolean {
    const room = Game.rooms[roomName];
    if (!room) return false;
    
    // Check for enemy structures
    const enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);
    if (enemyStructures.length > 0) return true;
    
    return false;
  }

  private detectFlag(): string | null {
    const flags = _.filter(Game.flags, flag => flag.name === "SEASON_FLAG");
    const roomNames: string[] = [];
    flags.forEach(flag => {
      roomNames.push(flag.pos.roomName);
    });
    return roomNames[0] || null;
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

  private getExploredRoomsFromMemory(): Map<string, number> {
    const exploredMap = new Map<string, number>();
    if (!Memory.seasonExploredRooms) {
      Memory.seasonExploredRooms = [];
      return exploredMap;
    }
    
    // Convert array to map and filter expired entries
    const currentTime = Game.time;
    for (const explored of Memory.seasonExploredRooms) {
      if (currentTime - explored.exploredAt <= EXPLORATION_EXPIRATION_TICKS) {
        exploredMap.set(explored.roomName, explored.exploredAt);
      }
    }
    
    return exploredMap;
  }

  private saveExploredRoomsToMemory(): void {
    const exploredArray: ExploredRoom[] = [];
    for (const [roomName, exploredAt] of this.exploredRooms.entries()) {
      exploredArray.push({ roomName, exploredAt });
    }
    Memory.seasonExploredRooms = exploredArray;
  }

  private getEnemyRoomsFromMemory(): string[] {
    if (!Memory.seasonEnemyRooms) {
      Memory.seasonEnemyRooms = [];
      return [];
    }
    return Memory.seasonEnemyRooms;
  }

  private saveEnemyRoomsToMemory(): void {
    Memory.seasonEnemyRooms = Array.from(this.enemyRooms);
  }

  private createCreepForThisArea(): SpawnTask | null {
    const bodyParts: BodyPartConstant[] = [MOVE];
    return new SpawnTask(SpawnType.Collector, this.areaId, "Collector", bodyParts, this);
  }
}
