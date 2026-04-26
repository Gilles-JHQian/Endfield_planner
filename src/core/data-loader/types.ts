/** Domain types for the data layer. Field names mirror data/schema/*.schema.json
 *  exactly — snake_case, identical shape — so JSON parsed from those files casts
 *  cleanly into these types after schema validation.
 */

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

export type ItemKind = 'solid' | 'fluid';

export type PortSide = 'N' | 'E' | 'S' | 'W';
export type PortKind = 'solid' | 'fluid' | 'power';
export type PortDirection = 'input' | 'output' | 'bidirectional' | 'paired_opposite';

export interface Port {
  readonly side: PortSide;
  readonly offset: number;
  readonly kind: PortKind;
  readonly direction_constraint: PortDirection;
}

export interface Footprint {
  readonly width: number;
  readonly height: number;
}

/** Power-related AoE for 供电桩 / 中继器.
 *  - `device_supply`: pole that powers devices inside its `edge`-cell square (POWER_001 consults).
 *  - `pole_link`: repeater that extends pole-to-pole connectivity inside its square but does NOT power devices.
 *  Centered on the device's footprint center.
 */
export interface PowerAoe {
  readonly kind: 'square_centered';
  readonly edge: number;
  readonly purpose: 'device_supply' | 'pole_link';
}

export interface Device {
  readonly id: string;
  readonly display_name_zh_hans: string;
  readonly display_name_en?: string;
  readonly footprint: Footprint;
  readonly bandwidth: number;
  readonly power_draw: number;
  /** Heat pool / generator capacity contributed when placed.
   *  Optional so devices that don't generate power can omit it.
   *  POWER_002 sums this across the project to verify supply ≥ demand. */
  readonly power_supply?: number;
  readonly requires_power: boolean;
  readonly has_fluid_interface: boolean;
  readonly io_ports: readonly Port[];
  readonly tech_prereq: readonly string[];
  readonly category: DeviceCategory;
  readonly recipes: readonly string[];
  readonly power_aoe?: PowerAoe;
}

export interface RecipePort {
  readonly item_id: string;
  readonly qty_per_cycle: number;
}

export interface Recipe {
  readonly id: string;
  readonly display_name_zh_hans: string;
  readonly display_name_en?: string;
  readonly cycle_seconds: number;
  readonly inputs: readonly RecipePort[];
  readonly outputs: readonly RecipePort[];
  readonly compatible_devices: readonly string[];
  readonly regions?: readonly string[];
}

export interface Item {
  readonly id: string;
  readonly display_name_zh_hans: string;
  readonly display_name_en?: string;
  readonly kind: ItemKind;
  readonly rarity: number;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Region {
  readonly id: string;
  readonly display_name_zh_hans: string;
  readonly display_name_en?: string;
  readonly plot_default_size: Footprint;
  readonly core_position: Cell;
  readonly sub_core_positions: readonly Cell[];
  readonly available_tech_tiers: readonly string[];
  readonly mining_nodes: readonly { item_id: string; position: Cell }[];
}

export interface CrossingRules {
  readonly same_layer_crossing: {
    readonly solid: SameLayerRule;
    readonly fluid: SameLayerRule;
  };
  readonly bridge_port_constraint: 'paired_opposite';
  readonly cross_layer_crossing: {
    readonly default: 'allowed' | 'forbidden';
    readonly exceptions: readonly CrossLayerException[];
  };
}

export interface SameLayerRule {
  readonly allowed_without_component: boolean;
  readonly crossing_component_id: string;
  readonly latency_penalty: LatencyPenalty | null;
}

export interface LatencyPenalty {
  readonly model: 'bridge_count_step';
  readonly thresholds: readonly { at_least: number; throughput_multiplier: number }[];
  readonly source?: string;
}

export interface CrossLayerException {
  readonly when: Readonly<Record<string, unknown>>;
  readonly result: 'allowed' | 'forbidden';
  readonly reason_zh_hans?: string;
  readonly reason_en?: string;
}

export interface SolidBeltTier {
  readonly tier: number;
  readonly id: string;
  readonly items_per_minute: number;
  readonly source?: string;
}

export interface FluidPipeTier {
  readonly tier: number;
  readonly id: string;
  readonly units_per_minute: number;
  readonly source?: string;
}

export interface TransportTiers {
  readonly solid_belts: readonly SolidBeltTier[];
  readonly fluid_pipes: readonly FluidPipeTier[];
}

export interface DataBundle {
  readonly version: string;
  readonly devices: readonly Device[];
  readonly recipes: readonly Recipe[];
  readonly items: readonly Item[];
  readonly regions: readonly Region[];
  readonly crossing_rules: CrossingRules;
  readonly transport_tiers: TransportTiers;
}
