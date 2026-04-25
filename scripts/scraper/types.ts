/** Output shapes the scraper produces. They mirror data/schema/*.schema.json. */

export interface ScrapedDevice {
  id: string;
  display_name_zh_hans: string;
  display_name_en?: string;
  footprint: { width: number; height: number };
  bandwidth: number;
  power_draw: number;
  requires_power: boolean;
  has_fluid_interface: boolean;
  io_ports: never[]; // §10.1 — populated by the device editor in Phase 2.
  tech_prereq: string[];
  category: DeviceCategory;
  recipes: string[]; // recipe ids, filled in by the cross-reference pass.
}

export type DeviceCategory =
  | 'miner'
  | 'storage'
  | 'basic_production'
  | 'synthesis'
  | 'power'
  | 'utility'
  | 'combat'
  | 'planting'
  | 'logistics';

export interface ScrapedRecipe {
  id: string;
  display_name_zh_hans: string;
  cycle_seconds: number;
  inputs: ScrapedRecipePort[];
  outputs: ScrapedRecipePort[];
  compatible_devices: string[];
  regions?: string[];
}

export interface ScrapedRecipePort {
  item_id: string;
  qty_per_cycle: number;
  /** Display name as shown in the recipe row. Used to derive item display names. */
  display_name_zh_hans: string;
}

/** Maps the 建筑类型 zh-Hans label from end.wiki to our schema's category enum. */
export const CATEGORY_MAP: Readonly<Record<string, DeviceCategory>> = {
  资源开采: 'miner',
  仓储存取: 'storage',
  基础生产: 'basic_production',
  合成制造: 'synthesis',
  电力供应: 'power',
  功能设备: 'utility',
  战斗辅助: 'combat',
  种植调配: 'planting',
  物流: 'logistics',
};
