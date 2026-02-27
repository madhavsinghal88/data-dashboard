# 📊 SAP Events Dashboard

A premium, live-synced dashboard for tracking SAP in-person and virtual events. This application connects directly to a Google Sheet and provides advanced tools for managing your event application pipeline.

## 🚀 Live Demo
The dashboard features a modern, dark-themed interface with glassmorphism effects and real-time synchronization.

## ✨ Key Features
- **Live Google Sheets Sync**: Fetches data directly via the Google Visualization API. 
- **Auto-Refresh**: Automatically checks for updates every 60 seconds without page reloads.
- **Multi-Tab Support**: Seamless switching between **In-Person** and **Virtual Events** tabs.
- **Advanced Tracking**: 3-way status toggle for every event:
  - 🟢 **Applied**: Events you've already registered for.
  - 🟡 **To Be Applied**: Your shortlist of upcoming targets.
  - ⚪ **Not Applied**: Default discovery state.
- **Personal Shortlist**: A dedicated "Your Progress" section at the bottom to track your application pipeline.
- **Powerful Filtering & Search**:
  - Filter events by month with color-coded chips.
  - Full-text search across all event metadata.
- **Sorting**: Multi-mode sorting by Date, Event Name, Location, and **Status** (prioritizing your shortlist).
- **Dual View Modes**: Switch between a premium **Card Grid** and a detailed **Table View**.
- **Persistence**: All your application statuses are saved to `localStorage` and persist across browser sessions.

## 🛠️ Technology Stack
- **Frontend**: Clean HTML5 / Vanilla CSS3 (Custom properties, flex/grid).
- **Logic**: Vanilla JavaScript (ES6+).
- **Data**: Google Sheets CSV Integration.
- **Design Elements**: Custom iconography and a curated dark color palette.

## 🏁 Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/madhavsinghal88/data-dashboard.git
   cd data-dashboard
   ```

2. **Run locally**:
   Since the dashboard uses `fetch` for the Google Sheet integration, it needs to be served from a local server.
   ```bash
   # Using Python
   python3 -m http.server 8888
   
   # Or using Node.js (npx)
   npx http-server -p 8888
   ```

3. **Open in Browser**:
   Navigate to `http://localhost:8888`

## 📊 Data Source
The dashboard is currently configured to pull data from a public SAP Events Google Sheet. You can update the `SHEET_ID` in `app.js` to point to any publicly accessible Google Sheet with compatible headers (`Date`, `Event Name`, `Location`, `Link`).
