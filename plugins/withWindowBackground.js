const { withAndroidStyles } = require('@expo/config-plugins');

module.exports = function withWindowBackground(config) {
  return withAndroidStyles(config, (config) => {
    const styleArray = config.modResults.resources.style;
    if (!styleArray) return config;
    for (const style of styleArray) {
      if (style.$?.name === 'AppTheme') {
        if (!style.item) style.item = [];
        style.item.push({
          $: { name: 'android:windowBackground' },
          _: '?attr/colorBackground',
        });
        break;
      }
    }
    return config;
  });
};
