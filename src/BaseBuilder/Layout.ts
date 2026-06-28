import { BaseLayout, Coord } from "./BaseLayout";
import layoutBunkerJson from "./Layouts/LayoutBunker.json";
import layoutFourWaysJson from "./Layouts/LayoutFourWays.json";
import layoutReverseRooftopJson from "./Layouts/LayoutReverseRooftop.json";
import layoutRooftopJson from "./Layouts/LayoutRooftop.json";
import layoutSieveJson from "./Layouts/LayoutSieve.json";
import layoutUtilityJson from "./Layouts/LayoutUtility.json";
import layoutFixedExtensionJson from "./Layouts/LayoutFixedExtension.json";

interface LayoutConfig {
  anchor: Coord;
  size?: Coord;
  levels: {
    [rcl: string]: {
      buildings: {
        [structureType: string]: Coord[] | undefined;
      };
    };
  };
}

const structureTypes = [
  "spawn",
  "extension",
  "road",
  "wall",
  "rampart",
  "container",
  "observer",
  "powerSpawn",
  "link",
  "terminal",
  "tower",
  "nuker",
  "storage",
  "lab"
];

function toBaseLayout(config: LayoutConfig): BaseLayout {
  const layout: BaseLayout = {
    data: {
      anchor: config.anchor,
      size: config.size
    }
  };

  Object.keys(config.levels).forEach(rclKey => {
    const controllerLevel = parseInt(rclKey, 10);
    if (isNaN(controllerLevel)) {
      return;
    }

    const jsonBuildings = config.levels[rclKey].buildings || {};
    const buildings: { [structureType: string]: { pos: Coord[] } } = {};

    structureTypes.forEach(structureType => {
      buildings[structureType] = { pos: jsonBuildings[structureType] || [] };
    });

    layout[controllerLevel] = {
      controllerLevel,
      buildings
    };
  });

  return layout;
}

export const layoutSieve: BaseLayout = toBaseLayout((layoutSieveJson as unknown) as LayoutConfig);
export const layoutRooftop: BaseLayout = toBaseLayout((layoutRooftopJson as unknown) as LayoutConfig);
export const layoutReverseRooftop: BaseLayout = toBaseLayout((layoutReverseRooftopJson as unknown) as LayoutConfig);
export const layoutFourWays: BaseLayout = toBaseLayout((layoutFourWaysJson as unknown) as LayoutConfig);
export const layoutUtility: BaseLayout = toBaseLayout((layoutUtilityJson as unknown) as LayoutConfig);
export const layoutBunker: BaseLayout = toBaseLayout((layoutBunkerJson as unknown) as LayoutConfig);
export const layoutFixedExtension: BaseLayout = toBaseLayout((layoutFixedExtensionJson as unknown) as LayoutConfig);
