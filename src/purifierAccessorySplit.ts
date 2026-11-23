import { DeviceDefinition, DeviceListEntry, ExposesEntry, isDeviceDefinition } from './z2mModels';

export const AIR_QUALITY_ACCESSORY_ROLE = 'air-quality';

const STARKVIND_MODELS = new Set(['E2007', 'E3007']);
const AIR_QUALITY_EXPOSE_NAMES = new Set(['pm25', 'air_quality']);

export function shouldSplitStarkvindAirQuality(device: DeviceListEntry, exposes?: ExposesEntry[]): boolean {
  if (!isStarkvind(device)) {
    return false;
  }

  return (exposes ?? device.definition.exposes).some((expose) => expose.name === 'pm25');
}

export function deviceForAccessoryRole(device: DeviceListEntry, role?: string, exposes?: ExposesEntry[]): DeviceListEntry {
  const definition = device.definition;
  if (!isDeviceDefinition(definition)) {
    return device;
  }
  const effectiveExposes = exposes ?? definition.exposes;
  if (!shouldSplitStarkvindAirQuality(device, effectiveExposes)) {
    return device;
  }

  const roleExposes = exposesForAccessoryRole(device, effectiveExposes, role);

  return {
    ...device,
    definition: {
      ...definition,
      exposes: roleExposes,
    },
  };
}

export function exposesForAccessoryRole(device: DeviceListEntry, exposes: ExposesEntry[], role?: string): ExposesEntry[] {
  if (!isStarkvind(device) || (role !== AIR_QUALITY_ACCESSORY_ROLE && !shouldSplitStarkvindAirQuality(device, exposes))) {
    return exposes;
  }

  return exposes.filter((expose) => (role === AIR_QUALITY_ACCESSORY_ROLE ? isAirQualityExpose(expose) : !isAirQualityExpose(expose)));
}

function isAirQualityExpose(expose: ExposesEntry): boolean {
  return expose.name !== undefined && AIR_QUALITY_EXPOSE_NAMES.has(expose.name);
}

function isStarkvind(device: DeviceListEntry): device is DeviceListEntry & { definition: DeviceDefinition } {
  return isDeviceDefinition(device.definition) && STARKVIND_MODELS.has(device.definition.model ?? '');
}
