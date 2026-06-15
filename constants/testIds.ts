/**
 * Tao CSS selector theo data-testid de selector trong page object ngan va nhat quan.
 */
export const tid = (id: string) => `[data-testid="${id}"]`;

export const testIds = {
    tabSite: (site: string) => `tab-${site}`,
    tabText: (tabText: string) => `tab-${tabText}`,
    proceedToCheckout: 'proceed-to-checkout',
    btnProceed: 'btn-proceed',
    inputName: 'input-name',
    inputRecipientName: 'input-recipient-name',
    inputPhone: 'input-phone',
    inputRecipientPhone: 'input-recipient-phone',
    confirmOrder: 'confirm-order',
    invoiceError: 'invoice-error',
    invoicePopup: 'invoice-popup',
} as const;
