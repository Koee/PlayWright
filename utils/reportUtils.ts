import path from 'path';
import fs from 'fs/promises';

/**
 * Ghi report loi vao test-results/report/err/report-loi.md, report-loi.json va report-loi.csv.
 * Cac flow checkout/copy goi ham nay trong catch block de intern co noi xem loi tap trung.
 */
export async function appendErrorReport(websiteName: string, error: any, screenshotPath?: string) {
    try {
        // Use absolute path based on current working directory
        const reportDir = path.resolve(process.cwd(), 'test-results', 'report', 'err');
        const reportPath = path.join(reportDir, 'report-loi.md');
        await fs.mkdir(reportDir, { recursive: true });
        console.log(`📁 Report directory: ${reportDir}`);

        const time = new Date().toLocaleString('vi-VN');
        const message = (error && error.message) ? error.message : String(error);
        const stack = (error && error.stack) ? error.stack : '';

        const entry = [`### ${websiteName} — ${time}`,
            '',
            '**Mô tả lỗi (tiếng Việt):**',
        `Lỗi khi chạy luồng checkout trên trang **${websiteName}**: ${message}`,
            '',
            '**Ngữ cảnh / Stack trace:**',
            '```',
            stack,
            '```',
            '',
        screenshotPath ? `**Ảnh chụp lỗi:** ${screenshotPath}` : '',
            '',
            '---',
            '',].join('\n');

        await fs.appendFile(reportPath, entry, 'utf8');
        console.log(`📝 Appended error report to: ${reportPath}`);

        // Also append JSON entry
        const jsonPath = path.join(reportDir, 'report-loi.json');
        try {
            let arr = [] as any[];
            try {
                const existing = await fs.readFile(jsonPath, 'utf8');
                arr = JSON.parse(existing || '[]');
            } catch { arr = []; }
            arr.push({ time, website: websiteName, message, stack, screenshot: screenshotPath || null });
            await fs.writeFile(jsonPath, JSON.stringify(arr, null, 2), 'utf8');
            console.log(`📝 Appended JSON error report to: ${jsonPath}`);
        } catch (je) {
            console.warn(`⚠️ Could not write JSON report: ${(je as Error).message}`);
        }

        // Also append CSV entry
        const csvPath = path.join(reportDir, 'report-loi.csv');
        try {
            const header = 'time,website,message,stack,screenshot\n';
            const escapeCsv = (s: string) => '"' + s.replace(/"/g, '""').replace(/\n/g, '\\n') + '"';
            const line = [time, websiteName, message || '', stack || '', screenshotPath || ''].map(v => escapeCsv(String(v))).join(',') + '\n';
            // If file doesn't exist, write header first
            try {
                await fs.access(csvPath);
            } catch {
                await fs.writeFile(csvPath, header, 'utf8');
            }
            await fs.appendFile(csvPath, line, 'utf8');
            console.log(`📝 Appended CSV error report to: ${csvPath}`);
        } catch (ce) {
            console.warn(`⚠️ Could not write CSV report: ${(ce as Error).message}`);
        }
    } catch (e) {
        console.warn(`⚠️ Could not write report-loi: ${(e as Error).message}`);
    }
}
