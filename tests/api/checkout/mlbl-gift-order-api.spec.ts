import { expect, test } from '@playwright/test';
import {
    buildMlblGiftOrderPayload,
    loadMlblGiftOrderData,
    resolveMlblGiftOrderScenario,
} from '../../../components/helpers/mlbl-gift-order-payload';
import {
    createMlblGiftOrderByApi,
    exportMlblGiftOrderApiTemplate,
    openMlblGiftOrderHome,
} from '../../../steps/mlbl-gift-order.steps';

const sampleProduct = {
    sku: '40000263',
    tenSP: 'Product A',
    nhanHang: 'Brand A',
    giaSauKM: 1000,
    soLuong: 46,
    giaGoc: 2000,
    brandType: 'CORE',
    hhNvkd: 10,
    tAdminNvkd: 5,
    donVi: 'Thung',
    sheetName: 'SP-DON',
};

const sampleGift = {
    sku: 'SPE0000448',
    tenSP: 'Gift B',
    nhanHang: 'Gift Brand',
    soLuong: 1,
    giaTriHangTang: 500,
    hinhThucGiao: 'giao sau',
    loai: 'Qua tang',
    sheetName: 'GIFTS_GiaoSau',
};

function buildSampleScenario(productQuantity = sampleProduct.soLuong) {
    return {
        ...loadMlblGiftOrderData(),
        combo: undefined,
        productSelector: { sku: sampleProduct.sku },
        giftSelector: { sku: sampleGift.sku, soLuong: 2 },
        products: [
            {
                ...sampleProduct,
                soLuong: productQuantity,
            },
        ],
        gifts: [sampleGift],
    };
}

test.describe('MLBL Gift Order API - SI', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'MLBL SI smoke uses the default Chromium project browser.');

    test('should send order detail payload for product and gift @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = loadMlblGiftOrderData();
        const payload = buildMlblGiftOrderPayload('https://si.timdaythay.com/', scenario, {
            productSku: scenario.combo.product.sku,
            productQuantity: 26,
            giftSku: scenario.combo.gift.sku,
            giftQuantity: 1,
        });

        expect(payload.orderData.skipDetail).toBe(false);
        expect(payload.orderData.products.length).toBeGreaterThan(0);
        expect(payload.orderData.gift.items.length).toBeGreaterThan(0);
    });

    test('should resolve product and gift from a single scenario config @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = loadMlblGiftOrderData();
        const resolved = resolveMlblGiftOrderScenario(scenario);

        expect(scenario.comboSource).toBeUndefined();
        expect(resolved.products[0].sku).toBe(scenario.combo.product.sku);
        expect(resolved.gifts[0].sku).toBe(scenario.combo.gift.sku);
    });

    test('should apply editable SKU and quantity config to resolved scenario @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = loadMlblGiftOrderData();
        const resolved = resolveMlblGiftOrderScenario(scenario, {
            productSku: scenario.combo.product.sku,
            productQuantity: 9,
            giftSku: scenario.combo.gift.sku,
            giftQuantity: 2,
        });

        expect(resolved.products[0].sku).toBe(scenario.combo.product.sku);
        expect(resolved.products[0].soLuong).toBe(9);
        expect(resolved.gifts[0].sku).toBe(scenario.combo.gift.sku);
        expect(resolved.gifts[0].soLuong).toBe(2);
    });

    test('should apply live product and gift fields for configured SKUs when building payload @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const payload = buildMlblGiftOrderPayload('https://si.timdaythay.com/', loadMlblGiftOrderData(), {
            productSku: '40000263',
            productQuantity: 3,
            giftSku: 'SPE0000450',
            giftQuantity: 1,
        }, {
            product: {
                sku: '40000263',
                tenSP: 'Live Product Name',
                giaSauKM: 123456,
            },
            gift: {
                sku: 'SPE0000450',
                tenSP: 'Live Gift Name',
                nhanHang: 'Live Gift Brand',
                giaTriHangTang: 7654321,
            },
        });

        expect(payload.orderData.products[0].tenSP).toBe('Live Product Name');
        expect(payload.orderData.products[0].giaSauKM).toBe(123456);
        expect(payload.orderData.products[0].tienSauKM).toBe(370368);
        expect(payload.orderData.totalAmount).toBe(370368);
        expect(payload.orderData.gift.items[0].tenSP).toBe('Live Gift Name');
        expect(payload.orderData.gift.items[0].nhanHang).toBe('Live Gift Brand');
        expect(payload.orderData.gift.items[0].giaTriHangTang).toBe(7654321);
        expect(payload.orderData.tongGtQuaTangDaChon).toBe(7654321);
    });

    test('should build payload with live gift data when configured gift SKU is not in fixture @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const payload = buildMlblGiftOrderPayload('https://si.timdaythay.com/', loadMlblGiftOrderData(), {
            productSku: '40000263',
            productQuantity: 3,
            giftSku: 'SPE0000016',
            giftQuantity: 1,
        }, {
            product: {
                sku: '40000263',
                giaSauKM: 123456,
            },
            gift: {
                sku: 'SPE0000016',
                tenSP: 'Live Config Gift',
                nhanHang: 'Live Config Brand',
                giaTriHangTang: 987654,
            },
        });

        expect(payload.orderData.gift.items[0].sku).toBe('SPE0000016');
        expect(payload.orderData.gift.items[0].tenSP).toBe('Live Config Gift');
        expect(payload.orderData.gift.items[0].nhanHang).toBe('Live Config Brand');
        expect(payload.orderData.gift.items[0].giaTriHangTang).toBe(987654);
        expect(payload.orderData.tongGtQuaTangDaChon).toBe(987654);
    });

    test('should prefer live TOP option product and gift SKUs when building payload @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const payload = buildMlblGiftOrderPayload('https://si.timdaythay.com/', loadMlblGiftOrderData(), {
            productSku: '40000263',
            productQuantity: 3,
            giftSku: 'SPE0000450',
            giftQuantity: 1,
        }, {
            product: {
                sku: 'LIVE-PROD-001',
                tenSP: 'Live TOP Product',
                nhanHang: 'Live TOP Product Brand',
                giaSauKM: 222000,
            },
            gift: {
                sku: 'LIVE-GIFT-001',
                tenSP: 'Live TOP Gift',
                nhanHang: 'Live TOP Gift Brand',
                giaTriHangTang: 333000,
            },
        });

        expect(payload.orderData.products[0].sku).toBe('LIVE-PROD-001');
        expect(payload.orderData.products[0].tenSP).toBe('Live TOP Product');
        expect(payload.orderData.products[0].giaSauKM).toBe(222000);
        expect(payload.orderData.gift.items[0].sku).toBe('LIVE-GIFT-001');
        expect(payload.orderData.gift.items[0].tenSP).toBe('Live TOP Gift');
        expect(payload.orderData.gift.items[0].giaTriHangTang).toBe(333000);
    });

    test('should scale required product quantity when requested gift quantity increases @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = resolveMlblGiftOrderScenario(buildSampleScenario());

        expect(scenario.products[0].soLuong).toBe(92);
        expect(scenario.gifts[0].soLuong).toBe(2);
    });

    test('should prefer explicit combo rule quantities over product and gift row quantities @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = resolveMlblGiftOrderScenario({
            ...buildSampleScenario(1),
            rule: {
                requiredProductQuantity: 77,
                rewardGiftQuantity: 1,
            },
        });

        expect(scenario.products[0].soLuong).toBe(154);
        expect(scenario.gifts[0].soLuong).toBe(2);
    });

    test('should create an SI order with product and gift by API @checkout @mlbl-gift-order', async ({ page, request }, testInfo) => {
        test.setTimeout(60000);
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        await openMlblGiftOrderHome(page, testInfo);
        const result = await createMlblGiftOrderByApi(request, testInfo, page);

        expect(result.ok, result.validationError || result.responseBody || result.error).toBe(true);
        expect(result.orderCode).toMatch(/^ONLINE-MLBL-CSB2B-\d{6}-\d{6}-[A-Z0-9]{6}$/);
        expect(result.productCount).toBeGreaterThan(0);
        expect(result.giftCount).toBeGreaterThan(0);

        await exportMlblGiftOrderApiTemplate(testInfo, page);
    });
});
