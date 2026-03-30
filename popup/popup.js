// popup/popup.js
// import OpenCTIAPI from '../utils/opencti-api.js';

// DOM Elements
const typeFilterSelect = document.getElementById('type-filter');
const copyAllButton = document.getElementById('copy-all-btn');
const sendAllButton = document.getElementById('send-all-btn');
const refreshButton = document.getElementById('refresh-btn');
const settingsButton = document.getElementById('settings-btn');
const configureOpenCTILink = document.getElementById('configure-opencti');
const scanPageButton = document.getElementById('scan-page-btn');

// UI State Elements
const loadingElement = document.getElementById('loading');
const noIOCsElement = document.getElementById('no-iocs');
const iocContainerElement = document.getElementById('ioc-container');
const openCTIStatusElement = document.getElementById('opencti-status');
const copyFeedbackElement = document.getElementById('copy-feedback');

// Templates
const iocSectionTemplate = document.getElementById('ioc-section-template');
const iocItemTemplate = document.getElementById('ioc-item-template');

// Store all IOCs for the current page
let currentIOCs = {};
// Track current filter
let currentFilter = 'all';
// API instance for OpenCTI
let openCTIAPI = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  initializeEventListeners();
  //checkOpenCTISettings();
  await loadIOCs();
});

// Set up event listeners
function initializeEventListeners() {
  // Type filter change
  typeFilterSelect.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderIOCs();
  });
  
  // Copy all IOCs
  copyAllButton.addEventListener('click', copyAllIOCs);
  
  // Send all to OpenCTI
  sendAllButton.addEventListener('click', sendAllToOpenCTI);
  
  // Refresh scan
  refreshButton.addEventListener('click', refreshScan);
  
  // Open settings
  settingsButton.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  
  // Configure OpenCTI
  configureOpenCTILink.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  
  // Scan page button
  scanPageButton.addEventListener('click', refreshScan);
  
  // Listen for messages from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'iocs_updated') {
      loadIOCs();
    }
  });
}

/* // Check if OpenCTI is configured
async function checkOpenCTISettings() {
  try {
    // This will depend on your chosen credential storage method
    const data = await browser.storage.local.get('opencti_url');
    
    if (data.opencti_url) {
      // OpenCTI is configured, hide the warning
      openCTIStatusElement.classList.add('hidden');
      
      // Create API instance (we'll add auth later)
      openCTIAPI = new OpenCTIAPI(data.opencti_url, null);
    } else {
      // Show the warning
      openCTIStatusElement.classList.remove('hidden');
      sendAllButton.disabled = true;
      
      // Disable all "Send to OpenCTI" buttons
      document.querySelectorAll('.send-btn, .send-section').forEach(btn => {
        btn.disabled = true;
      });
    }
  } catch (error) {
    console.error('Error checking OpenCTI settings:', error);
    openCTIStatusElement.classList.remove('hidden');
  }
} */

// Load IOCs from the background script
async function loadIOCs() {
  showLoading();
  
  try {
    // Get current tab ID
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs.length === 0) {
      showError("No active tab");
      return;
    }
    
    // Request IOCs for this tab from the background script
    const response = await browser.runtime.sendMessage({
      action: "get_iocs",
      tabId: tabs[0].id
    });
    
    if (response && response.success) {
      currentIOCs = response.data || {};
      renderIOCs();
    } else {
      showError("Failed to load indicators");
    }
  } catch (error) {
    console.error('Error loading IOCs:', error);
    showError("An error occurred while loading indicators");
  }
}

// Render IOCs in the popup
function renderIOCs() {
  // Clear the container
  iocContainerElement.innerHTML = '';
  
  // Check if we have any IOCs
  const totalIOCs = countTotalIOCs();
  
  if (totalIOCs === 0) {
    showNoIOCs();
    return;
  }
  
  // Show the IOC container
  loadingElement.classList.add('hidden');
  noIOCsElement.classList.add('hidden');
  iocContainerElement.classList.remove('hidden');
  
  // Filter IOCs if needed
  let filteredIOCs = currentIOCs;
  if (currentFilter !== 'all') {
    filteredIOCs = {};
    if (currentIOCs[currentFilter]) {
      filteredIOCs[currentFilter] = currentIOCs[currentFilter];
    }
  }
  
  // Create sections for each IOC type
  for (const [type, data] of Object.entries(filteredIOCs)) {
    if (!data.values || data.values.length === 0) continue;
    
    // Clone the section template
    const sectionElement = iocSectionTemplate.content.cloneNode(true);
    
    // Fill in the section details
    sectionElement.querySelector('.section-title').textContent = data.name;
    sectionElement.querySelector('.count-badge').textContent = data.values.length;
    
    // Set up section actions
    const copyButton = sectionElement.querySelector('.copy-section');
    copyButton.addEventListener('click', () => copySectionIOCs(type));
    
    const sendButton = sectionElement.querySelector('.send-section');
    sendButton.addEventListener('click', () => sendSectionToOpenCTI(type));
    
    // Disable send button if OpenCTI is not configured
    //if (!openCTIAPI) {
    sendButton.disabled = true;
    //}
    
    // Get the list element where we'll add IOC items
    const listElement = sectionElement.querySelector('.ioc-list');
    
    // Add each IOC item to the list
    data.values.forEach(ioc => {
      const itemElement = createIOCItem(ioc, type);
      listElement.appendChild(itemElement);
    });
    
    // Add the completed section to the container
    iocContainerElement.appendChild(sectionElement);
  }
}

// Create an IOC item element
function createIOCItem(ioc, type) {
  // Clone the item template
  const itemElement = iocItemTemplate.content.cloneNode(true);
  
  // Fill in the IOC value
  itemElement.querySelector('.ioc-value').textContent = ioc;
  
  // Set up item actions
  const copyButton = itemElement.querySelector('.copy-btn');
  copyButton.addEventListener('click', () => copyToClipboard(ioc));
  
  const sendButton = itemElement.querySelector('.send-btn');
  sendButton.addEventListener('click', () => sendToOpenCTI(ioc, type));
  
  // Disable send button if OpenCTI is not configured
  //if (!openCTIAPI) {
  sendButton.disabled = true;
  //}
  
  return itemElement;
}

// Count total IOCs across all types
function countTotalIOCs() {
  let count = 0;
  for (const type in currentIOCs) {
    if (currentIOCs[type].values) {
      count += currentIOCs[type].values.length;
    }
  }
  return count;
}

// Copy a single IOC to clipboard
function copyToClipboard(text) {
  // Use the background script to copy to clipboard
  browser.runtime.sendMessage({
    action: "copy_ioc",
    text: text
  }).then(() => {
    showCopyFeedback();
  }).catch(error => {
    console.error("Error copying to clipboard:", error);
  });
}

// Copy all IOCs for a section
function copySectionIOCs(type) {
  if (!currentIOCs[type] || !currentIOCs[type].values) return;
  
  const text = currentIOCs[type].values.join('\n');
  copyToClipboard(text);
}

// Copy all visible IOCs
function copyAllIOCs() {
  // Get all visible IOCs based on current filter
  let textLines = [];
  
  if (currentFilter === 'all') {
    // Add all IOC types with headers
    for (const [type, data] of Object.entries(currentIOCs)) {
      if (!data.values || data.values.length === 0) continue;
      
      textLines.push(`# ${data.name}`);
      textLines.push(...data.values);
      textLines.push(''); // Empty line between sections
    }
  } else if (currentIOCs[currentFilter]) {
    // Add only the filtered type
    const data = currentIOCs[currentFilter];
    textLines.push(`# ${data.name}`);
    textLines.push(...data.values);
  }
  
  if (textLines.length === 0) return;
  
  copyToClipboard(textLines.join('\n'));
}

// Send a single IOC to OpenCTI
/* async function sendToOpenCTI(ioc, type) {
  if (!openCTIAPI) {
    showOpenCTIWarning();
    return;
  } */
  
  /*
  try {
    // In a real implementation, you would:
    // 1. Get the API key (from secure storage)
    // 2. Create an authenticated API instance
    // 3. Send the IOC
    
    // This is a placeholder for now
    alert(`This would send the ${type} indicator "${ioc}" to OpenCTI`);
    
    // Example of what the actual implementation might look like:
    /*
    // Get credentials (implementation depends on your storage method)
    const credentials = await getOpenCTICredentials();
    if (!credentials.success) {
      throw new Error('Failed to get OpenCTI credentials');
    }
    
    // Create authenticated API instance
    //const api = new OpenCTIAPI(credentials.apiUrl, credentials.apiKey);
    
    // Send the IOC
    const result = await api.createObservable(ioc, type);
    
    if (result.success) {
      // Show success message
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error('Error sending to OpenCTI:', error);
    alert(`Error: ${error.message}`);
  }
}
*/

// Send all IOCs in a section to OpenCTI
function sendSectionToOpenCTI(type) {
  if (!currentIOCs[type] || !currentIOCs[type].values) return;
  
  // This is a placeholder
  alert(`This would send ${currentIOCs[type].values.length} ${type} indicators to OpenCTI`);
}

// Send all visible IOCs to OpenCTI
function sendAllToOpenCTI() {
  // Get all visible IOCs based on current filter
  let iocsToSend = [];
  
  if (currentFilter === 'all') {
    // Add all IOC types
    for (const [type, data] of Object.entries(currentIOCs)) {
      if (!data.values || data.values.length === 0) continue;
      
      iocsToSend.push({
        type: type,
        name: data.name,
        values: data.values
      });
    }
  } else if (currentIOCs[currentFilter]) {
    // Add only the filtered type
    const data = currentIOCs[currentFilter];
    iocsToSend.push({
      type: currentFilter,
      name: data.name,
      values: data.values
    });
  }
  
  if (iocsToSend.length === 0) return;
  
  // This is a placeholder
  const totalIOCs = iocsToSend.reduce((total, ioc) => total + ioc.values.length, 0);
  alert(`This would send ${totalIOCs} indicators to OpenCTI`);
}

// Refresh the scan
async function refreshScan() {
  showLoading();
  
  try {
    // Request a fresh scan from the content script
    await browser.runtime.sendMessage({
      action: "scan_page"
    });
    
    // Reload IOCs after a short delay to allow the scan to complete
    setTimeout(() => {
      loadIOCs();
    }, 500);
  } catch (error) {
    console.error('Error refreshing scan:', error);
    showError("Failed to scan page", error);
  }
}

// Show loading state
function showLoading() {
  loadingElement.classList.remove('hidden');
  noIOCsElement.classList.add('hidden');
  iocContainerElement.classList.add('hidden');
}

// Show no IOCs state
function showNoIOCs() {
  loadingElement.classList.add('hidden');
  noIOCsElement.classList.remove('hidden');
  iocContainerElement.classList.add('hidden');
}

// Show error message
function showError(message) {
  loadingElement.classList.add('hidden');
  noIOCsElement.classList.remove('hidden');
  iocContainerElement.classList.add('hidden');
  
  noIOCsElement.querySelector('p').textContent = message;
}

// Show copy feedback
function showCopyFeedback() {
  copyFeedbackElement.classList.remove('hidden');
  
  // Hide after animation completes
  setTimeout(() => {
    copyFeedbackElement.classList.add('hidden');
  }, 2000);
}

// Show OpenCTI warning
function showOpenCTIWarning() {
  openCTIStatusElement.classList.remove('hidden');
}