/** Test fixtures for the DRC test suites. Kept module-local (not under
 *  tests/) so per-rule unit tests can import without a long relative path,
 *  and so the fixtures live next to the rules they exercise.
 */
import { createProject } from '@core/domain/project.ts';
import type { Device, DataBundle, Region, CrossingRules } from '@core/data-loader/types.ts';
import type { Project } from '@core/domain/types.ts';

export function mkDevice(overrides: Partial<Device> & { id: string }): Device {
  return {
    display_name_zh_hans: overrides.id,
    footprint: { width: 1, height: 1 },
    bandwidth: 0,
    power_draw: 0,
    requires_power: false,
    has_fluid_interface: false,
    io_ports: [],
    tech_prereq: [],
    category: 'basic_production',
    recipes: [],
    ...overrides,
  };
}

export const TEST_REGION: Region = {
  id: 'test',
  display_name_zh_hans: '测试',
  plot_default_size: { width: 20, height: 20 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

export const TEST_CROSSING_RULES: CrossingRules = {
  same_layer_crossing: {
    solid: {
      allowed_without_component: false,
      crossing_component_id: 'belt-cross-bridge',
      latency_penalty: {
        model: 'bridge_count_step',
        thresholds: [
          { at_least: 2, throughput_multiplier: 0.75 },
          { at_least: 4, throughput_multiplier: 0.5 },
        ],
      },
    },
    fluid: {
      allowed_without_component: false,
      crossing_component_id: 'pipe-cross-bridge',
      latency_penalty: null,
    },
  },
  bridge_port_constraint: 'paired_opposite',
  cross_layer_crossing: { default: 'allowed', exceptions: [] },
};

export function mkBundle(overrides: Partial<DataBundle> = {}): DataBundle {
  return {
    version: 'test',
    devices: [],
    recipes: [],
    items: [],
    regions: [TEST_REGION],
    crossing_rules: TEST_CROSSING_RULES,
    transport_tiers: { solid_belts: [], fluid_pipes: [] },
    ...overrides,
  };
}

export function mkProject(): Project {
  return createProject({ region: TEST_REGION, data_version: 'test' });
}

export function lookupFrom(devices: readonly Device[]): (id: string) => Device | undefined {
  const byId = new Map(devices.map((d) => [d.id, d]));
  return (id) => byId.get(id);
}
