import ExpoModulesCore
import Foundation
import HealthKit

public final class SyntropicHealthKitModule: Module {
  private let healthStore = HKHealthStore()
  private let dateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private struct HealthTypeDescriptor {
    let type: String
    let sampleType: HKSampleType
    let unit: HKUnit?
    let unitName: String
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
          let mappedSamples = (samples ?? []).compactMap {
            self.mapSample($0, descriptor: descriptor, formatter: formatter)
          }
          let deletionDate = formatter.string(from: Date())
          let mappedDeletions = (deletedObjects ?? []).map { deletedObject in
            [
              "healthKitUuid": deletedObject.uuid.uuidString,
              "sampleType": descriptor.type,
              "deletedAt": deletionDate,
            ]
          }

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
        unit: HKUnit.count().unitDivided(by: .minute()),
        unitName: "count/min"
      )
    case "blood_pressure":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic) else {
        throw moduleError("Blood-pressure samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: .millimeterOfMercury(),
        unitName: "mmHg"
      )
    case "sleep":
      guard let sampleType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
        throw moduleError("Sleep samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: nil,
        unitName: "category"
      )
    case "activity":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
        throw moduleError("Activity samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: .count(),
        unitName: "count"
      )
    case "body_measurements":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
        throw moduleError("Body-mass samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: .gramUnit(with: .kilo),
        unitName: "kg"
      )
    case "temperature":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .bodyTemperature) else {
        throw moduleError("Temperature samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: .degreeCelsius(),
        unitName: "°C"
      )
    case "oxygen":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) else {
        throw moduleError("Oxygen-saturation samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: .percent(),
        unitName: "%"
      )
    case "respiratory":
      guard let sampleType = HKObjectType.quantityType(forIdentifier: .respiratoryRate) else {
        throw moduleError("Respiratory-rate samples are unavailable on this iOS version.")
      }
      return HealthTypeDescriptor(
        type: type,
        sampleType: sampleType,
        unit: HKUnit.count().unitDivided(by: .minute()),
        unitName: "count/min"
      )
    default:
      throw moduleError("Unsupported HealthKit type: \(type)")
    }
  }

  private func mapSample(
    _ sample: HKSample,
    descriptor: HealthTypeDescriptor,
    formatter: ISO8601DateFormatter
  ) -> [String: Any]? {
    let value: Double

    if let quantitySample = sample as? HKQuantitySample, let unit = descriptor.unit {
      value = quantitySample.quantity.doubleValue(for: unit)
    } else if let categorySample = sample as? HKCategorySample {
      value = Double(categorySample.value)
    } else {
      return nil
    }

    return [
      "id": sample.uuid.uuidString,
      "type": descriptor.type,
      "value": value,
      "unit": descriptor.unitName,
      "startDate": formatter.string(from: sample.startDate),
      "endDate": formatter.string(from: sample.endDate),
      "source": sample.sourceRevision.source.bundleIdentifier,
      "sourceRevision": sample.sourceRevision.version ?? "",
    ]
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