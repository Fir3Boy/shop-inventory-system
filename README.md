# shop-inventory-system

# TextilePOS: Desktop Retail Inventory System

An offline-first, standalone desktop Point-of-Sale (POS) and inventory management application built for high-efficiency retail environments. 

---

## 🛠️ Tech Stack
* **Desktop Wrapper:** Electron & TypeScript
* **Backend:** Node.js & Express (Local embedded server)
* **Database:** SQLite (Configured in WAL mode for concurrent, reliable local transactions)
* **Build & Packaging:** `electron-builder` (targeting standalone portable Windows executables)

---

## 📖 The Developer's Journey: From CS Student to Engineer

This project is more than just a functional application—it represents a crucial inflection point in my transition from a computer science undergraduate to an industry-ready software engineer. Building a production-grade desktop app forced me to confront real-world engineering hurdles that university theory alone doesn't cover. 

### 1. The Electron Learning Curve
As a developer primarily familiar with web stacks and backend logic, **Electron was entirely new territory**. 
* **The Struggle:** Debugging production-level dependency trees, managing context isolation, and bridging the main and renderer processes proved overwhelming at first. Handling runtime path resolutions (like fixing fixed `process.cwd()` vs. production `resourcesPath` bugs) required deep dives into Chromium and Node.js process lifecycles.
* **The Takeaway:** It taught me patience and systematic debugging. Instead of relying on trial-and-error, I learned to read low-level stack traces and trace compilation pipelines manually.

### 2. The Git & Binary Trap (A Beginner's Lesson)
While I was comfortable with basic Git version control, this project introduced me to the harsh realities of enterprise repository hygiene.
* **The Mistake:** During my first attempts to package the app, I accidentally committed heavy build artifacts—including `node_modules/` and 200MB+ compiled `.exe` binaries inside `release/`—straight into local history. 
* **The Result:** When pushing to GitHub, I hit hard pre-receive hook blocks and 100MB file-size limit rejections (`GH001: Large files detected`). 
* **The Resolution:** I had to learn how to cleanly rewrite Git commit history using interactive resets, correctly configure `.gitignore` rules for runtime data (`data/`) and build targets, and establish a strict discipline of tracking only source code.

### 3. Leveraging AI as a Co-Pilot
Throughout this project, I utilized AI tools extensively. However, rather than letting AI blindly write code, I used it as an interactive technical mentor:
* **Debugging complex errors:** Parsing cryptic compilation and focus-loss bugs in Electron's multi-process architecture.
* **Architecture guidance:** Designing an isolated SQLite Write-Ahead Log (WAL) structure to prevent database locks during high-frequency retail transactions.
* **Code auditing:** Tracing and auditing generated code line-by-line to ensure I fully understood the underlying logic rather than just pasting solutions.

---

## 💡 Key Architectural Features
* **Offline-First Resilience:** Relies on a local SQLite database, ensuring the shop can run smoothly even without an active internet connection.
* **Optimized Retail Workflows:** Fast keyboard navigation, numeric step handling for rapid pricing, and custom modal focus management to prevent UI freezing during checkout confirmations.
* **Portable Distribution:** Packaged into a standalone executable (`.exe`) that runs smoothly without requiring local Node.js installations on the target machine.

---

## 🚀 Moving Forward
Building TextilePOS made me realize that engineering isn't just about making things work—it's about understanding *why* they work, managing dependencies gracefully, and respecting system constraints. 

To bridge my remaining knowledge gaps, I have intentionally slowed my deployment pace to focus heavily on foundational computer science theory, advanced systems architecture, and robust tooling. This project stands as a testament to that learning curve: raw, honest, and continuously evolving.

---

## ⚙️ Getting Started (Development)

If you wish to explore or run the codebase locally:

```bash
# Clone the repository
git clone [https://github.com/Fir3Boy/shop-inventory-system.git](https://github.com/Fir3Boy/shop-inventory-system.git)

# Install dependencies
npm install

# Run in development mode (spins up Express and Electron concurrently)
npm run dev

Building the Portable Executable
Bash
npm run build:exe
