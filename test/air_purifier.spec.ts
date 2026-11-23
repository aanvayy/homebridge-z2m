import * as hapNodeJs from '@homebridge/hap-nodejs';
import { Characteristic, CharacteristicValue, WithUUID } from '@homebridge/hap-nodejs';
import { vi } from 'vitest';
import { hap, setHap } from '../src/hap';
import { ExposesEntry } from '../src/z2mModels';
import { loadExposesFromFile, ServiceHandlersTestHarness } from './testHelpers';

describe('Air Purifier', () => {
  beforeAll(() => {
    setHap(hapNodeJs);
  });

  describe('IKEA STARKVIND E2007', () => {
    let deviceExposes: ExposesEntry[] = [];
    let harness: ServiceHandlersTestHarness;
    const filterServiceId = `replace_filter_${hapNodeJs.Service.FilterMaintenance.UUID}`;

    beforeEach(() => {
      if (deviceExposes.length === 0) {
        deviceExposes = loadExposesFromFile('ikea/e2007.json');
        expect(deviceExposes.length).toBeGreaterThan(0);
      }

      harness = new ServiceHandlersTestHarness();
      harness
        .getOrAddHandler(hap.Service.AirPurifier)
        .addExpectedCharacteristic('fan_state', hap.Characteristic.Active, true)
        .addExpectedCharacteristic('fan_state_current', hap.Characteristic.CurrentAirPurifierState, false, 'fan_state')
        .addExpectedCharacteristic('fan_mode', hap.Characteristic.TargetAirPurifierState, true)
        .addExpectedCharacteristic('fan_mode_speed', hap.Characteristic.RotationSpeed, true, 'fan_mode');
      harness
        .getOrAddHandler(hap.Service.FilterMaintenance, 'replace_filter', filterServiceId)
        .addExpectedCharacteristic('replace_filter', hap.Characteristic.FilterChangeIndication);

      harness.prepareCreationMocks();
      harness.callCreators(deviceExposes);
      harness.checkCreationExpectations();
      harness.checkHasMainCharacteristics();
      harness.checkExpectedGetableKeys(['fan_state']);
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    test('Status update: fan_state ON', () => {
      harness.checkUpdateState(
        '{"fan_state":"ON"}',
        hap.Service.AirPurifier,
        new Map<WithUUID<new () => Characteristic> | string, CharacteristicValue>([
          [hap.Characteristic.Active, hap.Characteristic.Active.ACTIVE],
          [hap.Characteristic.CurrentAirPurifierState, hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR],
        ])
      );
    });

    test('Status update: fan_mode auto', () => {
      harness.checkSingleUpdateState(
        '{"fan_mode":"auto"}',
        hap.Service.AirPurifier,
        hap.Characteristic.TargetAirPurifierState,
        hap.Characteristic.TargetAirPurifierState.AUTO
      );
    });

    test('Status update: fan_mode numeric', () => {
      harness.checkUpdateState(
        '{"fan_mode":"5"}',
        hap.Service.AirPurifier,
        new Map<WithUUID<new () => Characteristic> | string, CharacteristicValue>([
          [hap.Characteristic.TargetAirPurifierState, hap.Characteristic.TargetAirPurifierState.MANUAL],
          [hap.Characteristic.RotationSpeed, 56],
        ])
      );
    });

    test('Status update: fan_speed', () => {
      harness.checkSingleUpdateState('{"fan_speed":9}', hap.Service.AirPurifier, hap.Characteristic.RotationSpeed, 100);
    });

    test('Status update: replace_filter', () => {
      harness.checkSingleUpdateState(
        '{"replace_filter":true}',
        filterServiceId,
        hap.Characteristic.FilterChangeIndication,
        hap.Characteristic.FilterChangeIndication.CHANGE_FILTER
      );
      harness.clearMocks();
      harness.checkSingleUpdateState(
        '{"replace_filter":false}',
        filterServiceId,
        hap.Characteristic.FilterChangeIndication,
        hap.Characteristic.FilterChangeIndication.FILTER_OK
      );
    });

    test('HomeKit writes are handled', () => {
      harness.checkHomeKitUpdateWithSingleValue(hap.Service.AirPurifier, 'fan_state', hap.Characteristic.Active.ACTIVE, 'ON');
      harness.clearMocks();
      harness.checkHomeKitUpdateWithSingleValue(
        hap.Service.AirPurifier,
        'fan_mode',
        hap.Characteristic.TargetAirPurifierState.AUTO,
        'auto'
      );
      harness.clearMocks();
      harness.checkUpdateState(
        '{"fan_mode":"4"}',
        hap.Service.AirPurifier,
        new Map<WithUUID<new () => Characteristic> | string, CharacteristicValue>([
          [hap.Characteristic.TargetAirPurifierState, hap.Characteristic.TargetAirPurifierState.MANUAL],
          [hap.Characteristic.RotationSpeed, 44],
        ]),
        false
      );
      harness.clearMocks();
      harness.checkHomeKitUpdateWithSingleValue(hap.Service.AirPurifier, 'fan_mode', hap.Characteristic.TargetAirPurifierState.MANUAL, '4');
      harness.clearMocks();
      harness.checkHomeKitUpdateWithSingleValue(hap.Service.AirPurifier, 'fan_mode_speed', 0, 'OFF', 'fan_state');
      harness.clearMocks();
      harness.checkHomeKitUpdateWithSingleValue(hap.Service.AirPurifier, 'fan_mode_speed', 67, '6', 'fan_mode');
    });

    test('Manual restores the last speed after Off', () => {
      harness.checkUpdateState(
        '{"fan_mode":"2"}',
        hap.Service.AirPurifier,
        new Map<WithUUID<new () => Characteristic> | string, CharacteristicValue>([
          [hap.Characteristic.TargetAirPurifierState, hap.Characteristic.TargetAirPurifierState.MANUAL],
          [hap.Characteristic.RotationSpeed, 22],
        ]),
        false
      );
      harness.clearMocks();
      harness.checkSingleUpdateState(
        '{"fan_mode":"off"}',
        hap.Service.AirPurifier,
        hap.Characteristic.TargetAirPurifierState,
        hap.Characteristic.TargetAirPurifierState.MANUAL
      );
      harness.clearMocks();
      harness.checkHomeKitUpdateWithSingleValue(hap.Service.AirPurifier, 'fan_mode', hap.Characteristic.TargetAirPurifierState.MANUAL, '2');
    });

    test('Rejects target-state writes when mode is read-only', () => {
      const readOnlyExposes = structuredClone(deviceExposes);
      const fan = readOnlyExposes.find((entry) => entry.name === 'fan');
      const mode = fan !== undefined && 'features' in fan ? fan.features.find((entry) => entry.name === 'mode') : undefined;
      if (mode !== undefined) {
        mode.access = 1;
      }

      harness = new ServiceHandlersTestHarness();
      harness
        .getOrAddHandler(hap.Service.AirPurifier)
        .addExpectedCharacteristic('fan_state', hap.Characteristic.Active, true)
        .addExpectedCharacteristic('fan_state_current', hap.Characteristic.CurrentAirPurifierState, false, 'fan_state')
        .addExpectedCharacteristic('fan_mode', hap.Characteristic.TargetAirPurifierState, true);
      harness
        .getOrAddHandler(hap.Service.FilterMaintenance, 'replace_filter', filterServiceId)
        .addExpectedCharacteristic('replace_filter', hap.Characteristic.FilterChangeIndication);
      harness.prepareCreationMocks();
      harness.callCreators(readOnlyExposes);
      harness.checkCreationExpectations();
      harness.checkHomeKitUpdateRejected(
        hap.Service.AirPurifier,
        'fan_mode',
        hap.Characteristic.TargetAirPurifierState.AUTO,
        'Changing the target state is not supported for this device'
      );
    });
  });

  test.each(['E2007', 'E3007'])('Recognizes %s without filter status', (model) => {
    const exposes = loadExposesFromFile('ikea/e2007.json').filter(
      (entry) => !['replace_filter', 'pm25', 'air_quality'].includes(entry.name ?? '')
    );
    const harness = new ServiceHandlersTestHarness();
    harness.accessoryMock.matchesDeviceModel.mockImplementation((...models: string[]) => models.includes(model));
    harness
      .getOrAddHandler(hap.Service.AirPurifier)
      .addExpectedCharacteristic('fan_state', hap.Characteristic.Active, true)
      .addExpectedCharacteristic('fan_state_current', hap.Characteristic.CurrentAirPurifierState, false, 'fan_state')
      .addExpectedCharacteristic('fan_mode', hap.Characteristic.TargetAirPurifierState, true)
      .addExpectedCharacteristic('fan_mode_speed', hap.Characteristic.RotationSpeed, true, 'fan_mode');
    harness.prepareCreationMocks();
    harness.callCreators(exposes);
    harness.checkCreationExpectations();
  });

  test('Does not classify an unrelated fan as an air purifier', () => {
    const exposes = loadExposesFromFile('ikea/e2007.json').filter(
      (entry) => !['replace_filter', 'pm25', 'air_quality'].includes(entry.name ?? '')
    );
    const harness = new ServiceHandlersTestHarness();
    harness.accessoryMock.matchesDeviceModel.mockReturnValue(false);
    harness.callCreators(exposes);
    harness.checkCreationExpectations();
    expect(harness.accessoryMock.isServiceHandlerIdKnown).not.toHaveBeenCalledWith(hap.Service.AirPurifier.UUID);
  });
});
