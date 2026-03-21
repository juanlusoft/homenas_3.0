# Design System Strategy: The Luminous Obsidian Interface

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Kinetic Observatory."** 

Moving away from the static, mechanical feel of traditional NAS management software, this system treats data as a living, breathing entity. We reject the "spreadsheet-in-a-box" aesthetic of legacy systems. Instead, we utilize a **High-End Editorial** approach: high-contrast typography scales, intentional asymmetry, and a deep, multi-layered dark mode that feels more like a high-performance flight deck than a server configuration tool.

By leveraging **Tonal Layering** and **Atmospheric Depth**, we break the standard grid. Elements should feel as though they are suspended in a deep-sea environment—luminous, precise, and sophisticated.

---

## 2. Colors & Surface Logic

This system utilizes a "Deep Slate" foundation with a high-chroma accent palette to guide the eye toward critical system telemetry.

### The "No-Line" Rule
**Explicit Instruction:** Traditional 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined solely through background color shifts. 
- A card should sit on the `surface` background using `surface-container-low`. 
- High-priority modules use `surface-container-high`.
- This creates a seamless, "molded" look rather than a fragmented, "boxed" UI.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of frosted glass.
*   **Base:** `surface` (#10141a) – The infinite void.
*   **Sectioning:** `surface-container-low` (#181c22) – Large structural areas.
*   **Interactive Cards:** `surface-container` (#1c2026) – The standard component home.
*   **Elevated Focus:** `surface-container-highest` (#31353c) – Pop-overs and active states.

### The Glass & Gradient Rule
To achieve "Premium Modernity," all floating elements (modals, dropdowns, tooltips) must use **Glassmorphism**. 
- **Recipe:** `surface_variant` at 60% opacity + `backdrop-blur: 20px`.
- **Signature CTA:** Main actions should not be flat. Apply a subtle linear gradient from `primary` (#44e5c2) to `primary_container` (#00c9a7) at a 135-degree angle. This adds a "jewel-like" quality to the interaction points.

---

## 3. Typography: The Technical Editorial
We pair a high-fashion geometric sans with a rigid, technical monospace to create a "Professional-Luxury" tension.

*   **Display & Headlines (`spaceGrotesk`):** Used for large-scale data points and section headers. The wide tracking and geometric apertures feel architectural.
*   **Body & Titles (`manrope`):** Optimized for readability in technical documentation and settings.
*   **Metrics (`JetBrains Mono` / `inter`):** We leverage the user's request for monospaced metrics. All throughput (MB/s), CPU loads (%), and IP addresses must use `JetBrains Mono` (mapped via `label-md`) to ensure character alignment and a "pro-terminal" feel.

---

## 4. Elevation & Depth

### The Layering Principle
Hierarchy is achieved through **Tonal Stacking**. To emphasize a sub-element within a card, do not use a shadow; instead, drop the background of the sub-element to `surface-container-lowest` (#0a0e14). This "sunken" effect creates a sophisticated internal hierarchy.

### Ambient Shadows & Ghost Borders
- **Floating Shadows:** For modals that require a physical lift, use a diffuse shadow: `offset: 0 20px, blur: 40px, color: rgba(0, 201, 167, 0.08)`. This uses the primary teal to create a "glow" rather than a grey shadow.
- **The Ghost Border:** For accessibility in high-density areas, use a 1px border with `outline_variant` (#3c4a45) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons & Interaction
*   **Primary:** Gradient of `primary` to `primary_container`. **Roundedness:** `md` (0.75rem). Use a subtle inner-glow (1px stroke, top-only) using `primary_fixed`.
*   **Secondary:** Ghost style. No background fill; `outline` token at 20% opacity. On hover, fill with `surface_bright`.

### Cards & Status Modules
*   **Forbid Divider Lines:** Use `Spacing Scale 6` (1.5rem) to separate content sections within cards.
*   **Status Indicators:** Do not use simple dots. Use "Glow-Pills." A healthy status uses `primary` text on a `on_primary_container` background with a 4px blur glow of the same color.

### Data Inputs
*   **Input Fields:** Use `surface_container_lowest`. The "active" state should not change the border color to a solid line; it should trigger a 1px `primary` glow effect on the bottom edge only.

### Contextual Components for NAS
*   **Disk Health Gauge:** An asymmetric semi-circle using `primary` for health. 
*   **Node Pulse:** A subtle, repeating CSS animation on the background of the active node card, using a radial gradient of `surface_variant` to `surface`.

---

## 6. Do’s and Don'ts

### Do:
*   **Do** use `spaceGrotesk` for numbers that are purely decorative/large (e.g., "98%" CPU).
*   **Do** embrace negative space. If a dashboard feels crowded, increase the padding to `Spacing 10` (2.5rem).
*   **Do** use `JetBrains Mono` for any string of text that represents a file path or system log.

### Don’t:
*   **Don’t** use pure black (#000000) for backgrounds. It kills the depth of the "frosted glass" effect. Stick to `surface` (#10141a).
*   **Don’t** use the Secondary Orange (`secondary`) for anything other than non-critical alerts or "Storage Warning" states. It is a high-energy accent and should be used sparingly (less than 5% of the UI).
*   **Don’t** use standard "Drop Shadows." Use tonal shifts or ambient glows to define space.