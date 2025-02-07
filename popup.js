document.addEventListener('DOMContentLoaded', () => {
  // Get elements
  const startView = document.getElementById('start-view');
  const activeView = document.getElementById('active-view');
  const resultsView = document.getElementById('results-view');
  
  // Set popup size
  setPopupSize(300, 250);
  
  const taskInput = document.getElementById('task-description');
  const startButton = document.getElementById('start-session');
  const endButton = document.getElementById('end-session');
  const newSessionButton = document.getElementById('new-session');
  const toggleClassificationButton = document.getElementById('toggle-classification');
  const analysisIndicator = document.getElementById('analysis-indicator');
  
  // Check if there's an active session
  chrome.storage.local.get(['activeSession', 'sessionTask', 'sessionStart'], (data) => {
    if (data.activeSession) {
      // Show active session view
      startView.classList.add('hidden');
      activeView.classList.remove('hidden');
      document.getElementById('task-display').textContent = data.sessionTask;
      
      // Start updating stats
      updateStats();
      setInterval(updateStats, 1000);
      
      // Update current site info
      updateCurrentSiteInfo();
    }
  });
  
  // Start session button
  startButton.addEventListener('click', () => {
    const task = taskInput.value.trim();
    if (!task) {
      alert('Please describe what you are working on');
      return;
    }
    
    // Save session data
    const sessionStart = Date.now();
    chrome.storage.local.set({
      activeSession: true,
      sessionTask: task,
      sessionStart: sessionStart,
      visitedSites: {},
      productiveTime: 0,
      unproductiveTime: 0
    });
    
    // Update background script
    chrome.runtime.sendMessage({
      action: 'startSession',
      task: task
    });
    
    // Show active view
    startView.classList.add('hidden');
    activeView.classList.remove('hidden');
    document.getElementById('task-display').textContent = task;
    
    // Start updating stats
    updateStats();
    setInterval(updateStats, 1000);
    
    // Update current site info after a delay to give time for classification
    setTimeout(updateCurrentSiteInfo, 1000);
  });
  
  // End session button
  endButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'endSession' });
    chrome.storage.local.set({ activeSession: false });
    
    // Show results view
    activeView.classList.add('hidden');
    resultsView.classList.remove('hidden');
    
    // Display final results
    displayResults();
  });
  
  // Toggle classification button
  toggleClassificationButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'toggleClassification' }, (response) => {
      if (response && response.isProductive !== undefined) {
        document.getElementById('current-site-status').textContent = 
          response.isProductive ? 'Productive' : 'Unproductive';
        document.getElementById('current-site-status').className = 
          response.isProductive ? 'productive-status' : 'unproductive-status';
        
        // Add feedback message
        document.getElementById('classification-reason').textContent = 
          "Classification manually overridden by you";
      }
    });
  });
  
  // New session button
  newSessionButton.addEventListener('click', () => {
    resultsView.classList.add('hidden');
    startView.classList.remove('hidden');
    taskInput.value = '';
  });
  
  function updateStats() {
    chrome.storage.local.get(['sessionStart', 'productiveTime', 'unproductiveTime'], (data) => {
      if (data.sessionStart) {
        const sessionDuration = Date.now() - data.sessionStart;
        document.getElementById('active-time').textContent = formatTime(sessionDuration);
        document.getElementById('productive-time').textContent = formatTime(data.productiveTime || 0);
        document.getElementById('unproductive-time').textContent = formatTime(data.unproductiveTime || 0);
      }
    });
  }
  
  function updateCurrentSiteInfo() {
    chrome.runtime.sendMessage({ action: 'getCurrentSite' }, (response) => {
      if (response && response.currentSite) {
        const site = response.currentSite;
        document.getElementById('current-site-url').textContent = site.hostname;
        
        // Update classification status
        document.getElementById('current-site-status').textContent = 
          site.isProductive ? 'Productive' : 'Unproductive';
        document.getElementById('current-site-status').className = 
          site.isProductive ? 'productive-status' : 'unproductive-status';
        
        // Show analysis indicator if classification is pending
        if (site.classificationPending) {
          analysisIndicator.classList.remove('hidden');
        } else {
          analysisIndicator.classList.add('hidden');
        }
        
        // Update explanation
        document.getElementById('classification-reason').textContent = 
          site.explanation || 'No explanation provided';
      } else {
        document.getElementById('current-site-url').textContent = 'None';
        document.getElementById('current-site-status').textContent = 'Unknown';
        document.getElementById('current-site-status').className = '';
        document.getElementById('classification-reason').textContent = 'Not yet analyzed';
        analysisIndicator.classList.add('hidden');
      }
    });
  }
  
  function displayResults() {
    chrome.storage.local.get(['sessionStart', 'productiveTime', 'unproductiveTime', 'visitedSites'], (data) => {
      const sessionEnd = Date.now();
      const totalTime = sessionEnd - (data.sessionStart || 0);
      
      document.getElementById('total-time').textContent = formatTime(totalTime);
      document.getElementById('final-productive-time').textContent = formatTime(data.productiveTime || 0);
      document.getElementById('final-unproductive-time').textContent = formatTime(data.unproductiveTime || 0);
      
      const productivePercent = totalTime > 0 ? Math.round((data.productiveTime / totalTime) * 100) : 0;
      const unproductivePercent = totalTime > 0 ? Math.round((data.unproductiveTime / totalTime) * 100) : 0;
      
      document.getElementById('productive-percent').textContent = `${productivePercent}%`;
      document.getElementById('unproductive-percent').textContent = `${unproductivePercent}%`;
      
      // Display visited sites
      const sitesList = document.getElementById('sites-list');
      sitesList.innerHTML = '';
      
      const sites = data.visitedSites || {};
      
      // Convert to array and sort by time spent (descending)
      const sitesArray = Object.entries(sites).map(([hostname, site]) => ({
        hostname,
        ...site
      }));
      
      sitesArray.sort((a, b) => b.totalTime - a.totalTime);
      
      sitesArray.forEach(site => {
        const siteElement = document.createElement('div');
        siteElement.className = `site-item ${site.isProductive ? 'productive' : 'unproductive'}`;
        siteElement.innerHTML = `
          <div class="site-title">${site.title || site.hostname}</div>
          <div class="site-url">${site.hostname}</div>
          <div class="site-time">${formatTime(site.totalTime || 0)}</div>
          <div class="site-status">${site.isProductive ? 'Productive' : 'Unproductive'}</div>
        `;
        sitesList.appendChild(siteElement);
      });
    });
  }
  
  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  
  // Function to control popup size
  function setPopupSize(width, height) {
    document.body.style.width = `${width}px`;
    document.body.style.height = `${height}px`;
    document.body.style.minWidth = `${width}px`;
    document.body.style.minHeight = `${height}px`;
    document.body.style.maxWidth = `${width}px`;
    document.body.style.maxHeight = `${height}px`;
  }
  
  // Listen for updates from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'siteUpdated') {
      updateCurrentSiteInfo();
    }
    return false;
  });
  
  // Update current site info every 5 seconds
  setInterval(updateCurrentSiteInfo, 5000);
});
