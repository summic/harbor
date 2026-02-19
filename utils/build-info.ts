declare const __APP_VERSION__: string;
declare const __LAST_COMMIT_TIME__: string;
declare const __GIT_SHA__: string;

const appVersion =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : process.env.APP_VERSION || '0.0.0';
const buildTimeRaw =
  typeof __LAST_COMMIT_TIME__ !== 'undefined' ? __LAST_COMMIT_TIME__ : process.env.BUILD_TIME;
const gitSha = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'local';

export const buildInfo = {
  appVersion,
  buildTimeText: buildTimeRaw ? new Date(buildTimeRaw).toLocaleString() : '--',
  gitSha,
  copyrightText: `© ${new Date().getFullYear()} Beforeve`,
};
