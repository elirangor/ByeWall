# Privacy Policy for Page Rewind

**Last Updated: February 2026**

Page Rewind ("we," "us," or "the extension") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our Chrome extension.

## 1. Data Collection
**We do not collect any personal information.** Page Rewind does not send your browsing data, history, or any other personal information to our own servers or any third-party analytics services. 

## 2. Use of Permissions
To provide its core functionality, the extension requires the following permissions:
* **`tabs` / `activeTab`**: Used solely to retrieve the URL and title of the website you are currently viewing so it can be sent to an archive service upon your explicit request.
* **`storage`**: Used to store your extension preferences (like Dark Mode) and your recently viewed archive history locally on your device.
* **`scripting`**: Used to enable the "Same Tab" navigation feature by allowing the extension to update the current tab's location.

## 3. Data Storage and Retention
All history and preference data is stored **locally** on your device via the `chrome.storage.local` API. 
* **History**: We only keep the last 5 archived pages in your local history.
* **Control**: We have no access to this data. You can clear this data at any time by uninstalling the extension or clearing your browser data.

## 4. Third-Party Services
When you choose to archive a page, the URL is sent to the service you selected:
* **Archive.today** (`archive.today`, `archive.ph`)
* **Wayback Machine** (`web.archive.org`)

These are independent third-party services. Page Rewind only sends the URL you explicitly ask to archive. We recommend reviewing the privacy policies of these services.

## 5. Changes to This Policy
We may update this privacy policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons.

## 6. Contact
If you have questions about this privacy policy, you can contact the developer via the [GitHub repository](https://github.com/elirangor/ByeWall).
