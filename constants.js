// constants.js — shared constants across the extension

// Timeouts (ms)
export const TIMEOUTS = {
  ARCHIVE_TODAY_PRECHECK: 3500,
  ARCHIVE_TODAY_RETRY_EXTRA: 2500,
  WAYBACK_PRECHECK: 700,
  WAYBACK_FULL: 8000,
};

// Archive services
export const SERVICES = {
  ARCHIVE_TODAY: 'archiveToday',
  WAYBACK: 'wayback',
};

export const SERVICE_NAMES = {
  [SERVICES.ARCHIVE_TODAY]: 'Archive.Today',
  [SERVICES.WAYBACK]: 'Wayback Machine',
};

// Storage keys
export const STORAGE_KEYS = {
  ARCHIVE_HISTORY: 'archiveHistory',
  SELECTED_SERVICE: 'selectedArchiveServicePref',
  OPEN_IN_NEW_TAB: 'openInNewTab',
  DARK_MODE: 'darkModeEnabled',
  PENDING_MESSAGE: 'byewallPendingMessage',
};

// History settings
export const HISTORY_CONFIG = {
  MAX_ITEMS: 5,
  MESSAGE_TIMEOUT: 30000, // 30 seconds
};

// URLs
export const ARCHIVE_URLS = {
  ARCHIVE_TODAY_BASE: 'https://archive.today/',
  ARCHIVE_TODAY_NEWEST: 'newest/',
  WAYBACK_AVAILABLE: 'https://archive.org/wayback/available',
  WAYBACK_CDX: 'https://web.archive.org/cdx/search/cdx',
  WAYBACK_WEB: 'https://web.archive.org/web/',
};

// Error codes
export const ERROR_CODES = {
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_URL: 'UNSUPPORTED_URL',
  NO_SNAPSHOT_ARCHIVE_TODAY: 'NO_SNAPSHOT_ARCHIVE_TODAY',
  NO_SNAPSHOT_WAYBACK: 'NO_SNAPSHOT_WAYBACK',
  WAYBACK_TIMEOUT: 'WAYBACK_TIMEOUT',
  WAYBACK_ERROR: 'WAYBACK_ERROR',
  ARCHIVE_TODAY_TIMEOUT: 'ARCHIVE_TODAY_TIMEOUT',
  ARCHIVE_TODAY_UNCERTAIN: 'ARCHIVE_TODAY_UNCERTAIN',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

// Tracking parameters to remove from URLs
export const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'gift',
];

// Unsupported URL prefixes
export const UNSUPPORTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'edge-extension://',
  'about:',
  'file://',
  'moz-extension://',
  'opera://',
];