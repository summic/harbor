const appVersion = process.env.APP_VERSION || '0.0.0';
const buildTimeRaw = process.env.BUILD_TIME;

export const buildInfo = {
  appVersion,
  buildTimeText: buildTimeRaw ? new Date(buildTimeRaw).toLocaleString() : '--',
  copyrightText: `© ${new Date().getFullYear()} Beforeve. All rights reserved.`,
};

