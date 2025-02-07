// Global state
let activeSession = false;
let sessionTask = "";
let sessionStart = null;
let currentSite = null;
let siteStartTime = null;
let visitedSites = {};
let productiveTime = 0;
let unproductiveTime = 0;

// Gemini API Key
// Import API key from .env file (ensure you create a .env file with your own GEMINI_API_KEY)
// Example .env file content: GEMINI_API_KEY=your_api_key_here
let GEMINI_API_KEY;
try {
  // In development, load from .env file through environment variables
  GEMINI_API_KEY = process.env.GEMINI_API_KEY;
} catch (error) {
  // Fallback to placeholder - IMPORTANT: Replace with your own API key in .env file
  GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
  console.warn("Please add your Gemini API key to the .env file");
}
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Load initial state from storage
chrome.storage.local.get(['activeSession', 'sessionTask', 'sessionStart', 'visitedSites', 'productiveTime', 'unproductiveTime'], (data) => {
  if (data.activeSession) {
    activeSession = data.activeSession;
    sessionTask = data.sessionTask || "";
    sessionStart = data.sessionStart || Date.now();
    visitedSites = data.visitedSites || {};
    productiveTime = data.productiveTime || 0;
    unproductiveTime = data.unproductiveTime || 0;
    
    // Get the current tab to start tracking immediately
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        handleTabChange(tabs[0].url, tabs[0].title);
      }
    });
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSession') {
    activeSession = true;
    sessionTask = message.task;
    sessionStart = Date.now();
    visitedSites = {};
    productiveTime = 0;
    unproductiveTime = 0;
    
    // Get current tab to start tracking
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        handleTabChange(tabs[0].url, tabs[0].title);
      }
    });
    
  } else if (message.action === 'endSession') {
    if (currentSite && siteStartTime) {
      // Update time for the last site
      updateSiteTime();
    }
    activeSession = false;
    saveSessionData();
    
  } else if (message.action === 'getCurrentSite') {
    sendResponse({ currentSite: currentSite });
    return true;
    
  } else if (message.action === 'toggleClassification') {
    if (currentSite) {
      currentSite.isProductive = !currentSite.isProductive;
      
      // Track user corrections for improving classification
      chrome.storage.local.get(['classificationFeedback'], (data) => {
        const feedback = data.classificationFeedback || {};
        feedback[currentSite.url] = {
          task: sessionTask,
          isProductive: currentSite.isProductive,
          timeStamp: Date.now()
        };
        chrome.storage.local.set({ classificationFeedback: feedback });
      });
      
      if (visitedSites[currentSite.hostname]) {
        visitedSites[currentSite.hostname].isProductive = currentSite.isProductive;
      }
      saveSessionData();
      sendResponse({ isProductive: currentSite.isProductive });
      return true;
    }
    
  } else if (message.action === 'contentAnalysis') {
    // Process content analysis from content script
    processContentAnalysis(message.url, message.title, message.content, message.metadata)
      .then(() => {
        // Notify popup about the update
        try {
          chrome.runtime.sendMessage({
            action: 'siteUpdated',
            site: currentSite
          });
        } catch (err) {
          console.log("Error sending site update: ", err);
        }
      }).catch(err => {
        console.error("Error processing content:", err);
      });
  }
});

// Track active tab changes
chrome.tabs.onActivated.addListener(activeInfo => {
  if (!activeSession) return;
  
  chrome.tabs.get(activeInfo.tabId, tab => {
    handleTabChange(tab.url, tab.title);
  });
});

// Track URL changes in the same tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeSession || !changeInfo.url) return;
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && tabs[0].id === tabId) {
      handleTabChange(tab.url, tab.title);
    }
  });
});

// Classify using Gemini API
async function classifyWithGeminiAI(url, pageTitle, taskContext, pageContent, metadata) {
  try {
    // First check if we have a cached result
    const cacheKey = `${url}_${taskContext}`;
    const cachedResult = await getCachedClassification(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    
    // Prepare page content - truncate if too long
    const contentSummary = pageContent && pageContent.length > 2000 
      ? pageContent.substring(0, 2000) + "... (content truncated for length)"
      : (pageContent || "No content available");
    
    // Create prompt for Gemini
    const prompt = `
Task Context: "${taskContext}"
URL: ${url}
Page Title: ${pageTitle}
Page Content Summary: ${contentSummary}

Based ONLY on the relevance of this content to the user's task context, classify whether this webpage is productive or unproductive for the user's current task.

DO NOT use any preset rules about specific topics, domains, or categories. Analyze the actual content and its relevance to the task.

Consider factors like:
1. How directly relevant is the content to completing the user's task?
2. Does the content provide useful information for the task context?
3. Is the content likely to distract from the task rather than support it?

Respond in this exact format:
CLASSIFICATION: [productive/unproductive]
EXPLANATION: [brief explanation focused only on content relevance to the task]
`;

    // Prepare request to Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                  "CLASSIFICATION: productive\nEXPLANATION: Unable to determine, defaulting to productive.";
    
    console.log('Gemini Classification Result:', result);
    
    // Cache the result
    cacheClassification(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('Error using Gemini AI:', error);
    // Fall back to basic classification if Gemini fails
    return fallbackClassification(url, pageTitle, taskContext, pageContent, metadata);
  }
}

// Dynamic fallback classification without hardcoded rules
function fallbackClassification(url, pageTitle, taskContext, pageContent, metadata) {
  // Process url parameters if this is a search query
  let searchQuery = '';
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('google.com') && urlObj.pathname.includes('/search')) {
      searchQuery = urlObj.searchParams.get('q') || '';
    }
  } catch (e) {
    console.error("Error parsing URL:", e);
  }
  
  // Extract keywords from search query if present
  const searchKeywords = searchQuery ? extractTerms(searchQuery) : [];
  
  // Determine relevance by comparing task and content
  const taskTerms = extractTerms(taskContext);
  const titleTerms = extractTerms(pageTitle);
  const contentTerms = pageContent ? extractTerms(pageContent.substring(0, 3000)) : [];
  
  // Include metadata in analysis if available
  const metadataTerms = metadata ? extractTerms(JSON.stringify(metadata)) : [];
  
  // Calculate semantic relevance using weighted scores
  const titleRelevance = calculateOverlap(taskTerms, titleTerms) * 2.0; // Title is highest weight
  const contentRelevance = calculateOverlap(taskTerms, contentTerms) * 0.8;
  const searchRelevance = searchKeywords.length > 0 ? 
                         calculateOverlap(taskTerms, searchKeywords) * 1.5 : 0; // Search queries are high weight
  const metadataRelevance = metadataTerms.length > 0 ? 
                           calculateOverlap(taskTerms, metadataTerms) * 0.4 : 0;
  
  // Calculate weighted relevance score
  let relevanceFactors = [titleRelevance, contentRelevance];
  let totalWeight = 2.8; // Sum of weights: 2.0 + 0.8
  
  if (searchRelevance > 0) {
    relevanceFactors.push(searchRelevance);
    totalWeight += 1.5;
  }
  
  if (metadataRelevance > 0) {
    relevanceFactors.push(metadataRelevance);
    totalWeight += 0.4;
  }
  
  // Calculate final score normalized by total weight
  const totalRelevance = relevanceFactors.reduce((sum, val) => sum + val, 0);
  const relevanceScore = totalWeight > 0 ? totalRelevance / totalWeight : 0;
  
  // Check for recent feedback on similar URLs
  let feedbackAdjustment = 0;
  chrome.storage.local.get(['classificationFeedback'], (data) => {
    const feedback = data.classificationFeedback || {};
    
    // Look for similar URLs with matching task contexts
    Object.entries(feedback).forEach(([feedbackUrl, details]) => {
      try {
        if (feedbackUrl.includes(new URL(url).hostname) && 
            calculateOverlap(extractTerms(details.task), taskTerms) > 0.5) {
          // Apply feedback adjustment based on recency (within last 7 days)
          const daysSinceFeedback = (Date.now() - details.timeStamp) / (1000 * 60 * 60 * 24);
          if (daysSinceFeedback < 7) {
            feedbackAdjustment = details.isProductive ? 0.2 : -0.2;
          }
        }
      } catch (e) {
        console.error("Error processing feedback URL:", e);
      }
    });
  });
  
  // Adjust relevance score with feedback
  const adjustedScore = relevanceScore + feedbackAdjustment;
  
  // Format factors for explanation
  const factors = [];
  if (titleRelevance > 0) factors.push(`title relevance: ${titleRelevance.toFixed(2)}`);
  if (contentRelevance > 0) factors.push(`content relevance: ${contentRelevance.toFixed(2)}`);
  if (searchRelevance > 0) factors.push(`search query relevance: ${searchRelevance.toFixed(2)}`);
  if (feedbackAdjustment !== 0) factors.push(`user feedback adjustment: ${feedbackAdjustment.toFixed(2)}`);
  
  // Classify based on adjusted relevance score (threshold 0.15)
  if (adjustedScore > 0.15) {
    return `CLASSIFICATION: productive
EXPLANATION: The content appears relevant to your task with factors: ${factors.join(', ')}.`;
  } else {
    return `CLASSIFICATION: unproductive
EXPLANATION: The content has low relevance to your task with factors: ${factors.join(', ')}.`;
  }
}

// Helper function to extract terms from text
function extractTerms(text) {
  if (!text) return [];
  
  // Remove common words and punctuation
  const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'on', 'in', 'to', 'for', 'with', 'by', 'at', 'of'];
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
}

// Helper function to calculate overlap between term sets
function calculateOverlap(terms1, terms2) {
  if (!terms1.length || !terms2.length) return 0;
  
  let matches = 0;
  const terms1Set = new Set(terms1);
  
  // Count exact matches
  terms2.forEach(term => {
    if (terms1Set.has(term)) {
      matches += 1;
    }
  });
  
  // Also look for partial matches for longer terms
  terms2.forEach(term => {
    if (term.length > 4) {
      for (const t1 of terms1) {
        if (t1.length > 4 && (t1.includes(term) || term.includes(t1))) {
          matches += 0.5;
          break;
        }
      }
    }
  });
  
  // Normalize by the smaller set size
  return matches / Math.min(terms1.length, terms2.length);
}

// Cache management for classifications
async function getCachedClassification(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(['classificationCache'], (data) => {
      const cache = data.classificationCache || {};
      resolve(cache[key] || null);
    });
  });
}

function cacheClassification(key, result) {
  chrome.storage.local.get(['classificationCache'], (data) => {
    const cache = data.classificationCache || {};
    cache[key] = result;
    cache[key].timestamp = Date.now();
    
    // Limit cache size to avoid storage issues
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      // Remove oldest 20 entries
      const keysByTime = keys.sort((a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0));
      for (let i = 0; i < 20; i++) {
        delete cache[keysByTime[i]];
      }
    }
    
    chrome.storage.local.set({ classificationCache: cache });
  });
}

// Process the content analysis with progressive approach and latency management
async function processContentAnalysis(url, title, content, metadata) {
  if (!currentSite || currentSite.url !== url) return;
  
  // Set classification status to pending
  currentSite.classificationPending = true;
  currentSite.classificationStartTime = Date.now();
  
  // Perform quick analysis with just title for immediate feedback
  if (!currentSite.initialClassificationDone) {
    const quickClassification = fallbackClassification(url, title, sessionTask, "", metadata);
    const isProductiveQuick = quickClassification.toLowerCase().includes('classification: productive');
    
    // Update with preliminary result
    currentSite.isProductive = isProductiveQuick;
    currentSite.explanation = "Initial classification based on title: " + 
                             (quickClassification.match(/EXPLANATION:\s*(.*)/i)?.[1] || "Analyzing...");
    currentSite.initialClassificationDone = true;
    
    // Save preliminary data
    saveSessionData();
    
    // Notify popup about initial update
    try {
      chrome.runtime.sendMessage({
        action: 'siteUpdated',
        site: currentSite
      });
    } catch (err) {
      console.log("Error sending initial site update: ", err);
    }
  }
  
  // Perform full content classification
  console.log(`Starting full classification for ${currentSite.hostname}...`);
  const startTime = Date.now();
  
  // Classify the content using Gemini AI
  const classification = await classifyWithGeminiAI(url, title, sessionTask, content, metadata);
  
  // FIX: Properly determine if the classification is productive
  // Look for specific pattern "CLASSIFICATION: productive" or "CLASSIFICATION: [productive]"
  const isProductive = classification.toLowerCase().match(/classification:\s*\[?productive\]?/i) !== null;
  
  // Log performance metrics
  const classificationTime = Date.now() - startTime;
  console.log(`Classification completed in ${classificationTime}ms`);
  
  // Extract explanation if available
  const explanationMatch = classification.match(/EXPLANATION:\s*(.*)/i);
  const explanation = explanationMatch ? explanationMatch[1] : 'No explanation provided';
  
  console.log(`Classification for ${currentSite.hostname}: ${isProductive ? 'Productive' : 'Unproductive'} - ${explanation}`);
  
  // Update current site with final classification results
  currentSite.isProductive = isProductive;
  currentSite.explanation = explanation;
  currentSite.classificationPending = false;
  currentSite.classificationTime = classificationTime;
  
  // Update visited sites record
  if (visitedSites[currentSite.hostname]) {
    visitedSites[currentSite.hostname].isProductive = isProductive;
  }
  
  // Save data to storage
  saveSessionData();
  
  // Set alarm for notification if site is unproductive
  if (!isProductive) {
    chrome.alarms.create(`unproductive-${Date.now()}`, {
      delayInMinutes: 2 // Show notification after 2 minutes
    });
  }
}

// Handle tab changes to analyze new pages
async function handleTabChange(url, title) {
  if (!activeSession || !url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }
  
  // Update time for previous site if any
  if (currentSite && siteStartTime) {
    updateSiteTime();
  }
  
  // Skip browser UI pages
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    currentSite = null;
    siteStartTime = null;
    return;
  }
  
  // Extract hostname
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    hostname = url;
  }
  
  // Set current site with initial data
  currentSite = {
    url: url,
    hostname: hostname,
    title: title,
    isProductive: true, // Default to productive initially
    explanation: "Initial classification, waiting for content analysis...",
    classificationPending: true,
    initialClassificationDone: false
  };
  
  siteStartTime = Date.now();
  
  // Initialize this site in visited sites if not already there
  if (!visitedSites[hostname]) {
    visitedSites[hostname] = {
      title: title,
      url: url,
      totalTime: 0,
      isProductive: true
    };
  }
  
  // Save data to storage
  saveSessionData();
  
  // Get active tab to analyze content
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0] && tabs[0].url === url) {
      // Execute content script to analyze page content
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: grabPageContent,
        args: [url, sessionTask]
      }).catch(err => {
        console.error("Error executing content script:", err);
        
        // If content script fails, still attempt classification with minimal data
        processContentAnalysis(url, title, "", null);
      });
    }
  } catch (error) {
    console.error('Error executing content script:', error);
    // Still try to classify with minimal data if scripting fails
    processContentAnalysis(url, title, "", null);
  }
}

// Function to run in content script context to get page content
function grabPageContent(url, taskContext) {
  // Function to extract text content from the page
  function getVisibleText() {
    // Get page title
    const title = document.title;
    
    // Get meta description
    const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
    
    // Get all heading text
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(h => h.innerText.trim())
      .join(' ');
    
    // Get all paragraph text
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map(p => p.innerText.trim())
      .join(' ');
    
    // Get text from other important elements
    const listItems = Array.from(document.querySelectorAll('li'))
      .map(li => li.innerText.trim())
      .join(' ');
    
    // Get text from links
    const links = Array.from(document.querySelectorAll('a'))
      .map(a => a.innerText.trim())
      .join(' ');
    
    // Extra metadata that might be useful
    const metadata = {
      url: window.location.href,
      domain: window.location.hostname,
      hasLoginForm: document.querySelectorAll('input[type="password"]').length > 0,
      hasVideo: document.querySelectorAll('video').length > 0 || 
                document.querySelectorAll('iframe[src*="youtube"]').length > 0,
      isSearchPage: window.location.href.includes('/search') || 
                   document.querySelectorAll('input[type="search"]').length > 0
    };
    
    // Check if page might be a search results page
    if (metadata.isSearchPage) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        metadata.searchQuery = urlParams.get('q') || urlParams.get('query') || '';
      } catch (e) {
        console.error("Error parsing search query:", e);
      }
    }
    
    // Combine all text
    return {
      title: title,
      metaDescription: metaDescription,
      headings: headings,
      paragraphs: paragraphs,
      listItems: listItems,
      links: links,
      fullText: `${title} ${metaDescription} ${headings} ${paragraphs} ${listItems} ${links}`,
      metadata: metadata
    };
  }
  
  try {
    // Extract page content
    const pageContent = getVisibleText();
    
    // Send the content back to the background script
    chrome.runtime.sendMessage({
      action: 'contentAnalysis',
      url: url,
      title: pageContent.title,
      content: pageContent.fullText,
      metadata: pageContent.metadata
    }).catch(err => {
      console.error("Error sending content analysis message:", err);
    });
  } catch (error) {
    console.error("Error grabbing page content:", error);
  }
}

// Update time tracking for the current site
function updateSiteTime() {
  if (!currentSite || !siteStartTime) return;
  
  const timeSpent = Date.now() - siteStartTime;
  const hostname = currentSite.hostname;
  
  if (!visitedSites[hostname]) {
    visitedSites[hostname] = {
      title: currentSite.title,
      url: currentSite.url,
      totalTime: 0,
      isProductive: currentSite.isProductive
    };
  }
  
  visitedSites[hostname].totalTime = (visitedSites[hostname].totalTime || 0) + timeSpent;
  
  if (currentSite.isProductive) {
    productiveTime += timeSpent;
  } else {
    unproductiveTime += timeSpent;
  }
  
  // Save updated times
  saveSessionData();
}

// Save session data to Chrome storage
function saveSessionData() {
  chrome.storage.local.set({
    activeSession: activeSession,
    sessionTask: sessionTask,
    sessionStart: sessionStart,
    visitedSites: visitedSites,
    productiveTime: productiveTime,
    unproductiveTime: unproductiveTime
  });
}

// Handle alarms for productivity notifications
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('unproductive-') && currentSite && !currentSite.isProductive && !currentSite.classificationPending) {
    const timeOnSite = (Date.now() - siteStartTime) / 60000; // minutes
    if (timeOnSite >= 2) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Productivity Alert',
        message: `You've spent over 2 minutes on ${currentSite.hostname} which appears unproductive for your task: ${sessionTask}`,
        priority: 2
      });
    }
  }
});

// Periodically update time for current site
setInterval(() => {
  if (activeSession && currentSite && siteStartTime) {
    updateSiteTime();
    siteStartTime = Date.now(); // Reset the timer for the next interval
  }
}, 30000); // Every 30 seconds
