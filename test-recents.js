const fs = require('fs');
const path = require('path');

async function test() {
    const appName = "Antigravity";
    const appData = process.env.APPDATA;
    let storagePath = "";

    const name = appName.toLowerCase();
    if (name.includes("antigravity")) {
      storagePath = path.join(appData, "Antigravity", "User", "globalStorage", "storage.json");
    }

    console.log("Storage Path:", storagePath);
    if (!fs.existsSync(storagePath)) {
        console.log("File not found");
        return;
    }

    try {
      const content = fs.readFileSync(storagePath, "utf-8");
      const json = JSON.parse(content);
      
      let workspaceUris = Object.keys(json.profileAssociations?.workspaces || {});
      console.log("Profile Workspaces:", workspaceUris);

      const recentlyOpened = json.history?.recentlyOpenedPathsList || [];
      console.log("Recently Opened count:", recentlyOpened.length);
      
      recentlyOpened.forEach(item => {
        const uri = item.folderUri || item.workspace?.configPath || item.fileUri;
        if (uri && !workspaceUris.includes(uri)) {
          workspaceUris.push(uri);
        }
      });
      
      console.log("Combined Workspaces:", workspaceUris);
    } catch (e) {
      console.error("Error:", e);
    }
}

test();
