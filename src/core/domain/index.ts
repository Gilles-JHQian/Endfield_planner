export * from './types.ts';
export * from './project.ts';
// Re-export Region/Device/etc so consumers don't need to mix data-loader and
// domain imports in the same file.
export type {
  Device,
  Recipe,
  Region,
  Item,
  Port,
  PortKind,
  PortSide,
  PortDirection,
  PowerAoe,
  Footprint,
  DataBundle,
} from '@core/data-loader/types.ts';
