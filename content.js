// This file runs in the context of web pages
// It analyzes page content when requested by the background script

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "ping") {
      sendResponse({pong: true});
      return true;
    }
    return false;
  });
  
  // Function to extract and send page content
  function sendPageContent() {
    try {
      // Function to extract text and metadata from the page
      const getPageContent = () => {
        // Get page title
        const title = document.title;
        
        // Get meta description
        const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
        
        // Get OpenGraph and other metadata
        const metaTags = {};
        document.querySelectorAll('meta').forEach(meta => {
          const property = meta.getAttribute('property') || meta.getAttribute('name');
          if (property) {
            metaTags[property] = meta.getAttribute('content');
          }
        });
        
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
        
        // Detect search queries
        let searchQuery = '';
        if (document.location.href.includes('/search')) {
          const searchInputs = document.querySelectorAll('input[type="search"], input[name="q"], input[name="query"]');
          if (searchInputs.length > 0) {
            searchQuery = searchInputs[0].value || '';
          }
          
          if (!searchQuery) {
            try {
              const urlParams = new URLSearchParams(window.location.search);
              searchQuery = urlParams.get('q') || urlParams.get('query') || '';
            } catch (e) {
              console.error("Error parsing search query:", e);
            }
          }
        }
        
        // Detect other page characteristics
        const hasVideo = document.querySelectorAll('video').length > 0 || 
                        document.querySelectorAll('iframe[src*="youtube"]').length > 0;
                        
        const hasLoginForm = document.querySelectorAll('input[type="password"]').length > 0;
        
        const hasSocialElements = document.querySelectorAll(
          '[class*="social"], [id*="social"], [class*="share"], [id*="share"]'
        ).length > 0;
        
        // Create metadata object with page characteristics
        const metadata = {
          url: window.location.href,
          domain: window.location.hostname,
          metaTags: metaTags,
          searchQuery: searchQuery,
          hasVideo: hasVideo,
          hasLoginForm: hasLoginForm,
          hasSocialElements: hasSocialElements,
          contentLength: (paragraphs + headings + listItems).length
        };
        
        // Combine all text
        return {
          title: title,
          url: window.location.href,
          fullText: `${title} ${metaDescription} ${headings} ${paragraphs} ${listItems} ${links}`,
          metadata: metadata
        };
      };
      
      // Extract page content
      const content = getPageContent();
      
      // Send content to background script
      chrome.runtime.sendMessage({
        action: 'contentAnalysis',
        url: content.url,
        title: content.title,
        content: content.fullText,
        metadata: content.metadata
      }).catch(err => {
        console.error("Error sending content analysis message:", err);
      });
    } catch (error) {
      console.error("Error in sendPageContent:", error);
    }
  }
  
  // Send content analysis on page load
  window.addEventListener('load', () => {
    // Wait for the page to fully render
    setTimeout(sendPageContent, 1500);
  });
  
  // Report page content on document visibility changes (when user returns to tab)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(sendPageContent, 500);
    }
  });
  
  // Set up a mutation observer to detect dynamic content changes
  let contentChangeTimer = null;
  const observer = new MutationObserver((mutations) => {
    // Only process significant DOM changes
    const significantChanges = mutations.some(mutation => 
      mutation.type === 'childList' && mutation.addedNodes.length > 2
    );
    
    if (significantChanges) {
      // Debounce content analysis to avoid excessive processing
      clearTimeout(contentChangeTimer);
      contentChangeTimer = setTimeout(() => {
        sendPageContent();
      }, 2000);
    }
  });
  
  // Start observing the document with configured parameters
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false,
    attributeFilter: ['class', 'id'] // Only care about structural changes
  });
  
  // Stop observing after 20 seconds to prevent performance issues
  setTimeout(() => {
    observer.disconnect();
  }, 20000);
  