// error-messages.js — error code to user message mapping

import { ERROR_CODES } from './constants.js';

/**
 * Convert error codes to user-friendly messages
 */
export function messageFromErrorCode(code) {
  switch (code) {
    case ERROR_CODES.INVALID_URL:
      return 'Invalid URL detected.';
    
    case ERROR_CODES.UNSUPPORTED_URL:
      return 'Cannot archive this type of page.';
    
    case ERROR_CODES.NO_SNAPSHOT_ARCHIVE_TODAY:
      return 'No snapshot available on Archive.Today for this URL.';
    
    case ERROR_CODES.NO_SNAPSHOT_WAYBACK:
      return 'No archived version found in Wayback Machine for this URL.';
    
    case ERROR_CODES.WAYBACK_TIMEOUT:
      return 'Request timed out. The archive service might be slow.';
    
    case ERROR_CODES.ARCHIVE_TODAY_TIMEOUT:
    case ERROR_CODES.ARCHIVE_TODAY_UNCERTAIN:
    case ERROR_CODES.NETWORK_ERROR:
      return "Couldn't verify a snapshot on Archive.Today (blocked or timed out).";
    
    default:
      return 'Service unavailable. Please try again or use the other archive option.';
  }
}