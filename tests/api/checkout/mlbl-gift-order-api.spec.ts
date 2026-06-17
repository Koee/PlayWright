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

test.describe('MLBL Gift Order API - SI', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'MLBL SI smoke uses the default Chromium project browser.');

    test('should send order detail payload for product and gift @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const payload = buildMlblGiftOrderPayload('https://si.timdaythay.com/');

        expect(payload.orderData.skipDetail).toBe(false);
        expect(payload.orderData.products.length).toBeGreaterThan(0);
        expect(payload.orderData.gift.items.length).toBeGreaterThan(0);
    });

    test('should resolve product and gift from a single scenario config @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = loadMlblGiftOrderData();
        const resolved = resolveMlblGiftOrderScenario(scenario);

        expect(scenario.comboSource).toBeUndefined();
        expect(scenario.combo.product.sku).toBe('40000263');
        expect(scenario.combo.gift.sku).toBe('SPE0000450');
        expect(resolved.products[0].sku).toBe('40000263');
        expect(resolved.gifts[0].sku).toBe('SPE0000450');
    });

    test('should scale required product quantity when requested gift quantity increases @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = resolveMlblGiftOrderScenario({
            ...loadMlblGiftOrderData(),
            combo: undefined,
            productSelector: { sku: '40000263' },
            giftSelector: { sku: 'SPE0000448', soLuong: 2 },
            products: [
                {
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
                },
            ],
            gifts: [
                {
                    sku: 'SPE0000448',
                    tenSP: 'Gift B',
                    nhanHang: 'Gift Brand',
                    soLuong: 1,
                    giaTriHangTang: 500,
                    hinhThucGiao: 'giao sau',
                    loai: 'Qua tang',
                    sheetName: 'GIFTS_GiaoSau',
                },
            ],
        });

        expect(scenario.products[0].soLuong).toBe(92);
        expect(scenario.gifts[0].soLuong).toBe(2);
    });

    test('should prefer explicit combo rule quantities over product and gift row quantities @checkout @mlbl-gift-order', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        const scenario = resolveMlblGiftOrderScenario({
            ...loadMlblGiftOrderData(),
            combo: undefined,
            productSelector: { sku: '40000263' },
            giftSelector: { sku: 'SPE0000448', soLuong: 2 },
            products: [
                {
                    sku: '40000263',
                    tenSP: 'Product A',
                    nhanHang: 'Brand A',
                    giaSauKM: 1000,
                    soLuong: 1,
                    giaGoc: 2000,
                    brandType: 'CORE',
                    hhNvkd: 10,
                    tAdminNvkd: 5,
                    donVi: 'Thung',
                    sheetName: 'SP-DON',
                },
            ],
            gifts: [
                {
                    sku: 'SPE0000448',
                    tenSP: 'Gift B',
                    nhanHang: 'Gift Brand',
                    soLuong: 1,
                    giaTriHangTang: 500,
                    hinhThucGiao: 'giao sau',
                    loai: 'Qua tang',
                    sheetName: 'GIFTS_GiaoSau',
                },
            ],
            rule: {
                requiredProductQuantity: 77,
                rewardGiftQuantity: 1,
            },
        });

        expect(scenario.products[0].soLuong).toBe(154);
        expect(scenario.gifts[0].soLuong).toBe(2);
    });

    test('should create an SI order with product and gift by API @checkout @mlbl-gift-order', async ({ page, request }, testInfo) => {
        test.skip(testInfo.project.name !== 'si', 'MLBL gift-order payload is scoped to SI first.');

        await openMlblGiftOrderHome(page, testInfo);
        const result = await createMlblGiftOrderByApi(request, testInfo);

        expect(result.ok, result.validationError || result.responseBody || result.error).toBe(true);
        expect(result.orderCode).toMatch(/^ONLINE-MLBL-CSB2B-\d{6}-\d{6}-[A-Z0-9]{6}$/);
        expect(result.productCount).toBeGreaterThan(0);
        expect(result.giftCount).toBeGreaterThan(0);

        await exportMlblGiftOrderApiTemplate(testInfo);
    });
});
