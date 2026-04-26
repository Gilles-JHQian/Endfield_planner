/** Helper: inject the test-fixture io_ports into a DataBundle so port-
 *  dependent DRC rules can be exercised before the §5.4 device editor (B9)
 *  lets owners populate real port geometry. Returns a new bundle — does NOT
 *  mutate the input.
 *
 *  Used by:
 *  - the DRC test suite (port-required-input.test.ts etc.) to set up scenarios
 *  - a future dev-mode debug toggle that lets the editor preview what
 *    PORT_xxx / LAYER_CROSS_003 would say once real io_ports land
 *
 *  Production code paths must NOT call this — production data should reach
 *  port-rule readiness only after owner fills `data/versions/<v>/devices.json`
 *  via the device editor.
 */
import sample from '../../../tests/fixtures/sample-io-ports.json' with { type: 'json' };
import type { DataBundle, Device, Port } from '@core/data-loader/types.ts';

export function injectSampleIoPorts(bundle: DataBundle): DataBundle {
  const ports = sample.ports as Record<string, Port[]>;
  const augmented: Device[] = bundle.devices.map((d) => {
    const fixturePorts = ports[d.id];
    if (!fixturePorts || d.io_ports.length > 0) return d;
    return { ...d, io_ports: fixturePorts };
  });
  return { ...bundle, devices: augmented };
}
