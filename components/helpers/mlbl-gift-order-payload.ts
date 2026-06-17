/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { randomInt } from 'crypto';

export type MlblGiftOrderProduct = {
    sku: string;
    tenSP: string;
    nhanHang: string;
    giaSauKM: number;
    soLuong: number;
    giaGoc: number;
    brandType: string;
    hhNvkd: number;
    tAdminNvkd: number;
    donVi: string;
    sheetName: string;
};

export type MlblGiftOrderGift = {
    sku: string;
    tenSP: string;
    nhanHang: string;
    soLuong: number;
    giaTriHangTang: number;
    hinhThucGiao: string;
    loai: string;
    sheetName: string;
};

type MlblGiftOrderComboRule = {
    requiredProductQuantity: number;
    rewardGiftQuantity: number;
};

type MlblGiftOrderSelector = {
    sku?: string;
    sheetName?: string;
    nhanHang?: string;
    soLuong?: number;
};

type MlblGiftOrderComboSource = {
    type: 'json-cache';
    path: string;
};

export type MlblGiftOrderData = {
    projectName: string;
    apiPath: string;
    token: string;
    orderCodePrefix: string;
    customer: {
        name: string;
        phone: string;
        address: string;
    };
    paymentMethod: string;
    staff: {
        staffName: string;
        staffCode: string;
        staffEmail: string;
        kiotCode: string;
    };
    targetGroup: {
        maBich: string;
        tenBich: string;
        sizeBich: string;
        nhomDoiTuong: string;
    };
    giftBudget: number;
    giftQuantity?: number;
    combo?: {
        name?: string;
        rule: MlblGiftOrderComboRule;
        product: MlblGiftOrderProduct;
        gift: MlblGiftOrderGift;
    };
    comboSource?: MlblGiftOrderComboSource;
    productSelector?: MlblGiftOrderSelector;
    giftSelector?: MlblGiftOrderSelector;
    rule?: MlblGiftOrderComboRule;
    products?: MlblGiftOrderProduct[];
    gifts?: MlblGiftOrderGift[];
};

type MlblGiftOrderCombo = {
    name?: string;
    rule?: MlblGiftOrderComboRule;
    products: MlblGiftOrderProduct[];
    gifts: MlblGiftOrderGift[];
};

type MlblGiftOrderComboCache = {
    projectName: string;
    campaignCode?: string;
    combos: MlblGiftOrderCombo[];
};

export type MlblGiftOrderPayload = {
    _token: string;
    action: 'insertOrder';
    orderData: {
        orderCode: string;
        customerName: string;
        customerPhone: string;
        customerAddress: string;
        paymentMethod: string;
        staffName: string;
        staffCode: string;
        staffEmail: string;
        kiotCode: string;
        maBich: string;
        tenBich: string;
        sizeBich: string;
        nhomDoiTuong: string;
        products: Array<MlblGiftOrderProduct & { tienSauKM: number }>;
        gift: {
            items: MlblGiftOrderGift[];
        };
        tongGiaTriHangHoa: number;
        tongGiaTriDangBan: number;
        tongMuaLoi: number;
        totalAmount: number;
        tongGtQuaTang: number;
        tongGtQuaTangDaChon: number;
        tongGtQuaTangConLai: number;
        totalHoaHongSale: number;
        totalThuongAdmin: number;
        pay1Lan: number;
        pay1LanStatus: string;
        deposit: number;
        depositStatus: string;
        payLan2: number;
        payLan2Status: string;
        skipDetail: boolean;
        orderType: 'ORDER';
    };
    config: {
        baseURL: string;
    };
};

const DATA_PATH = path.resolve(process.cwd(), 'test-data', 'json', 'mlbl-gift-order-si.json');
const ORDER_CODE_SUFFIX_LENGTH = 6;
const ORDER_CODE_SUFFIX_BASE = 36 ** ORDER_CODE_SUFFIX_LENGTH;

export function loadMlblGiftOrderData(dataPath = DATA_PATH): MlblGiftOrderData {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8').replace(/^\uFEFF/, ''));
}

function resolveProjectPath(filePath: string) {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    return path.resolve(process.cwd(), filePath);
}

function readComboCache(source: MlblGiftOrderComboSource): MlblGiftOrderComboCache {
    if (source.type !== 'json-cache') {
        throw new Error(`Unsupported MLBL gift order combo source: ${source.type}`);
    }

    const cachePath = resolveProjectPath(source.path);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8').replace(/^\uFEFF/, ''));
}

function matchesSelector(value: { sku?: string; sheetName?: string; nhanHang?: string }, selector: MlblGiftOrderSelector | undefined) {
    if (!selector || Object.keys(selector).length === 0) {
        return true;
    }

    return Object.entries(selector).every(([key, expected]) => {
        if (key === 'soLuong') {
            return true;
        }

        if (!expected) {
            return true;
        }

        return String(value[key as keyof typeof value] ?? '').trim().toLowerCase() === String(expected).trim().toLowerCase();
    });
}

function getRequestedGiftQuantity(selector: MlblGiftOrderSelector | undefined) {
    if (selector?.soLuong === undefined) {
        return undefined;
    }

    if (!Number.isFinite(selector.soLuong) || selector.soLuong <= 0) {
        throw new Error(`giftSelector.soLuong must be a positive number. Current value: ${selector.soLuong}`);
    }

    return selector.soLuong;
}

function getScenarioGiftQuantity(data: MlblGiftOrderData) {
    return data.giftSelector?.soLuong ?? data.giftQuantity;
}

function scaleScenarioQuantities(
    products: MlblGiftOrderProduct[],
    gifts: MlblGiftOrderGift[],
    giftSelector: MlblGiftOrderSelector | undefined,
    rule: MlblGiftOrderComboRule | undefined,
) {
    const requestedGiftQuantity = getRequestedGiftQuantity(giftSelector);
    if (requestedGiftQuantity === undefined || gifts.length === 0) {
        return {
            products,
            gifts,
        };
    }

    const baseProductQuantity = rule?.requiredProductQuantity ?? products[0]?.soLuong;
    const baseGiftQuantity = rule?.rewardGiftQuantity ?? gifts[0].soLuong;
    if (!Number.isFinite(baseProductQuantity) || baseProductQuantity <= 0) {
        throw new Error(`Resolved product base quantity must be positive. Current value: ${baseProductQuantity}`);
    }

    if (!Number.isFinite(baseGiftQuantity) || baseGiftQuantity <= 0) {
        throw new Error(`Resolved gift base quantity must be positive. Current value: ${baseGiftQuantity}`);
    }

    const multiplier = requestedGiftQuantity / baseGiftQuantity;
    return {
        products: products.map(product => ({
            ...product,
            soLuong: baseProductQuantity * multiplier,
        })),
        gifts: gifts.map(gift => ({
            ...gift,
            soLuong: baseGiftQuantity * multiplier,
        })),
    };
}

export function resolveMlblGiftOrderScenario(data = loadMlblGiftOrderData()) {
    if (data.combo) {
        return scaleScenarioQuantities(
            [data.combo.product],
            [data.combo.gift],
            {
                ...data.giftSelector,
                soLuong: getScenarioGiftQuantity(data),
            },
            data.combo.rule,
        );
    }

    if (data.products?.length && data.gifts?.length) {
        return scaleScenarioQuantities(
            data.products.filter(product => matchesSelector(product, data.productSelector)),
            data.gifts.filter(gift => matchesSelector(gift, data.giftSelector)),
            data.giftSelector,
            data.rule,
        );
    }

    if (!data.comboSource) {
        throw new Error('MLBL gift order data must define products/gifts or comboSource.');
    }

    const cache = readComboCache(data.comboSource);
    const combo = cache.combos.find(candidate => {
        return candidate.products.some(product => matchesSelector(product, data.productSelector))
            && candidate.gifts.some(gift => matchesSelector(gift, data.giftSelector));
    });

    if (!combo) {
        throw new Error([
            `Could not resolve MLBL gift order combo for project "${data.projectName}".`,
            `Product selector: ${JSON.stringify(data.productSelector || {})}.`,
            `Gift selector: ${JSON.stringify(data.giftSelector || {})}.`,
            `Source: ${data.comboSource.path}.`,
        ].join(' '));
    }

    return scaleScenarioQuantities(
        combo.products.filter(product => matchesSelector(product, data.productSelector)),
        combo.gifts.filter(gift => matchesSelector(gift, data.giftSelector)),
        data.giftSelector,
        combo.rule,
    );
}

export function resolveMlblGiftOrderApiUrl(baseUrl: string, data = loadMlblGiftOrderData()) {
    const url = new URL(data.apiPath, baseUrl);
    return url.toString();
}

export function generateMlblGiftOrderCode(prefix: string, now = new Date()) {
    const pad = (value: number) => String(value).padStart(2, '0');
    const datePart = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const seed = (Date.now() + randomInt(0, ORDER_CODE_SUFFIX_BASE)) % ORDER_CODE_SUFFIX_BASE;
    let suffix = seed.toString(36).toUpperCase().padStart(ORDER_CODE_SUFFIX_LENGTH, '0').slice(-ORDER_CODE_SUFFIX_LENGTH);

    if (/^\d+$/.test(suffix)) {
        suffix = `${String.fromCharCode(65 + (seed % 26))}${suffix.slice(1)}`;
    }

    return `${prefix}-${datePart}-${timePart}-${suffix}`;
}

export function buildMlblGiftOrderPayload(baseUrl: string, data = loadMlblGiftOrderData()): MlblGiftOrderPayload {
    const scenario = resolveMlblGiftOrderScenario(data);
    const products = scenario.products.map(product => ({
        ...product,
        tienSauKM: product.giaSauKM * product.soLuong,
    }));
    const totalAmount = products.reduce((sum, product) => sum + product.tienSauKM, 0);
    const totalHoaHongSale = products.reduce((sum, product) => sum + product.hhNvkd * product.soLuong, 0);
    const totalThuongAdmin = products.reduce((sum, product) => sum + product.tAdminNvkd * product.soLuong, 0);
    const tongGiaTriHangHoa = products.reduce((sum, product) => sum + product.giaGoc * product.soLuong, 0);
    const tongGtQuaTangDaChon = scenario.gifts.reduce((sum, gift) => sum + gift.giaTriHangTang * gift.soLuong, 0);

    return {
        _token: process.env.MLBL_GIFT_ORDER_TOKEN || data.token,
        action: 'insertOrder',
        orderData: {
            orderCode: generateMlblGiftOrderCode(data.orderCodePrefix),
            customerName: process.env.MLBL_GIFT_ORDER_CUSTOMER_NAME ?? data.customer.name,
            customerPhone: process.env.MLBL_GIFT_ORDER_CUSTOMER_PHONE ?? data.customer.phone,
            customerAddress: process.env.MLBL_GIFT_ORDER_CUSTOMER_ADDRESS ?? data.customer.address,
            paymentMethod: process.env.MLBL_GIFT_ORDER_PAYMENT_METHOD || data.paymentMethod,
            ...data.staff,
            ...data.targetGroup,
            products,
            gift: {
                items: scenario.gifts,
            },
            tongGiaTriHangHoa,
            tongGiaTriDangBan: totalAmount,
            tongMuaLoi: 0,
            totalAmount,
            tongGtQuaTang: data.giftBudget,
            tongGtQuaTangDaChon,
            tongGtQuaTangConLai: data.giftBudget - tongGtQuaTangDaChon,
            totalHoaHongSale,
            totalThuongAdmin,
            pay1Lan: totalAmount,
            pay1LanStatus: '',
            deposit: 0,
            depositStatus: '',
            payLan2: 0,
            payLan2Status: '',
            skipDetail: false,
            orderType: 'ORDER',
        },
        config: {
            baseURL: new URL(data.apiPath, baseUrl).origin,
        },
    };
}
