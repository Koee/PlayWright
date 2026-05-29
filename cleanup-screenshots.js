const fs = require('fs/promises');
const path = require('path');

async function cleanupScreenshots() {
    const screenshotsDir = 'screenshots';
    try {
        const files = await fs.readdir(screenshotsDir);
        for (const file of files) {
            const filePath = path.join(screenshotsDir, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
                await fs.unlink(filePath);
            }
        }
        console.log(`✅ Deleted all files in screenshots folder`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`ℹ️ Screenshots folder does not exist`);
        } else {
            console.warn(`⚠️ Could not delete files in screenshots folder: ${error.message}`);
        }
    }
}

cleanupScreenshots();
