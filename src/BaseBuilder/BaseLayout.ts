export interface Coord {
    x: number;
    y: number;
  }
  
  export interface BasePlanner {
    controllerLevel: number;
    buildings: { [structureType: string]: { pos: Coord[] } };
  }
  
  export interface BaseLayout {
    [controllerLevel: number]: BasePlanner | undefined;
    data: {
      anchor: Coord;
    }
  }