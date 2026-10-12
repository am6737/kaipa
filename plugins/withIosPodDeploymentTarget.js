const { withPodfile } = require('@expo/config-plugins');

/**
 * Xcode 26 rejects the legacy deployment targets declared by a few resource and
 * privacy pods. Expo's iOS deployment target updates the app target and Podfile
 * platform, but those pod targets can still retain their own older values.
 */
module.exports = function withIosPodDeploymentTarget(config) {
  const deploymentTarget = config.ios?.deploymentTarget || '16.4';

  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;
    const marker = '# Kaipa: normalize pod deployment targets';

    if (contents.includes(marker)) {
      return podfileConfig;
    }

    const hook = `
    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current_target.nil? || Gem::Version.new(current_target) < Gem::Version.new('${deploymentTarget}')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'
        end
      end
    end
`;

    podfileConfig.modResults.contents = contents.replace(
      '  post_install do |installer|\n',
      `  post_install do |installer|\n${hook}`,
    );
    return podfileConfig;
  });
};
