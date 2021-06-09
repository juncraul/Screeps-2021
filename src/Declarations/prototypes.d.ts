interface Room {

}

interface RoomVisual {
	roads: number[][]//StructureRoad[];

	structure(x: number, y: number, type: BuildableStructureConstant, opts?: { [option: string]: any }): RoomVisual;
    
	connectRoads(opts?: { [option: string]: any }): RoomVisual | void;
}
