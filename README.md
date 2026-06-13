# Rise of Cultures: City Helper
Browser-based tool suite for the mobile city-building game *Rise of Cultures*

---

## 🏛️ Project Overview
**Rise of Cultures: City Helper** is a fan-made, browser-based tool suite designed to help players plan and optimize their cities in *Rise of Cultures* by Goodgame Studios.

The suite currently has two tools:
- **Layout Optimizer** — uses a Simulated Annealing algorithm to automatically generate city layouts based on your buildings, territory, and production priorities.
- **Map Editor** — a free-build interactive grid where you can manually place buildings, visualize culture site coverage, and track production statistics live.

Built with vanilla HTML, CSS, and JavaScript — no frameworks, no build tools, deployable as a static site on GitHub Pages.

---

## 🚀 Live Site
👉 [Rise of Cultures: City Helper](https://912-cernautan-teofan.github.io/rise-of-cultures-optimizer/)

---

## 📊 Progress Tracker

### 🗝️ Legend

| Symbol | Meaning |
|:------:|:--------------------------------|
| 🟢 | **Done / Finished** |
| 🔵 | **Almost Done but Buggy / Needs Fixes** |
| 🟡 | **Currently In Progress** |
| ⚪ | **Planned / Not Started** |
| 🔴 | **Dropped / On Hold** |

### ⚙️ Layout Optimizer
- 🟢 Simulated Annealing core (Web Worker, non-blocking)
- 🟢 Territory selector (chunk-based, expandable grid)
- 🟢 Building picker with level and quantity selection
- 🟢 Resource priority system (primary + secondary weights)
- 🟢 Playstyle selection (active / casual / idle)
- 🟢 Result grid visualization (SVG, color-coded, level badges)
- 🟢 Production stats (food per playstyle, coins, goods)
- 🟢 Happiness tier breakdown
- ⚪ Export / Import city configurations
- ⚪ "Copy to Map Editor" button from optimizer results
- ⚪ Military priority weighting
- ⚪ Optimize starting from an existing layout
- ⚪ Preset strategy patterns (selectable culture site clustering)
- ⚪ Support for alternative maps (e.g. Egypt)

### 🗺️ Map Editor
- 🟢 Interactive canvas with drag-and-drop building placement
- 🟢 Click to rotate, right-click to delete
- 🟢 Culture site happiness radius overlay
- 🟢 Live production statistics (all playstyles)
- 🟢 Happiness tier tracking and hover tooltips
- 🟢 Chunk grid toggle
- 🟢 Town Hall configurable radius and culture points
- ⚪ Export / Import map layouts
- ⚪ Click placed building to edit its properties
- ⚪ Building sprites instead of colored blocks

### 🏗️ Landing Page & General
- 🟢 Landing page with tool cards
- 🟢 Consistent dark medieval visual theme
- 🟢 Deployed on GitHub Pages
- ⚪ Wonders and event buildings
- ⚪ Buildings beyond Minoan Era
- ⚪ Account building auto-import (under investigation)

### 📦 Building Database (JSON)
- 🟢 Farms (fast and slow variants, luxurious farm)
- 🟢 Houses (small and large)
- 🟢 Workshops / goods buildings
- 🟢 Culture sites (various sizes and radii)
- 🟢 Military buildings
- 🟢 Town Hall
- ⚪ Wonders
- ⚪ Event / limited buildings
- ⚪ Allied cultures buildings

---

## 🗒️ Notes
This project started as a personal tool and grew into a small public suite after community interest from the Rise of Cultures Discord and subreddit.  
The building database currently covers buildings up to the **Minoan Era**.  
The progress tracker is a living document — tasks will be added, updated, or removed as the project evolves.

> **A note on the Layout Optimizer:** The optimizer uses a heuristic algorithm (Simulated Annealing) which means results are not guaranteed to be perfect. Each generation is an independent random search — some runs will produce better layouts than others. It is recommended to generate multiple layouts and compare them to find the one that suits your city best. Quality of life changes will be investigated later on with this thing in mind.

---

## ⚠️ Disclaimer
Rise of Cultures: City Helper is a **non-commercial fan project** created purely for educational and entertainment purposes.  
*Rise of Cultures* and all related assets belong to **InnoGames**.  
No copyright infringement is intended.  
All original code, logic, and systems developed for this project are the property of the project creator.
