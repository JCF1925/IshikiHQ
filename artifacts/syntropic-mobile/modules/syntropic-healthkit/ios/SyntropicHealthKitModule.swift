import ExpoModulesCore
import Foundation
import HealthKit

public final class SyntropicHealthKitModule: Module {
  private let healthStore = HKHealthStore()
  private var smokeSample: HKQuantitySample?
  private let dateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private enum SampleMapping {
    case quantity(unit: HKUnit, unitName: String)
    case category(unitName: String)
    case bloodPressure
  }

  private struct HealthTypeDescriptor {
    let type: String
    let sampleType: HKSampleType
    let mapping: SampleMapping
  }

  public func definition() -> ModuleDefinition {
    Name("SyntropicHealthKit")

    AsyncFunction("availability") { () -> [String: Any] in
      guard HKHealthStore.isHealthDataAvailable() else {
        return [
          "available": false,
          "reason": "Apple Health is not available on this device.",
        ]
      }

      return ["available": true]
    }

    // HealthKit deliberately does not expose whether a user has granted read
    // access for a particular type. Request status is the closest supported
    // signal before the request; an unnecessary request is treated as usable.
    AsyncFunction("authorization") { (type: String, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve("unavailable")
        return
      }

      do {
        let descriptor = try self.descriptor(for: type)
        self.healthStore.getRequestStatusForAuthorization(
          toShare: [],
          read: [descriptor.sampleType]
        ) { status, error in
          if let error {
            promise.reject(error)
            return
          }

          switch status {
          case .shouldRequest:
            promise.resolve("notDetermined")
          case .unnecessary:
            promise.resolve("authorized")
          @unknown default:
            promise.resolve("denied")
          }
        }
      } catch {
        promise.reject(error)
      }
    }

    AsyncFunction("request") { (types: [String], promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(
          Dictionary(uniqueKeysWithValues: types.map { ($0, "unavailable") })
        )
        return
      }

      do {
        let descriptors = try types.map { try self.descriptor(for: $0) }
        let readTypes: Set<HKObjectType> = Set(
          descriptors.map { $0.sampleType as HKObjectType }
        )

        self.healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
          if let error {
            promise.reject(error)
            return
          }

          // For read-only HealthKit access, `success` means the permission
          // sheet completed. Apple intentionally does not disclose a per-type
          // read decision, so the next anchored read remains authoritative.
          let status = success ? "authorized" : "denied"
          promise.resolve(
            Dictionary(uniqueKeysWithValues: types.map { ($0, status) })
          )
        }
      } catch {
        promise.reject(error)
      }
    }

    // Development-only fixture hooks. The sample stays private to this
    // module so its value and identifier never cross the native bridge.
    AsyncFunction("writeSmokeSample") { (type: String, promise: Promise) in
      guard type == "activity" else {
        promise.reject(self.moduleError("The HealthKit smoke sample is only supported for Activity."))
        return
      }
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.reject(self.moduleError("Apple Health is not available on this device."))
        return
      }
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
        promise.reject(self.moduleError("Activity samples are unavailable on this iOS version."))
        return
      }

      let now = Date()
      let sample = HKQuantitySample(
        type: sampleType,
        quantity: HKQuantity(unit: .count(), doubleValue: 1),
        start: now.addingTimeInterval(-1),
        end: now
      )
      let shareTypes: Set<HKSampleType> = [sampleType]

      self.healthStore.requestAuthorization(toShare: shareTypes, read: []) { success, error in
        if let error {
          promise.reject(error)
          return
        }
        guard success else {
          promise.reject(self.moduleError("HealthKit write access was not granted for the smoke sample."))
          return
        }

        self.healthStore.save(sample) { saved, saveError in
          if let saveError {
            promise.reject(saveError)
            return
          }
          guard saved else {
            promise.reject(self.moduleError("HealthKit did not save the smoke sample."))
            return
          }
          self.smokeSample = sample
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("removeSmokeSample") { (promise: Promise) in
      guard let sample = self.smokeSample else {
        promise.resolve(nil)
        return
      }

      self.healthStore.delete(sample) { success, error in
        if let error {
          promise.reject(error)
          return
        }
        guard success else {
          promise.reject(self.moduleError("HealthKit did not remove the smoke sample."))
          return
        }
        self.smokeSample = nil
        promise.resolve(nil)
      }
    }

    AsyncFunction("read") { (type: String, anchor: String?, promise: Promise) in
      do {
        let descriptor = try self.descriptor(for: type)
        let queryAnchor = try self.decodeAnchor(anchor)
        let query = HKAnchoredObjectQuery(
          type: descriptor.sampleType,
          predicate: nil,
          anchor: queryAnchor,
          limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, deletedObjects, nextAnchor, error in
          guard let self else {
            promise.reject("HEALTHKIT_MODULE_UNAVAILABLE", "The HealthKit module was released.")
            return
          }
          if let error {
            promise.reject(error)
            return
          }

          let formatter = self.dateFormatter
          let mappedSamples = (samples ?? []).flatMap {
            self.mapSamples($0, descriptor: descriptor, formatter: formatter)
          }
          let deletionDate = formatter.string(from: Date())
          let mappedDeletions = self.mapDeletions(
            deletedObjects ?? [],
            descriptor: descriptor,
            deletedAt: deletionDate
          )

          var result: [String: Any] = [
            "samples": mappedSamples,
            "deletions": mappedDeletions,
          ]
          if let nextAnchor, let encodedAnchor = self.encodeAnchor(nextAnchor) {
            result["anchor"] = encodedAnchor
          }
          promise.resolve(result)
        }

        self.healthStore.execute(query)
      } catch {
        promise.reject(error)
      }
    }
  }

  private func descriptor(for type: String) throws -> HealthTypeDescriptor {
    switch type {
    case "cardiovascular":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
        throw moduleError("Heart-rate samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .quantity(
          unit: HKUnit.count().unitDivided(by: .minute()),
          unitName: "count/min"
        )
      )
    case "blood_pressure":
      guard let sampleType = HKObjectType.correlationType(forIdentifier: .bloodPressure) else {
        throw moduleError("Blood-pressure samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .bloodPressure
      )
    case "sleep":
      guard let sampleType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
        throw moduleError("Sleep samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .category(unitName: "category")
      )
    case "activity":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
        throw moduleError("Activity samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .quantity(unit: .count(), unitName: "count")
      )
    case "body_measurements":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
        throw moduleError("Body-mass samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .quantity(
          unit: .gramUnit(with: .kilo),
          unitName: "kg"
        )
      )
    case "temperature":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .bodyTemperature) else {
        throw moduleError("Temperature samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .quantity(unit: .degreeCelsius(), unitName: "°C")
      )
    case "oxygen":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) else {
        throw moduleError("Oxygen-saturation samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .quantity(unit: .percent(), unitName: "%")
      )
    case "respiratory":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .respiratoryRate) else {
        throw moduleError("Respiratory-rate samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        mapping: .quantity(
          unit: HKUnit.count().unitDivided(by: .minute()),
          unitName: "count/min"
        )
      )
    default:
      throw moduleError("Unsupported HealthKit type: \(type)")
    }
  }

  private func mapSamples(
    _ sample: HKSample,
    descriptor: HealthTypeDescriptor,
    formatter: ISO8601DateFormatter
  ) -> [[String: Any]] {
    if case .bloodPressure = descriptor.mapping, let correlation = sample as? HKCorrelation {
      // Correlation UUIDs are the only deletion IDs HealthKit returns for a
      // blood-pressure record. Deriving component IDs from that UUID keeps
      // each imported component distinct and lets deletion tombstones match
      // both rows when the parent correlation is removed.
      return correlation.objects.compactMap { object in
        guard let quantitySample = object as? HKQuantitySample else {
          return nil
        }

        let component: String
        if quantitySample.quantityType.identifier == HKQuantityTypeIdentifier.bloodPressureSystolic.rawValue {
          component = "systolic"
        } else if quantitySample.quantityType.identifier == HKQuantityTypeIdentifier.bloodPressureDiastolic.rawValue {
          component = "diastolic"
        } else {
          return nil
        }

        return self.mapQuantitySample(
          quantitySample,
          id: "\(correlation.uuid.uuidString):\(component)",
          type: descriptor.type,
          unit: .millimeterOfMercury(),
          unitName: "mmHg",
          formatter: formatter,
          metadata: [
            "component": component,
            "correlationUuid": correlation.uuid.uuidString,
          ]
        )
      }.sorted { left, right in
        (left["metadata"] as? [String: String])?["component"] == "systolic"
          && (right["metadata"] as? [String: String])?["component"] == "diastolic"
      }
    }

    switch descriptor.mapping {
    case let .quantity(unit, unitName):
      guard let quantitySample = sample as? HKQuantitySample else {
        return []
      }
      return [self.mapQuantitySample(
        quantitySample,
        id: sample.uuid.uuidString,
        type: descriptor.type,
        unit: unit,
        unitName: unitName,
        formatter: formatter
      )]
    case let .category(unitName):
      guard let categorySample = sample as? HKCategorySample else {
        return []
      }
      return [[
        "id": sample.uuid.uuidString,
        "type": descriptor.type,
        "value": Double(categorySample.value),
        "unit": unitName,
        "startDate": formatter.string(from: sample.startDate),
        "endDate": formatter.string(from: sample.endDate),
        "source": sample.sourceRevision.source.bundleIdentifier,
        "sourceRevision": sample.sourceRevision.version ?? "",
      ]]
    case .bloodPressure:
      return []
    }
  }

  private func mapQuantitySample(
    _ sample: HKQuantitySample,
    id: String,
    type: String,
    unit: HKUnit,
    unitName: String,
    formatter: ISO8601DateFormatter,
    metadata: [String: String] = [:]
  ) -> [String: Any] {
    var mapped: [String: Any] = [
      "id": id,
      "type": type,
      "value": sample.quantity.doubleValue(for: unit),
      "unit": unitName,
      "startDate": formatter.string(from: sample.startDate),
      "endDate": formatter.string(from: sample.endDate),
      "source": sample.sourceRevision.source.bundleIdentifier,
      "sourceRevision": sample.sourceRevision.version ?? "",
    ]
    if !metadata.isEmpty {
      mapped["metadata"] = metadata
    }
    return mapped
  }

  private func mapDeletions(
    _ deletedObjects: [HKDeletedObject],
    descriptor: HealthTypeDescriptor,
    deletedAt: String
  ) -> [[String: Any]] {
    deletedObjects.flatMap { deletedObject in
      let ids: [String]
      if case .bloodPressure = descriptor.mapping {
        ids = ["systolic", "diastolic"].map {
          "\(deletedObject.uuid.uuidString):\($0)"
        }
      } else {
        ids = [deletedObject.uuid.uuidString]
      }

      return ids.map { healthKitUuid in
        [
          "healthKitUuid": healthKitUuid,
          "sampleType": descriptor.type,
          "deletedAt": deletedAt,
        ]
      }
    }
  }

  private func encodeAnchor(_ anchor: HKQueryAnchor) -> String? {
    guard let data = try? NSKeyedArchiver.archivedData(
      withRootObject: anchor,
      requiringSecureCoding: true
    ) else {
      return nil
    }
    return data.base64EncodedString()
  }

  private func decodeAnchor(_ encodedAnchor: String?) throws -> HKQueryAnchor? {
    guard let encodedAnchor else {
      return nil
    }
    guard let data = Data(base64Encoded: encodedAnchor) else {
      throw moduleError("The HealthKit anchor is not valid base64.")
    }
    do {
      return try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    } catch {
      throw moduleError("The HealthKit anchor could not be decoded.")
    }
  }

  private func moduleError(_ description: String) -> NSError {
    NSError(domain: "SyntropicHealthKit", code: 1, userInfo: [
      NSLocalizedDescriptionKey: description,
    ])
  }
}