Pod::Spec.new do |s|
  s.name           = 'SyntropicHealthKit'
  s.version        = '1.0.0'
  s.summary        = 'Read-only HealthKit adapter for Ishiki.'
  s.description    = 'Provides the native HealthKit adapter used by the Ishiki development build.'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end