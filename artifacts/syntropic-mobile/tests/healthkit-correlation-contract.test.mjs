import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const modulePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../modules/syntropic-healthkit/ios/SyntropicHealthKitModule.swift',
);

describe('HealthKit blood-pressure correlation contract', () => {
  it('uses the correlation type and maps both component quantities', async () => {
    const source = await readFile(modulePath, 'utf8');

    assert.match(source, /correlationType\(forIdentifier: \.bloodPressure\)/);
    assert.match(source, /HKQuantityTypeIdentifier\.bloodPressureSystolic/);
    assert.match(source, /HKQuantityTypeIdentifier\.bloodPressureDiastolic/);
    assert.match(source, /"component": component/);
    assert.match(source, /"correlationUuid": correlation\.uuid\.uuidString/);
  });

  it('derives deletion IDs for both components from the correlation UUID', async () => {
    const source = await readFile(modulePath, 'utf8');

    assert.match(source, /ids = \["systolic", "diastolic"\]\.map/);
    assert.ok(source.includes('"\\(deletedObject.uuid.uuidString):\\($0)"'));
    assert.match(source, /"sampleType": descriptor\.type/);
  });
});