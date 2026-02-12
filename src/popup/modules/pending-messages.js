// pending-messages.js - Handle pending error messages from background script

import { STORAGE_KEYS, HISTORY_CONFIG } from "../../core/constants.js";
import { getStorage, setStorage } from "../../utils/utils.js";
import { messageFromErrorCode } from "../../core/error-messages.js";
import { showMessageBox } from "../../ui/popup-ui.js";

/**
 * Check for and display any pending messages from the background script
 * (e.g., errors from keyboard shortcuts)
 */
export async function showPendingMessageIfAny() {
  const { [STORAGE_KEYS.PENDING_MESSAGE]: byewallPendingMessage } =
    await getStorage(STORAGE_KEYS.PENDING_MESSAGE);

  if (!byewallPendingMessage) return;

  const { code, time } = byewallPendingMessage;
  if (
    typeof time === "number" &&
    Date.now() - time < HISTORY_CONFIG.MESSAGE_TIMEOUT
  ) {
    const msg = messageFromErrorCode(code);
    showMessageBox(msg);
  }

  // Clear the pending message
  await setStorage(STORAGE_KEYS.PENDING_MESSAGE, null);
}
