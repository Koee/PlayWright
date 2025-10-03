/**
1/Truy cập trang web https://testgrid.io/
2/Đăng nhập vào trang web bằng thông tin xác thực hợp lệ 
3/Xác minh người dùng đã đăng nhập bằng cách thay đổi văn bản “Bảng điều khiển”
4/Nhấp vào liên kết 'Codeless' trong phần Tự động hóa
5/Xác minh văn bản “Hãy bắt đầu với tự động hóa không cần mã”
6/Mở liên kết ' Real Device Cloud ' trong tab mới và sau đó quay lại trang gốc
7/Xác minh văn bản “Selenium” để đảm bảo người dùng quay lại trang gốc
8/Đăng xuất khỏi ứng dụng
 */

const { chromium, test, expect } = require("@playwright/test");

test("Testgrid.io Scenario", async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Visit the Site https://testgrid.io/
    await page.goto("https://public.testgrid.io/");

    // 2. Login into the site with valid credentials
    await page.fill('input[name="email"]', "jarryliurobert@gmail.com");
    await page.fill('input[name="password"]', "Test@1234");
    // 2.1 tìm catche
    // Chờ và tìm iframe chứa reCAPTCHA
    const iframe = await page.waitForSelector('iframe[src*="recaptcha"]');
    console.log('Đã tìm thấy iframe reCAPTCHA:', await iframe.evaluate(el => el.src));
    //Lấy frame từ iframe
    const recaptchaFrame = await iframe.contentFrame();
    //Di chuột ngẫu nhiên để mô phỏng hành vi người dùng
    /* await page.mouse.move(Math.random() * 500, Math.random() * 500);
     await page.waitForTimeout(Math.random() * 1000 + 500); // Chờ ngẫu nhiên 0.5-1.5s */
    //Tìm và click vào checkbox reCAPTCHA(sử dụng ID chính xác hơn)
    const checkbox = await recaptchaFrame.waitForSelector('#recaptcha-anchor');
    await checkbox.click();
    console.log('Đã click vào checkbox reCAPTCHA');


    // 2.2 thực thi login
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(7000);


    // 3. Verify user is logged in by verifying the text "Dashboard"
    await expect(page.locator("text=Dashboard")).toBeVisible();

    // 4. Click on 'Codeless' link under Automation section
    await page.click("text=Codeless");

    // 5. Verify the text "Let's get you started with codeless automation"
    await expect(
        page.locator("text=Lets get you started with codeless automation")
    ).toBeVisible();
    await page.click('[id="testcase_back_button"]');

    // 6. Open the link 'Real Device Cloud' in a new tab and then back to the parent page
    const [newPage] = await Promise.all([
        context.waitForEvent("page"),
        page.click("text=Real Device Cloud"),
    ]);
    await newPage.waitForLoadState("domcontentloaded");
    await newPage.close();
    await page.bringToFront();

    // 7. Verify the text "Selenium" to make sure the user is back on the parent page
    await expect(page.locator("text=Selenium")).toBeVisible();

    // 8. Logout from the application
    await page.click('[data-toggle="dropdown"]');
    page.click("text=Logout");
    await expect(page.locator("text=ForgotPassword?")).toBeVisible();
    await context.close();
});