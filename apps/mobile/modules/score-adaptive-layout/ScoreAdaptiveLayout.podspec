Pod::Spec.new do |s|
  s.name           = 'ScoreAdaptiveLayout'
  s.version        = '1.0.0'
  s.summary        = 'Native window geometry and reserved-region snapshots'
  s.description    = 'Publishes the active UIKit window bounds, safe area, and reserved regions to React Native.'
  s.homepage       = 'https://converter.nossateoria.com.br'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'Conversor de Partituras'
  s.platform       = :ios, '15.1'
  s.source         = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
