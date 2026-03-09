#!/usr/bin/env node

/**
 * Helper script to set up the separate Edge profile for the dashboard.
 * This opens Edge with the dashboard profile so you can log in to providers.
 */

const { chromium } = require("playwright");
require("dotenv").config();

async function setupProfile() {
  const profilePath = process.env.EDGE_PROFILE_PATH;
  
  if (!profilePath) {
    console.error("❌ EDGE_PROFILE_PATH not set in .env");
    console.log("\nPlease add this to your .env file:");
    console.log("EDGE_PROFILE_PATH=/home/username/.config/microsoft-edge-dashboard");
    process.exit(1);
  }

  console.log("🚀 Opening Edge with dashboard profile...");
  console.log(`📁 Profile: ${profilePath}`);
  console.log("\n📝 Please log in to these providers:");
  console.log("   - https://www.right.codes");
  console.log("   - https://www.packyapi.com");
  console.log("   - https://www.openclaudecode.cn");
  console.log("\n⏳ Press Ctrl+C when done to close this window.\n");

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    channel: "msedge",
  });

  const page = browser.pages()[0] || await browser.newPage();
  
  // Open a helpful page
  await page.goto("about:blank");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div style="font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 40px; background: #f5f5f5; border-radius: 8px;">
        <h1 style="color: #333;">Dashboard Profile Setup</h1>
        <p style="color: #666; line-height: 1.6;">
          This is your dedicated Edge profile for the token usage dashboard.
        </p>
        <h2 style="color: #333; margin-top: 30px;">Please log in to:</h2>
        <ul style="color: #666; line-height: 2;">
          <li><a href="https://www.right.codes" target="_blank">Right Code</a></li>
          <li><a href="https://www.packyapi.com" target="_blank">Packy API</a></li>
          <li><a href="https://www.openclaudecode.cn" target="_blank">Micu (米醋API)</a></li>
        </ul>
        <p style="color: #999; margin-top: 30px; font-size: 14px;">
          After logging in, you can close this window or press Ctrl+C in the terminal.
        </p>
      </div>
    `;
  });

  // Keep the browser open until user closes it
  await new Promise(() => {});
}

setupProfile().catch(console.error);
