/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { randomInt } from 'crypto';

export type MlblGiftOrderProduct = {
    sku: string;
    tenSP: string;
    nhanHang: string;
    giaSauKM: number;
    giaDangBanKenh?: number;
    giaMuaLoi?: number;
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

export type MlblGiftOrderProductLine = MlblGiftOrderProduct & { tienSauKM: number };

export type MlblGiftOrderTotals = {
    totalAmount: number;
    totalHoaHongSale: number;
    totalThuongAdmin: number;
    tongGiaTriHangHoa: number;
    tongGiaTriDangBan: number;
    tongMuaLoi: number;
    tongGtQuaTang: number;
    tongGtQuaTangDaChon: number;
    tongGtQuaTangConLai: number;
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

export type MlblGiftOrderEditableConfig = {
    productSku: string;
    productQuantity: number;
    giftSku: string;
    giftQuantity: number;
    uiTabs?: MlblGiftOrderUiTabConfig[];
    uiTabsByProject?: Record<string, MlblGiftOrderUiTabConfig[]>;
    dataPaths?: Record<string, string>;
    livePricing?: {
        enabled: boolean;
    };
};

export type MlblGiftOrderUiTabConfig = {
    tab: string;
    slug: string;
    selectors?: string[];
};

export type MlblGiftOrderLiveProductPrice = {
    sku: string;
    tenSP?: string;
    nhanHang?: string;
    giaSauKM: number;
    giaDangBanKenh?: number;
    giaMuaLoi?: number;
};

export type MlblGiftOrderLiveGiftData = {
    sku: string;
    tenSP?: string;
    nhanHang?: string;
    giaTriHangTang?: number;
};

export type MlblGiftOrderLiveData = MlblGiftOrderLiveProductPrice | {
    product?: MlblGiftOrderLiveProductPrice;
    gift?: MlblGiftOrderLiveGiftData;
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
    giftBudgetRate?: number;
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

type ResolvedMlblGiftOrderScenario = {
    products: MlblGiftOrderProduct[];
    gifts: MlblGiftOrderGift[];
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
        giftReceiverName: string;
        giftReceiverPhone: string;
        orderBuyerName: string;
        orderBuyerPhone: string;
        paymentMethod: string;
        staffName: string;
        staffCode: string;
        staffEmail: string;
        kiotCode: string;
        maBich: string;
        tenBich: string;
        sizeBich: string;
        nhomDoiTuong: string;
        products: MlblGiftOrderProductLine[];
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
const CONFIG_PATH = path.resolve(process.cwd(), 'test-data', 'json', 'mlbl-gift-order-config.json');
const ORDER_CODE_SUFFIX_LENGTH = 6;
const ORDER_CODE_SUFFIX_BASE = 36 ** ORDER_CODE_SUFFIX_LENGTH;
const DEFAULT_PROJECT_CUSTOMER_NAME = 'Nguyễn Văn A';
const PROJECT_CUSTOMER_NAME_SUFFIX: Record<string, string> = {
    si: 'SI',
    hangthietyeu: 'HangThietYeu',
    tuoixanhnhanhngon: 'TuoiXanhNhanhNgon',
    tegianoitro: 'TheGiaNoiTro',
    danongdichthuc: 'DanOngDichThuc',
    nhanquocdan: 'NhanQuocDan',
    thegioiphaidep: 'TheGioiPhaiDep',
};

export function loadMlblGiftOrderData(dataPath = DATA_PATH): MlblGiftOrderData {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8').replace(/^\uFEFF/, ''));
}

export function loadMlblGiftOrderConfig(configPath = CONFIG_PATH): MlblGiftOrderEditableConfig {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, ''));
}

export function resolveMlblGiftOrderDataPathForProject(
    projectName: string,
    config = loadMlblGiftOrderConfig(),
) {
    const dataPath = config.dataPaths?.[projectName] ?? config.dataPaths?.default;
    return dataPath ? resolveProjectPath(dataPath) : DATA_PATH;
}

function toProjectCustomerSuffix(projectName: string) {
    const normalizedProjectName = projectName.trim().toLowerCase();
    const configuredSuffix = PROJECT_CUSTOMER_NAME_SUFFIX[normalizedProjectName];
    if (configuredSuffix) {
        return configuredSuffix;
    }

    return normalizedProjectName
        .split(/[^a-z0-9]+/i)
        .filter(Boolean)
        .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join('');
}

export function buildMlblGiftOrderCustomerName(projectName: string) {
    const suffix = toProjectCustomerSuffix(projectName);
    return suffix ? `${DEFAULT_PROJECT_CUSTOMER_NAME} ${suffix}` : DEFAULT_PROJECT_CUSTOMER_NAME;
}

export function loadMlblGiftOrderDataForProject(projectName: string) {
    const data = loadMlblGiftOrderData(resolveMlblGiftOrderDataPathForProject(projectName));
    return {
        ...data,
        customer: {
            ...data.customer,
            name: buildMlblGiftOrderCustomerName(projectName),
        },
    };
}

export function calculateMlblGiftOrderTotals(
    products: MlblGiftOrderProductLine[],
    gifts: MlblGiftOrderGift[],
    data: Pick<MlblGiftOrderData, 'giftBudget' | 'giftBudgetRate'>,
): MlblGiftOrderTotals {
    const productTotals = products.reduce((totals, product) => {
        totals.totalAmount += product.tienSauKM;
        totals.totalHoaHongSale += product.hhNvkd * product.soLuong;
        totals.totalThuongAdmin += product.tAdminNvkd * product.soLuong;
        totals.tongGiaTriHangHoa += product.giaGoc * product.soLuong;
        totals.tongGiaTriDangBan += (product.giaDangBanKenh ?? product.giaSauKM) * product.soLuong;
        totals.tongMuaLoi += (product.giaMuaLoi ?? 0) * product.soLuong;
        return totals;
    }, {
        totalAmount: 0,
        totalHoaHongSale: 0,
        totalThuongAdmin: 0,
        tongGiaTriHangHoa: 0,
        tongGiaTriDangBan: 0,
        tongMuaLoi: 0,
    });
    const tongGtQuaTang = data.giftBudgetRate === undefined
        ? data.giftBudget
        : Math.round(productTotals.totalAmount * data.giftBudgetRate);
    const tongGtQuaTangDaChon = gifts.reduce((sum, gift) => sum + gift.giaTriHangTang * gift.soLuong, 0);

    return {
        ...productTotals,
        tongGtQuaTang,
        tongGtQuaTangDaChon,
        tongGtQuaTangConLai: tongGtQuaTang - tongGtQuaTangDaChon,
    };
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

function assertPositiveQuantity(name: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number. Current value: ${value}`);
    }
}

function withEditableSelectors(data: MlblGiftOrderData, config: MlblGiftOrderEditableConfig | undefined): MlblGiftOrderData {
    if (!config) {
        return data;
    }

    return {
        ...data,
        productSelector: {
            ...data.productSelector,
            sku: config.productSku,
        },
        giftSelector: {
            ...data.giftSelector,
            sku: config.giftSku,
        },
    };
}

function isStructuredLiveData(liveData: MlblGiftOrderLiveData): liveData is { product?: MlblGiftOrderLiveProductPrice; gift?: MlblGiftOrderLiveGiftData } {
    return 'product' in liveData || 'gift' in liveData;
}

function getLiveProductOverride(liveData: MlblGiftOrderLiveData | undefined): MlblGiftOrderLiveProductPrice | undefined {
    if (!liveData) {
        return undefined;
    }

    return isStructuredLiveData(liveData) ? liveData.product : liveData;
}

function getLiveGiftOverride(liveData: MlblGiftOrderLiveData | undefined): MlblGiftOrderLiveGiftData | undefined {
    if (!liveData) {
        return undefined;
    }

    return isStructuredLiveData(liveData) ? liveData.gift : undefined;
}

function buildProductFromLiveData(
    productTemplate: MlblGiftOrderProduct | undefined,
    liveProduct: MlblGiftOrderLiveProductPrice | undefined,
): MlblGiftOrderProduct | undefined {
    if (!productTemplate || !liveProduct) {
        return undefined;
    }

    return {
        ...productTemplate,
        ...liveProduct,
    };
}

function buildGiftFromLiveData(
    giftTemplate: MlblGiftOrderGift | undefined,
    liveGift: MlblGiftOrderLiveGiftData | undefined,
): MlblGiftOrderGift | undefined {
    if (!giftTemplate || !liveGift) {
        return undefined;
    }

    if (!liveGift.tenSP || !liveGift.nhanHang || liveGift.giaTriHangTang === undefined) {
        throw new Error(`Live MLBL gift data for SKU ${liveGift.sku} must include tenSP, nhanHang, and giaTriHangTang.`);
    }

    return {
        ...giftTemplate,
        ...liveGift,
    };
}

function applyEditableConfig(
    scenario: ResolvedMlblGiftOrderScenario,
    config: MlblGiftOrderEditableConfig | undefined,
    liveData?: MlblGiftOrderLiveData,
): ResolvedMlblGiftOrderScenario {
    if (!config) {
        return scenario;
    }

    assertPositiveQuantity('productQuantity', config.productQuantity);
    assertPositiveQuantity('giftQuantity', config.giftQuantity);

    const product = scenario.products.find(item => matchesSelector(item, { sku: config.productSku }));
    const liveProduct = getLiveProductOverride(liveData);
    const liveGift = getLiveGiftOverride(liveData);
    const targetProductSku = liveProduct?.sku || config.productSku;
    const targetGiftSku = liveGift?.sku || config.giftSku;
    const resolvedProduct = scenario.products.find(item => matchesSelector(item, { sku: targetProductSku }))
        ?? product
        ?? buildProductFromLiveData(scenario.products[0], liveProduct);
    const gift = scenario.gifts.find(item => matchesSelector(item, { sku: targetGiftSku }))
        ?? scenario.gifts.find(item => matchesSelector(item, { sku: config.giftSku }))
        ?? buildGiftFromLiveData(scenario.gifts[0], liveGift);

    if (!resolvedProduct) {
        throw new Error(`Could not resolve MLBL gift order product SKU from config/live data: ${targetProductSku}`);
    }

    if (!gift) {
        throw new Error(`Could not resolve MLBL gift order gift SKU from config/live data: ${targetGiftSku}`);
    }

    return {
        products: [
            {
                ...resolvedProduct,
                ...(liveProduct?.sku === targetProductSku ? liveProduct : {}),
                soLuong: config.productQuantity,
            },
        ],
        gifts: [
            {
                ...gift,
                ...(liveGift?.sku === targetGiftSku ? liveGift : {}),
                soLuong: config.giftQuantity,
            },
        ],
    };
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

export function resolveMlblGiftOrderScenario(
    data = loadMlblGiftOrderData(),
    config?: MlblGiftOrderEditableConfig,
    liveData?: MlblGiftOrderLiveData,
): ResolvedMlblGiftOrderScenario {
    const scenarioData = withEditableSelectors(data, config);

    if (scenarioData.combo) {
        return applyEditableConfig(scaleScenarioQuantities(
            [data.combo.product],
            [data.combo.gift],
            {
                ...scenarioData.giftSelector,
                soLuong: getScenarioGiftQuantity(scenarioData),
            },
            scenarioData.combo.rule,
        ), config, liveData);
    }

    if (scenarioData.products?.length && scenarioData.gifts?.length) {
        return applyEditableConfig(scaleScenarioQuantities(
            scenarioData.products.filter(product => matchesSelector(product, scenarioData.productSelector)),
            scenarioData.gifts.filter(gift => matchesSelector(gift, scenarioData.giftSelector)),
            scenarioData.giftSelector,
            scenarioData.rule,
        ), config, liveData);
    }

    if (!scenarioData.comboSource) {
        throw new Error('MLBL gift order data must define products/gifts or comboSource.');
    }

    const cache = readComboCache(scenarioData.comboSource);
    const combo = cache.combos.find(candidate => {
        return candidate.products.some(product => matchesSelector(product, scenarioData.productSelector))
            && candidate.gifts.some(gift => matchesSelector(gift, scenarioData.giftSelector));
    });

    if (!combo) {
        throw new Error([
            `Could not resolve MLBL gift order combo for project "${scenarioData.projectName}".`,
            `Product selector: ${JSON.stringify(scenarioData.productSelector || {})}.`,
            `Gift selector: ${JSON.stringify(scenarioData.giftSelector || {})}.`,
            `Source: ${scenarioData.comboSource.path}.`,
        ].join(' '));
    }

    return applyEditableConfig(scaleScenarioQuantities(
        combo.products.filter(product => matchesSelector(product, scenarioData.productSelector)),
        combo.gifts.filter(gift => matchesSelector(gift, scenarioData.giftSelector)),
        scenarioData.giftSelector,
        combo.rule,
    ), config, liveData);
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

export function buildMlblGiftOrderPayload(
    baseUrl: string,
    data = loadMlblGiftOrderData(),
    config = loadMlblGiftOrderConfig(),
    liveData?: MlblGiftOrderLiveData,
): MlblGiftOrderPayload {
    const scenario = resolveMlblGiftOrderScenario(data, config, liveData);
    const products = scenario.products.map(product => ({
        ...product,
        tienSauKM: product.giaSauKM * product.soLuong,
    }));
    const totals = calculateMlblGiftOrderTotals(products, scenario.gifts, data);
    const customerName = process.env.MLBL_GIFT_ORDER_CUSTOMER_NAME ?? data.customer.name;
    const customerPhone = process.env.MLBL_GIFT_ORDER_CUSTOMER_PHONE ?? data.customer.phone;
    const giftReceiverName = process.env.MLBL_GIFT_ORDER_GIFT_RECEIVER_NAME ?? customerName;
    const giftReceiverPhone = process.env.MLBL_GIFT_ORDER_GIFT_RECEIVER_PHONE ?? customerPhone;
    const orderBuyerName = process.env.MLBL_GIFT_ORDER_BUYER_NAME ?? customerName;
    const orderBuyerPhone = process.env.MLBL_GIFT_ORDER_BUYER_PHONE ?? customerPhone;

    return {
        _token: process.env.MLBL_GIFT_ORDER_TOKEN || data.token,
        action: 'insertOrder',
        orderData: {
            orderCode: generateMlblGiftOrderCode(data.orderCodePrefix),
            customerName,
            customerPhone,
            customerAddress: process.env.MLBL_GIFT_ORDER_CUSTOMER_ADDRESS ?? data.customer.address,
            giftReceiverName,
            giftReceiverPhone,
            orderBuyerName,
            orderBuyerPhone,
            paymentMethod: process.env.MLBL_GIFT_ORDER_PAYMENT_METHOD || data.paymentMethod,
            ...data.staff,
            ...data.targetGroup,
            products,
            gift: {
                items: scenario.gifts,
            },
            ...totals,
            pay1Lan: totals.totalAmount,
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
