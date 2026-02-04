// Background service worker for Chrome Extension

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Context menu for "Send selection to NotebookLM"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-to-notebooklm',
    title: 'Send selection to NotebookLM',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'send-to-notebooklm' && info.selectionText && tab?.id) {
    // Store selection in storage to be picked up by side panel
    await chrome.storage.local.set({
      pendingSelection: {
        text: info.selectionText,
        url: tab.url,
        title: tab.title,
      },
    });

    // Open side panel
    if (tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
});

// Listen for messages from content scripts or side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({
          url: tabs[0].url,
          title: tabs[0].title,
        });
      }
    });
    return true; // Will respond asynchronously
  }
});
