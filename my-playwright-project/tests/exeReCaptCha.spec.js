const { chromium, test, expect } = require("@playwright/test");
test("Test reCAPTCHA", async ({ browser }) => {
    try {
        // Khởi tạo trình duyệt
        const browser = await chromium.launch({ headless: false }); // headless: false để xem trình duyệt
        const page = await browser.newPage();

        // Mở trang demo reCAPTCHA (bạn có thể thay bằng URL của trang web thực tế)
        await page.goto('https://www.google.com/recaptcha/api2/demo');

        // Chờ và tìm iframe chứa reCAPTCHA
        const iframe = await page.waitForSelector('iframe[src*="recaptcha"]', { timeout: 10000 });
        console.log('Đã tìm thấy iframe reCAPTCHA:', await iframe.evaluate(el => el.src));

        // Lấy frame từ iframe
        const recaptchaFrame = await iframe.contentFrame();

        // Tìm và click vào checkbox reCAPTCHA (sử dụng ID chính xác hơn)
        const checkbox = await recaptchaFrame.waitForSelector('#recaptcha-anchor', { timeout: 10000 });
        console.log('Đã tìm thấy checkbox reCAPTCHA');
        await checkbox.click();
        console.log('Đã click vào checkbox reCAPTCHA');

        // Chờ một chút để kiểm tra kết quả (có thể điều chỉnh)
        await page.waitForTimeout(5000); // Chờ 5 giây để xem kết quả

        // Chụp screenshot để kiểm tra
        await page.screenshot({ path: 'recaptcha_success.png' });
        console.log('Đã chụp screenshot: recaptcha_success.png');

        // Đóng trình duyệt
        await browser.close();
    } catch (error) {
        console.error('Lỗi xảy ra:', error.message);
        // Nếu có page, chụp screenshot lỗi
        if (page) {
            await page.screenshot({ path: 'recaptcha_error.png' });
            console.log('Đã chụp screenshot lỗi: recaptcha_error.png');
        }
        // Đóng trình duyệt nếu còn mở
        if (browser) await browser.close();
    }
});