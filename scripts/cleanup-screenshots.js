const fs = require('fs/promises');
const path = require('path');

async function cleanupScreenshots() {
    const dirs = ['test-results/report/err', 'test-results/report/pass'];
    for (const dir of dirs) {
        try {
            const files = await fs.readdir(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    await fs.unlink(filePath);
                }
            }
            console.log(`✅ Deleted all files in ${dir} folder`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`ℹ️ ${dir} folder does not exist`);
            } else {
                console.warn(`⚠️ Could not delete files in ${dir} folder: ${error.message}`);
            }
        }
    }
}

cleanupScreenshots();
