Gg
# AI-Powered Productivity Chrome Extension
A smart Chrome extension that helps you stay focused by analyzing your browsing activity using AI (Gemini API) and providing real-time productivity insights.

<img width="1440" alt="Screenshot 2025-04-17 at 8 16 50 PM" src="https://github.com/user-attachments/assets/24d2cacb-c4e5-4999-9ede-84780a4157c4" />



## Features ✨

- **AI-Powered Website Classification**  
  Automatically categorizes visited sites as productive/unproductive using Gemini AI

- **Real-Time Tracking Dashboard**  
  Visualizes productive vs unproductive time with interactive charts

- **Smart Notifications**  
  Alerts when spending too much time on unproductive sites

- **Customizable Allowlist**  
  Manually override classifications for specific domains

- **Session History**  
  Review daily/weekly productivity trends with detailed reports

## Installation ⚙️

### Prerequisites
- Chrome browser (v90+)
- Google Gemini API key

### Setup
1. Clone repository
2. Install dependencies:
3. Configure Gemini API:
- Create `.env` file with:
  ```
  GEMINI_API_KEY=your_api_key_here
  ```
4. Load extension in Chrome:
- Navigate to `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked" and select the extension directory

## Usage 🚀

1. **Start Session**
- Click extension icon
- Enter task description (e.g., "Researching AI ethics papers")
- Click "Start Focus Session"

2. **View Dashboard**
- Real-time productivity breakdown
- Current website classification
- Time spent analytics

3. **Manage Sessions**
- Pause/resume tracking
- Export session reports (CSV/JSON)
- Customize notification thresholds

## Technology Stack 💻

- **Core**: Chrome Extension API (Manifest v3)
- **AI Engine**: Google Gemini API
- **Frontend**: 
- Modern JavaScript (ES6+)
- Chart.js for visualizations
- Glassmorphism UI design
- **Storage**: Chrome Storage API + IndexedDB
- **Build Tools**: Webpack, Babel

## Configuration ⚙️

`manifest.json` options:
{
"permissions": [
"storage",
"tabs",
"alarms",
"notifications"
],
"host_permissions": [
"<all_urls>"
]
}

## Demo
<img width="1440" alt="Screenshot 2025-04-17 at 8 17 50 PM" src="https://github.com/user-attachments/assets/961d0e96-306b-48fd-a886-adcc446c532a" />
<img width="1440" alt="Screenshot 2025-04-17 at 8 18 12 PM" src="https://github.com/user-attachments/assets/ba904be6-91fb-4654-9682-fd50f6ca956c" />
<img width="1440" alt="Screenshot 2025-04-17 at 8 18 27 PM" src="https://github.com/user-attachments/assets/49da21fa-93c8-445a-9ba1-f2c133c207a6" />
<img width="1440" alt="Screenshot 2025-04-17 at 8 19 16 PM" src="https://github.com/user-attachments/assets/f2328eba-3d00-48e2-8967-35113ced494d" />
<img width="1440" alt="Screenshot 2025-04-17 at 8 20 15 PM" src="https://github.com/user-attachments/assets/22f155a1-70bc-4ecc-a4dc-acb21d44d9f1" />
<img width="1440" alt="Screenshot 2025-04-17 at 8 21 50 PM" src="https://github.com/user-attachments/assets/02ba089a-7c4f-43fc-a130-d8b162845fa6" />